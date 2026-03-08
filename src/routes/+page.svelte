<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { openTypePicker } from '$lib/stores/type-picker-store.svelte';
	import {
		accountService,
		transactionService,
		userService,
		goalsService,
		insightsService
	} from '$lib/core/services';
	import { db } from '$lib/core/db';
	import * as Button from '$lib/components/ui/button/index.ts';
	import { formatAmount, formatTransactionAmount } from '$lib/utils/currency-utils';
	import { useCurrencyFormatting } from '$lib/hooks/use-currency-formatting';
	import { PageLayout } from '$lib/components/layouts';
	import { Shield } from '@lucide/svelte';
	import AllowanceSummary from '$lib/components/AllowanceSummary.svelte';
	import CountUpHero from '$lib/components/CountUpHero.svelte';
	import FirstRunChecklist from '$lib/components/FirstRunChecklist.svelte';
	import {
		planService,
		userService as userServiceImport,
		negativeAllowanceService
	} from '$lib/core/services';
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import type { NegativeAllowanceStatus, RecoverySuggestion } from '$lib/core/services/core/negative-allowance-service';
	import type { Insight } from '$lib/core/db';

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
	/** Critical tier alerts for "Needs attention" (Phase 5: unified alerts, 2–3 max) */
	let criticalAlerts = $state<Insight[]>([]);
	let isLoaded = $state(false);
	let activeGoals = $state<any[]>([]);
	let thisWeekSpent = $state<number>(0);
	let thisWeekPlanned = $state<number | null>(null);
	let firstRunChecklistComplete = $state(false);

	onMount(async () => {
		try {
			const preferences = await userService.getUserPreferences();
			userCurrency = preferences?.currency || 'USD';
			username = preferences?.username || '';
			firstRunChecklistComplete = (preferences as { firstRunChecklistComplete?: boolean })
				?.firstRunChecklistComplete ?? false;

			const [accountsData, balanceData, transactionsData, categoriesData] = await Promise.all([
				accountService.getAccounts(),
				accountService.getTotalBalance(),
				transactionService.getAllTransactions(),
				db.getActiveCategories()
			]);

			accounts = accountsData;
			totalBalance = balanceData;
			recentTransactions = transactionsData.filter((t: any) => t && !t.deletedAt).slice(0, 8);
			budgetCategories = categoriesData.reduce(
				(acc: Record<string, any>, category: any) => {
					acc[category.id] = category;
					return acc;
				},
				{} as Record<string, any>
			);

			await loadGlobalAllowance();
			criticalAlerts = await insightsService.getCriticalAlertsForHome(3);
			await loadGoalsAndThisWeek();
		} catch (error) {
			console.error('Error loading dashboard data:', error);
		} finally {
			isLoaded = true;
		}
	});

	// First-run checklist: mark complete when all 3 steps done, then hide permanently (UX_SPEC §8)
	const hasBudgetCategory = $derived(
		Object.values(budgetCategories).some((c: { budgetAmount?: number }) => (c?.budgetAmount ?? 0) > 0)
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
			globalAllowance = await planService.getEnhancedAllowance();
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
		} finally {
			isLoadingAllowance = false;
		}
	}

	async function loadGoalsAndThisWeek() {
		try {
			const goalsData = await goalsService.getGoalsData();
			activeGoals = (goalsData.activeGoals || []).slice(0, 3);

			const allTx = await transactionService.getAllTransactions();
			const now = new Date();
			const weekStart = new Date(now);
			weekStart.setDate(now.getDate() - now.getDay());
			weekStart.setHours(0, 0, 0, 0);
			const weekEnd = new Date(weekStart);
			weekEnd.setDate(weekStart.getDate() + 7);

			const weekTransactions = allTx.filter((t: any) => {
				if (!t || t.deletedAt) return false;
				const d = new Date(t.clearedDate || t.plannedDate || t.createdAt);
				return d >= weekStart && d < weekEnd && t.type === 'expense' && t.status === 'cleared';
			});
			thisWeekSpent = weekTransactions.reduce((sum: number, t: any) => sum + Math.abs(t.amount || 0), 0);

			const allowance = await planService.getEnhancedAllowance();
			if (allowance?.total?.monthly) {
				thisWeekPlanned = (allowance.total.monthly / 30) * 7;
			}
		} catch (error) {
			console.error('Error loading goals or weekly data:', error);
		}
	}

	const currencyFormat = useCurrencyFormatting();

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
	<div class="flex flex-col min-h-full">

		<!-- ── Balance hero (tap → /accounts) ── -->
		<section
			class="px-5 sm:px-6 pt-10 pb-8 animate-card-enter max-w-sm mx-auto"
			style="animation-delay: 0ms"
		>
			<p class="text-xs text-center tracking-widest uppercase text-muted-foreground mb-3 font-medium">
				{username ? `Hey ${username} ·` : ''} Total balance
			</p>

			<button
				type="button"
				class="block w-full text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)] rounded-lg"
				onclick={() => goto('/accounts')}
			>
				{#if isLoaded}
					<CountUpHero value={totalBalance} format={(n) => formatBalance(n)} ready={isLoaded} delay={80} />
				{:else}
					<div class="h-14 w-48 rounded-lg bg-[var(--color-bg-surface)] animate-pulse mx-auto"></div>
				{/if}
			</button>

			<a
				href="/accounts"
				class="block text-xs text-center text-muted-foreground mt-3 hover:text-[var(--color-text-primary)] transition-colors"
			>
				{#if accounts.length > 0}
					↑ {accounts.length} account{accounts.length === 1 ? '' : 's'}
				{:else}
					Add your first account
				{/if}
			</a>
		</section>

		<!-- ── Divider ── -->
		<div class="mx-5 sm:mx-6 h-px bg-border mb-6"></div>

		<div class="px-5 sm:px-6 max-w-2xl mx-auto w-full flex flex-col space-y-8 pb-8">
			<!-- ── First-run checklist (hide when all 3 steps complete, UX_SPEC §8) ── -->
			{#if !firstRunChecklistComplete}
				<FirstRunChecklist
					hasAccount={accounts.length > 0}
					hasTransaction={recentTransactions.length > 0}
					hasBudgetCategory={hasBudgetCategory}
				/>
			{/if}

			<!-- ── Allowance (tap → /plan?tab=allowance) ── -->
			<section class="animate-card-enter" style="animation-delay: 60ms">
				<a href="/plan?tab=allowance" class="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)] rounded-2xl">
					<AllowanceSummary
						allowance={globalAllowance}
						isLoading={isLoadingAllowance}
						negativeStatus={negativeAllowanceStatus}
						recoverySuggestions={recoverySuggestions}
					/>
				</a>
			</section>

			<!-- ── Needs attention: Critical tier only, 2–3 max (Phase 5 unified alerts) ── -->
			{#if criticalAlerts.length > 0}
				<section class="animate-card-enter" style="animation-delay: 120ms">
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
							<Shield class="h-3.5 w-3.5 text-[var(--color-warm-coral)]" />
							Needs attention
						</h2>
						<button
							type="button"
							class="text-xs text-muted-foreground hover:text-[var(--color-text-primary)] transition-colors"
							onclick={() => window.dispatchEvent(new CustomEvent('open-alerts-panel'))}
						>
							All alerts →
						</button>
					</div>
					<div class="space-y-2">
						{#each criticalAlerts as alert (alert.id)}
							<a
								href={alert.actionUrl || '#'}
								class="flex items-center justify-between squircle-2xl squircle-border px-4 py-3 transition-colors hover:opacity-90"
								style="--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);"
							>
								<div class="min-w-0 flex-1">
									<div class="text-sm font-medium text-[var(--color-warm-coral)] truncate">{alert.title}</div>
									<div class="text-xs text-muted-foreground truncate">{alert.message}</div>
								</div>
								{#if alert.actionUrl}
									<span class="text-xs text-muted-foreground shrink-0 ml-2">View →</span>
								{/if}
							</a>
						{/each}
					</div>
				</section>
			{/if}

			<!-- ── This week ── -->
			<section class="animate-card-enter" style="animation-delay: 140ms">
				<h2 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
					This week
				</h2>
				<div class="squircle-4xl squircle-border bg-card px-4 py-4">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-sm font-medium">
								{formatAmount(thisWeekSpent, userCurrency)} spent
							</p>
							{#if thisWeekPlanned != null}
								<p class="text-xs text-muted-foreground mt-0.5">
									{thisWeekSpent <= thisWeekPlanned
										? 'On track'
										: 'Over your weekly plan'}
								</p>
							{:else}
								<p class="text-xs text-muted-foreground mt-0.5">
									Set a plan to compare
								</p>
							{/if}
						</div>
						{#if thisWeekPlanned != null && thisWeekPlanned > 0}
							<div class="flex-1 max-w-24 h-2 rounded-full bg-[var(--color-bg-surface)] overflow-hidden">
								<div
									class="h-full rounded-full transition-all {thisWeekSpent > thisWeekPlanned ? 'bg-[var(--color-warm-coral)]' : 'bg-[var(--color-sage-green)]'}"
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
					<h2 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
						Recent
					</h2>
					<a
						href="/transactions"
						class="text-xs text-muted-foreground hover:text-[var(--color-text-primary)] transition-colors"
					>
						View all →
					</a>
				</div>

				{#if !isLoaded}
					<div class="squircle-4xl squircle-border bg-card overflow-hidden">
						{#each Array(4) as _}
							<div class="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0">
								<div class="flex-1 space-y-1.5">
									<div class="h-3.5 w-32 rounded bg-[var(--color-bg-surface)] animate-pulse"></div>
									<div class="h-2.5 w-20 rounded bg-[var(--color-bg-surface)] animate-pulse"></div>
								</div>
								<div class="h-3.5 w-16 rounded bg-[var(--color-bg-surface)] animate-pulse"></div>
							</div>
						{/each}
					</div>
				{:else if recentTransactions.length === 0}
					<div class="squircle-4xl squircle-border bg-card px-4 py-10 text-center">
						<p class="text-sm text-muted-foreground">Nothing yet.</p>
						<button
							type="button"
							class="mt-1 text-sm text-amber hover:underline"
							onclick={() => openTypePicker()}
						>
							Add your first transaction
						</button>
					</div>
				{:else}
					<div class="squircle-4xl squircle-border bg-card overflow-hidden">
						{#each groupedTransactions() as [dateLabel, txGroup], gi}
							<!-- Date group header -->
							<div class="px-4 py-2 bg-[var(--color-bg-secondary)] border-b border-border">
								<span class="text-xs font-medium uppercase tracking-widest text-muted-foreground">
									{dateLabel}
								</span>
							</div>
							<!-- Transactions in group -->
							{#each txGroup as transaction, ti (transaction.id)}
								<button
									type="button"
									class="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--color-bg-surface)]
										{gi === groupedTransactions().length - 1 && ti === txGroup.length - 1 ? '' : 'border-b border-border'}"
									onclick={() => goto(`/transactions/add/${transaction.id}`)}
								>
									<div class="min-w-0 flex-1">
										<div class="text-sm font-medium truncate leading-snug">
											{transaction.description || 'No description'}
										</div>
										<div class="text-xs text-muted-foreground mt-0.5">
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
						<h2 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
							Goals
						</h2>
						<a
							href="/plan?tab=goals"
							class="text-xs text-muted-foreground hover:text-[var(--color-text-primary)] transition-colors"
						>
							View all →
						</a>
					</div>
					<div class="space-y-2">
						{#each activeGoals as goal (goal.id)}
							<a
								href="/plan?tab=goals"
								class="flex items-center gap-3 squircle-2xl squircle-border bg-card px-4 py-3 transition-colors hover:bg-[var(--color-bg-surface)]"
							>
								<div class="min-w-0 flex-1">
									<p class="text-sm font-medium truncate">{goal.name || 'Goal'}</p>
									<div class="mt-1 h-1.5 w-full rounded-full bg-[var(--color-bg-surface)] overflow-hidden">
										<div
											class="h-full rounded-full bg-[var(--color-amber)] transition-all"
											style="width: {goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0}%"
										></div>
									</div>
								</div>
								<span class="text-xs text-muted-foreground shrink-0">
									{goal.targetAmount > 0 ? Math.round((goal.currentAmount / goal.targetAmount) * 100) : 0}%
								</span>
							</a>
						{/each}
					</div>
				</section>
			{/if}

		</div>
	</div>
</PageLayout>
