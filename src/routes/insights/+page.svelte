<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { BarChart3, TrendingUp, Award, RefreshCw, Shield, Sparkles, Brain } from '@lucide/svelte';

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

	// Services
	import { insightsService } from '$lib/core/services';

	// Tab configuration
	const insightsTabs: TabConfig[] = [
		{ id: 'overview', label: 'Overview', icon: BarChart3 },
		{ id: 'patterns', label: 'Patterns', icon: TrendingUp },
		{ id: 'recurring', label: 'Recurring', icon: Sparkles },
		{ id: 'predictions', label: 'Predictions', icon: BarChart3 }, // Using BarChart3 as placeholder
		{ id: 'savings', label: 'Fee Avoidance', icon: Shield },
		{ id: 'learning', label: 'Learning', icon: Brain },
		{ id: 'badges', label: 'Badges', icon: Award }
	];

	// State
	let activeTab = $state('overview');
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

	// Handle URL parameters for tab selection
	$effect(() => {
		const urlParams = new URLSearchParams($page.url.search);
		const tabParam = urlParams.get('tab');
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
			description="Financial intelligence and behavioral patterns"
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
					<TabContent tabId="overview" isActive={activeTab === 'overview'} tabs={insightsTabs}>
						<OverviewTab {insights} {isLoading} />
					</TabContent>

					<TabContent tabId="patterns" isActive={activeTab === 'patterns'} tabs={insightsTabs}>
						<PatternsTab {isLoading} />
					</TabContent>

					<TabContent tabId="recurring" isActive={activeTab === 'recurring'} tabs={insightsTabs}>
						<div class="p-2 sm:p-4">
							<RecurringTransactionManager />
						</div>
					</TabContent>

					<TabContent
						tabId="predictions"
						isActive={activeTab === 'predictions'}
						tabs={insightsTabs}
					>
						<PredictionsTab {isLoading} />
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

					<TabContent tabId="learning" isActive={activeTab === 'learning'} tabs={insightsTabs}>
						<div class="p-2 sm:p-4">
							<LearningAdaptationPanel />
						</div>
					</TabContent>

					<TabContent tabId="badges" isActive={activeTab === 'badges'} tabs={insightsTabs}>
						<BadgesTab {isLoading} />
					</TabContent>
				{/snippet}
			</TabContentWrapper>
		</div>
	{/snippet}
</PageLayout>
