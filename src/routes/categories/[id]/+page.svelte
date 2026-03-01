<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as Button from '$lib/components/ui/button/index.ts';
	import * as Tabs from '$lib/components/ui/tabs/index.ts';
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { budgetService, transactionService, userService } from '$lib/core/services';
	import type { Category, Transaction } from '$lib/core/db';
	import { page } from '$app/stores';
	import { formatAmount } from '$lib/utils/currency-utils';
	import { PageLayout } from '$lib/components/layouts';

	const { data } = $props<{ data: any }>();

	let category = $state<Category | null>(null);
	let transactions = $state<Transaction[]>([]);
	let isLoading = $state(true);
	let isEditing = $state(false);
	let activeTab = $state('overview');
	let userCurrency = $state<string>('USD');
	let spent = $state(0);
	let remaining = $state(0);


	const categoryId = $derived($page.params.id);

	const waterfallColors = {
		survival: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
		security: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
		growth: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
		lifestyle: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
	};

	onMount(async () => {
		// Get user's preferred currency
		const preferences = await userService.getUserPreferences();
		userCurrency = preferences?.currency || 'USD';
		
		await loadCategory();
		await loadTransactions();
	});

	async function loadCategory() {
		try {
			if (categoryId) {
				// Get all categories and find the one with matching ID
				const categories = await budgetService.getBudgetCategories();
				category = categories.find(cat => cat.id === categoryId) || null;
				if (!category) {
					// Category not found, redirect to Plan > Categories
					goto('/plan?tab=categories');
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
				transactions = await transactionService.getTransactionsByCategory(categoryId);
				// Calculate spent amount for this category
				spent = transactions
					.filter(tx => tx.type === 'expense' && tx.status === 'cleared')
					.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
				remaining = (category?.budgetAmount || 0) - spent;
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

	async function saveCategory(updatedCategory: Category) {
		try {
			if (categoryId) {
				await budgetService.updateBudgetCategory(categoryId, updatedCategory);
				category = updatedCategory;
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
				// Soft delete by setting isActive to false
				await budgetService.updateBudgetCategory(category.id, { isActive: false });
				goto('/plan?tab=categories');
			} catch (error) {
				console.error('Error deleting category:', error);
			}
		}
	}

	// Calculate spending percentage
	let spendingPercentage = $derived(
		category && category.budgetAmount && category.budgetAmount > 0 
			? (spent / category.budgetAmount) * 100 
			: 0
	);
</script>

<svelte:head>
	<title>{category?.name || 'Category'} - Budgic</title>
</svelte:head>

<PageLayout>
	

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
onclick={() => goto('/plan?tab=categories')}
					>
					← Back
				</Button.Root>
				<div>
					<h1 class="text-2xl font-bold text-primary">{category.name}</h1>
					<Badge class={waterfallColors[category.waterfallTier]}>
						{category.waterfallTier}
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
						<div class="text-sm font-medium text-secondary">Budget Amount</div>
						<p class="text-lg font-semibold">{formatAmount(category.budgetAmount || 0, userCurrency)}</p>
					</div>
					<div>
						<div class="text-sm font-medium text-secondary">Spent</div>
						<p class="text-lg font-semibold text-destructive">{formatAmount(spent, userCurrency)}</p>
					</div>
					<div>
						<div class="text-sm font-medium text-secondary">Remaining</div>
						<p class="text-lg font-semibold {remaining >= 0 ? 'text-success' : 'text-destructive'}">{formatAmount(remaining, userCurrency)}</p>
					</div>
					<div>
						<div class="text-sm font-medium text-secondary">Priority</div>
						<p class="text-lg font-semibold">#{category.priority}</p>
					</div>
				</div>

				{#if category.description}
					<div>
						<div class="text-sm font-medium text-secondary">Description</div>
						<p class="text-sm text-tertiary">{category.description}</p>
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
								{#each transactions.slice(0, 10) as transaction}
									<div class="flex items-center justify-between p-3 border rounded-lg">
										<div class="flex-1">
											<div class="flex items-center gap-2">
												<p class="font-medium">{transaction.description || 'No description'}</p>
												{#if transaction.groupId}
													<Badge variant="secondary" class="text-xs">Grouped</Badge>
												{/if}
											</div>
											<p class="text-sm text-tertiary">
												{new Date(transaction.clearedDate || transaction.plannedDate || transaction.createdAt).toLocaleDateString()}
											</p>
											{#if transaction.groupName}
												<p class="text-xs text-tertiary">Group: {transaction.groupName}</p>
											{/if}
										</div>
										<div class="text-right">
											<p class="font-semibold {transaction.type === 'expense' ? 'text-destructive' : 'text-success'}">
												{transaction.type === 'expense' ? '-' : '+'}{formatAmount(Math.abs(transaction.amount || 0), transaction.currency)}
											</p>
											<p class="text-xs text-tertiary capitalize">{transaction.type}</p>
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
		<Button.Root onclick={() => goto('/plan?tab=categories')}>
			Back to Categories
		</Button.Root>
	</div>
	{/if}
</PageLayout>
