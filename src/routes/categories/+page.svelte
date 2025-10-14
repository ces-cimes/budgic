<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Plus } from '@lucide/svelte';
	import { budgetService } from '$lib/core/services/budget-service';
	import type { BudgetCategory, WaterfallCategory } from '$lib/core/services/budget-service';
	import { Button } from '$lib/components/ui/button/index.ts';
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import * as Alert from '$lib/components/ui/alert/index.ts';
	import * as Select from '$lib/components/ui/select/index.ts';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.ts';
	import * as Switch from '$lib/components/ui/switch/index.ts';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import Header from '$lib/components/Header.svelte';
	import { PageLayout, MobileNavigation } from '$lib/components/layouts';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';

	let categories = $state<BudgetCategory[]>([]);
	let isLoading = $state(true);
	let error = $state('');
	let selectedWaterfallCategory = $state<WaterfallCategory | 'all'>('all');
	let activeState = $state<'active' | 'inactive' | 'all'>('active');
	let showDeleteDialog = $state(false);
	let categoryToDelete = $state<BudgetCategory | null>(null);

	// Sidebar context for mobile detection
	const sidebar = Sidebar.useSidebar();

	const waterfallCategories: { value: WaterfallCategory | 'all'; label: string; description: string }[] = [
		{ value: 'all', label: 'All Categories', description: 'View all budget categories' },
		{ value: 'survival', label: 'Survival', description: 'Essential needs for basic living' },
		{ value: 'security', label: 'Security', description: 'Financial safety and stability' },
		{ value: 'growth', label: 'Growth', description: 'Personal and financial development' },
		{ value: 'lifestyle', label: 'Lifestyle', description: 'Discretionary spending and enjoyment' }
	];

	// Filter categories based on selected waterfall category and active state
	let filteredCategories = $derived.by(() => {
		let filtered = categories;
		
		// Filter by waterfall category
		if (selectedWaterfallCategory !== 'all') {
			filtered = filtered.filter(cat => cat.waterfallCategory === selectedWaterfallCategory);
		}
		
		// Filter by active state
		if (activeState === 'active') {
			filtered = filtered.filter(cat => cat.isActive);
		} else if (activeState === 'inactive') {
			filtered = filtered.filter(cat => !cat.isActive);
		}
		
		return filtered;
	});

	// Calculate counts for badges based on waterfall category filter only (not active/inactive filter)
	let activeCount = $derived.by(() => {
		let filtered = categories;
		if (selectedWaterfallCategory !== 'all') {
			filtered = filtered.filter(cat => cat.waterfallCategory === selectedWaterfallCategory);
		}
		return filtered.filter(cat => cat.isActive).length;
	});
	
	let inactiveCount = $derived.by(() => {
		let filtered = categories;
		if (selectedWaterfallCategory !== 'all') {
			filtered = filtered.filter(cat => cat.waterfallCategory === selectedWaterfallCategory);
		}
		return filtered.filter(cat => !cat.isActive).length;
	});

	// Calculate totals for each waterfall category
	let categoryTotals = $derived.by(() => {
		const totals: Record<WaterfallCategory, { allocated: number; spent: number; remaining: number }> = {
			survival: { allocated: 0, spent: 0, remaining: 0 },
			security: { allocated: 0, spent: 0, remaining: 0 },
			growth: { allocated: 0, spent: 0, remaining: 0 },
			lifestyle: { allocated: 0, spent: 0, remaining: 0 }
		};

		categories.forEach(category => {
			const total = totals[category.waterfallCategory];
			total.allocated += category.allocatedAmount;
			total.spent += category.spent;
			total.remaining += category.remaining;
		});

		return totals;
	});

	onMount(async () => {
		try {
			categories = await budgetService.getBudgetCategories();
		} catch (err) {
			error = 'Failed to load budget categories';
			console.error(err);
		} finally {
			isLoading = false;
		}
	});

	async function toggleCategoryStatus(category: BudgetCategory) {
		try {
			await budgetService.updateBudgetCategory(category.id, {
				isActive: !category.isActive
			});
			
			// Update local state - $state() will handle reactivity automatically
			categories = categories.map(cat => 
				cat.id === category.id 
					? { ...cat, isActive: !cat.isActive }
					: cat
			);
		} catch (err) {
			error = 'Failed to update category status';
			console.error(err);
		}
	}

	async function deleteCategory(category: BudgetCategory) {
		try {
			// For now, we'll just deactivate the category
			// In a real implementation, you might want to handle this differently
			await budgetService.updateBudgetCategory(category.id, {
				isActive: false
			});
			
			// Update local state - $state() will handle reactivity automatically
			categories = categories.map(cat => 
				cat.id === category.id 
					? { ...cat, isActive: false }
					: cat
			);
			
			showDeleteDialog = false;
			categoryToDelete = null;
		} catch (err) {
			error = 'Failed to delete category';
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
</script>

<svelte:head>
	<title>Budget Categories | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<!-- Header -->
		<Header title="Budget Categories">
			<Button
				onclick={() => goto('/categories/add')}
				size="sm"
				class="hidden sm:flex"
				target="_blank"
				rel="noopener noreferrer">
				<Plus />
				<span>Add Category</span>
			</Button>
		</Header>
	{/snippet}

	{#snippet bottomBar()}
		<!-- Mobile Navigation -->
		{#if sidebar.isMobile}
			<MobileNavigation />
		{/if}
	{/snippet}

	<div class="container mx-auto p-2 sm:p-4 max-w-4xl">

	{#if error}
		<Alert.Root variant="destructive" class="mb-6">
			<Alert.Title>Error</Alert.Title>
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
	{/if}

	<!-- Filter Bar -->
	<div class="mb-4 bg-background sticky">
		<!-- Desktop Layout -->
		<div class="hidden md:flex items-center gap-2">
			<div class="flex items-center gap-2 flex-1">
				<!-- Waterfall Category Filter -->
				<div class="flex-1">
					<Select.Root type="single" bind:value={selectedWaterfallCategory}>
						<Select.Trigger class="w-full">
							{waterfallCategories.find(c => c.value === selectedWaterfallCategory)?.label || 'Filter by category'}
						</Select.Trigger>
						<Select.Content>
							{#each waterfallCategories as category}
								<Select.Item value={category.value}>
									{category.label}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				
				<!-- Active/Inactive Toggle -->
				<div class="flex items-center gap-2">
					<ToggleGroup.Root type="single" variant="outline" bind:value={activeState}>
						<ToggleGroup.Item value="active" size="sm">Active</ToggleGroup.Item>
						<ToggleGroup.Item value="inactive" size="sm">Inactive</ToggleGroup.Item>
						<ToggleGroup.Item value="all" size="sm">All</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
			</div>

			<!-- Category Count Badges -->
			<div class="flex gap-2">
				<Badge variant="default">Active: {activeCount}</Badge>
				<Badge variant="secondary">Inactive: {inactiveCount}</Badge>
			</div>
		</div>

		<!-- Mobile Layout -->
		<div class="md:hidden space-y-2">
			<!-- Filter Row -->
			<div class="flex items-center gap-2">
				<!-- Waterfall Category Filter -->
				<div class="flex-1">
					<Select.Root type="single" bind:value={selectedWaterfallCategory}>
						<Select.Trigger class="w-full">
							{waterfallCategories.find(c => c.value === selectedWaterfallCategory)?.label || 'Filter by category'}
						</Select.Trigger>
						<Select.Content>
							{#each waterfallCategories as category}
								<Select.Item value={category.value}>
									{category.label}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				
				<!-- Active/Inactive Toggle -->
				<div class="flex items-center gap-2">
					<ToggleGroup.Root type="single" variant="outline" bind:value={activeState}>
						<ToggleGroup.Item value="active" size="sm">Active</ToggleGroup.Item>
						<ToggleGroup.Item value="inactive" size="sm">Inactive</ToggleGroup.Item>
						<ToggleGroup.Item value="all" size="sm">All</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
			</div>

			<!-- Category Count Badges -->
			<div class="flex gap-2">
				<Badge variant="default">Active: {activeCount}</Badge>
				<Badge variant="secondary">Inactive: {inactiveCount}</Badge>
			</div>
		</div>
	</div>

	<!-- Summary Stats -->
	{#if selectedWaterfallCategory !== 'all'}
		{@const total = categoryTotals[selectedWaterfallCategory]}
		<section class="mb-4">
			<div class="bg-card rounded-xl p-4 shadow-sm border border-border">
				<div class="grid grid-cols-3 gap-4 text-center">
					<div>
						<div class="text-lg font-bold text-[var(--color-sage-green)]">{formatCurrency(total.allocated)}</div>
						<div class="text-xs text-tertiary">Allocated</div>
					</div>
					<div>
						<div class="text-lg font-bold text-[var(--color-warm-coral)]">{formatCurrency(total.spent)}</div>
						<div class="text-xs text-tertiary">Spent</div>
					</div>
					<div>
						<div class="text-lg font-bold {total.remaining >= 0 ? 'text-[var(--color-sage-green)]' : 'text-[var(--color-warm-coral)]'}">
							{formatCurrency(total.remaining)}
						</div>
						<div class="text-xs text-tertiary">Remaining</div>
					</div>
				</div>
			</div>
		</section>
	{/if}

	<!-- Category Description -->
	{#if selectedWaterfallCategory !== 'all'}
		{@const category = waterfallCategories.find(c => c.value === selectedWaterfallCategory)}
		<div class="mb-6">
			<h2 class="text-xl font-semibold text-primary mb-2">{category?.label} Categories</h2>
			<p class="text-muted-foreground">{category?.description}</p>
		</div>
	{/if}


	<!-- Categories List -->
	<section class="space-y-6">
		{#if isLoading}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each Array(6) as _}
					<div class="bg-card rounded-2xl shadow-sm border border-border p-6">
						<div class="animate-pulse">
							<div class="h-4 bg-muted rounded w-3/4 mb-2"></div>
							<div class="h-3 bg-muted rounded w-1/2 mb-4"></div>
							<div class="h-6 bg-muted rounded w-full"></div>
						</div>
					</div>
				{/each}
			</div>
		{:else if filteredCategories.length === 0}
			<div class="bg-card rounded-2xl shadow-sm border border-border">
				<div class="p-8 text-center text-muted-foreground">
					<div class="text-lg mb-2">No categories found</div>
					<div class="text-sm mb-4">Try adjusting your filters or add a new category</div>
					<Button onclick={() => goto('/categories/add')}>
						Create your first category
					</Button>
				</div>
			</div>
		{:else}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each filteredCategories as category (category.id)}
					<div class="bg-card rounded-2xl shadow-sm border border-border hover:shadow-md transition-shadow overflow-hidden">
						<!-- Card Header -->
						<div class="p-4 pb-3 border-b border-border">
							<div class="flex items-center justify-between mb-2">
								<div class="flex items-center space-x-3">
									<div class="w-10 h-10 rounded-full flex items-center justify-center text-lg font-semibold" style="background-color: {category.color || '#6B7280'}20; color: {category.color || '#6B7280'}">
										{category.name.charAt(0).toUpperCase()}
									</div>
									<div>
										<h3 class="font-semibold text-primary">{category.name}</h3>
									</div>
								</div>
								<Badge variant={category.isActive ? 'default' : 'secondary'} class="text-xs">
									{category.isActive ? 'Active' : 'Inactive'}
								</Badge>
							</div>
							<Badge variant="outline" class="text-xs">
								{category.waterfallCategory}
							</Badge>
						</div>
						
						<!-- Card Content -->
						<div class="p-4 space-y-4">
							<!-- Budget Progress -->
							<div class="space-y-2">
								<div class="flex justify-between text-sm">
									<span class="text-muted-foreground">Allocated</span>
									<span class="font-medium">{formatCurrency(category.allocatedAmount)}</span>
								</div>
								<div class="flex justify-between text-sm">
									<span class="text-muted-foreground">Spent</span>
									<span class="font-medium">{formatCurrency(category.spent)}</span>
								</div>
								<div class="flex justify-between text-sm">
									<span class="text-muted-foreground">Remaining</span>
									<span class="font-semibold {getStatusColor(category.remaining, category.allocatedAmount)}">
										{formatCurrency(category.remaining)}
									</span>
								</div>
							</div>

							<!-- Progress Bar -->
							<div class="space-y-1">
								<div class="w-full bg-muted rounded-full h-2">
									<div 
										class="h-2 rounded-full transition-all duration-300 {category.remaining < 0 ? 'bg-destructive' : category.remaining < category.allocatedAmount * 0.2 ? 'bg-yellow-500' : 'bg-green-500'}"
										style="width: {Math.min((category.spent / category.allocatedAmount) * 100, 100)}%"
									></div>
								</div>
								<div class="text-xs text-muted-foreground text-center">
									{Math.round((category.spent / category.allocatedAmount) * 100)}% used
								</div>
							</div>

							<!-- Goal Progress (if applicable) -->
							{#if category.isGoalBased && category.goalTarget}
								<div class="space-y-1">
									<div class="flex justify-between text-xs text-muted-foreground">
										<span>Goal Progress</span>
										<span>{Math.round((category.goalProgress || 0) / category.goalTarget * 100)}%</span>
									</div>
									<div class="w-full bg-muted rounded-full h-1">
										<div 
											class="h-1 rounded-full bg-blue-500"
											style="width: {Math.min((category.goalProgress || 0) / category.goalTarget * 100, 100)}%"
										></div>
									</div>
								</div>
							{/if}

							<!-- Status Badge -->
							<div class="text-center">
								<Badge 
									variant={category.remaining < 0 ? 'destructive' : category.remaining < category.allocatedAmount * 0.2 ? 'secondary' : 'default'}
									class="text-xs"
								>
									{getStatusText(category.remaining, category.allocatedAmount)}
								</Badge>
							</div>
						</div>

						<!-- Card Actions -->
						<div class="p-4 pt-0 flex justify-between items-center">
							<div class="flex items-center space-x-2">
								<Switch.Root 
									checked={category.isActive}
									onCheckedChange={() => toggleCategoryStatus(category)}
								/>
								<span class="text-sm text-muted-foreground">
									{category.isActive ? 'Active' : 'Inactive'}
								</span>
							</div>
							<div class="flex space-x-2">
								<Button 
									variant="outline" 
									size="sm"
									onclick={() => goto(`/categories/${category.id}`)}
								>
									View
								</Button>
								<Button 
									variant="ghost" 
									size="sm"
									onclick={() => {
										categoryToDelete = category;
										showDeleteDialog = true;
									}}
									class="text-destructive hover:text-destructive hover:bg-destructive/10"
								>
									Delete
								</Button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={showDeleteDialog}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete Category</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete "{categoryToDelete?.name}"? This action cannot be undone.
				The category will be deactivated and won't appear in transaction forms.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button 
				variant="outline" 
				onclick={() => {
					showDeleteDialog = false;
					categoryToDelete = null;
				}}
			>
				Cancel
			</Button>
			<Button 
				variant="destructive"
				onclick={() => categoryToDelete && deleteCategory(categoryToDelete)}
			>
				Delete
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
</PageLayout>
