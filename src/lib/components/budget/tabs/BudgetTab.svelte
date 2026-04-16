<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
	import { Progress } from '$lib/components/ui/progress/index.ts';
	import {
		DollarSign,
		Plus,
		TrendingUp,
		TrendingDown,
		Target,
		AlertCircle,
		CheckCircle,
		PieChart,
		BarChart3,
		ExternalLink
	} from '@lucide/svelte';
	import { formatAmount, formatPercentage } from '$lib/utils/currency-utils';
	import { goto } from '$app/navigation';
	import { budgetService, transactionService, insightsService } from '$lib/core/services';
	import type { BudgetTabProps, PlanningData } from '../types.js';
	import type { Category } from '$lib/core/db';
	import { effectiveAmountForCategory } from '$lib/utils/category-utils';
	import CategoriesTabContent from '$lib/components/categories/CategoriesTabContent.svelte';
	import InlineAlertBadge from '$lib/components/InlineAlertBadge.svelte';
	import type { Insight } from '$lib/core/db';

	const { userCurrency, selectedAccountId, planningData, onSetGoal }: BudgetTabProps = $props();

	// Real budget categories data from our service
	let budgetCategories = $state<any[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	/** Low-tier (success/info) insights for inline badges on category rows. Key = categoryId. */
	let inlineInsightsByCategory = $state<Map<string, Insight[]>>(new Map());

	// Load real budget data and inline alerts
	onMount(async () => {
		try {
			isLoading = true;
			error = null;

			// Get categories with budget information
			const categories = await budgetService.getBudgetCategories();
			const transactions = await transactionService.getAllTransactions();

			// Calculate budget data for each category
			budgetCategories = categories.map((category) => {
				const categoryTransactions = transactions.filter(
					(tx) =>
						tx.type === 'expense' &&
						tx.status === 'cleared' &&
						Math.abs(effectiveAmountForCategory(tx, category.id)) > 1e-9
				);

				const spent = categoryTransactions.reduce(
					(sum, tx) => sum + Math.abs(effectiveAmountForCategory(tx, category.id)),
					0
				);
				const allocated = category.budgetAmount || 0;

				return {
					id: category.id,
					name: category.name,
					allocated,
					spent,
					color: getCategoryColor(category.waterfallTier),
					bgColor: getCategoryBgColor(category.waterfallTier),
					borderColor: getCategoryBorderColor(category.waterfallTier),
					icon: getCategoryIcon(category.waterfallTier),
					description: getCategoryDescription(category.waterfallTier),
					waterfallTier: category.waterfallTier
				};
			});
		} catch (err) {
			console.error('Error loading budget data:', err);
			error = 'Failed to load budget data';
		} finally {
			isLoading = false;
		}

		try {
			const lowTier = await insightsService.getLowTierInlineInsights();
			const byCategory = new Map<string, Insight[]>();
			for (const i of lowTier) {
				if (i.categoryId) {
					const list = byCategory.get(i.categoryId) ?? [];
					list.push(i);
					byCategory.set(i.categoryId, list);
				}
			}
			inlineInsightsByCategory = byCategory;
		} catch {
			// Non-blocking
		}
	});

	async function dismissInlineAlert(insightId: string) {
		await insightsService.dismissInsight(insightId);
		const next = await insightsService.getLowTierInlineInsights();
		const byCategory = new Map<string, Insight[]>();
		for (const i of next) {
			if (i.categoryId) {
				const list = byCategory.get(i.categoryId) ?? [];
				list.push(i);
				byCategory.set(i.categoryId, list);
			}
		}
		inlineInsightsByCategory = byCategory;
	}

	function getCategoryColor(tier: Category['waterfallTier']): string {
		switch (tier) {
			case 'survival':
				return 'text-red-500';
			case 'security':
				return 'text-yellow-600';
			case 'growth':
				return 'text-blue-600';
			case 'lifestyle':
				return 'text-green-600';
			default:
				return 'text-gray-500';
		}
	}

	function getCategoryBgColor(tier: Category['waterfallTier']): string {
		switch (tier) {
			case 'survival':
				return 'bg-red-50';
			case 'security':
				return 'bg-yellow-50';
			case 'growth':
				return 'bg-blue-50';
			case 'lifestyle':
				return 'bg-green-50';
			default:
				return 'bg-gray-50';
		}
	}

	function getCategoryBorderColor(tier: Category['waterfallTier']): string {
		switch (tier) {
			case 'survival':
				return 'border-red-200';
			case 'security':
				return 'border-yellow-200';
			case 'growth':
				return 'border-blue-200';
			case 'lifestyle':
				return 'border-green-200';
			default:
				return 'border-gray-200';
		}
	}

	function getCategoryIcon(tier: Category['waterfallTier']) {
		switch (tier) {
			case 'survival':
				return AlertCircle;
			case 'security':
				return CheckCircle;
			case 'growth':
				return TrendingUp;
			case 'lifestyle':
				return PieChart;
			default:
				return DollarSign;
		}
	}

	function getCategoryDescription(tier: Category['waterfallTier']): string {
		switch (tier) {
			case 'survival':
				return 'Essential needs like food, housing, utilities';
			case 'security':
				return 'Emergency fund, debt payments, insurance';
			case 'growth':
				return 'Investments, education, career development';
			case 'lifestyle':
				return 'Entertainment, hobbies, discretionary spending';
			default:
				return 'General expenses';
		}
	}

	// Goals impact data - simplified for now
	let goalsImpact = $state<any[]>([]);

	function formatCurrency(amount: number): string {
		return formatAmount(amount, userCurrency);
	}

	function getSpendingPercentage(category: any): number {
		return Math.min(100, (category.spent / category.allocated) * 100);
	}

	function getRemainingBudget(category: any): number {
		return Math.max(0, category.allocated - category.spent);
	}

	function getStatusColor(category: any): string {
		const percentage = getSpendingPercentage(category);
		if (percentage >= 90) return 'text-destructive';
		if (percentage >= 75) return 'text-warning';
		return 'text-success';
	}

	function getStatusBadgeVariant(
		category: any
	): 'default' | 'destructive' | 'secondary' | 'outline' {
		const percentage = getSpendingPercentage(category);
		if (percentage >= 90) return 'destructive';
		if (percentage >= 75) return 'secondary';
		return 'default';
	}

	function getTotalAllocated(): number {
		return budgetCategories.reduce((sum, cat) => sum + cat.allocated, 0);
	}

	function getTotalSpent(): number {
		return budgetCategories.reduce((sum, cat) => sum + cat.spent, 0);
	}

	function getTotalRemaining(): number {
		return getTotalAllocated() - getTotalSpent();
	}

	function getTotalGoalsImpact(): number {
		return goalsImpact.reduce((sum, goal) => sum + goal.monthlyContribution, 0);
	}

	function getDailyAllowanceImpact(): number {
		return goalsImpact.reduce((sum, goal) => sum + goal.impactOnDailyAllowance, 0);
	}
</script>

<div class="space-y-6 p-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-primary text-lg font-semibold">Budget Allocation</h2>
			<div class="text-muted-foreground text-sm">
				Manage your budget categories and track goal impact
			</div>
		</div>
		<Button onclick={onSetGoal} size="sm">
			<Plus class="mr-2" size={14} />
			Set Goal
		</Button>
	</div>

	{#if isLoading}
		<!-- Loading State -->
		<div class="flex items-center justify-center py-8">
			<div class="text-muted-foreground">Loading budget data...</div>
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="bg-destructive/10 border-destructive/20 rounded-lg border p-4">
			<div class="text-destructive flex items-center gap-2">
				<AlertCircle size={16} />
				<span class="font-medium">Error</span>
			</div>
			<div class="text-destructive mt-1 text-sm">{error}</div>
		</div>
	{:else if budgetCategories.length === 0}
		<!-- No Budget Categories -->
		<Card class="border-border">
			<CardContent class="py-8 text-center">
				<DollarSign size={48} class="text-muted-foreground mx-auto mb-4" />
				<h3 class="mb-2 text-lg font-semibold">No Budget Categories</h3>
				<p class="text-muted-foreground mb-4">
					Create budget categories to start tracking your spending
				</p>
				<Button
					onclick={() =>
						document
							.getElementById('budget-categories-section')
							?.scrollIntoView({ behavior: 'smooth' })}
				>
					<Plus class="mr-2" size={14} />
					Create Category
				</Button>
			</CardContent>
		</Card>
	{:else}
		<!-- Budget Summary -->
		<Card class="border-border">
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<BarChart3 size={18} />
					Budget Overview
				</CardTitle>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="grid grid-cols-3 gap-4">
					<div class="text-center">
						<div class="text-primary text-2xl font-bold">{formatCurrency(getTotalAllocated())}</div>
						<div class="text-muted-foreground text-sm">Total Allocated</div>
					</div>
					<div class="text-center">
						<div class="text-warning text-2xl font-bold">{formatCurrency(getTotalSpent())}</div>
						<div class="text-muted-foreground text-sm">Total Spent</div>
					</div>
					<div class="text-center">
						<div class="text-success text-2xl font-bold">{formatCurrency(getTotalRemaining())}</div>
						<div class="text-muted-foreground text-sm">Remaining</div>
					</div>
				</div>

				{#if getTotalAllocated() > 0}
					<!-- Overall Progress -->
					<div class="space-y-2">
						<div class="flex items-center justify-between text-sm">
							<span class="text-muted-foreground">Overall Budget Usage</span>
							<span class="font-medium"
								>{formatPercentage((getTotalSpent() / getTotalAllocated()) * 100)}</span
							>
						</div>
						<Progress value={(getTotalSpent() / getTotalAllocated()) * 100} class="h-2" />
					</div>
				{/if}
			</CardContent>
		</Card>

		<!-- Budget Categories -->
		<div class="space-y-4">
			<h3 class="text-lg font-semibold">Budget Categories</h3>
			{#each budgetCategories as category (category.id)}
				{@const CategoryIcon = category.icon}
				{@const spendingPercentage = getSpendingPercentage(category)}
				{@const remainingBudget = getRemainingBudget(category)}

				<Card class="border-border {category.borderColor}">
					<CardHeader class="pb-3">
						<div class="flex items-start justify-between">
							<div class="flex flex-wrap items-center gap-2">
								<CategoryIcon size={16} class={category.color} />
								<CardTitle class="text-lg">{category.name}</CardTitle>
								<Badge variant="outline" class="text-xs">
									{category.waterfallTier}
								</Badge>
								{#if (inlineInsightsByCategory.get(category.id)?.length ?? 0) > 0}
									<InlineAlertBadge
										insights={inlineInsightsByCategory.get(category.id)!}
										onDismiss={dismissInlineAlert}
										label="rising"
									/>
								{/if}
							</div>
							{#if category.allocated > 0}
								<Badge variant={getStatusBadgeVariant(category)} class="text-xs">
									{spendingPercentage.toFixed(0)}% used
								</Badge>
							{/if}
						</div>
						<p class="text-muted-foreground text-sm">{category.description}</p>
					</CardHeader>
					<CardContent class="space-y-4">
						{#if category.allocated > 0}
							<!-- Progress Bar -->
							<div class="space-y-2">
								<div class="flex items-center justify-between text-sm">
									<span class="text-muted-foreground">Spending Progress</span>
									<span class="font-medium {getStatusColor(category)}"
										>{formatPercentage(spendingPercentage)}</span
									>
								</div>
								<Progress value={spendingPercentage} class="h-2" />
								<div class="flex items-center justify-between text-sm">
									<span class="text-muted-foreground">
										{formatCurrency(category.spent)} of {formatCurrency(category.allocated)}
									</span>
									<span class="text-success font-medium">
										{formatCurrency(remainingBudget)} remaining
									</span>
								</div>
							</div>

							<!-- Budget Details -->
							<div class="grid grid-cols-2 gap-4 text-sm">
								<div>
									<div class="text-muted-foreground">Allocated</div>
									<div class="font-medium">{formatCurrency(category.allocated)}</div>
								</div>
								<div>
									<div class="text-muted-foreground">Spent</div>
									<div class="font-medium {getStatusColor(category)}">
										{formatCurrency(category.spent)}
									</div>
								</div>
							</div>

							<!-- Warning if over budget -->
							{#if category.spent > category.allocated}
								<div class="bg-destructive/10 border-destructive/20 rounded-lg border p-3">
									<div class="text-destructive flex items-center gap-2 text-sm">
										<AlertCircle size={14} />
										<span class="font-medium">Over Budget</span>
									</div>
									<div class="text-destructive mt-1 text-xs">
										You've exceeded your {category.name.toLowerCase()} budget by {formatCurrency(
											category.spent - category.allocated
										)}
									</div>
								</div>
							{/if}
						{:else}
							<!-- No Budget Set -->
							<div class="py-4 text-center">
								<div class="text-muted-foreground mb-2 text-sm">No budget allocated</div>
								<Button
									variant="outline"
									size="sm"
									onclick={() =>
										document
											.getElementById('budget-categories-section')
											?.scrollIntoView({ behavior: 'smooth' })}
								>
									Set Budget
								</Button>
							</div>
						{/if}
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}

	<!-- Quick Actions -->
	<Card class="border-border">
		<CardHeader>
			<CardTitle>Quick Actions</CardTitle>
		</CardHeader>
		<CardContent>
			<div class="grid grid-cols-2 gap-3">
				<Button
					variant="outline"
					onclick={() =>
						document
							.getElementById('budget-categories-section')
							?.scrollIntoView({ behavior: 'smooth' })}
					class="h-auto p-4"
				>
					<div class="text-center">
						<Plus class="mx-auto mb-2" size={20} />
						<div class="font-medium">Add Category</div>
						<div class="text-muted-foreground text-xs">Create new budget category</div>
					</div>
				</Button>
				<Button
					variant="outline"
					onclick={() =>
						document
							.getElementById('budget-categories-section')
							?.scrollIntoView({ behavior: 'smooth' })}
					class="h-auto p-4"
				>
					<div class="text-center">
						<DollarSign class="mx-auto mb-2" size={20} />
						<div class="font-medium">Manage Categories</div>
						<div class="text-muted-foreground text-xs">View and edit all categories</div>
					</div>
				</Button>
			</div>
		</CardContent>
	</Card>

	<!-- Manage categories (reused from Plan; add/edit via sheet or inline) -->
	<section id="budget-categories-section" class="scroll-mt-4">
		<h3 class="mb-3 text-lg font-semibold">Manage Categories</h3>
		<CategoriesTabContent />
	</section>
</div>
