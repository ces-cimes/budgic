<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Select from '$lib/components/ui/select';
	import type { FilterState } from '../TransactionList.svelte';
	import type { Category } from '$lib/core/db';

	interface Props {
		filters: FilterState;
		categories: Record<string, Category>;
		onFiltersChange: (filters: FilterState) => void;
	}

	let { filters, categories, onFiltersChange }: Props = $props();

	const categoryList = $derived(Object.values(categories).filter(c => c && !c.deletedAt));
	
	const categoryTypeValue = $derived(filters.categoryType || '');
	
	const waterfallTiers: Array<{ value: FilterState['waterfallTier'][number]; label: string }> = [
		{ value: 'survival', label: 'Survival' },
		{ value: 'security', label: 'Security' },
		{ value: 'growth', label: 'Growth' },
		{ value: 'lifestyle', label: 'Lifestyle' }
	];

	function toggleCategory(categoryId: string) {
		const currentIds = filters.categoryIds || [];
		const newIds = currentIds.includes(categoryId)
			? currentIds.filter(id => id !== categoryId)
			: [...currentIds, categoryId];
		
		onFiltersChange({
			...filters,
			categoryIds: newIds.length > 0 ? newIds : undefined
		});
	}

	function toggleWaterfallTier(tier: FilterState['waterfallTier'][number]) {
		const currentTiers = filters.waterfallTier || [];
		const newTiers = currentTiers.includes(tier)
			? currentTiers.filter(t => t !== tier)
			: [...currentTiers, tier];
		
		onFiltersChange({
			...filters,
			waterfallTier: newTiers.length > 0 ? newTiers : undefined
		});
	}
</script>

<div class="space-y-4">
	<!-- Category Type -->
	<div class="space-y-2">
		<label class="text-xs font-medium text-muted-foreground">Category Type</label>
		<Select.Root
			type="single"
			value={categoryTypeValue}
			onValueChange={(value) => {
				onFiltersChange({
					...filters,
					categoryType: value === '' ? undefined : (value as 'expense' | 'income' | undefined)
				});
			}}
		>
			<Select.Trigger class="w-full">
				{filters.categoryType || 'All'}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">All</Select.Item>
				<Select.Item value="expense">Expense</Select.Item>
				<Select.Item value="income">Income</Select.Item>
			</Select.Content>
		</Select.Root>
	</div>

	<!-- Waterfall Tier -->
	<div class="space-y-2">
		<label class="text-xs font-medium text-muted-foreground">Waterfall Tier</label>
		<div class="space-y-2">
			{#each waterfallTiers as tier}
				<label class="flex items-center space-x-2 cursor-pointer">
					<Checkbox
						checked={filters.waterfallTier?.includes(tier.value) || false}
						onCheckedChange={() => toggleWaterfallTier(tier.value)}
					/>
					<span class="text-sm text-primary">{tier.label}</span>
				</label>
			{/each}
		</div>
	</div>

	<!-- Categories -->
	<div class="space-y-2">
		<label class="text-xs font-medium text-muted-foreground">Categories</label>
		<div class="max-h-48 overflow-y-auto space-y-2 border rounded-md p-2">
			<label class="flex items-center space-x-2 cursor-pointer">
				<Checkbox
					checked={filters.categoryIds?.includes('__uncategorized__') || false}
					onCheckedChange={() => toggleCategory('__uncategorized__')}
				/>
				<span class="text-sm text-primary">Uncategorized</span>
			</label>
			{#each categoryList as category}
				<label class="flex items-center space-x-2 cursor-pointer">
					<Checkbox
						checked={filters.categoryIds?.includes(category.id) || false}
						onCheckedChange={() => toggleCategory(category.id)}
					/>
					<span class="text-sm text-primary">{category.name}</span>
				</label>
			{/each}
		</div>
	</div>
</div>
