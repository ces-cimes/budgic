<script lang="ts">
	import DialogDrawer from '$lib/components/shared/DialogDrawer.svelte';
	import ReimbursementSettlementPicker from '$lib/components/reimbursements/ReimbursementSettlementPicker.svelte';
	import * as Button from '$lib/components/ui/button/index.ts';
	import * as Select from '$lib/components/ui/select/index.ts';
	import { accountService } from '$lib/core/services/core/account-service';
	import { userService } from '$lib/core/services/core/user-service';
	import {
		createAndApplyMigrationBatch,
		estimateResidualBalances,
		groupProposalsByConfidence,
		inferProposalsForLedger,
		ledgerBalancesByCurrency,
		prepareMigrationBatch,
		resolveDefaultAnchorAccountId,
		rollbackPersonMigrationBatch,
		personService
	} from '$lib/core/services/person-ledger';
	import type { Account } from '$lib/core/db';
	import type {
		MigrationProposal,
		PersonMigrationMode
	} from '$lib/core/services/person-ledger/types';
	import { formatTransactionAmount, convertToMainCurrency } from '$lib/utils/currency-utils';

	type WizardStep = 'mode' | 'guided' | 'residual' | 'done';
	type ProposalDecision = 'pending' | 'accepted' | 'skipped';

	interface Props {
		ledgerAccountId: string;
		open: boolean;
		onOpenChange: (open: boolean) => void;
		onApplied?: () => void;
		/** Open directly on undo for an already-applied batch */
		rollbackBatchId?: string | null;
	}

	let { ledgerAccountId, open, onOpenChange, onApplied, rollbackBatchId = null }: Props = $props();

	let ledgerAccount = $state<Account | null>(null);
	let selectableAccounts = $state<Account[]>([]);
	let walletAccountIds = $state<Set<string>>(new Set());
	let balancesByCurrency = $state<Record<string, number>>({});
	let mainCurrency = $state('USD');
	let mainCurrencyTotal = $state<number | null>(null);
	let anchorAccountId = $state('');
	let mode = $state<PersonMigrationMode>('single_total');
	let wizardStep = $state<WizardStep>('mode');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let appliedBatchId = $state<string | null>(null);
	let resolvedPersonName = $state('');
	let resolvedPersonId = $state<string | undefined>(undefined);

	let allProposals = $state<MigrationProposal[]>([]);
	let proposalDecisions = $state<Record<string, ProposalDecision>>({});
	let proposalSettlementKeys = $state<Record<string, string>>({});
	let residualBalances = $state<Record<string, number>>({});
	let tailMode =
		$state<Extract<PersonMigrationMode, 'single_total' | 'forgive_archive'>>('single_total');

	$effect(() => {
		if (open && ledgerAccountId) {
			if (rollbackBatchId) {
				appliedBatchId = rollbackBatchId;
				wizardStep = 'done';
			} else {
				void loadWizardData();
			}
		}
	});

	$effect(() => {
		if (!open || wizardStep !== 'mode') return;
		void refreshMainCurrencyRollup();
	});

	async function refreshMainCurrencyRollup() {
		const prefs = await userService.getUserPreferences();
		mainCurrency = prefs?.currency ?? 'USD';
		let total = 0;
		let any = false;
		for (const [currency, amount] of Object.entries(balancesByCurrency)) {
			if (Math.abs(amount) <= 0.001) continue;
			any = true;
			total += await convertToMainCurrency(amount, currency, mainCurrency);
		}
		mainCurrencyTotal = any ? total : null;
	}

	async function loadWizardData() {
		error = null;
		appliedBatchId = null;
		wizardStep = 'mode';
		allProposals = [];
		proposalDecisions = {};
		proposalSettlementKeys = {};
		residualBalances = {};
		busy = true;
		try {
			const [acct, selectable, wallets, balances] = await Promise.all([
				accountService.getAccount(ledgerAccountId),
				accountService.getSelectableAccounts(),
				accountService.getWalletAccounts(),
				ledgerBalancesByCurrency(ledgerAccountId)
			]);
			ledgerAccount = acct;
			selectableAccounts = selectable.filter((a) => a.id !== ledgerAccountId);
			walletAccountIds = new Set(wallets.map((w) => w.id));
			balancesByCurrency = balances;

			if (acct) {
				const person = await personService.peekPersonForLedgerAccount(acct);
				resolvedPersonName = person?.displayName ?? acct.name;
				resolvedPersonId = person?.id;
				const defaultAnchor = await resolveDefaultAnchorAccountId({
					ledgerAccountId,
					personId: person?.id
				});
				anchorAccountId =
					defaultAnchor && selectableAccounts.some((a) => a.id === defaultAnchor)
						? defaultAnchor
						: (selectableAccounts[0]?.id ?? '');
			}
			await refreshMainCurrencyRollup();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load migration data';
		} finally {
			busy = false;
		}
	}

	async function loadGuidedProposals() {
		if (!anchorAccountId || !resolvedPersonId) {
			const person = await personService.resolvePersonForLedgerAccount(ledgerAccount!);
			resolvedPersonId = person.id;
			resolvedPersonName = person.displayName;
		}
		const person = await personService.getPerson(resolvedPersonId!);
		if (!person) throw new Error('Person not found');
		busy = true;
		error = null;
		try {
			const proposals = await inferProposalsForLedger({
				ledgerAccountId,
				anchorAccountId,
				person
			});
			allProposals = proposals;
			const decisions: Record<string, ProposalDecision> = {};
			const settlements: Record<string, string> = {};
			for (const p of proposals) {
				decisions[p.id] = 'pending';
				if (p.selectedSettlementKey) {
					settlements[p.id] = p.selectedSettlementKey;
				}
			}
			proposalDecisions = decisions;
			proposalSettlementKeys = settlements;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to analyze history';
		} finally {
			busy = false;
		}
	}

	const balanceLines = $derived(
		Object.entries(balancesByCurrency)
			.filter(([, v]) => Math.abs(v) > 0.001)
			.map(([currency, amount]) => ({
				currency,
				label: formatTransactionAmount(amount, currency)
			}))
	);

	const groupedProposals = $derived(groupProposalsByConfidence(allProposals));

	const acceptedProposals = $derived(
		allProposals
			.filter((p) => proposalDecisions[p.id] === 'accepted')
			.map((p) => ({
				...p,
				selectedSettlementKey: proposalSettlementKeys[p.id] ?? p.selectedSettlementKey
			}))
	);

	const anchorLabel = $derived(
		selectableAccounts.find((a) => a.id === anchorAccountId)?.name ?? 'Select account'
	);

	const residualLines = $derived(
		Object.entries(residualBalances)
			.filter(([, v]) => Math.abs(v) > 0.001)
			.map(([currency, amount]) => ({
				currency,
				label: formatTransactionAmount(amount, currency)
			}))
	);

	function setProposalDecision(id: string, decision: ProposalDecision) {
		proposalDecisions = { ...proposalDecisions, [id]: decision };
	}

	function setSettlementKey(proposalId: string, key: string) {
		proposalSettlementKeys = { ...proposalSettlementKeys, [proposalId]: key };
	}

	async function goToGuidedReview() {
		if (!anchorAccountId) {
			error = 'Choose an anchor account';
			return;
		}
		await loadGuidedProposals();
		wizardStep = 'guided';
	}

	async function continueFromGuided() {
		busy = true;
		error = null;
		try {
			residualBalances = await estimateResidualBalances(ledgerAccountId, acceptedProposals);
			const hasResidual = Object.values(residualBalances).some((v) => Math.abs(v) > 0.001);
			if (hasResidual) {
				wizardStep = 'residual';
			} else {
				await applyGuidedBatch();
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to estimate remaining balance';
		} finally {
			busy = false;
		}
	}

	async function applyGuidedBatch() {
		if (!anchorAccountId) return;
		const built = await prepareMigrationBatch({
			ledgerAccountId,
			anchorAccountId,
			mode: 'guided',
			acceptedProposals,
			tailMode: Object.values(residualBalances).some((v) => Math.abs(v) > 0.001)
				? tailMode
				: undefined,
			residualBalances: Object.values(residualBalances).some((v) => Math.abs(v) > 0.001)
				? residualBalances
				: undefined
		});
		const batch = await createAndApplyMigrationBatch(built);
		appliedBatchId = batch.id;
		wizardStep = 'done';
		onApplied?.();
	}

	async function handleApply() {
		if (!anchorAccountId) {
			error = 'Choose an anchor account';
			return;
		}
		if (mode === 'guided') {
			await goToGuidedReview();
			return;
		}
		busy = true;
		error = null;
		try {
			const built = await prepareMigrationBatch({
				ledgerAccountId,
				anchorAccountId,
				mode: mode as Extract<PersonMigrationMode, 'single_total' | 'forgive_archive'>
			});
			const batch = await createAndApplyMigrationBatch(built);
			appliedBatchId = batch.id;
			wizardStep = 'done';
			onApplied?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Migration failed';
		} finally {
			busy = false;
		}
	}

	async function handleApplyResidual() {
		busy = true;
		error = null;
		try {
			await applyGuidedBatch();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Migration failed';
		} finally {
			busy = false;
		}
	}

	async function handleUndo() {
		if (!appliedBatchId) return;
		busy = true;
		error = null;
		try {
			await rollbackPersonMigrationBatch(appliedBatchId);
			appliedBatchId = null;
			wizardStep = 'mode';
			onApplied?.();
			await loadWizardData();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Undo failed';
		} finally {
			busy = false;
		}
	}

	function close() {
		onOpenChange(false);
	}

	function backToMode() {
		wizardStep = 'mode';
		error = null;
	}
</script>

<DialogDrawer
	{open}
	{onOpenChange}
	title="Close person account"
	description={ledgerAccount
		? `Move tracking for ${resolvedPersonName || ledgerAccount.name} to reimbursements on a real wallet.`
		: ''}
>
	<div class="space-y-5">
		{#if error}
			<p class="text-sm text-red-600" role="alert">{error}</p>
		{/if}

		{#if appliedBatchId && wizardStep === 'done'}
			<div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4">
				<p class="text-sm text-[var(--color-text-primary)]">
					Person account closed. Reimbursements are on your anchor wallet; this ledger is archived.
				</p>
				<div class="mt-3 flex flex-wrap gap-2">
					<Button.Root variant="outline" size="sm" disabled={busy} onclick={handleUndo}>
						Undo
					</Button.Root>
					<Button.Root variant="ghost" size="sm" onclick={close}>Done</Button.Root>
				</div>
			</div>
		{:else if busy && !ledgerAccount}
			<p class="text-sm text-[var(--color-text-tertiary)]">Loading…</p>
		{:else if ledgerAccount && wizardStep === 'residual'}
			<div class="space-y-3">
				<p class="text-sm text-[var(--color-text-primary)]">
					After the rewrites you confirmed, this person ledger still has a balance. Choose how to
					close the remainder before archiving.
				</p>
				<ul class="space-y-0.5 text-sm">
					{#each residualLines as line (line.currency)}
						<li>{line.label} ({line.currency})</li>
					{/each}
				</ul>
				<div class="flex flex-col gap-2">
					<label
						class="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--color-border)] p-3"
					>
						<input
							type="radio"
							name="pl-tail"
							value="single_total"
							checked={tailMode === 'single_total'}
							onchange={() => (tailMode = 'single_total')}
							class="mt-1"
						/>
						<span class="text-sm">Move remainder to reimbursements</span>
					</label>
					<label
						class="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--color-border)] p-3"
					>
						<input
							type="radio"
							name="pl-tail"
							value="forgive_archive"
							checked={tailMode === 'forgive_archive'}
							onchange={() => (tailMode = 'forgive_archive')}
							class="mt-1"
						/>
						<span class="text-sm">Forgive remainder and archive</span>
					</label>
				</div>
				<div class="flex flex-wrap gap-2 pt-2">
					<Button.Root disabled={busy} onclick={handleApplyResidual}>
						{busy ? 'Applying…' : 'Apply migration'}
					</Button.Root>
					<Button.Root variant="ghost" disabled={busy} onclick={() => (wizardStep = 'guided')}>
						Back
					</Button.Root>
				</div>
			</div>
		{:else if ledgerAccount && wizardStep === 'guided'}
			<div class="space-y-4">
				<p class="text-sm text-[var(--color-text-tertiary)]">
					Review suggested rewrites. Confirm each item, skip what looks wrong, then continue.
				</p>

				{#if allProposals.length === 0}
					<p class="text-sm">
						No history rewrites detected. You can still close with a single balance move.
					</p>
				{/if}

				{#each [{ key: 'high', label: 'High confidence' }, { key: 'medium', label: 'Medium confidence' }, { key: 'low', label: 'Low confidence' }] as section (section.key)}
					{@const items = groupedProposals[section.key as keyof typeof groupedProposals]}
					{#if items.length > 0}
						<div class="space-y-2">
							<p class="text-xs font-medium text-[var(--color-text-tertiary)] uppercase">
								{section.label}
							</p>
							{#each items as proposal (proposal.id)}
								<div
									class="rounded-lg border border-[var(--color-border)] p-3 {proposalDecisions[
										proposal.id
									] === 'accepted'
										? 'border-[var(--color-emerald)]/50'
										: ''}"
								>
									<p class="text-sm font-medium">{proposal.summary}</p>
									{#if proposal.conflict}
										<p class="mt-1 text-xs text-amber-700">{proposal.conflict}</p>
									{/if}
									{#if proposal.settlementCandidates && proposal.settlementCandidates.length > 1}
										<div class="mt-2">
											<p class="mb-1 text-xs text-[var(--color-text-tertiary)]">Settle against</p>
											<ReimbursementSettlementPicker
												options={proposal.settlementCandidates.map((c) => ({
													transactionId: c.transactionId,
													reimbursementId: c.reimbursementId,
													label: c.label
												}))}
												value={proposalSettlementKeys[proposal.id] ?? ''}
												onValueChange={(k) => setSettlementKey(proposal.id, k)}
											/>
										</div>
									{/if}
									<div class="mt-2 flex flex-wrap gap-2">
										<Button.Root
											size="sm"
											variant={proposalDecisions[proposal.id] === 'accepted'
												? 'default'
												: 'outline'}
											disabled={busy}
											onclick={() => setProposalDecision(proposal.id, 'accepted')}
										>
											Confirm
										</Button.Root>
										<Button.Root
											size="sm"
											variant={proposalDecisions[proposal.id] === 'skipped' ? 'secondary' : 'ghost'}
											disabled={busy}
											onclick={() => setProposalDecision(proposal.id, 'skipped')}
										>
											Skip
										</Button.Root>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{/each}

				<div class="flex flex-wrap gap-2 pt-2">
					<Button.Root disabled={busy} onclick={continueFromGuided}>
						{busy ? 'Checking balance…' : 'Continue'}
					</Button.Root>
					<Button.Root variant="ghost" disabled={busy} onclick={backToMode}>Back</Button.Root>
				</div>
			</div>
		{:else if ledgerAccount}
			<div class="space-y-2">
				<p class="text-xs font-medium text-[var(--color-text-tertiary)] uppercase">Mode</p>
				<div class="flex flex-col gap-2">
					<label
						class="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--color-border)] p-3"
					>
						<input
							type="radio"
							name="pl-mode"
							value="guided"
							checked={mode === 'guided'}
							onchange={() => (mode = 'guided')}
							class="mt-1"
						/>
						<span>
							<span class="text-sm font-medium">Review history (guided)</span>
							<span class="mt-0.5 block text-xs text-[var(--color-text-tertiary)]">
								Confirm inferred rewrites, then close any remaining balance.
							</span>
						</span>
					</label>
					<label
						class="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--color-border)] p-3"
					>
						<input
							type="radio"
							name="pl-mode"
							value="single_total"
							checked={mode === 'single_total'}
							onchange={() => (mode = 'single_total')}
							class="mt-1"
						/>
						<span>
							<span class="text-sm font-medium">Move balance to reimbursements</span>
							<span class="mt-0.5 block text-xs text-[var(--color-text-tertiary)]">
								One opening balance on the anchor wallet; zero and archive this person account.
							</span>
						</span>
					</label>
					<label
						class="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--color-border)] p-3"
					>
						<input
							type="radio"
							name="pl-mode"
							value="forgive_archive"
							checked={mode === 'forgive_archive'}
							onchange={() => (mode = 'forgive_archive')}
							class="mt-1"
						/>
						<span>
							<span class="text-sm font-medium">We're even — forgive and archive</span>
							<span class="mt-0.5 block text-xs text-[var(--color-text-tertiary)]">
								Close without open receivables; mark existing reimbursements forgiven.
							</span>
						</span>
					</label>
				</div>
			</div>

			{#if balanceLines.length > 0}
				<div>
					<p class="text-xs font-medium text-[var(--color-text-tertiary)] uppercase">Balances</p>
					<ul class="mt-1 space-y-0.5 text-sm">
						{#each balanceLines as line (line.currency)}
							<li>{line.label} ({line.currency})</li>
						{/each}
					</ul>
					{#if mainCurrencyTotal != null}
						<p class="mt-1 text-sm text-[var(--color-text-tertiary)]">
							≈ {formatTransactionAmount(mainCurrencyTotal, mainCurrency)} total ({mainCurrency},
							display only)
						</p>
					{/if}
				</div>
			{:else}
				<p class="text-sm text-[var(--color-text-tertiary)]">
					No balance to move; account will be archived.
				</p>
			{/if}

			<div class="space-y-2">
				<label for="pl-anchor" class="text-sm font-medium">Anchor account</label>
				<Select.Root
					type="single"
					value={anchorAccountId}
					onValueChange={(v) => {
						if (v) anchorAccountId = v;
					}}
				>
					<Select.Trigger id="pl-anchor" class="w-full">{anchorLabel}</Select.Trigger>
					<Select.Content>
						{#each selectableAccounts as acct (acct.id)}
							<Select.Item value={acct.id}>
								{acct.name}
								{#if walletAccountIds.has(acct.id)}
									<span class="text-[var(--color-text-tertiary)]"> · wallet</span>
								{/if}
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<div class="flex flex-wrap gap-2 pt-2">
				<Button.Root disabled={busy || !anchorAccountId} onclick={handleApply}>
					{busy ? 'Working…' : mode === 'guided' ? 'Review proposals' : 'Confirm'}
				</Button.Root>
				<Button.Root variant="ghost" disabled={busy} onclick={close}>Cancel</Button.Root>
			</div>
		{/if}
	</div>
</DialogDrawer>
