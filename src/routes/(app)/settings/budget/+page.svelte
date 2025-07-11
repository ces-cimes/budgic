<script lang="ts">
	import { budgetService, type CategoryBudget, type BudgetRecommendation, type BudgetInsight } from '$lib/core/services/budget-service';
	import TagBudgetManager from '$lib/components/layout/TagBudgetManager.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Card from '$lib/components/primitives/Card.svelte';
	import TopBar from '$lib/components/layout/TopBar.svelte';
	import { AlertTriangle, TrendingUp, Target, DollarSign, Settings, Lightbulb } from '@lucide/svelte';

	let categoryBudgets = $state<CategoryBudget[]>([]);
	let recommendations = $state<BudgetRecommendation[]>([]);
	let insights = $state<BudgetInsight[]>([]);
	let isLoading = $state(true);
	let activeTab = $state<'overview' | 'tag-budgets' | 'recommendations' | 'insights'>('overview');

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('en-US', { 
			style: 'currency', 
			currency: 'USD',
			minimumFractionDigits: 0
		}).format(amount);
	}

	function calculateProgress(spent: number, allocated: number) {
		return Math.min((spent / allocated) * 100, 100);
	}

	const loadBudgetData = async () => {
		try {
			isLoading = true;
			
			// Get current spending status
			categoryBudgets = await budgetService.getCurrentSpendingStatus();
			
			// Generate recommendations and insights
			recommendations = await budgetService.generateRecommendations(categoryBudgets);
			insights = await budgetService.generateInsights(categoryBudgets);
			
		} catch (error) {
			console.error('Error loading budget data:', error);
		} finally {
			isLoading = false;
		}
	};

	const handleBudgetSave = async () => {
		await loadBudgetData();
	};

	const getCategoryColor = (category: string) => {
		const colors = {
			survival: '#4A7C59',
			security: '#E8B86D', 
			growth: '#FF8A80',
			lifestyle: '#9C27B0'
		};
		return colors[category as keyof typeof colors] || '#666';
	};

	const getPriorityColor = (priority: string) => {
		const colors = {
			high: 'text-red-600 bg-red-100 dark:bg-red-900/20',
			medium: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20',
			low: 'text-green-600 bg-green-100 dark:bg-green-900/20'
		};
		return colors[priority as keyof typeof colors] || colors.low;
	};

	const getInsightIcon = (type: string) => {
		const icons = {
			spending_trend: TrendingUp,
			category_overspend: AlertTriangle,
			surplus_detected: DollarSign,
			rollover_opportunity: TrendingUp,
			goal_milestone: Target,
			tag_overspend: AlertTriangle
		};
		return icons[type as keyof typeof icons] || Settings;
	};

	const getInsightColor = (severity: string) => {
		const colors = {
			info: 'text-blue-600 bg-blue-100 dark:bg-blue-900/20',
			warning: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20',
			alert: 'text-red-600 bg-red-100 dark:bg-red-900/20',
			success: 'text-green-600 bg-green-100 dark:bg-green-900/20'
		};
		return colors[severity as keyof typeof colors] || colors.info;
	};

	$effect(() => {
		loadBudgetData();
	});
</script>

<svelte:head>
	<title>Budget Settings - Budgic</title>
</svelte:head>

<TopBar 
	title="Budget Settings"
	description="Configure your tag-level budget system with dynamic waterfall categories"
	showBackButton={true}
	onBack={() => window.history.back()}
/>

