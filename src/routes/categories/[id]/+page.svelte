<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as Button from '$lib/components/ui/button/index.ts';
	import * as Tabs from '$lib/components/ui/tabs/index.ts';
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { budgetService } from '$lib/core/services/budget-service';
	import { transactionService } from '$lib/core/services/transaction-service';
	import type { BudgetCategory, Transaction } from '$lib/core/db';
	import type { TransactionOrGroup } from '$lib/utils/transaction-utils';
	import { page } from '$app/stores';
	import { formatAmount } from '$lib/utils/currency-utils';
	import { settingsService } from '$lib/core/services/settings-service';
	import { PageLayout, MobileNavigation } from '$lib/components/layouts';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';

	const { data } = $props<{ data: any }>();

	let category = $state<BudgetCategory | null>(null);
	let transactions = $state<TransactionOrGroup[]>([]);
	let isLoading = $state(true);
	let isEditing = $state(false);
	let activeTab = $state('overview');
	let userCurrency = $state<string>('USD');

	// Sidebar context for mobile detection
	const sidebar = Sidebar.useSidebar();

	const categoryId = $derived($page.params.id);

	const waterfallColors = {
		survival: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
		security: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
		growth: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
		lifestyle: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
	};

	onMount(async () => {
		// Get user's preferred currency
		userCurrency = await settingsService.getCurrency();
		
		await loadCategory();
		await loadTransactions();
	});

	async function loadCategory() {
		try {
			if (categoryId) {
				const categoryData = await budgetService.getBudgetCategoryById(categoryId);
				category = categoryData || null;
				if (!category) {
					// Category not found, redirect to categories list
					goto('/categories');
					return;
				}
			}
		} catch (error) {
			console.error('Error loading category:', error);
		} finally {
			isLoading = false;
		}
	}

	async function loadTransactions() {
		try {
			if (categoryId) {
				const result = await transactionService.getTransactionsByBudgetCategory(categoryId, false);
				// The method returns TransactionOrGroup[] when separateSplits is false
				transactions = result as TransactionOrGroup[];
			}
		} catch (error) {
			console.error('Error loading transactions:', error);
		}
	}

	function startEditing() {
		isEditing = true;
	}

	function cancelEditing() {
		isEditing = false;
	}

	async function saveCategory(updatedCategory: BudgetCategory) {
		try {
			if (categoryId) {
				category = await budgetService.updateBudgetCategory(categoryId, updatedCategory);
				isEditing = false;
			}
		} catch (error) {
			console.error('Error saving category:', error);
		}
	}

	async function deleteCategory() {
		if (!category) return;
		
		if (confirm(`Are you sure you want to delete "${category.name}"? This action cannot be undone.`)) {
			try {
				await budgetService.deleteBudgetCategory(category.id);
				goto('/categories');
			} catch (error) {
				console.error('Error deleting category:', error);
			}
		}
	}

	// Calculate spending percentage
	let spendingPercentage = $derived(
		category && category.allocatedAmount > 0 
			? (category.spent / category.allocatedAmount) * 100 
			: 0
	);
</script>

