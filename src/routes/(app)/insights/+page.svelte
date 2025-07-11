<script lang="ts">
	import { onMount } from 'svelte';
	import LoadingSpinner from '$lib/components/primitives/LoadingSpinner.svelte';
	import NetWorthTrend from '$lib/components/layout/NetWorthTrend.svelte';
	import HotInsights from '$lib/components/layout/HotInsights.svelte';
	import SpendingPatterns from '$lib/components/layout/SpendingPatterns.svelte';
	import GoalProgress from '$lib/components/layout/GoalProgress.svelte';
	import TopBar from '$lib/components/layout/TopBar.svelte';
	import { unifiedInsightsService } from '$lib/core/services';
	import { BarChart3, TrendingUp, Lightbulb } from '@lucide/svelte';

	// State
	let isLoading = $state(true);
	let showPlaceholder = $state(true);
	
	// Data for components
	let netWorthData = $state<any[]>([]);
	let hotInsights = $state<any[]>([]);
	let emotionalTriggers = $state<any[]>([]);
	let spendingPatterns = $state<any[]>([]);
	let goals = $state<any[]>([]);

	// Load insights data
	const loadInsightsData = async () => {
		try {
			isLoading = true;
			
			// TODO: Load real data from services
			// const netWorth = await insightsService.getNetWorthTrend();
			// const insights = await insightsService.getHotInsights();
			// const triggers = await insightsService.getEmotionalTriggers();
			// const patterns = await insightsService.getSpendingPatterns();
			// const userGoals = await insightsService.getUserGoals();
			
			// For now, use placeholder data
			netWorthData = [];
			hotInsights = [];
			emotionalTriggers = [];
			spendingPatterns = [];
			goals = [];
			showPlaceholder = true;
			
		} catch (error) {
			console.error('Error loading insights data:', error);
		} finally {
			isLoading = false;
		}
	};

	onMount(() => {
		loadInsightsData();
	});
</script>

<TopBar 
	title="Insights & Psychology"
	description="Data-driven behavioral insights"
	showBackButton={false}
>
	<div class="flex items-center gap-2">
		<button class="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-surface transition-colors">
			<BarChart3 size={20} class="text-text-primary" />
		</button>
		<button class="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-surface transition-colors">
			<TrendingUp size={20} class="text-text-primary" />
		</button>
		<button class="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-surface transition-colors">
			<Lightbulb size={20} class="text-text-primary" />
		</button>
	</div>
</TopBar>

<div class="min-h-screen flex flex-col bg-bg-primary">
	<!-- Main Content -->
	<div class="flex-1 overflow-y-auto">
		{#if isLoading}
			<div class="flex items-center justify-center min-h-[60vh]">
				<LoadingSpinner message="Loading insights..." />
			</div>
		{:else}
			<div class="p-4 space-y-6">
				<!-- Net Worth Trend -->
				<section>
					<NetWorthTrend 
						data={netWorthData}
						{showPlaceholder}
					/>
				</section>

				<!-- Hot Insights -->
				<section>
					<HotInsights 
						insights={hotInsights}
						{showPlaceholder}
					/>
				</section>

				<!-- Spending Patterns -->
				<section>
					<SpendingPatterns 
						emotionalTriggers={emotionalTriggers}
						spendingPatterns={spendingPatterns}
						{showPlaceholder}
					/>
				</section>

				<!-- Goal Progress -->
				<section>
					<GoalProgress 
						goals={goals}
						{showPlaceholder}
					/>
				</section>
			</div>
		{/if}
	</div>
</div>
