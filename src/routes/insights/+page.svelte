<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { AlertCircle, TrendingUp, Award, RefreshCw, Shield, Zap } from '@lucide/svelte';

	// Shared components
	import { TabHeader, TabContent, TabContentWrapper, type TabConfig } from '$lib/components/shared';

	// Insights-specific components
	import {
		OverviewTab,
		PatternsTab,
		PredictionsTab,
		BadgesTab
	} from '$lib/components/insights/tabs';
	import FeeAvoidancePanel from '$lib/components/insights/FeeAvoidancePanel.svelte';
	import RecurringTransactionManager from '$lib/components/recurring/RecurringTransactionManager.svelte';
	import LearningAdaptationPanel from '$lib/components/insights/LearningAdaptationPanel.svelte';
	import OptimizeTab from '$lib/components/insights/OptimizeTab.svelte';

	// Services
	import { insightsService } from '$lib/core/services';

	// Tab configuration (5 tabs per proposal: Alerts | Savings | Patterns | Optimize | Badges)
	const insightsTabs: TabConfig[] = [
		{ id: 'alerts', label: 'Alerts', icon: AlertCircle },
		{ id: 'savings', label: 'Savings', icon: Shield },
		{ id: 'patterns', label: 'Patterns', icon: TrendingUp },
		{ id: 'optimize', label: 'Optimize', icon: Zap },
		{ id: 'badges', label: 'Badges', icon: Award }
	];

	// State (default to alerts; support legacy ?tab=overview via effect)
	let activeTab = $state('alerts');
	let isLoading = $state(true);
	let insights = $state<any[]>([]);
	let error = $state<string | null>(null);

	// Derived values
	const insightsCount = $derived(() => insights.filter((i) => i.isActive).length);

	onMount(async () => {
		try {
			// Load insights data
			await loadInsightsData();

			// Start auto-updates
			insightsService.startAutoUpdates();
		} catch (error) {
			console.error('Error loading insights data:', error);
			error = error instanceof Error ? error.message : 'Failed to load insights data';
		} finally {
			isLoading = false;
		}
	});

	// Handle URL parameters for tab selection (map legacy tab names to consolidated tabs)
	$effect(() => {
		const urlParams = new URLSearchParams($page.url.search);
		let tabParam = urlParams.get('tab');
		if (tabParam === 'overview') tabParam = 'alerts';
		if (['recurring', 'predictions', 'learning'].includes(tabParam ?? '')) tabParam = 'patterns';
		if (tabParam && insightsTabs.some((tab) => tab.id === tabParam)) {
			activeTab = tabParam;
		}
	});

	async function loadInsightsData() {
		try {
			// Generate cross-route insights with predictions (since user is on insights page)
			await insightsService.generateCrossRouteInsights({
				timeRange: 'month',
				includePredictions: true, // Include predictions when on insights page
				includeBehavioral: true,
				onInsightsPage: true // Flag to prevent summary notification
			});

			// Load insights from database
			insights = await insightsService.getInsights();
		} catch (error) {
			console.error('Error loading insights data:', error);
			error = error instanceof Error ? error.message : 'Failed to load insights data';
		}
	}

	function handleTabChange(tabId: string) {
		activeTab = tabId;
		// Update URL without causing navigation
		const url = new URL($page.url);
		url.searchParams.set('tab', tabId);
		goto(url.toString(), { replaceState: true, noScroll: true });
	}

	async function handleRefresh() {
		isLoading = true;
		try {
			// Force update with predictions included
			await insightsService.generateCrossRouteInsights(
				{
					timeRange: 'month',
					includePredictions: true, // Include predictions on manual refresh
					includeBehavioral: true,
					onInsightsPage: true // Flag to prevent summary notification
				},
				true
			); // force = true
			await loadInsightsData();
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Insights - Budgic</title>
	<meta name="description" content="Financial insights, patterns, and predictions" />
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header
			title="Insights"
			variant="with-tabs"
			buttonProps={[
				{
					onclick: handleRefresh,
					size: 'sm',
					icon: RefreshCw,
					disabled: isLoading,
					className: isLoading ? 'animate-spin' : ''
				}
			]}
		>
			<TabHeader tabs={insightsTabs} {activeTab} onTabChange={handleTabChange} />
		</Header>
	{/snippet}

	{#snippet children()}
		<div class="container mx-auto h-full w-full">
			<TabContentWrapper
				tabs={insightsTabs}
				{activeTab}
				onTabChange={handleTabChange}
				class="flex-1"
			>
				{#snippet children()}
					<TabContent tabId="alerts" isActive={activeTab === 'alerts'} tabs={insightsTabs}>
						<OverviewTab {insights} {isLoading} />
					</TabContent>

					<TabContent tabId="savings" isActive={activeTab === 'savings'} tabs={insightsTabs}>
						<div class="p-2 sm:p-4">
							<FeeAvoidancePanel
								showAllAccounts={true}
								initialMaxRisks={20}
								onRecommendationApplied={handleRefresh}
							/>
						</div>
					</TabContent>

					<TabContent tabId="patterns" isActive={activeTab === 'patterns'} tabs={insightsTabs}>
						<div class="space-y-8 px-4 py-5">
							<section>
								<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4">Behavioral patterns</h2>
								<PatternsTab {isLoading} />
							</section>
							<section>
								<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4">Recurring</h2>
								<RecurringTransactionManager />
							</section>
							<section>
								<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4">Predictions</h2>
								<PredictionsTab {isLoading} />
							</section>
							<section>
								<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4">Learning</h2>
								<LearningAdaptationPanel />
							</section>
						</div>
					</TabContent>

					<TabContent tabId="optimize" isActive={activeTab === 'optimize'} tabs={insightsTabs}>
						<OptimizeTab />
					</TabContent>

					<TabContent tabId="badges" isActive={activeTab === 'badges'} tabs={insightsTabs}>
						<BadgesTab {isLoading} />
					</TabContent>
				{/snippet}
			</TabContentWrapper>
		</div>
	{/snippet}
</PageLayout>
