<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { openTypePicker } from '$lib/stores/type-picker-store.svelte';
	import {
		accountService,
		transactionService,
		userService,
		insightsService,
		goalService
	} from '$lib/core/services';
	import * as Button from '$lib/components/ui/button/index.ts';
	import { EmptyState } from '$lib/components/ui/empty-state';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatAmount, formatTransactionAmount } from '$lib/utils/currency-utils';
	import { useCurrencyFormatting } from '$lib/hooks/use-currency-formatting';
	import { PageLayout } from '$lib/components/layouts';
	import { Shield } from '@lucide/svelte';
	import AllowanceSummary from '$lib/components/AllowanceSummary.svelte';
	import CountUpHero from '$lib/components/CountUpHero.svelte';
	import FirstRunChecklist from '$lib/components/FirstRunChecklist.svelte';
	import {
		planService,
		budgetService,
		userService as userServiceImport,
		negativeAllowanceService
	} from '$lib/core/services';
	import type { EnhancedAllowance } from '$lib/core/services/core/budget-service';
	import type {
		NegativeAllowanceStatus,
		RecoverySuggestion
	} from '$lib/core/services/core/negative-allowance-service';
	import type { Insight } from '$lib/core/db';
	import { db } from '$lib/core/db';
	import { tierRowsFromBudgetSummary, type AllowanceTierRow } from '$lib/utils/budget-tier-display';
	import { alertActionUrlForInsight } from '$lib/utils/alert-tiers';
	import { notificationsService } from '$lib/core/services';
	import { dateUtils } from '$lib/utils/date-utils';

	const { data } = $props<{ data: any }>();

	let accounts = $state<any[]>([]);
	let totalBalance = $state(0);
	let recentTransactions = $state<any[]>([]);
	let budgetCategories = $state<Record<string, any>>({});
	let userCurrency = $state<string>('USD');
	let username = $state('');
	let globalAllowance = $state<EnhancedAllowance | null>(null);
	let isLoadingAllowance = $state(false);
	let negativeAllowanceStatus = $state<NegativeAllowanceStatus | null>(null);
	let recoverySuggestions = $state<RecoverySuggestion[]>([]);
	let allowanceConfidence = $state<{
		ratio: number;
		tier: 'low' | 'medium' | 'high';
		unclassifiedSpend: number;
		totalSpend: number;
	} | null>(null);
	let allowanceTierRows = $state<AllowanceTierRow[]>([]);
	/** Panel-tier alert groups for "Needs attention" (Critical + High, grouped, ~3 max) */
	let attentionGroups = $state<Insight[][]>([]);
	let weekStartsOn = $state(0);
	let isLoaded = $state(false);
	let activeGoals = $state<any[]>([]);
	let thisWeekSpent = $state<number>(0);
	let thisWeekPlanned = $state<number | null>(null);
	let firstRunChecklistComplete = $state(false);
	let accruedNetWorthDelta = $state(0);

	onMount(async () => {
		try {
			const preferences = await userService.getUserPreferences();
			userCurrency = preferences?.currency || 'USD';
			username = preferences?.username || '';
			weekStartsOn = preferences.weekStartsOn ?? 0;
			firstRunChecklistComplete =
				(preferences as { firstRunChecklistComplete?: boolean })?.firstRunChecklistComplete ??
				false;

			const [accountsData, balanceData, transactionsData, categoriesData] = await Promise.all([
				accountService.getAccounts(),
				accountService.getTotalBalance(),
				transactionService.getAllTransactions(),
				db.getActiveCategories()
			]);

			accounts = accountsData;
			totalBalance = balanceData;
			if (preferences?.includeAccruedInNetWorth) {
				const nw = await accountService.getNetWorthDisplay();
				accruedNetWorthDelta = nw.accruedDelta;
			} else {
				accruedNetWorthDelta = 0;
			}
			recentTransactions = transactionsData.filter((t: any) => t && !t.deletedAt).slice(0, 8);
			budgetCategories = categoriesData.reduce(
				(acc: Record<string, any>, category: any) => {
					acc[category.id] = category;
					return acc;
				},
				{} as Record<string, any>
			);

			await loadGlobalAllowance();
			attentionGroups = await insightsService.getPanelAlertGroupsForHome(3);
			await loadGoalsAndThisWeek();
		} catch (error) {
			console.error('Error loading dashboard data:', error);
		} finally {
			isLoaded = true;
		}
	});

	// First-run checklist: mark complete when all 3 steps done, then hide permanently (UX_SPEC §8)
	const hasBudgetCategory = $derived(
		Object.values(budgetCategories).some(
			(c: { budgetAmount?: number }) => (c?.budgetAmount ?? 0) > 0
		)
	);
	$effect(() => {
		if (
			!isLoaded ||
			firstRunChecklistComplete ||
			accounts.length === 0 ||
			recentTransactions.length === 0 ||
			!hasBudgetCategory
		)
			return;
		userService.updateUserPreferences({ firstRunChecklistComplete: true }).then(() => {
			firstRunChecklistComplete = true;
		});
	});

	async function loadGlobalAllowance() {
		isLoadingAllowance = true;
		try {
			const [enhancedAllowance, budgetSummary] = await Promise.all([
				planService.getEnhancedAllowance(),
				budgetService.getBudgetSummary()
			]);
			globalAllowance = enhancedAllowance;
			allowanceConfidence = budgetSummary?.confidence ?? null;
			allowanceTierRows = tierRowsFromBudgetSummary(budgetSummary);
			if (globalAllowance) {
				const prefs = await userServiceImport.getUserPreferences();
				const handling =
					(prefs as { negativeAllowanceHandling?: string }).negativeAllowanceHandling ??
					'allow_with_strong_warning';
				negativeAllowanceStatus = await negativeAllowanceService.checkNegativeAllowance(
					globalAllowance,
					handling as
						| 'block_with_warning'
						| 'allow_with_strong_warning'
						| 'borrow_from_future'
						| 'borrow_from_other_categories'
				);
				recoverySuggestions = negativeAllowanceStatus.isNegative
					? negativeAllowanceService.getRecoverySuggestions(globalAllowance)
					: [];
				if (negativeAllowanceStatus.isNegative) {
					await negativeAllowanceService.recordCurrentNegativeAllowanceIfAny(
						globalAllowance,
						handling as
							| 'block_with_warning'
							| 'allow_with_strong_warning'
							| 'borrow_from_future'
							| 'borrow_from_other_categories'
					);
				}
			} else {
				negativeAllowanceStatus = null;
				recoverySuggestions = [];
			}
		} catch (error) {
			console.error('Error loading global allowance:', error);
			allowanceTierRows = [];
		} finally {
			isLoadingAllowance = false;
		}
	}

	async function loadGoalsAndThisWeek() {
		try {
			activeGoals = await goalService.getActiveGoalsForHomeSnapshot(3);

			const allTx = await transactionService.getAllTransactions();
			const now = new Date();
			const weekStart = dateUtils.getWeekStart(weekStartsOn, now);
			const weekEnd = dateUtils.getWeekEnd(weekStartsOn, now);

			const weekTransactions = allTx.filter((t: any) => {
				if (!t || t.deletedAt) return false;
				const d = new Date(t.clearedDate || t.plannedDate || t.createdAt);
				return d >= weekStart && d < weekEnd && t.type === 'expense' && t.status === 'cleared';
			});
			thisWeekSpent = weekTransactions.reduce(
				(sum: number, t: any) => sum + Math.abs(t.amount || 0),
				0
			);

			const allowance = await planService.getEnhancedAllowance();
			if (allowance?.total?.monthly) {
				thisWeekPlanned = (allowance.total.monthly / 30) * 7;
			}
		} catch (error) {
			console.error('Error loading goals or weekly data:', error);
		}
	}

	const currencyFormat = useCurrencyFormatting();

	async function handleAttentionGroupClick(group: Insight[]) {
		const primary = group[0];
		const url = alertActionUrlForInsight(primary);
		for (const i of group) {
			await notificationsService.markAsRead(i.id);
		}
		window.dispatchEvent(new CustomEvent('alerts-updated'));
		if (url) {
			await goto(url);
		} else {
			window.dispatchEvent(new CustomEvent('open-alerts-panel'));
		}
	}

	function attentionCtaLabel(insight: Insight): string {
		if (insight.actionText) return insight.actionText;
		const url = alertActionUrlForInsight(insight);
		return url ? 'View →' : 'External step';
	}

	/** Time-aware greeting per UX_SPEC §3.1 (Good morning / afternoon / evening) */
	function timeGreeting(): string {
		const hour = new Date().getHours();
		if (hour < 12) return 'Good morning';
		if (hour < 18) return 'Good afternoon';
		return 'Good evening';
	}

	function formatBalance(amount: number) {
		return currencyFormat.formatBalance(amount, userCurrency);
	}

	function getCategoryName(transaction: any) {
		if (transaction.categoryId && budgetCategories[transaction.categoryId]) {
			return budgetCategories[transaction.categoryId].name;
		}
		if (transaction.categoryId) {
			return transaction.categoryId
				.replace(/-/g, ' ')
				.replace(/\b\w/g, (l: string) => l.toUpperCase());
		}
		return 'Uncategorized';
	}

	function getAccountName(accountId: string) {
		const account = accounts.find((a) => a.id === accountId);
		return account?.name || 'Unknown';
	}

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		if (date.toDateString() === today.toDateString()) return 'Today';
		if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	// Group transactions by date label
	const groupedTransactions = $derived(() => {
		const groups: Record<string, any[]> = {};
		for (const t of recentTransactions) {
			const label = formatDate(t.clearedDate || t.plannedDate || t.createdAt);
			if (!groups[label]) groups[label] = [];
			groups[label].push(t);
		}
		return Object.entries(groups);
	});
