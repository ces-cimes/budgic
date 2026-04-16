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
	import { toast } from 'svelte-sonner';
	import { formatAmount, getUserMainCurrency } from '$lib/utils/currency-utils';
	import { effectiveAmountForCategory } from '$lib/utils/category-utils';

	let categories = $state<Category[]>([]);
	let transactions = $state<any[]>([]);
	let isLoading = $state(true);
	let error = $state('');
	let mainCurrency = $state('USD');
	let activeState = $state<'active' | 'inactive' | 'all'>('active');
	let categoryType = $state<'all' | 'expense' | 'income'>('all');

	let draggedCategory = $state<Category | null>(null);
	let dragOverIndex = $state<number | null>(null);

	let categoriesWithBudget = $derived(
		categories.map((category) => {
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
			const remaining = allocated - spent;
			return {
				...category,
				spent,
				allocated,
				remaining,
				percentageUsed: allocated > 0 ? (spent / allocated) * 100 : 0
			};
		})
	);

	type TierGroupKey = NonNullable<Category['waterfallTier']> | 'no_tier';

	const waterfallTierInfo: Record<TierGroupKey, { label: string; description: string }> = {
		survival: { label: 'Survival', description: 'Essential needs for basic living' },
		security: { label: 'Security', description: 'Financial safety and stability' },
		growth: { label: 'Growth', description: 'Personal and financial development' },
		lifestyle: { label: 'Lifestyle', description: 'Discretionary spending and enjoyment' },
		unclassified: {
			label: 'Unclassified',
			description: 'Needs manual tier classification before analytics include it'
		},
		no_tier: {
			label: 'Organizational',
			description: 'No waterfall tier — not offered in the transaction category picker'
		}
	};

	let categoryById = $derived(new Map(categories.map((c) => [c.id, c])));

	function categoryTreeDepth(category: Category): number {
		let depth = 0;
		let pid = category.parentId;
		while (pid && depth < 12) {
			depth += 1;
			pid = categoryById.get(pid)?.parentId;
		}
		return depth;
	}

	let filteredCategories = $derived.by(() => {
		let filtered = categoriesWithBudget;
		if (activeState === 'active') {
			filtered = filtered.filter((cat) => cat.isActive);
		} else if (activeState === 'inactive') {
			filtered = filtered.filter((cat) => !cat.isActive);
		}
		if (categoryType !== 'all') {
			filtered = filtered.filter((cat) => cat.type === categoryType);
		}
		return filtered;
	});

	let groupedCategories = $derived.by(() => {
		const groups: Map<TierGroupKey, typeof filteredCategories> = new Map();
		filteredCategories.forEach((category) => {
			const tier: TierGroupKey =
				category.waterfallTier === undefined ? 'no_tier' : category.waterfallTier;
			if (!groups.has(tier)) groups.set(tier, []);
			groups.get(tier)!.push(category);
		});
		groups.forEach((cats) => cats.sort((a, b) => a.priority - b.priority));
		const tierOrder: TierGroupKey[] = [
			'survival',
			'security',
			'growth',
			'lifestyle',
			'no_tier',
			'unclassified'
		];
		return tierOrder
			.filter((tier) => groups.has(tier))
			.map((tier) => ({ tier, categories: groups.get(tier)! }));
	});

	let activeCount = $derived.by(() => {
		let filtered = categoriesWithBudget;
		if (categoryType !== 'all') filtered = filtered.filter((cat) => cat.type === categoryType);
		return filtered.filter((cat) => cat.isActive).length;
	});

	let inactiveCount = $derived.by(() => {
		let filtered = categoriesWithBudget;
		if (categoryType !== 'all') filtered = filtered.filter((cat) => cat.type === categoryType);
		return filtered.filter((cat) => !cat.isActive).length;
	});

	onMount(async () => {
		try {
			const [categoriesData, transactionsData, currency] = await Promise.all([
				budgetService.getBudgetCategories(),
				transactionService.getAllTransactions(),
				getUserMainCurrency()
			]);
			categories = categoriesData;
			transactions = transactionsData;
			mainCurrency = currency;
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
			categories = categories.map((cat) =>
				cat.id === category.id ? { ...cat, isActive: !cat.isActive } : cat
			);
		} catch (err) {
			error = 'Failed to update category status';
			console.error(err);
		}
	}

	function getStatusColor(remaining: number, allocated: number): string {
		if (remaining < 0) return 'text-destructive';
		if (remaining < allocated * 0.2) return 'text-yellow-500';
		return 'text-green-500';
	}

	function getTierLabel(tier: TierGroupKey): string {
		const safeTier = tier ?? 'unclassified';
		return waterfallTierInfo[safeTier]?.label ?? safeTier;
	}

	function getTierDescription(tier: TierGroupKey): string {
		const safeTier = tier ?? 'unclassified';
		return waterfallTierInfo[safeTier]?.description ?? '';
	}

	/** True if `nodeId` is a strict descendant of `ancestorId` (walks parent chain from node). */
	function isDescendantOf(nodeId: string, ancestorId: string): boolean {
		let id: string | undefined = categoryById.get(nodeId)?.parentId;
		for (let g = 0; g < 24 && id; g++) {
			if (id === ancestorId) return true;
			id = categoryById.get(id)?.parentId;
		}
		return false;
	}

	function eligibleParentOptions(cat: Category): Category[] {
		return categories.filter(
			(c) => c.id !== cat.id && c.type === cat.type && !isDescendantOf(c.id, cat.id)
		);
	}

	async function updateCategoryParent(cat: Category, newParentId: string) {
		try {
			const next = newParentId.trim() === '' ? undefined : newParentId;
			await budgetService.updateBudgetCategory(cat.id, { parentId: next });
			const categoriesData = await budgetService.getBudgetCategories();
			categories = categoriesData;
			toast.success('Category parent updated');
		} catch (err) {
			error = 'Failed to update category parent';
			console.error(err);
			toast.error('Could not update parent');
		}
	}

	function handleDragStart(event: DragEvent, category: Category) {
		draggedCategory = category;
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function handleDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		dragOverIndex = index;
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
	}

	function handleDragEnd() {
		draggedCategory = null;
		dragOverIndex = null;
	}

	async function handleDrop(
		event: DragEvent,
		targetCategory: Category,
		targetGroupIndex: number,
		targetCategoryIndex: number
	) {
		event.preventDefault();
		if (!draggedCategory || !groupedCategories[targetGroupIndex]) return;

		const draggedCategoryId = draggedCategory.id;
		const targetGroup = groupedCategories[targetGroupIndex];
		const categoriesInGroup = targetGroup.categories;

		const draggedGroupIndex = groupedCategories.findIndex((group) =>
			group.categories.some((cat) => cat.id === draggedCategoryId)
		);
		if (draggedGroupIndex === -1) return;

		const draggedGroup = groupedCategories[draggedGroupIndex];
		const draggedIndex = draggedGroup.categories.findIndex((cat) => cat.id === draggedCategoryId);
		if (draggedGroupIndex === targetGroupIndex && draggedIndex === targetCategoryIndex) return;

		const isMovingBetweenTiers = draggedGroupIndex !== targetGroupIndex;

		if (isMovingBetweenTiers) {
			const newTier = targetGroup.tier;
			let newPriority = targetCategory.priority;
			if (targetCategoryIndex < categoriesInGroup.length - 1) {
				newPriority = targetCategory.priority;
			}

			const tierUpdate: Partial<Category> =
				newTier === 'no_tier' ? { waterfallTier: undefined } : { waterfallTier: newTier };

			await budgetService.updateBudgetCategory(draggedCategoryId, {
				...tierUpdate,
				priority: newPriority
			});

			const categoriesInOldTier = draggedGroup.categories
				.filter((cat) => cat.id !== draggedCategoryId)
				.map((cat, idx) => ({ ...cat, priority: idx + 1 }));
			for (const cat of categoriesInOldTier) {
				await budgetService.updateBudgetCategory(cat.id, {
					priority: cat.priority
				});
			}

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
			const newCategories = [...draggedGroup.categories];
			const [removed] = newCategories.splice(draggedIndex, 1);
			newCategories.splice(targetCategoryIndex, 0, removed);
			newCategories.forEach((cat, idx) => {
				cat.priority = idx + 1;
			});
			for (const cat of newCategories) {
				await budgetService.updateBudgetCategory(cat.id, {
					priority: cat.priority
				});
			}
		}

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

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-primary text-lg font-semibold">Spending categories</h2>
		<Button size="sm" onclick={() => goto('/plan?tab=budget')}>
			<Plus class="mr-2 h-4 w-4" />
			Add category
		</Button>
	</div>

	{#if error}
		<Alert.Root variant="destructive" class="mb-4">
			<Alert.Title>Error</Alert.Title>
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
	{/if}

	<FilterBar
		selectValue={categoryType}
		selectOptions={[
			{ value: 'all', label: 'All Types', description: 'View all category types' },
			{ value: 'expense', label: 'Expense', description: 'Spending categories' },
			{ value: 'income', label: 'Income', description: 'Earning categories' }
		]}
		selectPlaceholder="Filter by type"
		onSelectChange={(value) => (categoryType = (value || 'all') as typeof categoryType)}
		toggleValue={activeState}
		toggleOptions={[
			{ value: 'active', label: 'Active' },
			{ value: 'inactive', label: 'Inactive' },
			{ value: 'all', label: 'All' }
		]}
		onToggleChange={(value) => (activeState = value as 'active' | 'inactive' | 'all')}
		badges={[
			{ label: 'Active', count: activeCount, variant: 'default' },
			{ label: 'Inactive', count: inactiveCount, variant: 'secondary' }
		]}
	/>

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
					<Button onclick={() => goto('/plan?tab=budget')}>Create your first category</Button>
				</div>
			</div>
		{:else}
			{#each groupedCategories as group, groupIndex (group.tier)}
				<div class="space-y-3">
					<h3 class="text-primary mb-3 flex items-center gap-2 text-lg font-semibold">
						<span>{getTierLabel(group.tier)}</span>
						<Badge variant="outline" class="text-xs">
							{group.categories.length}
						</Badge>
					</h3>
					<p class="text-muted-foreground -mt-2 mb-3 text-sm">
						{getTierDescription(group.tier)}
					</p>

					<div class="space-y-2">
						{#each group.categories as category, categoryIndex (category.id)}
							<div
								role="listitem"
								draggable="true"
								ondragstart={(e) => handleDragStart(e, category)}
								ondragover={(e) => handleDragOver(e, categoryIndex)}
								ondrop={(e) => handleDrop(e, category, groupIndex, categoryIndex)}
								ondragend={handleDragEnd}
								class="bg-card border-border flex cursor-move items-center gap-3 rounded-lg border p-4 shadow-sm transition-all
									{dragOverIndex === categoryIndex && draggedCategory
									? 'border-[var(--color-golden-amber)] bg-[var(--color-bg-tertiary)]'
									: ''}
									hover:border-[var(--color-border-hover)]"
							>
								<GripVertical class="text-muted-foreground w-5 flex-shrink-0" />

								<div class="min-w-0 flex-1">
									<div class="mb-1 flex items-center gap-2">
										<h4
											class="text-primary font-semibold"
											style:padding-left="{categoryTreeDepth(category) * 12}px"
										>
											{category.name}
										</h4>
										<Badge variant="outline" class="text-xs capitalize">
											{category.type}
										</Badge>
									</div>
									{#if category.allocated > 0}
										<div class="flex items-center gap-3 text-sm">
											<span class="text-muted-foreground">
												Allocated:
												<span class="text-primary font-medium">
													{formatAmount(category.allocated, mainCurrency)}
												</span>
											</span>
											<span class="text-muted-foreground">·</span>
											<span class="text-muted-foreground">
												Spent:
												<span class="font-medium text-[var(--color-warm-coral)]">
													{formatAmount(category.spent, mainCurrency)}
												</span>
											</span>
											<span class="text-muted-foreground">·</span>
											<span
												class="font-semibold {getStatusColor(
													category.remaining,
													category.allocated
												)}"
											>
												{formatAmount(category.remaining, mainCurrency)}
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
									<label class="text-muted-foreground mt-2 block text-xs font-medium">
										Parent (category tree)
										<select
											class="border-input bg-background text-foreground mt-1 block w-full max-w-xs rounded-md border px-2 py-1.5 text-sm"
											value={category.parentId ?? ''}
											onchange={(e) =>
												updateCategoryParent(
													category,
													(e.currentTarget as HTMLSelectElement).value
												)}
										>
											<option value="">— Top level —</option>
											{#each eligibleParentOptions(category) as p (p.id)}
												<option value={p.id}>{p.name}</option>
											{/each}
										</select>
									</label>
								</div>

								<div class="flex items-center gap-2">
									<Switch.Root
										checked={category.isActive}
										onCheckedChange={() => toggleCategoryStatus(category)}
									/>
									<Button variant="outline" size="sm" onclick={() => goto(`/plan?tab=budget`)}>
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
