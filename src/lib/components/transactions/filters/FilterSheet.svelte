<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import FilterSection from './FilterSection.svelte';
	import StatusFilter from './StatusFilter.svelte';
	import CategoryFilter from './CategoryFilter.svelte';
	import AccountFilter from './AccountFilter.svelte';
	import AmountRangeFilter from './AmountRangeFilter.svelte';
	import DateRangeFilter from './DateRangeFilter.svelte';
	import FilterPresets from './FilterPresets.svelte';
	import { clearAdvancedFilters } from './filter-utils';
	import type { FilterState } from '../TransactionList.svelte';
	import type { Account, Category } from '$lib/core/db';

	interface Props {
		open: boolean;
		activeFilterCount: number;
		filters: FilterState;
		accounts: Record<string, Account>;
		categories: Record<string, Category>;
		userCurrency?: string | null;
		onFiltersChange: (filters: FilterState) => void;
		onClearAll: () => void;
		onApply: () => void;
	}

	let {
		open = $bindable(),
		activeFilterCount,
		filters,
		accounts,
		categories,
		userCurrency = null,
		onFiltersChange,
		onClearAll,
		onApply
	}: Props = $props();

	const isMobile = new IsMobile();
	const sheetSide = $derived(isMobile.current ? 'bottom' : 'right');

	function handleClearAll() {
		const cleared = clearAdvancedFilters(filters);
		onFiltersChange(cleared);
		onClearAll();
	}

	function handleApply() {
		onApply();
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side={sheetSide} class="sm:max-w-md w-full">
		<Sheet.Header>
			<Sheet.Title>Filter Transactions</Sheet.Title>
			<Sheet.Description>
				{activeFilterCount > 0 
					? `${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active`
					: 'Narrow down your transactions'}
			</Sheet.Description>
		</Sheet.Header>
		
		<div class="max-h-[calc(100vh-200px)] overflow-y-auto py-4 space-y-6">
			<!-- Filter Presets -->
			<FilterSection title="Quick Filters">
				<FilterPresets 
					currentFilters={filters}
					onPresetSelect={(newFilters) => {
						onFiltersChange(newFilters);
					}} 
				/>
			</FilterSection>

			<!-- Status Filter -->
			<FilterSection title="Status">
				<StatusFilter {filters} {onFiltersChange} />
			</FilterSection>
			
			<!-- Category Filter -->
			<FilterSection title="Category">
				<CategoryFilter {filters} {categories} {onFiltersChange} />
			</FilterSection>
			
			<!-- Account Filter -->
			<FilterSection title="Account">
				<AccountFilter {filters} {accounts} {onFiltersChange} />
			</FilterSection>
			
			<!-- Amount Filter -->
			<FilterSection title="Amount">
				<AmountRangeFilter {filters} {onFiltersChange} {userCurrency} />
			</FilterSection>
			
			<!-- Date Range Filter -->
			<FilterSection title="Date Range">
				<DateRangeFilter {filters} {onFiltersChange} />
			</FilterSection>
			
			<!-- Advanced Filters (collapsible) -->
			<details class="group">
				<summary class="cursor-pointer font-medium text-sm text-primary hover:text-primary/80">
					Advanced Filters
				</summary>
				<div class="mt-4 space-y-4">
					<!-- Type Filter -->
					<FilterSection title="Transaction Type">
						<div class="space-y-2">
							{#each ['income', 'expense', 'transfer', 'adjustment'] as type}
								<label class="flex items-center space-x-2 cursor-pointer">
									<input
										type="checkbox"
										checked={filters.types?.includes(type as any) || false}
										onchange={(e) => {
											const currentTypes = filters.types || [];
											const newTypes = e.currentTarget.checked
												? [...currentTypes, type as any]
												: currentTypes.filter(t => t !== type);
											onFiltersChange({
												...filters,
												types: newTypes.length > 0 ? newTypes : undefined
											});
										}}
										class="w-4 h-4"
									/>
									<span class="text-sm text-primary capitalize">{type}</span>
								</label>
							{/each}
						</div>
					</FilterSection>

					<!-- Recurring Filter -->
					<FilterSection title="Recurring">
						<div class="space-y-2">
							<label class="flex items-center space-x-2 cursor-pointer">
								<input
									type="radio"
									name="recurring"
									checked={filters.recurring === true}
									onchange={() => onFiltersChange({ ...filters, recurring: true })}
									class="w-4 h-4"
								/>
								<span class="text-sm text-primary">Recurring only</span>
							</label>
							<label class="flex items-center space-x-2 cursor-pointer">
								<input
									type="radio"
									name="recurring"
									checked={filters.recurring === false}
									onchange={() => onFiltersChange({ ...filters, recurring: false })}
									class="w-4 h-4"
								/>
								<span class="text-sm text-primary">Non-recurring only</span>
							</label>
							<label class="flex items-center space-x-2 cursor-pointer">
								<input
									type="radio"
									name="recurring"
									checked={filters.recurring === undefined}
									onchange={() => onFiltersChange({ ...filters, recurring: undefined })}
									class="w-4 h-4"
								/>
								<span class="text-sm text-primary">All</span>
							</label>
						</div>
					</FilterSection>

					<!-- Variance Filter -->
					<FilterSection title="Budget Variance">
						<div class="space-y-2">
							<label class="flex items-center space-x-2 cursor-pointer">
								<input
									type="checkbox"
									checked={filters.hasVariance || false}
									onchange={(e) => onFiltersChange({ ...filters, hasVariance: e.currentTarget.checked || undefined })}
									class="w-4 h-4"
								/>
								<span class="text-sm text-primary">Has variance</span>
							</label>
							<label class="flex items-center space-x-2 cursor-pointer">
								<input
									type="checkbox"
									checked={filters.underBudget || false}
									onchange={(e) => onFiltersChange({ ...filters, underBudget: e.currentTarget.checked || undefined })}
									class="w-4 h-4"
								/>
								<span class="text-sm text-primary">Under budget</span>
							</label>
							<label class="flex items-center space-x-2 cursor-pointer">
								<input
									type="checkbox"
									checked={filters.overBudget || false}
									onchange={(e) => onFiltersChange({ ...filters, overBudget: e.currentTarget.checked || undefined })}
									class="w-4 h-4"
								/>
								<span class="text-sm text-primary">Over budget</span>
							</label>
						</div>
					</FilterSection>
				</div>
			</details>
		</div>
		
		<Sheet.Footer class="flex justify-between border-t pt-4">
			<Button variant="outline" onclick={handleClearAll} disabled={activeFilterCount === 0}>
				Clear All
			</Button>
			<Button onclick={handleApply}>
				Apply Filters
			</Button>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
