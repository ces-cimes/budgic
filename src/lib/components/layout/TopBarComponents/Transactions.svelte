<script lang="ts">
	import Input from '$lib/components/primitives/Input.svelte';
	import Tabs from '$lib/components/primitives/Tabs.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import TransactionViewModes from '$lib/components/layout/TransactionViewModes.svelte';
	import TransactionImport from '$lib/components/layout/TransactionImport.svelte';
	import { SortAsc, Search, Filter, X } from '@lucide/svelte';
	import { transactionStore, transactionActions, filterOptions, sortOptions } from './Transactions.svelte.ts';

	// Props for enhanced functionality
	interface Props {
		selectedView?: string;
		onViewChange?: (view: string) => void;
		selectedTags?: string[];
		selectedAccounts?: string[];
		amountRange?: { min: number | null; max: number | null };
		dateRange?: { start: Date | null; end: Date | null };
		onSearchChange?: (query: string) => void;
		onTagsChange?: (tags: string[]) => void;
		onAccountsChange?: (accounts: string[]) => void;
		onAmountRangeChange?: (range: { min: number | null; max: number | null }) => void;
		onDateRangeChange?: (range: { start: Date | null; end: Date | null }) => void;
		onClearFilters?: () => void;
		onImport?: () => void;
		onExport?: () => void;
	}

	let {
		selectedView = 'list',
		onViewChange = () => {},
		selectedTags = [],
		selectedAccounts = [],
		amountRange = { min: null, max: null },
		dateRange = { start: null, end: null },
		onSearchChange = () => {},
		onTagsChange = () => {},
		onAccountsChange = () => {},
		onAmountRangeChange = () => {},
		onDateRangeChange = () => {},
		onClearFilters = () => {},
		onImport = () => {},
		onExport = () => {}
	}: Props = $props();

	let showAdvancedFilters = $state(false);

	const hasActiveFilters = $derived(
		selectedTags.length > 0 ||
		selectedAccounts.length > 0 ||
		amountRange.min !== null ||
		amountRange.max !== null ||
		dateRange.start !== null ||
		dateRange.end !== null
	);
</script>

<div class="space-y-4">
	<!-- View Mode Tabs -->
	<TransactionViewModes 
		selectedView={selectedView}
		onViewChange={onViewChange}
	/>

	<!-- Search and Basic Filters -->
	<div class="space-y-3">
		<!-- Search Bar -->
		<div class="relative">
			<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-text-tertiary" />
			<Input 
				placeholder="Search by amount, description, or category..."
				bind:value={transactionStore.searchQuery}
				on:input={(event) => {
					const value = (event.target as HTMLInputElement).value;
					transactionActions.setSearchQuery(value);
					onSearchChange(value);
				}}
				class="pl-10"
			/>
		</div>

		<!-- Filter Toggle and Import -->
		<div class="flex items-center justify-between">
			<button
				class="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
				onclick={() => showAdvancedFilters = !showAdvancedFilters}
			>
				<Filter class="size-4" />
				<span>Filters</span>
				{#if hasActiveFilters}
					<span class="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full">
						{selectedTags.length + selectedAccounts.length + (amountRange.min !== null ? 1 : 0) + (amountRange.max !== null ? 1 : 0) + (dateRange.start !== null ? 1 : 0) + (dateRange.end !== null ? 1 : 0)}
					</span>
				{/if}
			</button>

			<div class="flex items-center gap-2">
				{#if hasActiveFilters}
					<button
						class="flex items-center gap-1 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
						onclick={onClearFilters}
					>
						<X class="size-3" />
						<span>Clear</span>
					</button>
				{/if}
				<TransactionImport 
					onImport={onImport}
					onExport={onExport}
				/>
			</div>
		</div>

		<!-- Legacy Filter Pills -->
		<Tabs 
			items={filterOptions} 
			bind:selectedIndex={transactionStore.selectedFilterIndex}
			on:change={(event) => {
				transactionActions.setFilterIndex(event.detail.index);
			}}
		/>

		<!-- Sort Options -->
		<div class="flex items-center gap-2">
			<SortAsc class="size-4 text-gray-400" />
			<Tabs 
				items={sortOptions} 
				bind:selectedIndex={transactionStore.selectedSortIndex}
				on:change={(event) => {
					transactionActions.setSortIndex(event.detail.index);
				}}
				class="flex-1"
			/>
		</div>
	</div>

	<!-- Advanced Filters -->
	{#if showAdvancedFilters}
		<div class="space-y-4 p-4 bg-surface-secondary rounded-lg">
			<!-- Tags Filter -->
			<div>
				<div class="flex items-center gap-2 mb-2">
					<span class="text-sm font-medium">Tags</span>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each ['Food', 'Transport', 'Housing', 'Entertainment', 'Shopping', 'Healthcare', 'Income'] as tag}
						<button
							class="px-3 py-1 text-xs rounded-full border transition-colors {selectedTags.includes(tag) ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface text-text-secondary border-border hover:bg-surface-hover'}"
							onclick={() => {
								const newTags = selectedTags.includes(tag)
									? selectedTags.filter(t => t !== tag)
									: [...selectedTags, tag];
								onTagsChange(newTags);
							}}
						>
							{tag}
						</button>
					{/each}
				</div>
			</div>

			<!-- Accounts Filter -->
			<div>
				<div class="flex items-center gap-2 mb-2">
					<span class="text-sm font-medium">Accounts</span>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each ['Chase', 'Checking', 'Savings', 'Credit Card'] as account}
						<button
							class="px-3 py-1 text-xs rounded-full border transition-colors {selectedAccounts.includes(account) ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface text-text-secondary border-border hover:bg-surface-hover'}"
							onclick={() => {
								const newAccounts = selectedAccounts.includes(account)
									? selectedAccounts.filter(a => a !== account)
									: [...selectedAccounts, account];
								onAccountsChange(newAccounts);
							}}
						>
							{account}
						</button>
					{/each}
				</div>
			</div>

			<!-- Amount Range -->
			<div>
				<div class="flex items-center gap-2 mb-2">
					<span class="text-sm font-medium">Amount Range</span>
				</div>
				<div class="flex gap-2">
					<Input
						type="number"
						placeholder="Min"
						value={amountRange.min?.toString() || ''}
						on:input={(event) => {
							const value = (event.target as HTMLInputElement).value;
							onAmountRangeChange({ ...amountRange, min: value ? parseFloat(value) : null });
						}}
						class="flex-1"
					/>
					<Input
						type="number"
						placeholder="Max"
						value={amountRange.max?.toString() || ''}
						on:input={(event) => {
							const value = (event.target as HTMLInputElement).value;
							onAmountRangeChange({ ...amountRange, max: value ? parseFloat(value) : null });
						}}
						class="flex-1"
					/>
				</div>
			</div>

			<!-- Date Range -->
			<div>
				<div class="flex items-center gap-2 mb-2">
					<span class="text-sm font-medium">Date Range</span>
				</div>
				<div class="flex gap-2">
					<Input
						type="date"
						value={dateRange.start?.toISOString().split('T')[0] || ''}
						on:input={(event) => {
							const value = (event.target as HTMLInputElement).value;
							onDateRangeChange({ ...dateRange, start: value ? new Date(value) : null });
						}}
						class="flex-1"
					/>
					<Input
						type="date"
						value={dateRange.end?.toISOString().split('T')[0] || ''}
						on:input={(event) => {
							const value = (event.target as HTMLInputElement).value;
							onDateRangeChange({ ...dateRange, end: value ? new Date(value) : null });
						}}
						class="flex-1"
					/>
				</div>
			</div>
		</div>
	{/if}
</div>