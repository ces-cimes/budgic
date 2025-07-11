<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Tabs from '$lib/components/primitives/Tabs.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Fab from '$lib/components/primitives/Fab.svelte';
	import LoadingSpinner from '$lib/components/primitives/LoadingSpinner.svelte';
	import WaterfallBudget from '$lib/components/layout/WaterfallBudget.svelte';
	import ScenarioPlanning from '$lib/components/layout/ScenarioPlanning.svelte';
	import TagIntegration from '$lib/components/layout/TagIntegration.svelte';
	import TopBar from '$lib/components/layout/TopBar.svelte';
	import { budgetService } from '$lib/core/services/budget-service';
	import { unifiedInsightsService } from '$lib/core/services';
	import { Plus, Edit, Settings } from '@lucide/svelte';

	// Tab options for the plan page
	const tabOptions = ['Budget', 'Scenarios', 'Tags'];
	
	// State
	let selectedTab = $state(0);
	let isLoading = $state(true);
	let monthlyIncome = $state(4200);
	let showPlaceholder = $state(true);
	let scenarios = $state<any[]>([]);
	let whatTags = $state<any[]>([]);
	let whyTags = $state<any[]>([]);

	// Load plan data
	const loadPlanData = async () => {
		try {
			isLoading = true;
			
			// TODO: Load real data from services
			// const categoryBudgets = await budgetService.getCurrentSpendingStatus();
			// const userIncome = await budgetService.getUserIncome();
			// const userScenarios = await insightsService.getUserScenarios();
			// const userWhatTags = await tagService.getWhatTags();
			// const userWhyTags = await tagService.getWhyTags();
			
			// For now, use placeholder data
			monthlyIncome = 4200;
			scenarios = [];
			whatTags = [];
			whyTags = [];
			showPlaceholder = true;
			
		} catch (error) {
			console.error('Error loading plan data:', error);
		} finally {
			isLoading = false;
		}
	};

	// Handle tab change
	const handleTabChange = (event: CustomEvent) => {
		selectedTab = event.detail.index;
	};

	// Handle edit budget
	const handleEditBudget = () => {
		// TODO: Navigate to budget editing page
		console.log('Edit budget clicked');
		goto('/settings/budget');
	};

	// Handle scenario selection
	const handleScenarioSelect = (scenario: any) => {
		// TODO: Apply scenario to budget
		console.log('Scenario selected:', scenario);
	};

	// Handle tag editing
	const handleTagEdit = () => {
		// TODO: Navigate to tag management
		console.log('Edit tags clicked');
		goto('/settings/tags');
	};

	onMount(() => {
		loadPlanData();
	});
</script>

<TopBar 
	title="Plan & Budget"
	description="Strategic resource allocation"
	showBackButton={false}
>
	<div class="flex items-center gap-2">
		<button class="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-surface transition-colors">
			<Edit size={20} class="text-text-primary" />
		</button>
		<button class="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-surface transition-colors">
			<Settings size={20} class="text-text-primary" />
		</button>
	</div>
</TopBar>

<div class="min-h-screen flex flex-col bg-bg-primary">
	<!-- Tab Navigation -->
	<div class="px-4 py-3 border-b border-primary/20">
		<Tabs 
			items={tabOptions} 
			selectedIndex={selectedTab}
			on:change={handleTabChange}
		/>
	</div>

	<!-- Main Content -->
	<div class="flex-1 overflow-y-auto">
		{#if isLoading}
			<div class="flex items-center justify-center min-h-[60vh]">
				<LoadingSpinner message="Loading budget data..." />
			</div>
		{:else}
			<div class="p-4 space-y-6">
				{#if selectedTab === 0}
					<!-- Budget Tab -->
					<WaterfallBudget 
						{monthlyIncome}
						{showPlaceholder}
						onEditClick={handleEditBudget}
					/>
				{:else if selectedTab === 1}
					<!-- Scenarios Tab -->
					<ScenarioPlanning 
						{scenarios}
						{showPlaceholder}
						onScenarioSelect={handleScenarioSelect}
					/>
				{:else if selectedTab === 2}
					<!-- Tags Tab -->
					<TagIntegration 
						{whatTags}
						{whyTags}
						{showPlaceholder}
						onTagEdit={handleTagEdit}
					/>
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- Floating Action Button -->
<Fab 
	onclick={() => goto('/transaction/new')}
>
	<Plus/>
</Fab>