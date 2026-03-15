<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import * as Card from '$lib/components/ui/card/index.ts';
	import {
		BarChart3,
		DollarSign,
		Target,
		Plus,
		TrendingUp,
		TrendingDown,
		Settings
	} from '@lucide/svelte';

	import {
		TabHeader,
		TabContent,
		TabContentWrapper,
		type TabConfig
	} from '$lib/components/shared';

	import {
		BudgetTab,
		type PlanningData,
		type DailyAllowance,
		type WeeklyProjection
	} from '$lib/components/budget';
	import AllowanceVisualization from '$lib/components/accounts/AllowanceVisualization.svelte';
	import PlanRulesSummary from '$lib/components/budget/PlanRulesSummary.svelte';
	import AllowanceWeekView from '$lib/components/plan/AllowanceWeekView.svelte';
	import BalanceProjectionChart from '$lib/components/accounts/BalanceProjectionChart.svelte';
	import {
		OverviewTab as GoalsOverviewTab,
		ActiveTab as GoalsActiveTab,
		CompletedTab as GoalsCompletedTab,
		type GoalsData,
		type Goal
	} from '$lib/components/goals';

	import { planService, userService, negativeAllowanceService, goalsService } from '$lib/core/services';
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import type {
		NegativeAllowanceStatus,
		RecoverySuggestion
	} from '$lib/core/services/core/negative-allowance-service';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';

	const planTabs: TabConfig[] = [
		{ id: 'allowance', label: 'Allowance', icon: DollarSign },
		{ id: 'budget', label: 'Budget', icon: BarChart3 },
		{ id: 'goals', label: 'Goals', icon: Target }
	];

	const goalsSubTabs: TabConfig[] = [
		{ id: 'overview', label: 'Overview', icon: BarChart3 },
		{ id: 'active', label: 'Active', icon: Target },
		{ id: 'completed', label: 'Completed', icon: Target }
	];

	// Derive active tab from URL so tab highlight is correct on first paint and when navigating with ?tab=
	const activeTab = $derived.by(() => {
		const tabParam = new URLSearchParams($page.url.search).get('tab');
		if (tabParam && planTabs.some((t) => t.id === tabParam)) return tabParam;
		return 'allowance';
	});
	let goalsSubTab = $state('overview');
	let isLoading = $state(true);
	let userCurrency = $state<string>('USD');
	let selectedAccountId = $state<string>('');
	let dailyAllowance = $state<DailyAllowance | null>(null);
	let enhancedAllowance = $state<EnhancedAllowance | null>(null);
	let negativeAllowanceStatus = $state<NegativeAllowanceStatus | null>(null);
	let recoverySuggestions = $state<RecoverySuggestion[]>([]);
	let weeklyProjections = $state<WeeklyProjection[]>([]);
	let planningData = $state<PlanningData | null>(null);
	let goalsData = $state<GoalsData | null>(null);
	let activeGoals = $state<Goal[]>([]);
	let completedGoals = $state<Goal[]>([]);
	let error = $state<string | null>(null);

	const totalPlannedIncome = $derived(planningData?.totalPlannedIncome ?? 0);
	const totalPlannedExpenses = $derived(planningData?.totalPlannedExpenses ?? 0);
	const netProjectedChange = $derived(planningData?.netProjectedChange ?? 0);

	onMount(async () => {
		try {
			const preferences = await userService.getUserPreferences();
			userCurrency = preferences?.currency || 'USD';
			const accounts = await planService.getAccounts();
			const activeAccount = accounts.find((a) => a.isActive);
			if (activeAccount) selectedAccountId = activeAccount.id;
			await loadPlanData();
			await loadGoalsData();
		} catch (err) {
			console.error('Error loading plan data:', err);
			error = err instanceof Error ? err.message : 'Failed to load plan data';
		} finally {
			isLoading = false;
		}
	});

	$effect(() => {
		if (selectedAccountId && !isLoading) loadPlanData();
	});

	$effect(() => {
		const urlParams = new URLSearchParams($page.url.search);
		const goalsParam = urlParams.get('goalsTab');
		if (goalsParam && goalsSubTabs.some((t) => t.id === goalsParam)) goalsSubTab = goalsParam;
	});

	async function loadPlanData() {
		try {
			enhancedAllowance = await planService.getEnhancedAllowance();
			dailyAllowance = await planService.getDailyAllowance();
			if (enhancedAllowance) {
				const prefs = await userService.getUserPreferences();
				const handling =
					(prefs as { negativeAllowanceHandling?: string }).negativeAllowanceHandling ??
					'allow_with_strong_warning';
				negativeAllowanceStatus = await negativeAllowanceService.checkNegativeAllowance(
					enhancedAllowance,
					handling as
						| 'block_with_warning'
						| 'allow_with_strong_warning'
						| 'borrow_from_future'
						| 'borrow_from_other_categories'
				);
				recoverySuggestions = negativeAllowanceStatus.isNegative
					? negativeAllowanceService.getRecoverySuggestions(enhancedAllowance)
					: [];
			} else {
				negativeAllowanceStatus = null;
				recoverySuggestions = [];
			}
			if (selectedAccountId) {
				planningData = await planService.getPlanningData(selectedAccountId);
				weeklyProjections = await planService.getWeeklyProjections(selectedAccountId);
			}
		} catch (err) {
			console.error('Error loading plan data:', err);
		}
	}

	async function loadGoalsData() {
		try {
			const result = await goalsService.getGoalsData();
			goalsData = result;
			activeGoals = result.activeGoals;
			completedGoals = result.completedGoals;
		} catch (err) {
			console.error('Error loading goals:', err);
		}
	}

	function handleTabChange(tabId: string) {
		const url = new URL($page.url);
		url.searchParams.set('tab', tabId);
		url.searchParams.delete('goalsTab');
		goto(url.toString(), { replaceState: true, noScroll: true });
	}

	function handleGoalsSubTabChange(subTabId: string) {
		goalsSubTab = subTabId;
		const url = new URL($page.url);
		url.searchParams.set('tab', 'goals');
		url.searchParams.set('goalsTab', subTabId);
		goto(url.toString(), { replaceState: true, noScroll: true });
	}

	async function handleGoalAction(_action: string, _goalId: string) {
		await loadGoalsData();
	}