<svelte:head>
	<title>{category?.name || 'Category'} - Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet bottomBar()}
		<!-- Mobile Navigation -->
		{#if sidebar.isMobile}
			<MobileNavigation />
		{/if}
	{/snippet}

	{#if isLoading}
	<div class="flex items-center justify-center min-h-96">
		<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
	</div>
{:else if category}
	<div class="space-y-6">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<Button.Root 
					variant="ghost" 
					size="sm"
					onclick={() => goto('/categories')}
				>
					← Back
				</Button.Root>
				<div>
					<h1 class="text-2xl font-bold text-primary">{category.name}</h1>
					<Badge class={waterfallColors[category.waterfallCategory]}>
						{category.waterfallCategory}
					</Badge>
				</div>
			</div>
			
			<div class="flex gap-2">
				{#if !isEditing}
					<Button.Root 
						variant="outline" 
						onclick={startEditing}
					>
						Edit
					</Button.Root>
					<Button.Root 
						variant="destructive" 
						onclick={deleteCategory}
					>
						Delete
					</Button.Root>
				{:else}
					<Button.Root 
						variant="outline" 
						onclick={cancelEditing}
					>
						Cancel
					</Button.Root>
				{/if}
			</div>
		</div>

		<!-- Category Details -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Category Details</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label class="text-sm font-medium text-secondary">Allocated Amount</label>
						<p class="text-lg font-semibold">{formatAmount(category.allocatedAmount, userCurrency)}</p>
					</div>
					<div>
						<label class="text-sm font-medium text-secondary">Spent</label>
						<p class="text-lg font-semibold text-destructive">{formatAmount(category.spent, userCurrency)}</p>
					</div>
					<div>
						<label class="text-sm font-medium text-secondary">Remaining</label>
						<p class="text-lg font-semibold text-success">{formatAmount(category.remaining, userCurrency)}</p>
					</div>
					<div>
						<label class="text-sm font-medium text-secondary">Priority</label>
						<p class="text-lg font-semibold">#{category.priority}</p>
					</div>
				</div>

				{#if category.description}
					<div>
						<label class="text-sm font-medium text-secondary">Description</label>
						<p class="text-sm text-tertiary">{category.description}</p>
					</div>
				{/if}

				{#if category.isGoalBased && category.goalTarget}
					<div>
						<label class="text-sm font-medium text-secondary">Goal Target</label>
						<p class="text-lg font-semibold">{formatAmount(category.goalTarget, userCurrency)}</p>
						<div class="w-full bg-muted rounded-full h-2 mt-2">
							<div 
								class="bg-primary h-2 rounded-full transition-all duration-300"
								style="width: {Math.min((category.goalProgress / category.goalTarget) * 100, 100)}%"
							></div>
						</div>
						<p class="text-xs text-tertiary mt-1">
							{formatAmount(category.goalProgress, userCurrency)} of {formatAmount(category.goalTarget, userCurrency)}
						</p>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Tabs -->
		<Tabs.Root bind:value={activeTab} class="w-full">
			<Tabs.List class="grid w-full grid-cols-2">
				<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
				<Tabs.Trigger value="transactions">Transactions</Tabs.Trigger>
			</Tabs.List>
			
			<Tabs.Content value="overview" class="space-y-4">
				<Card.Root>
					<Card.Header>
						<Card.Title>Budget Overview</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="space-y-4">
							<div class="flex justify-between items-center">
								<span class="text-sm font-medium">Budget Utilization</span>
								<span class="text-sm text-tertiary">{spendingPercentage.toFixed(1)}%</span>
							</div>
							<div class="w-full bg-muted rounded-full h-3">
								<div 
									class="h-3 rounded-full transition-all duration-300 {spendingPercentage > 100 ? 'bg-destructive' : spendingPercentage > 80 ? 'bg-warning' : 'bg-success'}"
									style="width: {Math.min(spendingPercentage, 100)}%"
								></div>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			</Tabs.Content>
			
			<Tabs.Content value="transactions" class="space-y-4">
				<Card.Root>
					<Card.Header>
						<Card.Title>Recent Transactions</Card.Title>
					</Card.Header>
					<Card.Content>
						{#if transactions.length > 0}
							<div class="space-y-2">
								{#each transactions.slice(0, 10) as group}
									<div class="flex items-center justify-between p-3 border rounded-lg">
										<div class="flex-1">
											<div class="flex items-center gap-2">
												<p class="font-medium">{group.representative.description || 'No description'}</p>
												{#if group.type === 'split'}
													<Badge variant="secondary" class="text-xs">Split</Badge>
												{/if}
											</div>
											<p class="text-sm text-tertiary">
												{new Date(group.representative.clearedDate || group.representative.plannedDate || group.representative.createdAt).toLocaleDateString()}
											</p>
											{#if group.type === 'split' && group.commonFields.splitName}
												<p class="text-xs text-tertiary">Split: {group.commonFields.splitName}</p>
											{/if}
										</div>
										<div class="text-right">
											<p class="font-semibold {group.representative.type === 'expense' ? 'text-destructive' : 'text-success'}">
												{group.representative.type === 'expense' ? '-' : '+'}{formatAmount(group.totalAmount, group.representative.currency)}
											</p>
											{#if group.type === 'split'}
												<p class="text-xs text-tertiary">{group.transactions.length} items</p>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-center text-tertiary py-8">No transactions found for this category.</p>
						{/if}
					</Card.Content>
				</Card.Root>
			</Tabs.Content>
		</Tabs.Root>
	</div>
{:else}
	<div class="text-center py-12">
		<h2 class="text-xl font-semibold text-primary mb-2">Category not found</h2>
		<p class="text-tertiary mb-4">The category you're looking for doesn't exist or has been deleted.</p>
		<Button.Root onclick={() => goto('/categories')}>
			Back to Categories
		</Button.Root>
	</div>
	{/if}
</PageLayout>
