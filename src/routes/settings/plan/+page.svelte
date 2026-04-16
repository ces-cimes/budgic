<script lang="ts">
	import { userService, occasionService } from '$lib/core/services/index.ts';
	import type { NegativeAllowanceHandling } from '$lib/core/services/core/negative-allowance-service';
	import type { Occasion } from '$lib/core/db';
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
	import { CalendarDays, Plus, RefreshCw, Trash2 } from '@lucide/svelte';

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

	// Occasions (merged from /settings/occasions)
	let occasions = $state<Occasion[]>([]);
	let occasionsLoading = $state(false);
	let occasionsDetecting = $state(false);
	let occasionsError = $state<string | null>(null);
	let occasionsSuccess = $state<string | null>(null);
	let showAddOccasionForm = $state(false);
	let addOccasionTitle = $state('');
	let addOccasionType = $state<'weekly' | 'monthly' | 'annual'>('weekly');
	let addOccasionDayOfWeek = $state(5);
	let addOccasionExpectedDelta = $state(0);
	let addOccasionCurrency = $state('USD');

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
			}
		} catch (e) {
			console.error('Failed to load plan settings', e);
		} finally {
			isLoading = false;
		}
		loadOccasions();
	});

	async function loadOccasions() {
		occasionsLoading = true;
		try {
			occasions = await occasionService.getOccasions(undefined, { includeInactive: true });
		} catch (e) {
			occasionsError = e instanceof Error ? e.message : 'Failed to load occasions';
		} finally {
			occasionsLoading = false;
		}
	}

	async function detectOccasionsFromHistory() {
		occasionsDetecting = true;
		occasionsError = null;
		occasionsSuccess = null;
		try {
			const created = await occasionService.detectOccasionsFromTransactions(undefined, {
				daysLookback: 180,
				minConfidence: 65
			});
			await loadOccasions();
			occasionsSuccess =
				created.length > 0
					? `Detected ${created.length} occasion(s) from your transaction history.`
					: 'No new occasions detected. Try again with more transaction history.';
		} catch (e) {
			occasionsError = e instanceof Error ? e.message : 'Detection failed';
		} finally {
			occasionsDetecting = false;
		}
	}

	async function addOccasionSubmit() {
		if (!addOccasionTitle.trim()) return;
		occasionsError = null;
		try {
			let pattern: string;
			if (addOccasionType === 'weekly') {
				pattern = JSON.stringify({ type: 'weekly', dayOfWeek: addOccasionDayOfWeek });
			} else if (addOccasionType === 'monthly') {
				pattern = JSON.stringify({
					type: 'monthly',
					weekOfMonth: 1,
					dayOfWeek: addOccasionDayOfWeek
				});
			} else {
				pattern = JSON.stringify({ type: 'annual', month: 12, dayOfMonth: 25 });
			}
			await occasionService.createOccasion({
				title: addOccasionTitle.trim(),
				occasionType: addOccasionType,
				pattern,
				expectedAmountDelta: addOccasionExpectedDelta,
				currency: addOccasionCurrency,
				source: 'user_defined'
			});
			showAddOccasionForm = false;
			addOccasionTitle = '';
			addOccasionExpectedDelta = 0;
			await loadOccasions();
			occasionsSuccess = 'Occasion added.';
		} catch (e) {
			occasionsError = e instanceof Error ? e.message : 'Failed to add';
		}
	}

	async function toggleOccasionActive(o: Occasion) {
		await occasionService.updateOccasion(o.id, { isActive: !o.isActive });
		await loadOccasions();
	}

	async function deleteOccasion(id: string) {
		await occasionService.deleteOccasion(id);
		await loadOccasions();
	}

	function getOccasionPatternLabel(o: Occasion): string {
		try {
			const p = JSON.parse(o.pattern);
			if (p.type === 'weekly' && p.dayOfWeek != null) {
				const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
				return days[p.dayOfWeek];
			}
			if (p.type === 'monthly') return 'Monthly';
			if (p.type === 'annual') return `Annual (${p.month}/${p.dayOfMonth ?? 1})`;
		} catch {}
		return o.occasionType;
	}

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
				debtRecoveryActive
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
			buttonProps={[{ text: 'Save', onclick: save, size: 'sm', disabled: isSaving }]}
		/>
	{/snippet}

	<div class="mx-auto max-w-2xl px-4 py-6">
		{#if isLoading}
			<div class="h-96 animate-pulse rounded-2xl bg-[var(--color-bg-tertiary)]"></div>
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
									Recovery mode active
								</p>
								<p class="text-xs text-[var(--color-text-tertiary)]">
									When on, forward allowance deducts the recovery % from available cash flow.
								</p>
							</div>
							<Switch bind:checked={debtRecoveryActive} />
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
							<input
								id="envelope-borrow-total-limit"
								type="number"
								min="0"
								placeholder="No limit"
								bind:value={envelopeBorrowTotalLimit}
								class="border-border w-36 rounded-xl border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
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
						<input
							id="savings-opportunity-threshold"
							type="number"
							min="0"
							step="10"
							placeholder="50"
							bind:value={savingsOpportunityMinSurplus}
							class="border-border w-36 rounded-xl border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
						/>
					</div>
				</div>

				<!-- Occasions (merged from /settings/occasions) -->
				<div
					id="occasions"
					class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)] opacity-75"
				>
					<div class="border-border border-b px-5 py-3">
						<div class="flex items-center gap-2">
							<h2
								class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
							>
								Occasions
							</h2>
							<span
								class="rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase"
								style="background: color-mix(in oklch, var(--color-amber) 15%, transparent); color: var(--color-amber);"
								>Legacy</span
							>
						</div>
						<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
							Recurring spending events adjust your allowance so you can plan ahead.
						</p>
						<p class="mt-1 text-[10px] text-[var(--color-amber)]">
							Planned for replacement by recurring patterns &amp; deadline-based planned
							transactions (Phase 5). Existing occasions continue to work.
						</p>
					</div>
					<div class="space-y-4 px-5 py-4">
						{#if occasionsError}
							<div
								class="rounded-xl border border-[var(--color-warm-coral)]/30 bg-[var(--color-warm-coral)]/8 px-4 py-3"
							>
								<p class="text-sm text-[var(--color-warm-coral)]">{occasionsError}</p>
							</div>
						{/if}
						{#if occasionsSuccess}
							<div
								class="rounded-xl border border-[var(--color-sage-green)]/30 bg-[var(--color-sage-green)]/8 px-4 py-3"
							>
								<p class="text-sm text-[var(--color-sage-green)]">{occasionsSuccess}</p>
							</div>
						{/if}
						<div class="flex gap-2">
							<button
								type="button"
								onclick={detectOccasionsFromHistory}
								disabled={occasionsDetecting}
								class="border-border flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
							>
								<RefreshCw class="size-3.5" />
								{occasionsDetecting ? 'Detecting…' : 'Detect from history'}
							</button>
							<button
								type="button"
								onclick={() => (showAddOccasionForm = !showAddOccasionForm)}
								class="flex items-center gap-1.5 rounded-xl border border-[var(--color-amber)]/30 bg-[var(--color-amber-subtle)] px-4 py-2 text-sm font-medium text-[var(--color-amber)] transition-colors"
							>
								<Plus class="size-3.5" />
								Add occasion
							</button>
						</div>
						{#if showAddOccasionForm}
							<div
								class="border-border overflow-hidden rounded-xl border bg-[var(--color-bg-surface)]"
							>
								<div class="border-border border-b px-4 py-2.5">
									<h3
										class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
									>
										New occasion
									</h3>
								</div>
								<div class="space-y-4 px-4 py-4">
									<div class="space-y-1.5">
										<label
											for="add-occasion-title"
											class="text-sm font-medium text-[var(--color-text-primary)]">Title</label
										>
										<input
											id="add-occasion-title"
											bind:value={addOccasionTitle}
											placeholder="e.g. Friday nights"
											class="border-border w-full max-w-xs rounded-xl border bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
										/>
									</div>
									<div class="flex flex-wrap gap-3">
										<div class="space-y-1.5">
											<p class="text-xs font-medium text-[var(--color-text-secondary)]">Type</p>
											<Select
												type="single"
												value={addOccasionType}
												onValueChange={(v) => v && (addOccasionType = v as typeof addOccasionType)}
											>
												<SelectTrigger class="w-36">
													{addOccasionType === 'weekly'
														? 'Weekly'
														: addOccasionType === 'monthly'
															? 'Monthly'
															: 'Annual'}
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="weekly">Weekly</SelectItem>
													<SelectItem value="monthly">Monthly</SelectItem>
													<SelectItem value="annual">Annual</SelectItem>
												</SelectContent>
											</Select>
										</div>
										{#if addOccasionType === 'weekly'}
											<div class="space-y-1.5">
												<p class="text-xs font-medium text-[var(--color-text-secondary)]">Day</p>
												<Select
													type="single"
													value={String(addOccasionDayOfWeek)}
													onValueChange={(v) => v && (addOccasionDayOfWeek = parseInt(v, 10))}
												>
													<SelectTrigger class="w-32">
														{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
															addOccasionDayOfWeek
														]}
													</SelectTrigger>
													<SelectContent>
														{#each [0, 1, 2, 3, 4, 5, 6] as d}
															<SelectItem value={String(d)}
																>{[
																	'Sunday',
																	'Monday',
																	'Tuesday',
																	'Wednesday',
																	'Thursday',
																	'Friday',
																	'Saturday'
																][d]}</SelectItem
															>
														{/each}
													</SelectContent>
												</Select>
											</div>
										{/if}
										<div class="space-y-1.5">
											<label
												for="add-occasion-delta"
												class="text-xs font-medium text-[var(--color-text-secondary)]"
												>Expected change ({addOccasionCurrency})</label
											>
											<input
												id="add-occasion-delta"
												type="number"
												bind:value={addOccasionExpectedDelta}
												placeholder="0"
												class="border-border w-24 rounded-xl border bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
											/>
										</div>
									</div>
									<button
										type="button"
										onclick={addOccasionSubmit}
										class="rounded-xl bg-[var(--color-amber)] px-5 py-2 text-sm font-semibold text-[var(--color-bg-primary)]"
									>
										Add
									</button>
								</div>
							</div>
						{/if}
						{#if occasionsLoading}
							<div class="space-y-2">
								{#each [1, 2, 3] as _}
									<div class="h-14 animate-pulse rounded-xl bg-[var(--color-bg-surface)]"></div>
								{/each}
							</div>
						{:else if occasions.length === 0}
							<div
								class="border-border rounded-xl border bg-[var(--color-bg-surface)] p-8 text-center"
							>
								<CalendarDays class="mx-auto mb-3 size-8 text-[var(--color-text-tertiary)]" />
								<p class="text-sm text-[var(--color-text-secondary)]">No occasions yet.</p>
								<p class="mt-1 text-xs text-[var(--color-text-tertiary)]">
									Detect from history or add your own.
								</p>
							</div>
						{:else}
							<div
								class="divide-border border-border divide-y overflow-hidden rounded-xl border bg-[var(--color-bg-surface)]"
							>
								{#each occasions as o}
									<div class="flex items-center gap-3 px-4 py-3">
										<Switch checked={o.isActive} onCheckedChange={() => toggleOccasionActive(o)} />
										<div class="min-w-0 flex-1">
											<p class="text-sm font-medium text-[var(--color-text-primary)]">{o.title}</p>
											<p class="text-xs text-[var(--color-text-tertiary)]">
												{getOccasionPatternLabel(o)} · {o.source === 'detected'
													? `Detected (${o.confidence}%)`
													: 'User-defined'}
												· {formatTransactionAmount(o.expectedAmountDelta, o.currency)}/occurrence
											</p>
										</div>
										<button
											type="button"
											onclick={() => deleteOccasion(o.id)}
											class="shrink-0 rounded-lg p-1.5 text-[var(--color-warm-coral)] transition-colors hover:bg-[var(--color-warm-coral)]/10"
											title="Delete"
										>
											<Trash2 class="size-4" />
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>
</PageLayout>