</script>

<svelte:head>
	<title>Plan | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header
			title="Plan"
			variant="with-tabs"
			buttonProps={[
				{ text: 'Settings', onclick: () => goto('/settings/plan'), size: 'sm', icon: Settings },
				{ text: 'Add goal', onclick: () => goto('/plan?tab=goals'), size: 'sm', icon: Plus }
			]}
		>
			<TabHeader tabs={planTabs} activeTab={activeTab} onTabChange={handleTabChange} />
		</Header>
	{/snippet}

	{#snippet children()}
		<div class="mx-auto h-full max-w-2xl w-full px-5 sm:px-6">
			<TabContentWrapper
				tabs={planTabs}
				activeTab={activeTab}
				onTabChange={handleTabChange}
				class="flex-1"
			>
				{#snippet children()}
					<TabContent tabId="allowance" isActive={activeTab === 'allowance'} tabs={planTabs}>
						<div class="space-y-5 px-4 py-5">
							{#if enhancedAllowance}
								<div class="squircle-4xl squircle-border squircle-fill-tertiary p-5 space-y-4">
									<AllowanceVisualization allowance={enhancedAllowance} showDetails={true} showRecommendations={true} negativeStatus={negativeAllowanceStatus} recoverySuggestions={recoverySuggestions} />
									<!-- Week view: 7 mini bars Mon–Sun (UX_SPEC §3.2) -->
									<AllowanceWeekView allowance={enhancedAllowance} currency={userCurrency} />
									<PlanRulesSummary />
								</div>
								<!-- 30-day cash flow chart (UX_SPEC §3.2) -->
								<div class="squircle-4xl squircle-border squircle-fill-tertiary p-5">
									<h3 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4">30-day cash flow</h3>
									<BalanceProjectionChart daysAhead={30} showDetails={false} />
								</div>
							{:else if dailyAllowance}
								<div class="squircle-4xl squircle-border squircle-fill-tertiary p-5">
									<p class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-2">Daily allowance</p>
									<div class="text-hero-sm">{formatTransactionAmount(dailyAllowance.amount, userCurrency)}</div>
									<p class="text-xs text-[var(--color-text-tertiary)] mt-1">{dailyAllowance.daysRemaining} days remaining</p>
								</div>
							{:else}
								<div class="flex flex-col items-center py-12 text-center">
									<p class="text-sm text-[var(--color-text-secondary)]">No allowance data yet.</p>
									<p class="text-xs text-[var(--color-text-tertiary)] mt-1">Add accounts and budget categories to see your safe-to-spend.</p>
								</div>
							{/if}
							<Button variant="ghost" size="sm" onclick={() => goto('/settings/plan')} class="text-[var(--color-text-tertiary)]">
								<Settings class="mr-2 size-3.5" />
								Budget & allowance settings
							</Button>
						</div>
					</TabContent>

					<TabContent tabId="budget" isActive={activeTab === 'budget'} tabs={planTabs}>
						<div class="space-y-5 px-4 py-5">
							<!-- Financial summary -->
							<div class="squircle-4xl squircle-border squircle-fill-tertiary p-5">
								<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4">Financial summary</h2>
								<div class="grid grid-cols-2 gap-4 mb-4">
									<div class="text-center">
										<div class="text-hero-sm text-[var(--color-sage-green)]">
											{formatTransactionAmount(totalPlannedIncome, userCurrency)}
										</div>
										<div class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mt-1">Income</div>
									</div>
									<div class="text-center">
										<div class="text-hero-sm text-[var(--color-warm-coral)]">
											{formatTransactionAmount(totalPlannedExpenses, userCurrency)}
										</div>
										<div class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mt-1">Expenses</div>
									</div>
								</div>
								<div class="border-t border-border pt-4 text-center">
									<div class="flex items-center justify-center gap-2">
										{#if netProjectedChange >= 0}
											<TrendingUp class="size-4 text-[var(--color-amber)]" />
											<span class="text-hero-sm text-[var(--color-amber)]">+{formatTransactionAmount(netProjectedChange, userCurrency)}</span>
										{:else}
											<TrendingDown class="size-4 text-[var(--color-warm-coral)]" />
											<span class="text-hero-sm text-[var(--color-warm-coral)]">{formatTransactionAmount(netProjectedChange, userCurrency)}</span>
										{/if}
									</div>
									<p class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mt-1">Net projected</p>
								</div>
							</div>
							<BudgetTab userCurrency={userCurrency} selectedAccountId={selectedAccountId} planningData={planningData} onSetGoal={() => goto('/plan?tab=goals')} />
							<PlanRulesSummary />
						</div>
					</TabContent>	

					<TabContent tabId="goals" isActive={activeTab === 'goals'} tabs={planTabs}>
						<div class="px-4 py-5">
							<!-- Goals sub-tabs — pill style -->
							<div class="flex items-center gap-1 mb-5">
								{#each goalsSubTabs as t}
									<button
										type="button"
										onclick={() => handleGoalsSubTabChange(t.id)}
										class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors
											{goalsSubTab === t.id
												? 'bg-[var(--color-amber-subtle)] text-[var(--color-amber)]'
												: 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'}"
									>
										{t.label}
									</button>
								{/each}
								<div class="ml-auto">
									<Button variant="ghost" size="sm" onclick={() => goto('/plan?tab=goals')} class="text-[var(--color-amber)] gap-1.5">
										<Plus class="size-3.5" />
										Add goal
									</Button>
								</div>
							</div>
							{#if goalsSubTab === 'overview'}
								<GoalsOverviewTab goalsData={goalsData} activeGoals={activeGoals} completedGoals={completedGoals} userCurrency={userCurrency} onGoalAction={handleGoalAction} />
							{:else if goalsSubTab === 'active'}
								<GoalsActiveTab activeGoals={activeGoals} userCurrency={userCurrency} onGoalAction={handleGoalAction} />
							{:else}
								<GoalsCompletedTab completedGoals={completedGoals} userCurrency={userCurrency} onGoalAction={handleGoalAction} />
							{/if}
						</div>
					</TabContent>

				{/snippet}
			</TabContentWrapper>
		</div>
	{/snippet}
</PageLayout>
