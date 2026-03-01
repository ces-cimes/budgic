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
		FolderTree,
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
	import CategoriesTabContent from '$lib/components/categories/CategoriesTabContent.svelte';

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
		{ id: 'budget', label: 'Budget', icon: BarChart3 },
		{ id: 'allowance', label: 'Allowance', icon: DollarSign },
		{ id: 'goals', label: 'Goals', icon: Target },
		{ id: 'categories', label: 'Categories', icon: FolderTree }
	];

	const goalsSubTabs: TabConfig[] = [
		{ id: 'overview', label: 'Overview', icon: BarChart3 },
		{ id: 'active', label: 'Active', icon: Target },
		{ id: 'completed', label: 'Completed', icon: Target }
	];

	let activeTab = $state('budget');
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
		const tabParam = urlParams.get('tab');
		if (tabParam && planTabs.some((t) => t.id === tabParam)) activeTab = tabParam;
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
		activeTab = tabId;
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
				{ text: 'Add goal', onclick: () => goto('/goals/add'), size: 'sm', icon: Plus }
			]}
		>
			<TabHeader tabs={planTabs} activeTab={activeTab} onTabChange={handleTabChange} />
		</Header>
	{/snippet}

	{#snippet children()}
		<div class="container mx-auto h-full p-2 sm:p-4 max-w-4xl">
			<TabContentWrapper
				tabs={planTabs}
				activeTab={activeTab}
				onTabChange={handleTabChange}
				class="flex-1"
			>
				{#snippet children()}
					<TabContent tabId="budget" isActive={activeTab === 'budget'} tabs={planTabs}>
						<div class="space-y-6 p-4">
							<Card.Root class="border-border">
								<Card.Header>
									<Card.Title class="text-lg">Financial summary</Card.Title>
								</Card.Header>
								<Card.Content class="space-y-4">
									<div class="grid grid-cols-2 gap-4">
										<div class="text-center">
											<div class="text-success text-2xl font-bold">
												{formatTransactionAmount(totalPlannedIncome, userCurrency)}
											</div>
											<div class="text-muted-foreground text-sm">Planned income</div>
										</div>
										<div class="text-center">
											<div class="text-destructive text-2xl font-bold">
												{formatTransactionAmount(totalPlannedExpenses, userCurrency)}
											</div>
											<div class="text-muted-foreground text-sm">Planned expenses</div>
										</div>
									</div>
									<div class="text-center">
										<div class="flex items-center justify-center gap-2">
											{#if netProjectedChange >= 0}
												<TrendingUp class="text-success" size={20} />
												<div class="text-success text-xl font-bold">
													+{formatTransactionAmount(netProjectedChange, userCurrency)}
												</div>
											{:else}
												<TrendingDown class="text-destructive" size={20} />
												<div class="text-destructive text-xl font-bold">
													{formatTransactionAmount(netProjectedChange, userCurrency)}
												</div>
											{/if}
										</div>
										<div class="text-muted-foreground text-sm">Net projected change</div>
									</div>
								</Card.Content>
							</Card.Root>
							<BudgetTab
								userCurrency={userCurrency}
								selectedAccountId={selectedAccountId}
								planningData={planningData}
								onSetGoal={() => goto('/goals/add')}
							/>
							<PlanRulesSummary />
						</div>
					</TabContent>

					<TabContent tabId="allowance" isActive={activeTab === 'allowance'} tabs={planTabs}>
						<div class="space-y-6 p-4">
							{#if enhancedAllowance}
								<div class="bg-card border-border rounded-xl border p-6 shadow-sm space-y-4">
									<h2 class="text-primary text-xl font-semibold">Spending allowance</h2>
									<AllowanceVisualization
										allowance={enhancedAllowance}
										showDetails={true}
										showRecommendations={true}
										negativeStatus={negativeAllowanceStatus}
										recoverySuggestions={recoverySuggestions}
									/>
									<PlanRulesSummary />
								</div>
							{:else if dailyAllowance}
								<Card.Root class="border-border">
									<Card.Header>
										<Card.Title class="text-primary text-lg">Daily allowance</Card.Title>
									</Card.Header>
									<Card.Content>
										<div class="text-primary text-3xl font-bold">
											{formatTransactionAmount(dailyAllowance.amount, userCurrency)}
										</div>
										<div class="text-muted-foreground text-sm">
											{dailyAllowance.daysRemaining} days remaining
										</div>
									</Card.Content>
								</Card.Root>
							{:else}
								<div class="text-muted-foreground rounded-xl border border-border bg-card p-6 text-center">
									No allowance data. Add accounts and budget categories to see your safe-to-spend.
								</div>
							{/if}
							<Button variant="outline" onclick={() => goto('/settings')}>
								<Settings class="mr-2 h-4 w-4" />
								Budget & allowance settings
							</Button>
						</div>
					</TabContent>

					<TabContent tabId="goals" isActive={activeTab === 'goals'} tabs={planTabs}>
						<div class="p-4">
							<div class="mb-4 flex gap-2">
								{#each goalsSubTabs as t}
									<Button
										variant={goalsSubTab === t.id ? 'default' : 'outline'}
										size="sm"
										onclick={() => handleGoalsSubTabChange(t.id)}
									>
										{t.label}
									</Button>
								{/each}
							</div>
							{#if goalsSubTab === 'overview'}
								<GoalsOverviewTab
									goalsData={goalsData}
									activeGoals={activeGoals}
									completedGoals={completedGoals}
									userCurrency={userCurrency}
									onGoalAction={handleGoalAction}
								/>
							{:else if goalsSubTab === 'active'}
								<GoalsActiveTab
									activeGoals={activeGoals}
									userCurrency={userCurrency}
									onGoalAction={handleGoalAction}
								/>
							{:else}
								<GoalsCompletedTab
									completedGoals={completedGoals}
									userCurrency={userCurrency}
									onGoalAction={handleGoalAction}
								/>
							{/if}
						</div>
					</TabContent>

					<TabContent tabId="categories" isActive={activeTab === 'categories'} tabs={planTabs}>
						<div class="p-4">
							<CategoriesTabContent />
						</div>
					</TabContent>
				{/snippet}
			</TabContentWrapper>
		</div>
	{/snippet}
</PageLayout>
