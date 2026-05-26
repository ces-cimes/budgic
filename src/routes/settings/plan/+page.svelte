<script lang="ts">
	import { accountService, userService } from '$lib/core/services/index.ts';
	import type { Account } from '$lib/core/db';
	import type { NegativeAllowanceHandling } from '$lib/core/services/core/negative-allowance-service';
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select/index.ts';
	import { Switch } from '$lib/components/ui/switch/index.ts';
	import { onMount } from 'svelte';
	import Header from '$lib/components/Header.svelte';
	import { PageLayout } from '$lib/components/layouts';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import {
		automaticThresholdFromPreferences,
		normalizeAutomaticThreshold
	} from '$lib/core/services/person-ledger';
	import type { AutomaticThreshold } from '$lib/core/services/person-ledger';
	import { CalcExpressionInput } from '$lib/components/ui/calculator/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton';

	const NEGATIVE_ALLOWANCE_LABELS: Record<NegativeAllowanceHandling, string> = {
		block_with_warning: 'Block with warning – alert and require override',
		allow_with_strong_warning: 'Allow with strong warning – permit but flag for review (default)',
		borrow_from_future: "Borrow from future – use next period's allowance",
		borrow_from_other_categories: 'Borrow from other categories – envelope borrowing'
	};

	let isLoading = $state(true);
	let isSaving = $state(false);
	let negativeAllowanceHandling = $state<NegativeAllowanceHandling>('allow_with_strong_warning');
	let reimbursementAllowanceMode = $state<'conservative' | 'optimistic'>('conservative');
	let defaultReimbursementAnchorAccountId = $state<string>('');
	let personLedgerAutomaticThreshold = $state<AutomaticThreshold>({
		high: true,
		medium: true,
		low: false
	});
	let walletAccounts = $state<Account[]>([]);
	let envelopeBorrowMaxPerCategoryPercent = $state(50);
	let envelopeBorrowRepaymentPeriods = $state(2);
	let envelopeBorrowTotalLimit = $state<string>('');
	let envelopeBorrowRequireConfirmationRepeated = $state(true);
	let rolloverSurplusBehavior = $state<'rollover_next' | 'to_savings_goals' | 'hybrid'>(
		'rollover_next'
	);
	let rolloverSurplusHybridRatio = $state(50);
	let rolloverDeficitBehavior = $state<
		'reduce_next_period' | 'borrow_from_other' | 'one_time_exception'
	>('reduce_next_period');
	let savingsOpportunityMinSurplus = $state<string>('');
	let budgetAlertWarningAtPercent = $state(80);
	let budgetAlertCriticalAtPercent = $state(100);

	/** Phase 5.4 — debt tolerance */
	let maxDebtPeriodDays = $state(90);
	let recoveryAggressivenessPercent = $state(20);
	let debtRecoveryActive = $state(false);
	/** Milestone F — recovery-focused presentation mode */
	let recoveryModeActive = $state(false);

	onMount(async () => {
		try {
			const prefs = await userService.getUserPreferences();
			if (prefs) {
				negativeAllowanceHandling =
					(prefs as { negativeAllowanceHandling?: NegativeAllowanceHandling })
						.negativeAllowanceHandling ?? 'allow_with_strong_warning';
				reimbursementAllowanceMode =
					(prefs as { reimbursementAllowanceMode?: 'conservative' | 'optimistic' })
						.reimbursementAllowanceMode ?? 'conservative';
				defaultReimbursementAnchorAccountId =
					(prefs as { defaultReimbursementAnchorAccountId?: string })
						.defaultReimbursementAnchorAccountId ?? '';
				personLedgerAutomaticThreshold = automaticThresholdFromPreferences(prefs);
				walletAccounts = await accountService.getWalletAccounts();
				const p = prefs as Record<string, unknown>;
				envelopeBorrowMaxPerCategoryPercent = Math.round(
					(typeof p.envelopeBorrowMaxPerCategoryPercent === 'number'
						? p.envelopeBorrowMaxPerCategoryPercent
						: 0.5) * 100
				);
				envelopeBorrowRepaymentPeriods = (p.envelopeBorrowRepaymentPeriods as number) ?? 2;
				envelopeBorrowTotalLimit =
					(p.envelopeBorrowTotalLimit as number) != null ? String(p.envelopeBorrowTotalLimit) : '';
				envelopeBorrowRequireConfirmationRepeated =
					(p.envelopeBorrowRequireConfirmationRepeated as boolean) ?? true;
				const rsb = p.rolloverSurplusBehavior;
				rolloverSurplusBehavior =
					rsb === 'rollover_next' || rsb === 'to_savings_goals' || rsb === 'hybrid'
						? rsb
						: 'rollover_next';
				rolloverSurplusHybridRatio =
					typeof p.rolloverSurplusHybridRatio === 'number'
						? Math.round(p.rolloverSurplusHybridRatio * 100)
						: 50;
				const rdb = p.rolloverDeficitBehavior;
				rolloverDeficitBehavior =
					rdb === 'reduce_next_period' ||
					rdb === 'borrow_from_other' ||
					rdb === 'one_time_exception'
						? rdb
						: 'reduce_next_period';
				savingsOpportunityMinSurplus =
					typeof p.savingsOpportunityMinSurplus === 'number'
						? String(p.savingsOpportunityMinSurplus)
						: '';
				budgetAlertWarningAtPercent =
					typeof p.budgetAlertWarningAtPercent === 'number' ? p.budgetAlertWarningAtPercent : 80;
				budgetAlertCriticalAtPercent =
					typeof p.budgetAlertCriticalAtPercent === 'number' ? p.budgetAlertCriticalAtPercent : 100;
				maxDebtPeriodDays = typeof p.maxDebtPeriodDays === 'number' ? p.maxDebtPeriodDays : 90;
				recoveryAggressivenessPercent =
					typeof p.recoveryAggressiveness === 'number'
						? Math.round(p.recoveryAggressiveness * 100)
						: 20;
				debtRecoveryActive = p.debtRecoveryActive === true;
				recoveryModeActive = p.recoveryModeActive === true;
			}
		} catch (e) {
			console.error('Failed to load plan settings', e);
		} finally {
			isLoading = false;
		}
	});

	function clampBudgetAlertThresholds(): { warn: number; crit: number } {
		let w = Math.round(Number(budgetAlertWarningAtPercent));
		let c = Math.round(Number(budgetAlertCriticalAtPercent));
		if (Number.isNaN(w)) w = 80;
		if (Number.isNaN(c)) c = 100;
		w = Math.min(99, Math.max(50, w));
		c = Math.min(200, Math.max(Math.max(100, w + 1), c));
		budgetAlertWarningAtPercent = w;
		budgetAlertCriticalAtPercent = c;
		return { warn: w, crit: c };
	}

	async function save() {
		if (isSaving) return;
		isSaving = true;
		try {
			const prefs = await userService.getUserPreferences();
			if (!prefs) return;
			const { warn, crit } = clampBudgetAlertThresholds();
			await userService.updateUserPreferences({
				...prefs,
				negativeAllowanceHandling,
				reimbursementAllowanceMode,
				defaultReimbursementAnchorAccountId: defaultReimbursementAnchorAccountId || undefined,
				personLedgerAutomaticThreshold: normalizeAutomaticThreshold(personLedgerAutomaticThreshold),
				envelopeBorrowMaxPerCategoryPercent: envelopeBorrowMaxPerCategoryPercent / 100,
				envelopeBorrowRepaymentPeriods,
				envelopeBorrowTotalLimit:
					envelopeBorrowTotalLimit === '' ? undefined : Number(envelopeBorrowTotalLimit),
				envelopeBorrowRequireConfirmationRepeated,
				rolloverSurplusBehavior,
				rolloverSurplusHybridRatio: rolloverSurplusHybridRatio / 100,
				rolloverDeficitBehavior,
				savingsOpportunityMinSurplus:
					savingsOpportunityMinSurplus !== '' && !Number.isNaN(Number(savingsOpportunityMinSurplus))
						? Number(savingsOpportunityMinSurplus)
						: undefined,
				budgetAlertWarningAtPercent: warn,
				budgetAlertCriticalAtPercent: crit,
				maxDebtPeriodDays,
				recoveryAggressiveness: Math.min(0.5, Math.max(0.1, recoveryAggressivenessPercent / 100)),
				debtRecoveryActive,
				recoveryModeActive
			});
		} catch (e) {
			console.error('Failed to save plan settings', e);
		} finally {
			isSaving = false;
		}
	}
