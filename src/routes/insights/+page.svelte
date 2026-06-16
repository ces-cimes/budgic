<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { TrendingUp, Award, RefreshCw, Shield, AlertTriangle } from '@lucide/svelte';

	// Shared components
	import { TabHeader, TabContent, TabContentWrapper, type TabConfig } from '$lib/components/shared';

	// Insights-specific components
	import { BadgesTab } from '$lib/components/insights/tabs';
	import PatternsTabContent from '$lib/components/insights/PatternsTabContent.svelte';
	import FeeAvoidancePanel from '$lib/components/insights/FeeAvoidancePanel.svelte';
	import OptimizeTab from '$lib/components/insights/OptimizeTab.svelte';
	import CreditUtilizationCard from '$lib/components/insights/CreditUtilizationCard.svelte';
	import InterestOpportunitiesCard from '$lib/components/insights/InterestOpportunitiesCard.svelte';
	import SpendingVsBudgetCard from '$lib/components/insights/SpendingVsBudgetCard.svelte';

	// Services
	import { insightsService, userService } from '$lib/core/services';
	import { crossRouteSyncService } from '$lib/core/services/analytics/cross-route-sync-service';

	// Tab configuration: Patterns | Fees & Accounts | Badges (Alerts → bell panel; Savings merged into Fees & Accounts)
	const insightsTabs: TabConfig[] = [
		{ id: 'patterns', label: 'Patterns', icon: TrendingUp },
		{ id: 'fees-accounts', label: 'Fees & Accounts', icon: Shield },
		{ id: 'badges', label: 'Badges', icon: Award }
	];

	// State (default to patterns; support legacy URL params via effect)
	let activeTab = $state('patterns');
	let isLoading = $state(true);
	let insights = $state<any[]>([]);
	let error = $state<string | null>(null);
	let userCurrency = $state<string>('USD');
	let recoveryModeActive = $state(false);
	/** Bumps to force Patterns tab heavy reload (header refresh). */
	let patternsDataNonce = $state(0);

	// Derived values
	const insightsCount = $derived(() => insights.filter((i) => i.isActive).length);
	const insightTypeFilter = $derived($page.url.searchParams.get('insightType'));

	onMount(async () => {
		try {
			const prefs = await userService.getUserPreferences();
			userCurrency = prefs?.currency ?? 'USD';
			recoveryModeActive = prefs?.recoveryModeActive === true;
			// Load insights data
			await loadInsightsData();

			// Start auto-updates
			insightsService.startAutoUpdates();
		} catch (err) {
			console.error('Error loading insights data:', err);
			error = 'We could not load your insights right now. Please try again.';
		} finally {
			isLoading = false;
		}
	});

	// Handle URL parameters for tab selection (map legacy tab names to consolidated tabs)
	$effect(() => {
		const urlParams = new URLSearchParams($page.url.search);
		let tabParam = urlParams.get('tab');
		if (tabParam === 'overview' || tabParam === 'alerts') tabParam = 'patterns';
		if (['recurring', 'predictions', 'learning'].includes(tabParam ?? '')) tabParam = 'patterns';
		if (tabParam && insightsTabs.some((tab) => tab.id === tabParam)) {
			activeTab = tabParam;
		}
	});

	async function loadInsightsData() {
		try {
			error = null;
			// Generate cross-route insights with predictions (since user is on insights page)
			await insightsService.generateCrossRouteInsights({
				timeRange: 'month',
				includePredictions: true, // Include predictions when on insights page
				includeBehavioral: true,
				onInsightsPage: true // Flag to prevent summary notification
			});

			// Load insights from database
			insights = await insightsService.getInsights();
		} catch (err) {
			console.error('Error loading insights data:', err);
			error = 'We could not load your insights right now. Please try again.';
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
			crossRouteSyncService.notifyAnalyticsSurfacesStale();
			patternsDataNonce++;
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
		{#if error}
			<div class="py-12 text-center" role="alert">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20"
				>
					<AlertTriangle class="h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
				</div>
				<h2 class="text-foreground mb-2 text-lg font-semibold">Could not load insights</h2>
				<p class="text-muted-foreground mb-4">{error}</p>
				<button
					type="button"
					onclick={handleRefresh}
					disabled={isLoading}
					class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
				>
					Retry
				</button>
			</div>
		{:else}
			<TabContentWrapper tabs={insightsTabs} {activeTab} onTabChange={handleTabChange}>
				{#snippet children()}
					<TabContent tabId="patterns" isActive={activeTab === 'patterns'} tabs={insightsTabs}>
						<PatternsTabContent
							{isLoading}
							{userCurrency}
							insightTypeFilter={insightTypeFilter ?? undefined}
							patternsTabActive={activeTab === 'patterns'}
							{patternsDataNonce}
						/>
					</TabContent>

					{#if insightsTabs.some((t) => t.id === 'fees-accounts')}
						<TabContent
							tabId="fees-accounts"
							isActive={activeTab === 'fees-accounts'}
							tabs={insightsTabs}
						>
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
										Accounts
									</h2>
									<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
										<CreditUtilizationCard {userCurrency} />
										{#if !recoveryModeActive}
											<InterestOpportunitiesCard {userCurrency} />
										{/if}
										<SpendingVsBudgetCard {userCurrency} />
									</div>
								</section>
								{#if !recoveryModeActive}
									<section>
										<h2
											class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
										>
											What-if simulator
										</h2>
										<OptimizeTab suppressNonEssential={false} />
									</section>
								{:else}
									<p class="text-muted-foreground text-sm">
										What-if simulator is hidden while recovery view is active. Fee avoidance remains
										available above.
									</p>
								{/if}
							</div>
						</TabContent>
					{/if}

					<TabContent tabId="badges" isActive={activeTab === 'badges'} tabs={insightsTabs}>
						<BadgesTab {isLoading} />
					</TabContent>
				{/snippet}
			</TabContentWrapper>
		{/if}
	{/snippet}
</PageLayout>
