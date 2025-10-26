<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { GripVertical, Plus } from '@lucide/svelte';
	import { budgetService, transactionService } from '$lib/core/services';
	import type { Category } from '$lib/core/db';
	import { Button } from '$lib/components/ui/button/index.ts';
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import * as Alert from '$lib/components/ui/alert/index.ts';
	import FilterBar from '$lib/components/shared/FilterBar.svelte';
	import * as Switch from '$lib/components/ui/switch/index.ts';
	import * as Select from '$lib/components/ui/select/index.ts';
	import Header from '$lib/components/Header.svelte';
	import { PageLayout } from '$lib/components/layouts';
	import { toast } from 'svelte-sonner';

	let categories = $state<Category[]>([]);
	let transactions = $state<any[]>([]);
	let isLoading = $state(true);
	let error = $state('');
	let activeState = $state<'active' | 'inactive' | 'all'>('active');
	let categoryType = $state<'all' | 'expense' | 'income'>('all');

	// Drag and drop state
	let draggedCategory = $state<Category | null>(null);
	let dragOverIndex = $state<number | null>(null);

	// Calculate budget data for each category
	let categoriesWithBudget = $derived(
		categories.map(category => {
			const categoryTransactions = transactions.filter(tx => 
				tx.categoryId === category.id && 
				tx.type === 'expense' && 
				tx.status === 'cleared'
			);
			
			const spent = categoryTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
			const allocated = category.budgetAmount || 0;
			const remaining = allocated - spent;
			const percentageUsed = allocated > 0 ? (spent / allocated) * 100 : 0;
			
			return {
				...category,
				spent,
				allocated,
				remaining,
				percentageUsed
			};
		})
	);

	const waterfallTierInfo: Record<Category['waterfallTier'], { label: string; description: string }> = {
		survival: { label: 'Survival', description: 'Essential needs for basic living' },
		security: { label: 'Security', description: 'Financial safety and stability' },
		growth: { label: 'Growth', description: 'Personal and financial development' },
		lifestyle: { label: 'Lifestyle', description: 'Discretionary spending and enjoyment' }
	};

	// Filter categories based on active state and type
	let filteredCategories = $derived.by(() => {
		let filtered = categoriesWithBudget;

		// Filter by active state
		if (activeState === 'active') {
			filtered = filtered.filter((cat) => cat.isActive);
		} else if (activeState === 'inactive') {
			filtered = filtered.filter((cat) => !cat.isActive);
		}

		// Filter by type
		if (categoryType !== 'all') {
			filtered = filtered.filter((cat) => cat.type === categoryType);
		}

		return filtered;
	});

	// Group categories by waterfall tier
	let groupedCategories = $derived.by(() => {
		const groups: Map<Category['waterfallTier'], typeof filteredCategories> = new Map();
		
		filteredCategories.forEach(category => {
			const tier = category.waterfallTier;
			if (!groups.has(tier)) {
				groups.set(tier, []);
			}
			groups.get(tier)!.push(category);
		});

		// Sort categories within each tier by priority
		groups.forEach((categories, tier) => {
			categories.sort((a, b) => a.priority - b.priority);
		});

		// Return as array with tier order: survival, security, growth, lifestyle
		const tierOrder: Category['waterfallTier'][] = ['survival', 'security', 'growth', 'lifestyle'];
		return tierOrder
			.filter(tier => groups.has(tier))
			.map(tier => ({
				tier,
				categories: groups.get(tier)!
			}));
	});

	// Calculate counts for badges
	let activeCount = $derived.by(() => {
		let filtered = categoriesWithBudget;
		// Filter by type if specified
		if (categoryType !== 'all') {
			filtered = filtered.filter((cat) => cat.type === categoryType);
		}
		return filtered.filter((cat) => cat.isActive).length;
	});

	let inactiveCount = $derived.by(() => {
		let filtered = categoriesWithBudget;
		// Filter by type if specified
		if (categoryType !== 'all') {
			filtered = filtered.filter((cat) => cat.type === categoryType);
		}
		return filtered.filter((cat) => !cat.isActive).length;
	});

	// Calculate totals for each waterfall category
	let categoryTotals = $derived.by(() => {
		const totals: Record<
			Category['waterfallTier'],
			{ allocated: number; spent: number; remaining: number }
		> = {
			survival: { allocated: 0, spent: 0, remaining: 0 },
			security: { allocated: 0, spent: 0, remaining: 0 },
			growth: { allocated: 0, spent: 0, remaining: 0 },
			lifestyle: { allocated: 0, spent: 0, remaining: 0 }
		};

		categoriesWithBudget.forEach((category) => {
			const total = totals[category.waterfallTier];
			total.allocated += category.allocated;
			total.spent += category.spent;
			total.remaining += category.remaining;
		});

		return totals;
	});

	onMount(async () => {
		try {
			const [categoriesData, transactionsData] = await Promise.all([
				budgetService.getBudgetCategories(),
				transactionService.getAllTransactions()
			]);
			categories = categoriesData;
			transactions = transactionsData;
		} catch (err) {
			error = 'Failed to load budget categories';
			console.error(err);
		} finally {
			isLoading = false;
		}
	});

	async function toggleCategoryStatus(category: Category) {
		try {
			await budgetService.updateBudgetCategory(category.id, {
				isActive: !category.isActive
			});

			// Update local state
			categories = categories.map((cat) =>
				cat.id === category.id ? { ...cat, isActive: !cat.isActive } : cat
			);
		} catch (err) {
			error = 'Failed to update category status';
			console.error(err);
		}
	}

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
	}

	function getStatusColor(remaining: number, allocated: number): string {
		if (remaining < 0) return 'text-destructive';
		if (remaining < allocated * 0.2) return 'text-yellow-500';
		return 'text-green-500';
	}

	function getStatusText(remaining: number, allocated: number): string {
		if (remaining < 0) return 'Over budget';
		if (remaining < allocated * 0.2) return 'Low budget';
		return 'On track';
	}

	function getTierLabel(tier: Category['waterfallTier']): string {
		return waterfallTierInfo[tier]?.label || tier;
	}

	function getTierDescription(tier: Category['waterfallTier']): string {
		return waterfallTierInfo[tier]?.description || '';
	}

	// Drag and drop handlers
	function handleDragStart(event: DragEvent, category: Category) {
		draggedCategory = category;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		dragOverIndex = index;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	function handleDragEnd() {
		draggedCategory = null;
		dragOverIndex = null;
	}

	async function handleDrop(event: DragEvent, targetCategory: Category, targetGroupIndex: number, targetCategoryIndex: number) {
		event.preventDefault();
		
		if (!draggedCategory || !groupedCategories[targetGroupIndex]) return;

		const targetGroup = groupedCategories[targetGroupIndex];
		const categoriesInGroup = targetGroup.categories;
		
		// Store the dragged category ID for use in the function
		const draggedCategoryId = draggedCategory.id;
		
		// Find the dragged category's current group
		const draggedGroupIndex = groupedCategories.findIndex(group => 
			group.categories.some(cat => cat.id === draggedCategoryId)
		);
		
		if (draggedGroupIndex === -1) return;
		
		const draggedGroup = groupedCategories[draggedGroupIndex];
		const draggedIndex = draggedGroup.categories.findIndex(cat => cat.id === draggedCategoryId);

		// If dropped in same position, do nothing
		if (draggedGroupIndex === targetGroupIndex && draggedIndex === targetCategoryIndex) return;

		// Determine the new tier and priority
		const isMovingBetweenTiers = draggedGroupIndex !== targetGroupIndex;
		
		if (isMovingBetweenTiers) {
			// Moving to a different tier
			const newTier = targetGroup.tier;
			
			// Calculate new priority: if dropped in the middle, adjust priorities
			let newPriority = targetCategory.priority;
			
			// If dropped after the target, increment
			if (targetCategoryIndex < categoriesInGroup.length - 1) {
				newPriority = targetCategory.priority;
			}
			
			// Update the dragged category
			await budgetService.updateBudgetCategory(draggedCategoryId, {
				waterfallTier: newTier,
				priority: newPriority
			});

			// Update priorities in the dragged-from tier
			const categoriesInOldTier = draggedGroup.categories
				.filter(cat => cat.id !== draggedCategoryId)
				.map((cat, idx) => ({ ...cat, priority: idx + 1 }));
			
			for (const cat of categoriesInOldTier) {
				await budgetService.updateBudgetCategory(cat.id, {
					priority: cat.priority
				});
			}

			// Update priorities in the target tier
			const categoriesInNewTier = [...targetGroup.categories, draggedCategory]
				.sort((a, b) => {
					if (a.id === draggedCategoryId) return 1;
					if (b.id === draggedCategoryId) return -1;
					return a.priority - b.priority;
				})
				.map((cat, idx) => ({ ...cat, priority: idx + 1 }));
			
			for (const cat of categoriesInNewTier) {
				await budgetService.updateBudgetCategory(cat.id, {
					priority: cat.priority
				});
			}
		} else {
			// Reordering within the same tier
			const newCategories = [...draggedGroup.categories];
			const [removed] = newCategories.splice(draggedIndex, 1);
			newCategories.splice(targetCategoryIndex, 0, removed);
			
			// Update priorities
			newCategories.forEach((cat, idx) => {
				cat.priority = idx + 1;
			});

			// Save to database
			for (const cat of newCategories) {
				await budgetService.updateBudgetCategory(cat.id, {
					priority: cat.priority
				});
			}
		}

		// Reload categories
		try {
			const categoriesData = await budgetService.getBudgetCategories();
			categories = categoriesData;
			toast.success('Category order updated');
		} catch (err) {
			error = 'Failed to update category order';
			console.error(err);
			toast.error('Failed to update category order');
		}

		draggedCategory = null;
		dragOverIndex = null;
	}
</script>

<svelte:head>
	<title>Spending Categories | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<!-- Header -->
		<Header 
			title="Spending Categories"
			buttonProps={[
				{
					text: "Add Category",
					onclick: () => goto('/categories/add'),
					size: "sm",
					className: "hidden sm:flex",
					target: "_blank",
					rel: "noopener noreferrer",
					icon: Plus
				}
			]}
		/>
	{/snippet}

	<div class="container mx-auto max-w-5xl p-4">
		{#if error}
			<Alert.Root variant="destructive" class="mb-6">
				<Alert.Title>Error</Alert.Title>
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}

		<!-- Filter Bar -->
		<FilterBar
			selectValue={categoryType}
			selectOptions={[
				{ value: 'all', label: 'All Types', description: 'View all category types' },
				{ value: 'expense', label: 'Expense', description: 'Spending categories' },
				{ value: 'income', label: 'Income', description: 'Earning categories' }
			]}
			selectPlaceholder="Filter by type"
			onSelectChange={(value) => categoryType = (value || 'all') as typeof categoryType}
			toggleValue={activeState}
			toggleOptions={[
				{ value: 'active', label: 'Active' },
				{ value: 'inactive', label: 'Inactive' },
				{ value: 'all', label: 'All' }
			]}
			onToggleChange={(value) => activeState = value as 'active' | 'inactive' | 'all'}
			badges={[
				{ label: 'Active', count: activeCount, variant: 'default' },
				{ label: 'Inactive', count: inactiveCount, variant: 'secondary' }
			]}
		/>

		<!-- Categories List -->
		<section class="space-y-6">
			{#if isLoading}
				<div class="space-y-4">
					{#each Array(3) as _}
						<div class="bg-card border-border rounded-2xl border p-6 shadow-sm">
							<div class="animate-pulse">
								<div class="bg-muted mb-2 h-4 w-3/4 rounded"></div>
								<div class="bg-muted mb-4 h-3 w-1/2 rounded"></div>
								<div class="bg-muted h-6 w-full rounded"></div>
							</div>
						</div>
					{/each}
				</div>
			{:else if groupedCategories.length === 0}
				<div class="bg-card border-border rounded-2xl border shadow-sm">
					<div class="text-muted-foreground p-8 text-center">
						<div class="mb-2 text-lg">No categories found</div>
						<div class="mb-4 text-sm">Try adjusting your filters or add a new category</div>
						<Button onclick={() => goto('/categories/add')}>Create your first category</Button>
					</div>
				</div>
			{:else}
				<!-- Group by Tier -->
				{#each groupedCategories as group, groupIndex (group.tier)}
					<div class="space-y-3">
						<!-- Tier Header -->
						<h2 class="text-primary mb-3 flex items-center gap-2 text-lg font-semibold">
							<span>{getTierLabel(group.tier)}</span>
							<Badge variant="outline" class="text-xs">
								{group.categories.length}
							</Badge>
						</h2>
						<p class="text-muted-foreground -mt-2 mb-3 text-sm">
							{getTierDescription(group.tier)}
						</p>

						<!-- Categories in Tier -->
						<div class="space-y-2">
							{#each group.categories as category, categoryIndex (category.id)}
								<div
									role="listitem"
									draggable="true"
									ondragstart={(e) => handleDragStart(e, category)}
									ondragover={(e) => handleDragOver(e, categoryIndex)}
									ondrop={(e) => handleDrop(e, category, groupIndex, categoryIndex)}
									ondragend={handleDragEnd}
									class="bg-card border-border flex items-center gap-3 rounded-lg border p-4 shadow-sm transition-all
										{dragOverIndex === categoryIndex && draggedCategory ? 'border-[var(--color-golden-amber)] bg-[var(--color-bg-tertiary)]' : ''}
										hover:border-[var(--color-border-hover)] cursor-move"
								>
									<!-- Drag Handle -->
									<GripVertical class="w-5 h-5 flex-shrink-0 text-muted-foreground" />

									<!-- Category Info -->
									<div class="min-w-0 flex-1">
										<div class="mb-1 flex items-center gap-2">
											<h3 class="text-primary font-semibold">{category.name}</h3>
											<Badge variant="outline" class="text-xs capitalize">
												{category.type}
											</Badge>
										</div>
										
										{#if category.allocated > 0}
											<div class="flex items-center gap-3 text-sm">
												<span class="text-muted-foreground">
													Allocated: <span class="font-medium text-primary">{formatCurrency(category.allocated)}</span>
												</span>
												<span class="text-muted-foreground">•</span>
												<span class="text-muted-foreground">
													Spent: <span class="font-medium text-[var(--color-warm-coral)]">{formatCurrency(category.spent)}</span>
												</span>
												<span class="text-muted-foreground">•</span>
												<span class="font-semibold {getStatusColor(category.remaining, category.allocated)}">
													{formatCurrency(category.remaining)}
												</span>
											</div>
										{:else}
											<p class="text-muted-foreground text-sm">
												{#if category.description}
													{category.description}
												{:else}
													No budget allocated
												{/if}
											</p>
										{/if}
									</div>

									<!-- Actions -->
									<div class="flex items-center gap-2">
										<div class="flex items-center gap-2">
											<Switch.Root
												checked={category.isActive}
												onCheckedChange={() => toggleCategoryStatus(category)}
											/>
										</div>
										<Button
											variant="outline"
											size="sm"
											onclick={() => goto(`/categories/${category.id}`)}
										>
											View
										</Button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			{/if}
		</section>
	</div>
</PageLayout>