<div class="space-y-6">
	<!-- System Philosophy -->
	<Card>
        <div class="flex items-start gap-4">
            <div class="flex-1">
                <div class="flex flex-row items-center gap-4 mb-4">
                    <div class="w-12 h-12 min-w-12 min-h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                        <Lightbulb size={24} class="text-blue-600" />
                    </div>
                    <h2 class="text-lg font-semibold text-text-primary mb-2">Income-Agnostic Budgeting</h2>
                </div>
                <p class="text-text-secondary mb-3">
                    This system focuses on your actual financial needs and goals, not artificial income constraints. 
                    Create tag budgets based on what you need and want, then allocate income as it arrives.
                </p>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div class="p-3 bg-bg-tertiary rounded-lg">
                        <div class="font-medium text-text-primary mb-1">Needs-Based</div>
                        <div class="text-text-secondary">Budget for actual expenses and goals</div>
                    </div>
                    <div class="p-3 bg-bg-tertiary rounded-lg">
                        <div class="font-medium text-text-primary mb-1">Adaptive</div>
                        <div class="text-text-secondary">Allocate income as it arrives</div>
                    </div>
                    <div class="p-3 bg-bg-tertiary rounded-lg">
                        <div class="font-medium text-text-primary mb-1">Intelligent</div>
                        <div class="text-text-secondary">Smart suggestions based on priorities</div>
                    </div>
                </div>
            </div>
        </div>
	</Card>

	<!-- Navigation Tabs -->
	<div class="flex flex-wrap space-x-1 bg-bg-tertiary p-1 rounded-lg">
		<button
			class="flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors"
			class:text-text-primary={activeTab === 'overview'}
			class:text-text-secondary={activeTab !== 'overview'}
			class:bg-bg-secondary={activeTab === 'overview'}
			onclick={() => activeTab = 'overview'}
		>
			Overview
		</button>
		<button
			class="flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors"
			class:text-text-primary={activeTab === 'tag-budgets'}
			class:text-text-secondary={activeTab !== 'tag-budgets'}
			class:bg-bg-secondary={activeTab === 'tag-budgets'}
			onclick={() => activeTab = 'tag-budgets'}
		>
			Tag Budgets
		</button>
		<button
			class="flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors"
			class:text-text-primary={activeTab === 'recommendations'}
			class:text-text-secondary={activeTab !== 'recommendations'}
			class:bg-bg-secondary={activeTab === 'recommendations'}
			onclick={() => activeTab = 'recommendations'}
		>
			Recommendations
		</button>
		<button
			class="flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors"
			class:text-text-primary={activeTab === 'insights'}
			class:text-text-secondary={activeTab !== 'insights'}
			class:bg-bg-secondary={activeTab === 'insights'}
			onclick={() => activeTab = 'insights'}
		>
			Insights
		</button>
	</div>

	{#if isLoading}
		<div class="flex items-center justify-center py-12">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
		</div>
	{:else}
		<!-- Overview Tab -->
		{#if activeTab === 'overview'}
			<div class="space-y-6">
				<!-- Budget Summary -->
				<Card>
                    <h2 class="text-lg font-semibold text-text-primary mb-4">Budget Summary</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {#each categoryBudgets as categoryBudget}
                            <div class="p-4 bg-bg-tertiary rounded-lg">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="font-medium text-text-primary capitalize">{categoryBudget.waterfallCategory}</span>
                                    <div class="w-4 h-4 rounded-full" style="background-color: {getCategoryColor(categoryBudget.waterfallCategory)};"></div>
                                </div>
                                <div class="text-2xl font-bold text-text-primary mb-1">
                                    {formatCurrency(categoryBudget.totalAllocated)}
                                </div>
                                <div class="text-sm text-text-secondary mb-2">
                                    Used: {formatCurrency(categoryBudget.spent)} / Remaining: {formatCurrency(categoryBudget.remaining)}
                                </div>
                                <div class="w-full bg-bg-surface rounded-full h-2">
                                    <div 
                                        class="h-2 rounded-full transition-all duration-300"
                                        style="width: {calculateProgress(categoryBudget.spent, categoryBudget.totalAllocated)}%; background-color: {getCategoryColor(categoryBudget.waterfallCategory)};"
                                    ></div>
                                </div>
                            </div>
                        {/each}
                    </div>
				</Card>

				<!-- Quick Stats -->
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					<Card class="text-center">
                        <div class="text-2xl font-bold text-text-primary">
                            {categoryBudgets.reduce((sum, cb) => sum + cb.totalAllocated, 0).toLocaleString()}
                        </div>
                        <div class="text-sm text-text-secondary">Total Budget Needed</div>
					</Card>
					<Card class="text-center">
                        <div class="text-2xl font-bold text-text-primary">
                            {categoryBudgets.reduce((sum, cb) => sum + cb.spent, 0).toLocaleString()}
                        </div>
                        <div class="text-sm text-text-secondary">Total Spent</div>
					</Card>
					<Card class="text-center">
                        <div class="text-2xl font-bold text-text-primary">
                            {categoryBudgets.reduce((sum, cb) => sum + cb.remaining, 0).toLocaleString()}
                        </div>
                        <div class="text-sm text-text-secondary">Total Remaining</div>
					</Card>
				</div>

				<!-- How It Works -->
				<Card>
                    <h2 class="text-lg font-semibold text-text-primary mb-4">How It Works</h2>
                    <div class="space-y-4">
                        <div class="flex items-start gap-3">
                            <div class="w-8 h-8 min-w-8 min-h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">1</div>
                            <div>
                                <h3 class="font-medium text-text-primary">Create Tag Budgets</h3>
                                <p class="text-text-secondary">Set up budgets for specific expenses and goals: rent, groceries, emergency fund, etc.</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <div class="w-8 h-8 min-w-8 min-h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">2</div>
                            <div>
                                <h3 class="font-medium text-text-primary">Allocate Income</h3>
                                <p class="text-text-secondary">When income arrives, get smart suggestions for optimal allocation based on priorities.</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <div class="w-8 h-8 min-w-8 min-h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">3</div>
                            <div>
                                <h3 class="font-medium text-text-primary">Track Progress</h3>
                                <p class="text-text-secondary">Monitor spending against individual tags and see category totals automatically calculated.</p>
                            </div>
                        </div>
                    </div>
				</Card>
			</div>
		{/if}

		<!-- Tag Budgets Tab -->
		{#if activeTab === 'tag-budgets'}
			<TagBudgetManager 
				onSave={handleBudgetSave}
			/>
		{/if}

		<!-- Recommendations Tab -->
		{#if activeTab === 'recommendations'}
			<div class="space-y-4">
				{#if recommendations.length === 0}
					<Card>
						<div class="p-6 text-center">
							<Target size={48} class="mx-auto text-text-tertiary mb-4" />
							<h3 class="text-lg font-semibold text-text-primary mb-2">No Recommendations</h3>
							<p class="text-text-secondary">Your budget is well-balanced! Check back later for new suggestions.</p>
						</div>
					</Card>
				{:else}
					{#each recommendations as recommendation}
						<Card>
							<div class="p-4">
								<div class="flex items-start justify-between">
									<div class="flex-1">
										<div class="flex items-center gap-2 mb-2">
											<h3 class="font-semibold text-text-primary">{recommendation.title}</h3>
											<span class="text-xs px-2 py-1 rounded-full {getPriorityColor(recommendation.priority)}">
												{recommendation.priority}
											</span>
										</div>
										<p class="text-text-secondary mb-3">{recommendation.description}</p>
										<div class="text-sm text-text-tertiary">
											Reason: {recommendation.action.reason}
										</div>
									</div>
									<Button variant="secondary" size="sm">
										Apply
									</Button>
								</div>
							</div>
						</Card>
					{/each}
				{/if}
			</div>
		{/if}

		<!-- Insights Tab -->
		{#if activeTab === 'insights'}
			<div class="space-y-4">
				{#if insights.length === 0}
					<Card>
						<div class="p-6 text-center">
							<TrendingUp size={48} class="mx-auto text-text-tertiary mb-4" />
							<h3 class="text-lg font-semibold text-text-primary mb-2">No Insights</h3>
							<p class="text-text-secondary">Start using your budget to see personalized insights and trends.</p>
						</div>
					</Card>
				{:else}
					{#each insights as insight}
						<Card>
							<div class="p-4">
								<div class="flex items-start gap-3">
									<div class="flex-shrink-0">
										<div class="w-10 h-10 rounded-full {getInsightColor(insight.severity)} flex items-center justify-center">
											<svelte:component this={getInsightIcon(insight.type)} size={20} />
										</div>
									</div>
									<div class="flex-1">
										<h3 class="font-semibold text-text-primary mb-1">{insight.title}</h3>
										<p class="text-text-secondary">{insight.description}</p>
									</div>
								</div>
							</div>
						</Card>
					{/each}
				{/if}
			</div>
		{/if}
	{/if}
</div> 