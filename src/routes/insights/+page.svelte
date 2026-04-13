<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { TrendingUp, Award, RefreshCw, Zap } from '@lucide/svelte';

	// Shared components
	import { TabHeader, TabContent, TabContentWrapper, type TabConfig } from '$lib/components/shared';

	// Insights-specific components
	import { BadgesTab } from '$lib/components/insights/tabs';
	import PatternsTabContent from '$lib/components/insights/PatternsTabContent.svelte';
	import FeeAvoidancePanel from '$lib/components/insights/FeeAvoidancePanel.svelte';
	import OptimizeTab from '$lib/components/insights/OptimizeTab.svelte';

	// Services
	import { insightsService, userService } from '$lib/core/services';

	// Tab configuration: Patterns | Optimize | Badges (Alerts → bell panel; Savings merged into Optimize)
	const allInsightsTabs: TabConfig[] = [
		{ id: 'patterns', label: 'Patterns', icon: TrendingUp },
		{ id: 'optimize', label: 'Optimize', icon: Zap },
		{ id: 'badges', label: 'Badges', icon: Award }
	];

	// State (default to patterns; support legacy URL params via effect)
	let activeTab = $state('patterns');
	let isLoading = $state(true);
	let insights = $state<any[]>([]);
	let error = $state<string | null>(null);
	let userCurrency = $state<string>('USD');
	/** Phase 5: Optimize tab hidden for Beginner maturity */
	let maturityLevel = $state<'beginner' | 'intermediate' | 'advanced' | 'expert'>('beginner');

	// Visible tabs: hide Optimize for beginner (UX_SPEC Phase 5)
	const insightsTabs = $derived(
		maturityLevel === 'beginner'
			? allInsightsTabs.filter((t) => t.id !== 'optimize')
			: allInsightsTabs
	);

	// Derived values
	const insightsCount = $derived(() => insights.filter((i) => i.isActive).length);
	const insightTypeFilter = $derived($page.url.searchParams.get('insightType'));

	onMount(async () => {
		try {
			const prefs = await userService.getUserPreferences();
			userCurrency = prefs?.currency ?? 'USD';
			const level = (prefs as { userMaturityLevel?: string })?.userMaturityLevel ?? 'beginner';
			maturityLevel = level as 'beginner' | 'intermediate' | 'advanced' | 'expert';
			// Load insights data
			await loadInsightsData();

			// Start auto-updates
			insightsService.startAutoUpdates();
		} catch (err) {
			console.error('Error loading insights data:', err);
			error = err instanceof Error ? err.message : 'Failed to load insights data';
		} finally {
			isLoading = false;
		}
	});

	// Handle URL parameters for tab selection (map legacy tab names to consolidated tabs)
	$effect(() => {
		const urlParams = new URLSearchParams($page.url.search);
		let tabParam = urlParams.get('tab');
		if (tabParam === 'overview' || tabParam === 'alerts') tabParam = 'patterns';
		if (tabParam === 'savings') tabParam = 'optimize';
		if (['recurring', 'predictions', 'learning'].includes(tabParam ?? '')) tabParam = 'patterns';
		// If beginner and URL asks for optimize, show patterns instead
		if (maturityLevel === 'beginner' && tabParam === 'optimize') tabParam = 'patterns';
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
			description="What's happening now"
			variant="with-tabs"
			tabRowMobileOnly
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
		<TabContentWrapper tabs={insightsTabs} {activeTab} onTabChange={handleTabChange}>
			{#snippet children()}
				<TabContent tabId="patterns" isActive={activeTab === 'patterns'} tabs={insightsTabs}>
					<PatternsTabContent
						{isLoading}
						{userCurrency}
						insightTypeFilter={insightTypeFilter ?? undefined}
					/>
				</TabContent>

				{#if insightsTabs.some((t) => t.id === 'optimize')}
					<TabContent tabId="optimize" isActive={activeTab === 'optimize'} tabs={insightsTabs}>
						<div class="space-y-6 py-5">
							<section>
								<h2
									class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
								>
									Fee avoidance
								</h2>
								<FeeAvoidancePanel
									showAllAccounts={true}
									initialMaxRisks={20}
									onRecommendationApplied={handleRefresh}
								/>
							</section>
							<section>
								<h2
									class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
								>
									Optimize
								</h2>
								<OptimizeTab />
							</section>
						</div>
					</TabContent>
				{/if}

				<TabContent tabId="badges" isActive={activeTab === 'badges'} tabs={insightsTabs}>
					<BadgesTab {isLoading} />
				</TabContent>
			{/snippet}
		</TabContentWrapper>
	{/snippet}
</PageLayout>