</script>

<svelte:head>
	<title>Budget & Allowance | Settings | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header
			title="Budget & allowance"
			backButtonLink="/settings"
			backButtonLabel="Back to settings"
			buttonProps={[{ text: 'Save', onclick: save, size: 'sm', disabled: isSaving }]}
		/>
	{/snippet}

	<div class="mx-auto max-w-2xl px-4 py-6">
		{#if isLoading}
			<Skeleton class="h-96 w-full rounded-2xl bg-[var(--color-bg-tertiary)]" />
		{:else}
			<div class="space-y-6">
				<!-- Negative allowance -->
				<div class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]">
					<div class="border-border border-b px-5 py-3">
						<h2
							class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Negative allowance
						</h2>
						<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
							When spending exceeds your allowance this period
						</p>
					</div>
					<div class="space-y-2 px-5 py-4">
						<label
							for="negative-allowance-handling"
							class="text-sm font-medium text-[var(--color-text-primary)]">Handling</label
						>
						<Select
							type="single"
							value={negativeAllowanceHandling}
							onValueChange={(v) =>
								v && (negativeAllowanceHandling = v as NegativeAllowanceHandling)}
						>
							<SelectTrigger
								id="negative-allowance-handling"
								class="max-w-md"
								aria-label="Choose how to handle overspending"
							>
								{NEGATIVE_ALLOWANCE_LABELS[negativeAllowanceHandling] ?? 'Choose behaviour'}
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="block_with_warning"
									>{NEGATIVE_ALLOWANCE_LABELS.block_with_warning}</SelectItem
								>
								<SelectItem value="allow_with_strong_warning"
									>{NEGATIVE_ALLOWANCE_LABELS.allow_with_strong_warning}</SelectItem
								>
								<SelectItem value="borrow_from_future"
									>{NEGATIVE_ALLOWANCE_LABELS.borrow_from_future}</SelectItem
								>
								<SelectItem value="borrow_from_other_categories"
									>{NEGATIVE_ALLOWANCE_LABELS.borrow_from_other_categories}</SelectItem
								>
							</SelectContent>
						</Select>
						<p class="text-xs text-[var(--color-text-tertiary)]">
							"Allow with strong warning" permits spending but surfaces recovery suggestions.
						</p>
					</div>
				</div>

				<div class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]">
					<div class="border-border border-b px-5 py-3">
						<h2
							class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Budget — debt tolerance
						</h2>
						<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
							Controls how aggressively Budgic sets aside allowance after you acknowledge
							intentional debt (Phase 5).
						</p>
					</div>
					<div class="space-y-4 px-5 py-4">
						<div class="space-y-1.5">
							<label
								for="max-debt-days"
								class="text-sm font-medium text-[var(--color-text-primary)]"
								>Max debt period (days)</label
							>
							<input
								id="max-debt-days"
								type="range"
								min="7"
								max="183"
								bind:value={maxDebtPeriodDays}
								class="w-full accent-[var(--color-amber)]"
							/>
							<p class="text-xs text-[var(--color-text-tertiary)]">{maxDebtPeriodDays} days</p>
						</div>
						<div class="space-y-1.5">
							<label
								for="recovery-aggr"
								class="text-sm font-medium text-[var(--color-text-primary)]"
								>Recovery aggressiveness (% of income)</label
							>
							<input
								id="recovery-aggr"
								type="range"
								min="10"
								max="50"
								bind:value={recoveryAggressivenessPercent}
								class="w-full accent-[var(--color-amber)]"
							/>
							<p class="text-xs text-[var(--color-text-tertiary)]">
								{recoveryAggressivenessPercent}%
							</p>
						</div>
						<div
							class="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-bg-surface)] px-4 py-3"
						>
							<div>
								<p class="text-sm font-medium text-[var(--color-text-primary)]">
									Apply recovery deduction to allowance projection
								</p>
								<p class="text-xs text-[var(--color-text-tertiary)]">
									When on, forward allowance deducts the recovery % from available cash flow.
								</p>
							</div>
							<Switch bind:checked={debtRecoveryActive} />
						</div>
						<div
							class="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-bg-surface)] px-4 py-3"
						>
							<div>
								<p class="text-sm font-medium text-[var(--color-text-primary)]">
									Recovery-focused view
								</p>
								<p class="text-xs text-[var(--color-text-tertiary)]">
									Shows recovery horizon and plan sections. Can be set automatically by the home
									prompt.
								</p>
							</div>
							<Switch bind:checked={recoveryModeActive} />
						</div>
					</div>
				</div>

				<div class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]">
					<div class="border-border border-b px-5 py-3">
						<h2
							class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Reimbursement allowance mode
						</h2>
						<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
							Choose how open reimbursements affect allowance projections.
						</p>
					</div>
					<div class="space-y-2 px-5 py-4">
						<label
							for="reimbursement-allowance-mode"
							class="text-sm font-medium text-[var(--color-text-primary)]">Mode</label
						>
						<Select
							type="single"
							value={reimbursementAllowanceMode}
							onValueChange={(v) =>
								v && (reimbursementAllowanceMode = v as 'conservative' | 'optimistic')}
						>
							<SelectTrigger id="reimbursement-allowance-mode" class="max-w-md">
								{reimbursementAllowanceMode === 'optimistic'
									? 'Optimistic - net open expected reimbursements'
									: 'Conservative - count lending as full expense'}
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="conservative"
									>Conservative - count lending as full expense</SelectItem
								>
								<SelectItem value="optimistic"
									>Optimistic - net open expected reimbursements</SelectItem
								>
							</SelectContent>
						</Select>
					</div>
				</div>

				<div class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]">
					<div class="border-border border-b px-5 py-3">
						<h2
							class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Default reimbursement account
						</h2>
						<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
							Anchor wallet for new reimbursements and person-ledger migration when inference has no
							better match.
						</p>
					</div>
					<div class="space-y-2 px-5 py-4">
						<label
							for="default-reimbursement-anchor"
							class="text-sm font-medium text-[var(--color-text-primary)]">Account</label
						>
						<Select
							type="single"
							value={defaultReimbursementAnchorAccountId || '__none__'}
							onValueChange={(v) => {
								defaultReimbursementAnchorAccountId = v && v !== '__none__' ? v : '';
							}}
						>
							<SelectTrigger id="default-reimbursement-anchor" class="max-w-md">
								{defaultReimbursementAnchorAccountId
									? (walletAccounts.find((a) => a.id === defaultReimbursementAnchorAccountId)
											?.name ?? 'Selected account')
									: 'Not set'}
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__none__">Not set</SelectItem>
								{#each walletAccounts as account (account.id)}
									<SelectItem value={account.id}>{account.name}</SelectItem>
								{/each}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]">
					<div class="border-border border-b px-5 py-3">
						<h2
							class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Automatic person-ledger migration
						</h2>
						<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
							Default confidence levels when using automatic mode in Close person account (at least
							one required).
						</p>
					</div>
					<div class="flex flex-wrap gap-4 px-5 py-4">
						<label class="flex cursor-pointer items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={personLedgerAutomaticThreshold.high}
								onchange={(e) => {
									personLedgerAutomaticThreshold = normalizeAutomaticThreshold({
										...personLedgerAutomaticThreshold,
										high: e.currentTarget.checked
									});
								}}
							/>
							High confidence
						</label>
						<label class="flex cursor-pointer items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={personLedgerAutomaticThreshold.medium}
								onchange={(e) => {
									personLedgerAutomaticThreshold = normalizeAutomaticThreshold({
										...personLedgerAutomaticThreshold,
										medium: e.currentTarget.checked
									});
								}}
							/>
							Medium confidence
						</label>
						<label class="flex cursor-pointer items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={personLedgerAutomaticThreshold.low}
								onchange={(e) => {
									personLedgerAutomaticThreshold = normalizeAutomaticThreshold({
										...personLedgerAutomaticThreshold,
										low: e.currentTarget.checked
									});
								}}
							/>
							Low confidence
						</label>
					</div>
				</div>

				<!-- Budget category alerts (bell / insights) -->
				<div class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]">
					<div class="border-border border-b px-5 py-3">
						<h2
							class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Budget alert thresholds
						</h2>
						<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
							When category spending crosses these percentages of the category budget, Budgic
							creates High (approaching) or Critical (exceeded) alerts.
						</p>
					</div>
					<div class="space-y-4 px-5 py-4">
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-1.5">
								<label
									for="budget-alert-warn"
									class="text-sm font-medium text-[var(--color-text-primary)]"
									>Warn at (% used)</label
								>
								<input
									id="budget-alert-warn"
									type="number"
									min="50"
									max="99"
									bind:value={budgetAlertWarningAtPercent}
									class="border-border w-24 rounded-xl border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
								/>
								<p class="text-xs text-[var(--color-text-tertiary)]">
									High-tier alert from this level until the critical threshold.
								</p>
							</div>
							<div class="space-y-1.5">
								<label
									for="budget-alert-crit"
									class="text-sm font-medium text-[var(--color-text-primary)]"
									>Critical at (% used)</label
								>
								<input
									id="budget-alert-crit"
									type="number"
									min="100"
									max="200"
									bind:value={budgetAlertCriticalAtPercent}
									class="border-border w-24 rounded-xl border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
								/>
								<p class="text-xs text-[var(--color-text-tertiary)]">
									Must be at least 100% and greater than the warn threshold (adjusted on save if
									needed).
								</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Envelope borrowing -->
				<div class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]">
					<div class="border-border border-b px-5 py-3">
						<h2
							class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Envelope borrowing limits
						</h2>
						<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
							Applies when "Borrow from other categories" is selected
						</p>
					</div>
					<div class="space-y-4 px-5 py-4">
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-1.5">
								<label
									for="envelope-borrow-max-pct"
									class="text-sm font-medium text-[var(--color-text-primary)]"
									>Max per category (%)</label
								>
								<input
									id="envelope-borrow-max-pct"
									type="number"
									min="0"
									max="100"
									bind:value={envelopeBorrowMaxPerCategoryPercent}
									class="border-border w-24 rounded-xl border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
								/>
							</div>
							<div class="space-y-1.5">
								<label
									for="envelope-borrow-repayment"
									class="text-sm font-medium text-[var(--color-text-primary)]"
									>Repayment periods</label
								>
								<input
									id="envelope-borrow-repayment"
									type="number"
									min="1"
									max="6"
									bind:value={envelopeBorrowRepaymentPeriods}
									class="border-border w-20 rounded-xl border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
								/>
							</div>
						</div>
						<div class="space-y-1.5">
							<label
								for="envelope-borrow-total-limit"
								class="text-sm font-medium text-[var(--color-text-primary)]"
								>Total borrowing limit (optional)</label
							>
							<CalcExpressionInput
								id="envelope-borrow-total-limit"
								stringValue={envelopeBorrowTotalLimit}
								onStringValueChange={(s) => (envelopeBorrowTotalLimit = s)}
								decimalPlaces={2}
								min={0}
								required={false}
								placeholder="No limit"
								class="w-36"
								inputClass="border-border w-full rounded-xl border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
							/>
						</div>
						<label class="flex cursor-pointer items-center gap-2.5">
							<input
								type="checkbox"
								id="envelope-borrow-confirm-repeated"
								bind:checked={envelopeBorrowRequireConfirmationRepeated}
								class="border-border rounded accent-[var(--color-amber)]"
							/>
							<span class="text-sm text-[var(--color-text-primary)]"
								>Require confirmation for repeated borrowing</span
							>
						</label>
					</div>
				</div>

				<!-- Rollover -->
				<div class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]">
					<div class="border-border border-b px-5 py-3">
						<h2
							class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Rollover at period end
						</h2>
						<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
							What to do with leftover or overspent allowance
						</p>
					</div>
					<div class="space-y-4 px-5 py-4">
						<div class="space-y-1.5">
							<label
								for="rollover-surplus"
								class="text-sm font-medium text-[var(--color-text-primary)]"
								>Surplus (unspent)</label
							>
							<Select
								type="single"
								value={rolloverSurplusBehavior}
								onValueChange={(v) =>
									v && (rolloverSurplusBehavior = v as typeof rolloverSurplusBehavior)}
							>
								<SelectTrigger id="rollover-surplus" class="max-w-sm">
									{rolloverSurplusBehavior === 'rollover_next'
										? 'Roll over to next period'
										: rolloverSurplusBehavior === 'to_savings_goals'
											? 'Reallocate to savings goals'
											: 'Hybrid (split)'}
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="rollover_next">Roll over to next period</SelectItem>
									<SelectItem value="to_savings_goals">Reallocate to savings goals</SelectItem>
									<SelectItem value="hybrid">Hybrid (split)</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{#if rolloverSurplusBehavior === 'hybrid'}
							<div class="space-y-1.5">
								<label
									for="rollover-hybrid-ratio"
									class="text-sm font-medium text-[var(--color-text-primary)]"
									>Share to next period (%)</label
								>
								<input
									id="rollover-hybrid-ratio"
									type="number"
									min="0"
									max="100"
									bind:value={rolloverSurplusHybridRatio}
									class="border-border w-20 rounded-xl border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
								/>
							</div>
						{/if}
						<div class="space-y-1.5">
							<label
								for="rollover-deficit"
								class="text-sm font-medium text-[var(--color-text-primary)]"
								>Deficit (overspent)</label
							>
							<Select
								type="single"
								value={rolloverDeficitBehavior}
								onValueChange={(v) =>
									v && (rolloverDeficitBehavior = v as typeof rolloverDeficitBehavior)}
							>
								<SelectTrigger id="rollover-deficit" class="max-w-sm">
									{rolloverDeficitBehavior === 'reduce_next_period'
										? 'Reduce next period allowance'
										: rolloverDeficitBehavior === 'borrow_from_other'
											? 'Borrow from other categories'
											: 'One-time exception'}
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="reduce_next_period">Reduce next period allowance</SelectItem>
									<SelectItem value="borrow_from_other">Borrow from other categories</SelectItem>
									<SelectItem value="one_time_exception"
										>One-time exception (no adjustment)</SelectItem
									>
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>

				<!-- Savings opportunities -->
				<div class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]">
					<div class="border-border border-b px-5 py-3">
						<h2
							class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Savings opportunities
						</h2>
						<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
							Suggest contributing surplus to goals
						</p>
					</div>
					<div class="space-y-1.5 px-5 py-4">
						<label
							for="savings-opportunity-threshold"
							class="text-sm font-medium text-[var(--color-text-primary)]"
							>Minimum surplus to suggest</label
						>
						<CalcExpressionInput
							id="savings-opportunity-threshold"
							stringValue={savingsOpportunityMinSurplus}
							onStringValueChange={(s) => (savingsOpportunityMinSurplus = s)}
							decimalPlaces={0}
							min={0}
							required={false}
							placeholder="50"
							class="w-36"
							inputClass="border-border w-full rounded-xl border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
						/>
					</div>
				</div>
			</div>
		{/if}
	</div>
</PageLayout>
