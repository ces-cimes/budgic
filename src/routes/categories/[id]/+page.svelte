<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { budgetService, transactionService, userService } from '$lib/core/services';
	import type { Category, Transaction } from '$lib/core/db';
	import { page } from '$app/stores';
	import { formatAmount, formatPercentage } from '$lib/utils/currency-utils';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';

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

	const waterfallColors: Record<string, string> = {
		survival: 'text-[var(--color-warm-coral)]',
		security: 'text-[var(--color-amber)]',
		growth: 'text-[var(--color-sage-green)]',
		lifestyle: 'text-[var(--color-info)]'
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
	{#snippet topBar()}
		<Header
			title={category?.name || 'Category'}
			backButtonLabel="Back to categories"
			backButtonLink="/plan?tab=categories"
			buttonProps={category && !isEditing ? [
				{ text: 'Edit', onclick: startEditing, variant: 'ghost', size: 'sm' }
			] : category && isEditing ? [
				{ text: 'Cancel', onclick: cancelEditing, variant: 'ghost', size: 'sm' }
			] : []}
		/>
	{/snippet}

	<div class="mx-auto max-w-2xl px-4 py-6">
		{#if isLoading}
			<div class="space-y-4">
				<div class="h-28 animate-pulse rounded-2xl bg-[var(--color-bg-tertiary)]"></div>
				<div class="h-48 animate-pulse rounded-2xl bg-[var(--color-bg-tertiary)]"></div>
			</div>
		{:else if category}
			<div class="space-y-6">
				<!-- Hero stats -->
				<div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] p-5">
					<div class="flex items-start justify-between mb-4">
						<div>
							<p class="text-[10px] font-semibold uppercase tracking-widest {waterfallColors[category.waterfallTier] || 'text-[var(--color-text-tertiary)]'}">{category.waterfallTier}</p>
							{#if category.description}
								<p class="text-xs text-[var(--color-text-tertiary)] mt-1">{category.description}</p>
							{/if}
						</div>
						<button
							onclick={deleteCategory}
							class="text-xs text-[var(--color-warm-coral)] hover:underline"
						>
							Delete
						</button>
					</div>
					<div class="grid grid-cols-3 gap-4">
						<div>
							<p class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Budget</p>
							<p class="text-amount-sm text-[var(--color-text-primary)] mt-1">{formatAmount(category.budgetAmount || 0, userCurrency)}</p>
						</div>
						<div>
							<p class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Spent</p>
							<p class="text-amount-sm text-foreground mt-1">{formatAmount(spent, userCurrency)}</p>
						</div>
						<div>
							<p class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Remaining</p>
							<p class="text-amount-sm {remaining >= 0 ? 'text-[var(--color-sage-green)]' : 'text-[var(--color-warm-coral)]'} mt-1">{formatAmount(remaining, userCurrency)}</p>
						</div>
					</div>
				</div>

				<!-- Budget progress -->
				<div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] p-5">
					<h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4">Budget utilization</h2>
					<div class="flex items-center justify-between mb-2">
						<span class="text-sm text-[var(--color-text-secondary)]">Used</span>
						<span class="text-sm font-medium text-[var(--color-text-primary)]">{formatPercentage(spendingPercentage)}</span>
					</div>
					<div class="budget-progress">
						<div
							class="budget-progress-fill {spendingPercentage > 100 ? '!bg-[var(--color-warm-coral)]' : ''}"
							style="width: {Math.min(spendingPercentage, 100)}%"
						></div>
					</div>
				</div>

				<!-- Transactions -->
				<div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] overflow-hidden">
					<div class="px-5 py-3 border-b border-border">
						<h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Recent transactions</h2>
					</div>
					{#if transactions.length > 0}
						<div class="divide-y divide-border">
							{#each transactions.slice(0, 10) as transaction}
								<div class="flex items-center justify-between px-5 py-3">
									<div class="min-w-0 flex-1">
										<p class="text-sm font-medium text-[var(--color-text-primary)] truncate">{transaction.description || 'No description'}</p>
										<p class="text-xs text-[var(--color-text-tertiary)]">
											{new Date(transaction.clearedDate || transaction.plannedDate || transaction.createdAt).toLocaleDateString()}
										</p>
									</div>
									<p class="text-amount-sm ml-4 {transaction.type === 'income' ? 'text-[var(--color-sage-green)]' : 'text-foreground'}">
										{transaction.type === 'income' ? '+' : ''}{formatAmount(Math.abs(transaction.amount || 0), transaction.currency)}
									</p>
								</div>
							{/each}
						</div>
					{:else}
						<div class="px-5 py-10 text-center">
							<p class="text-sm text-[var(--color-text-tertiary)]">No transactions yet.</p>
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] p-12 text-center">
				<p class="text-sm text-[var(--color-text-primary)] mb-1">Category not found</p>
				<p class="text-xs text-[var(--color-text-tertiary)] mb-4">This category doesn't exist or was deleted.</p>
				<button
					onclick={() => goto('/plan?tab=categories')}
					class="rounded-xl border border-border px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] transition-colors"
				>
					Back to categories
				</button>
			</div>
		{/if}
	</div>
</PageLayout>