</script>

<svelte:head>
	<title>Home · Budgic</title>
</svelte:head>

<PageLayout>
	<div class="flex min-h-full flex-col">
		<!-- ── Balance hero (tap → /accounts) ── -->
		<section
			class="animate-card-enter mx-auto max-w-sm px-5 pt-10 pb-8 sm:px-6"
			style="animation-delay: 0ms"
		>
			<p
				class="text-muted-foreground mb-3 text-center text-xs font-medium tracking-widest uppercase"
			>
				{timeGreeting()}{username ? `, ${username}` : ''}
			</p>

			<button
				type="button"
				class="block w-full rounded-lg text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)]"
				onclick={() => goto('/accounts')}
			>
				{#if isLoaded}
					<CountUpHero
						value={totalBalance}
						format={(n) => formatBalance(n)}
						ready={isLoaded}
						delay={80}
					/>
				{:else}
					<Skeleton class="mx-auto h-14 w-48 rounded-lg bg-[var(--color-bg-surface)]" />
				{/if}
			</button>

			<a
				href="/accounts"
				class="text-muted-foreground mt-3 block text-center text-xs transition-colors hover:text-[var(--color-text-primary)]"
			>
				{#if accounts.length > 0}
					↑ {accounts.length} account{accounts.length === 1 ? '' : 's'}
				{:else}
					Add your first account
				{/if}
			</a>
			{#if accruedNetWorthDelta !== 0}
				<p class="text-muted-foreground mt-2 text-center text-xs">
					Including accrued: {formatBalance(accruedNetWorthDelta)}
				</p>
			{/if}
		</section>

		<!-- ── Divider ── -->
		<div class="bg-border mx-5 mb-6 h-px sm:mx-6"></div>

		<div class="mx-auto flex w-full max-w-2xl flex-col space-y-8 px-5 pb-8 sm:px-6">
			<!-- ── First-run checklist (hide when all 3 steps complete, UX_SPEC §8) ── -->
			{#if !firstRunChecklistComplete}
				<FirstRunChecklist
					hasAccount={accounts.length > 0}
					hasTransaction={recentTransactions.length > 0}
					{hasBudgetCategory}
				/>
			{/if}

			<!-- ── Allowance (tap → /plan?tab=allowance) ── -->
			<section class="animate-card-enter" style="animation-delay: 60ms">
				<a
					href="/plan?tab=allowance"
					class="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)]"
				>
					<AllowanceSummary
						allowance={globalAllowance}
						isLoading={isLoadingAllowance}
						negativeStatus={negativeAllowanceStatus}
						{recoverySuggestions}
						confidence={allowanceConfidence}
						tierRows={allowanceTierRows}
					/>
				</a>
			</section>

			<!-- ── Needs attention: Critical tier only, 2–3 max (Phase 5 unified alerts) ── -->
			{#if attentionGroups.length > 0}
				<section class="animate-card-enter" style="animation-delay: 120ms">
					<div class="mb-3 flex items-center justify-between">
						<h2
							class="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase"
						>
							<Shield class="h-3.5 w-3.5 text-[var(--color-warm-coral)]" />
							Needs attention
						</h2>
						<button
							type="button"
							class="text-muted-foreground text-xs transition-colors hover:text-[var(--color-text-primary)]"
							onclick={() => window.dispatchEvent(new CustomEvent('open-alerts-panel'))}
						>
							All alerts →
						</button>
					</div>
					<div class="space-y-2">
						{#each attentionGroups as group (group.map((i) => i.id).join('-'))}
							{@const alert = group[0]}
							<button
								type="button"
								class="squircle-2xl squircle-border flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:opacity-90"
								style="--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);"
								onclick={() => handleAttentionGroupClick(group)}
							>
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium text-[var(--color-warm-coral)]">
										{alert.title}
										{#if group.length > 1}
											<span class="text-muted-foreground font-normal"
												>· +{group.length - 1} similar</span
											>
										{/if}
									</div>
									<div class="text-muted-foreground truncate text-xs">{alert.message}</div>
								</div>
								<span class="text-muted-foreground ml-2 shrink-0 text-xs"
									>{attentionCtaLabel(alert)}</span
								>
							</button>
						{/each}
					</div>
				</section>
			{/if}

			<!-- ── Spending pace (weekly plan slice, not daily allowance) ── -->
			<section class="animate-card-enter" style="animation-delay: 140ms">
				<h2 class="text-muted-foreground mb-3 text-xs font-semibold tracking-widest uppercase">
					Spending pace
				</h2>
				<div class="squircle-4xl squircle-border bg-card px-4 py-4">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-sm font-medium">
								{formatAmount(thisWeekSpent, userCurrency)} spent this week
							</p>
							{#if thisWeekPlanned != null}
								<p class="text-muted-foreground mt-0.5 text-xs">
									{thisWeekSpent <= thisWeekPlanned
										? 'On track vs your weekly plan slice'
										: 'Over your weekly plan slice'}
								</p>
							{:else}
								<p class="text-muted-foreground mt-0.5 text-xs">
									Set a plan to compare weekly pace
								</p>
							{/if}
						</div>
						{#if thisWeekPlanned != null && thisWeekPlanned > 0}
							<div
								class="h-2 max-w-24 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-surface)]"
							>
								<div
									class="h-full rounded-full transition-all {thisWeekSpent > thisWeekPlanned
										? 'bg-[var(--color-warm-coral)]'
										: 'bg-[var(--color-sage-green)]'}"
									style="width: {Math.min(100, (thisWeekSpent / thisWeekPlanned) * 100)}%"
								></div>
							</div>
						{/if}
					</div>
				</div>
			</section>

			<!-- ── Recent transactions ── -->
			<section class="animate-card-enter" style="animation-delay: 180ms">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
						Recent
					</h2>
					<a
						href="/transactions"
						class="text-muted-foreground text-xs transition-colors hover:text-[var(--color-text-primary)]"
					>
						View all →
					</a>
				</div>

				{#if !isLoaded}
					<div class="squircle-4xl squircle-border bg-card overflow-hidden">
						{#each Array(4) as _}
							<div class="border-border flex items-center gap-3 border-b px-4 py-3.5 last:border-0">
								<div class="flex-1 space-y-1.5">
									<Skeleton class="h-3.5 w-32 rounded bg-[var(--color-bg-surface)]" />
									<Skeleton class="h-2.5 w-20 rounded bg-[var(--color-bg-surface)]" />
								</div>
								<Skeleton class="h-3.5 w-16 rounded bg-[var(--color-bg-surface)]" />
							</div>
						{/each}
					</div>
				{:else if recentTransactions.length === 0}
					<EmptyState variant="card" body="Nothing yet." class="px-4 py-10">
						{#snippet children()}
							<button
								type="button"
								class="text-amber mt-1 text-sm hover:underline"
								onclick={() => openTypePicker()}
							>
								Add your first transaction
							</button>
						{/snippet}
					</EmptyState>
				{:else}
					<div class="squircle-4xl squircle-border bg-card overflow-hidden">
						{#each groupedTransactions() as [dateLabel, txGroup], gi}
							<!-- Date group header -->
							<div class="border-border border-b bg-[var(--color-bg-secondary)] px-4 py-2">
								<span class="text-muted-foreground text-xs font-medium tracking-widest uppercase">
									{dateLabel}
								</span>
							</div>
							<!-- Transactions in group -->
							{#each txGroup as transaction, ti (transaction.id)}
								<button
									type="button"
									class="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--color-bg-surface)]
										{gi === groupedTransactions().length - 1 && ti === txGroup.length - 1
										? ''
										: 'border-border border-b'}"
									onclick={() => goto(`/transactions/add/${transaction.id}`)}
								>
									<div class="min-w-0 flex-1">
										<div class="truncate text-sm leading-snug font-medium">
											{transaction.description || 'No description'}
										</div>
										<div class="text-muted-foreground mt-0.5 text-xs">
											{getCategoryName(transaction)} · {getAccountName(transaction.accountId)}
										</div>
									</div>
									<div
										class="text-amount shrink-0 {(transaction.amount ?? 0) >= 0
											? 'text-[var(--color-sage-green)]'
											: 'text-foreground'}"
									>
										{formatTransactionAmount(
											transaction.amount,
											transaction.currency || userCurrency,
											true
										)}
									</div>
								</button>
							{/each}
						{/each}
					</div>
				{/if}
			</section>

			<!-- ── Goals snapshot (hide if no active goals) ── -->
			{#if activeGoals.length > 0}
				<section class="animate-card-enter" style="animation-delay: 220ms">
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
							Goals
						</h2>
						<a
							href="/plan?tab=goals"
							class="text-muted-foreground text-xs transition-colors hover:text-[var(--color-text-primary)]"
						>
							View all →
						</a>
					</div>
					<div class="space-y-2">
						{#each activeGoals as goal (goal.id)}
							<a
								href="/plan?tab=goals"
								class="squircle-2xl squircle-border bg-card flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-bg-surface)]"
							>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{goal.name || 'Goal'}</p>
									<div
										class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-surface)]"
									>
										<div
											class="h-full rounded-full bg-[var(--color-amber)] transition-all"
											style="width: {goal.targetAmount > 0
												? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100)
												: 0}%"
										></div>
									</div>
								</div>
								<span class="text-muted-foreground shrink-0 text-xs">
									{goal.targetAmount > 0
										? Math.round((goal.currentAmount / goal.targetAmount) * 100)
										: 0}%
								</span>
							</a>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	</div>
</PageLayout>
