<script lang="ts">
	import DialogDrawer from '$lib/components/shared/DialogDrawer.svelte';
	import * as Button from '$lib/components/ui/button/index.ts';
	import * as Select from '$lib/components/ui/select/index.ts';
	import { accountService } from '$lib/core/services/core/account-service';
	import {
		createAndApplyMigrationBatch,
		ledgerBalancesByCurrency,
		prepareMigrationBatch,
		resolveDefaultAnchorAccountId,
		rollbackPersonMigrationBatch,
		personService
	} from '$lib/core/services/person-ledger';
	import type { Account } from '$lib/core/db';
	import type { PersonMigrationMode } from '$lib/core/services/person-ledger/types';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';

	interface Props {
		ledgerAccountId: string;
		open: boolean;
		onOpenChange: (open: boolean) => void;
		onApplied?: () => void;
	}

	let { ledgerAccountId, open, onOpenChange, onApplied }: Props = $props();

	let ledgerAccount = $state<Account | null>(null);
	let selectableAccounts = $state<Account[]>([]);
	let walletAccountIds = $state<Set<string>>(new Set());
	let balancesByCurrency = $state<Record<string, number>>({});
	let anchorAccountId = $state('');
	let mode = $state<Extract<PersonMigrationMode, 'single_total' | 'forgive_archive'>>('single_total');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let appliedBatchId = $state<string | null>(null);
	let resolvedPersonName = $state('');

	$effect(() => {
		if (open && ledgerAccountId) {
			void loadWizardData();
		}
	});

	async function loadWizardData() {
		error = null;
		appliedBatchId = null;
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
				const defaultAnchor = await resolveDefaultAnchorAccountId({
					ledgerAccountId,
					personId: person?.id
				});
				anchorAccountId =
					defaultAnchor && selectableAccounts.some((a) => a.id === defaultAnchor)
						? defaultAnchor
						: (selectableAccounts[0]?.id ?? '');
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load migration data';
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

	const anchorLabel = $derived(
		selectableAccounts.find((a) => a.id === anchorAccountId)?.name ?? 'Select account'
	);

	async function handleApply() {
		if (!anchorAccountId) {
			error = 'Choose an anchor account';
			return;
		}
		busy = true;
		error = null;
		try {
			const built = await prepareMigrationBatch({
				ledgerAccountId,
				anchorAccountId,
				mode
			});
			const batch = await createAndApplyMigrationBatch(built);
			appliedBatchId = batch.id;
			onApplied?.();
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

		{#if appliedBatchId}
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
		{:else if ledgerAccount}
			<div class="space-y-2">
				<p class="text-xs font-medium text-[var(--color-text-tertiary)] uppercase">Mode</p>
				<div class="flex flex-col gap-2">
					<label class="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--color-border)] p-3">
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
					<label class="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--color-border)] p-3">
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
				</div>
			{:else}
				<p class="text-sm text-[var(--color-text-tertiary)]">No balance to move; account will be archived.</p>
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
					{busy ? 'Applying…' : 'Confirm'}
				</Button.Root>
				<Button.Root variant="ghost" disabled={busy} onclick={close}>Cancel</Button.Root>
			</div>
		{/if}
	</div>
</DialogDrawer>
