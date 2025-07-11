<script lang="ts">
	import { budgetService, type CategoryBudget, type BudgetAllocation, type FinancialNeeds } from '$lib/core/services/budget-service';
	import { unifiedInsightsService } from '$lib/core/services';
	import Button from '$lib/components/primitives/Button.svelte';
	import { Edit, TrendingUp, TrendingDown, Target, CheckCircle } from '@lucide/svelte';

	interface WaterfallCategory {
		id: string;
		name: string;
		allocated: number;
		targetAmount: number;
		used: number;
		remaining: number;
		icon: string;
		color: string;
		subcategories: {
			name: string;
			amount: number;
			icon: string;
		}[];
		rollover?: number;
		borrowed?: number;
		isComplete: boolean;
		completionPercentage: number;
	}

	const { monthlyIncome = 4200, showPlaceholder = false, onEditClick = () => {} } = $props<{
		monthlyIncome?: number;
		showPlaceholder?: boolean;
		onEditClick?: () => void;
	}>();

	let categories = $state<WaterfallCategory[]>([]);
	let isLoading = $state(true);
	let aiSuggestion = $state<{
		title: string;
		description: string;
		action: string;
		impact: string;
	} | null>(null);
	let financialNeeds = $state<FinancialNeeds | null>(null);

	// Waterfall configuration with absolute amounts
	const waterfallConfig = {
		survival: {
			name: 'SURVIVAL',
			icon: '🏠',
			color: '#4A7C59', // sage green
			subcategories: [
				{ name: 'Housing', amount: 1200, icon: '🏠' },
				{ name: 'Food', amount: 400, icon: '🍽️' },
				{ name: 'Transport', amount: 247, icon: '🚗' },
				{ name: 'Utilities', amount: 200, icon: '⚡' },
				{ name: 'Healthcare', amount: 150, icon: '🏥' },
				{ name: 'Buffer', amount: 0, icon: '🛡️' } // Will be calculated
			]
		},
		security: {
			name: 'SECURITY',
			icon: '🛡️',
			color: '#E8B86D', // warning amber
			subcategories: [
				{ name: 'Emergency Fund', amount: 500, icon: '🚨' },
				{ name: 'Insurance', amount: 200, icon: '🛡️' },
				{ name: 'Debt Payments', amount: 300, icon: '💳' }
			]
		},
		growth: {
			name: 'GROWTH',
			icon: '📈',
			color: '#FF8A80', // warm coral
			subcategories: [
				{ name: 'Investment', amount: 300, icon: '📈' },
				{ name: 'Education', amount: 200, icon: '🎓' },
				{ name: 'Skills', amount: 100, icon: '⚡' }
			]
		},
		lifestyle: {
			name: 'LIFESTYLE',
			icon: '🎯',
			color: '#9C27B0', // purple
			subcategories: [
				{ name: 'Entertainment', amount: 200, icon: '🎬' },
				{ name: 'Hobbies', amount: 100, icon: '🎨' },
				{ name: 'Discretionary', amount: 100, icon: '🎁' }
			]
		}
	};

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('en-US', { 
			style: 'currency', 
			currency: 'USD',
			minimumFractionDigits: 0
		}).format(amount);
	}

	function calculateProgress(used: number, allocated: number) {
		return Math.min((used / allocated) * 100, 100);
	}

	function calculateCompletionPercentage(allocated: number, targetAmount: number) {
		return Math.min((allocated / targetAmount) * 100, 100);
	}

	const loadBudgetData = async () => {
		try {
			isLoading = true;
			
			if (showPlaceholder) {
				                                // Use placeholder data with absolute amounts
                                const allocations = await budgetService.calculateOptimalAllocations([]);
				
				categories = Object.entries(waterfallConfig).map(([key, config]) => {
					const allocation = allocations[key as keyof BudgetAllocation];
					const allocated = allocation.amount;
					const targetAmount = allocation.targetAmount;
					const used = allocated * (0.7 + Math.random() * 0.3); // Random usage between 70-100%
					const remaining = allocated - used;
					const completionPercentage = calculateCompletionPercentage(allocated, targetAmount);
					
					return {
						id: key,
						name: config.name,
						allocated,
						targetAmount,
						used,
						remaining,
						icon: config.icon,
						color: config.color,
						subcategories: config.subcategories,
						rollover: Math.random() > 0.7 ? Math.random() * 100 : undefined,
						borrowed: Math.random() > 0.8 ? Math.random() * 50 : undefined,
						isComplete: allocation.isComplete,
						completionPercentage
					};
				});
				
				// Placeholder AI suggestion
				aiSuggestion = {
					title: 'AI Suggestion',
					description: 'Move $50 from Lifestyle to Emergency Fund',
					action: 'Accept',
					impact: 'Improves security buffer by 12%'
				};
			} else {
				// Load real budget data from budget service
				                                const categoryBudgets = await budgetService.getCurrentSpendingStatus();
                                const allocations = await budgetService.calculateOptimalAllocations([]);
				const recommendations = await budgetService.generateRecommendations(categoryBudgets);
				
				categories = Object.entries(waterfallConfig).map(([key, config]) => {
					const allocation = allocations[key as keyof BudgetAllocation];
					const categoryBudget = categoryBudgets.find(b => b.waterfallCategory === key);
					const allocated = allocation.amount;
					const targetAmount = allocation.targetAmount;
					const used = categoryBudget?.spent || 0;
					const remaining = allocated - used;
					const completionPercentage = calculateCompletionPercentage(allocated, targetAmount);
					
					return {
						id: key,
						name: config.name,
						allocated,
						targetAmount,
						used,
						remaining,
						icon: config.icon,
						color: config.color,
						subcategories: config.subcategories,
						rollover: categoryBudget?.rolloverAmount,
						borrowed: categoryBudget?.borrowedAmount,
						isComplete: allocation.isComplete,
						completionPercentage
					};
				});

				// Generate AI suggestion from recommendations
				if (recommendations.length > 0) {
					const recommendation = recommendations[0];
					aiSuggestion = {
						title: recommendation.title,
						description: recommendation.description,
						action: 'Accept',
						impact: 'Optimizes budget allocation'
					};
				}
			}
		} catch (error) {
			console.error('Error loading budget data:', error);
		} finally {
			isLoading = false;
		}
	};

	const handleAISuggestion = (action: 'accept' | 'dismiss') => {
		if (action === 'accept') {
			// TODO: Implement AI suggestion acceptance
			console.log('AI suggestion accepted');
		}
		aiSuggestion = null;
	};

	$effect(() => {
		loadBudgetData();
	});
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-text-primary">Plan & Budget</h1>
			<p class="text-text-secondary text-sm">Absolute Amount Waterfall System</p>
		</div>
		<Button 
			variant="secondary" 
			size="sm"
			onclick={onEditClick}
		>
			<Edit size={16} class="mr-2" />
			Edit
		</Button>
	</div>

	<!-- Monthly Income -->
	<div class="bg-bg-secondary rounded-2xl p-4 border border-primary">
		<div class="flex items-center justify-between">
			<span class="text-text-secondary">Monthly Income:</span>
			<span class="text-2xl font-bold text-text-primary">{formatCurrency(monthlyIncome)}</span>
		</div>
	</div>

	{#if isLoading}
		<div class="flex items-center justify-center py-8">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
		</div>
	{:else}
		<!-- Waterfall Categories -->
		<div class="space-y-4">
			{#each categories as category}
				{@const progress = calculateProgress(category.used, category.allocated)}
				<div class="bg-bg-secondary rounded-2xl p-4 border border-primary">
					<!-- Category Header -->
					<div class="flex items-center justify-between mb-3">
						<div class="flex items-center gap-2">
							<span class="text-xl">{category.icon}</span>
							<div>
								<span class="font-semibold text-text-primary">{category.name}</span>
								{#if category.isComplete}
									<CheckCircle size={16} class="inline ml-2 text-green-500" />
								{/if}
							</div>
						</div>
						<div class="text-right">
							<div class="font-bold text-text-primary">{formatCurrency(category.allocated)}</div>
							<div class="text-xs text-text-tertiary">Target: {formatCurrency(category.targetAmount)}</div>
						</div>
					</div>

					<!-- Progress Bar -->
					<div class="mb-3">
						<div class="flex justify-between text-sm mb-1">
							<span class="text-text-secondary">Used: {formatCurrency(category.used)}</span>
							<span class="text-text-secondary">Remaining: {formatCurrency(category.remaining)}</span>
						</div>
						<div class="w-full bg-bg-tertiary rounded-full h-2">
							<div 
								class="h-2 rounded-full transition-all duration-300"
								style="width: {progress}%; background-color: {category.color};"
							></div>
						</div>
					</div>

					<!-- Completion Status -->
					<div class="flex items-center justify-between mb-3 text-sm">
						<div class="flex items-center gap-1">
							<Target size={14} class="text-text-tertiary" />
							<span class="text-text-tertiary">Goal Progress:</span>
						</div>
						<span class="font-medium" style="color: {category.color}">
							{category.completionPercentage.toFixed(1)}%
						</span>
					</div>

					<!-- Subcategories -->
					<div class="space-y-2">
						{#each category.subcategories as subcategory}
							<div class="flex items-center justify-between text-sm">
								<div class="flex items-center gap-2">
									<span>{subcategory.icon}</span>
									<span class="text-text-secondary">{subcategory.name}</span>
								</div>
								<span class="font-medium text-text-primary">{formatCurrency(subcategory.amount)}</span>
							</div>
						{/each}
					</div>

					<!-- Rollover/Borrowed Indicators -->
					{#if category.rollover || category.borrowed}
						<div class="mt-3 pt-3 border-t border-bg-surface/50">
							{#if category.rollover}
								<div class="flex items-center justify-between text-sm">
									<span class="text-green-600">Rollover Available:</span>
									<span class="font-medium text-green-600">{formatCurrency(category.rollover)}</span>
								</div>
							{/if}
							{#if category.borrowed}
								<div class="flex items-center justify-between text-sm">
									<span class="text-red-600">Borrowed:</span>
									<span class="font-medium text-red-600">{formatCurrency(category.borrowed)}</span>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- AI Suggestion -->
		{#if aiSuggestion}
			<div class="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-4 border border-blue-200 dark:border-blue-800">
				<div class="flex items-start justify-between">
					<div class="flex-1">
						<h3 class="font-semibold text-text-primary mb-1">{aiSuggestion.title}</h3>
						<p class="text-sm text-text-secondary mb-2">{aiSuggestion.description}</p>
						<div class="flex items-center gap-4">
							<Button 
								variant="primary" 
								size="sm"
								onclick={() => handleAISuggestion('accept')}
							>
								{aiSuggestion.action}
							</Button>
							<Button 
								variant="secondary" 
								size="sm"
								onclick={() => handleAISuggestion('dismiss')}
							>
								Dismiss
							</Button>
						</div>
					</div>
					<div class="text-right">
						<div class="text-xs text-text-tertiary mb-1">Impact</div>
						<div class="text-sm font-medium text-text-primary">{aiSuggestion.impact}</div>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div> 