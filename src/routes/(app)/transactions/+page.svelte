<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Fab from '$lib/components/primitives/Fab.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import TransactionList from '$lib/components/layout/TransactionList.svelte';
	import TransactionAnalysis from '$lib/components/layout/TransactionAnalysis.svelte';
	import BulkOperations from '$lib/components/layout/BulkOperations.svelte';
	import { Plus, Calendar, Trash2, Download, Tag, Merge, CreditCard, Settings } from '@lucide/svelte';
	import { isCloseMatch } from '$lib/utils/levenshtein';
	import { transactionService, type TransactionOrGroup } from '$lib/core/services/transaction-service';
	import type { Transaction } from '$lib/core/db';
	import { flattenProcessedTransactionGroups, type ProcessedTransaction } from '$lib/utils/transaction-display';
	import TopBar from '$lib/components/layout/TopBar.svelte';
	import TransactionsTopBarContent from '$lib/components/layout/TopBarComponents/Transactions.svelte';
	import TransactionMultiSelect from '$lib/components/layout/TopBarComponents/TransactionMultiSelect.svelte';
	import LoadingSpinner from '$lib/components/primitives/LoadingSpinner.svelte';
	import { transactionStore, transactionActions, filterOptions, sortOptions } from '$lib/components/layout/TopBarComponents/Transactions.svelte.ts';

	// State
	let isLoading = $state(true);
	let error: Error | null = $state(null);
	let transactions: ProcessedTransaction[] = $state([]);
	let selectedTransactions = $state(new Set<string>());
	let selectionUpdateCounter = $state(0);

	// View mode state
	let selectedView = $state('list');

	// Advanced filter state
	let selectedTags = $state<string[]>([]);
	let selectedAccounts = $state<string[]>([]);
	let amountRange = $state<{ min: number | null; max: number | null }>({ min: null, max: null });
	let dateRange = $state<{ start: Date | null; end: Date | null }>({ start: null, end: null });

	// Reactive selected transactions count
	const selectedCount = $derived.by(() => selectedTransactions.size);

	// TopBar state
	let topBarTitle = $state('Transactions');
	let topBarDescription = $state('');
	let topBarChildren = $state<any>(null);
	let topBarChildrenProps = $state<any>(null);

	// Load transactions and tags
	const loadTransactions = async () => {
		try {
			isLoading = true;
			error = null;

			const baseTransactionGroups = await transactionService.getTransactions();
			transactions = await flattenProcessedTransactionGroups(baseTransactionGroups as TransactionOrGroup[]);
		} catch (err) {
			error = err instanceof Error ? err : new Error('Failed to load transactions');
			console.error('Error loading transactions:', error);
		} finally {
			isLoading = false;
		}
	};

	// Enhanced filtering and sorting with advanced filters
	const processTransactions = $derived.by(() => {
		let filtered = [...transactions];

		// Apply search filter with smart search
		if (transactionStore.searchQuery.trim()) {
			const query = transactionStore.searchQuery.toLowerCase();
			filtered = filtered.filter(tx => 
				isCloseMatch(query, tx.description?.toLowerCase()) ||
				isCloseMatch(query, tx.tagNames?.what?.toLowerCase()) ||
				isCloseMatch(query, tx.tagNames?.why?.toLowerCase()) ||
				isCloseMatch(query, tx.tagNames?.where?.toLowerCase()) ||
				tx.tagNames?.custom?.some(tag => isCloseMatch(query, tag.toLowerCase())) ||
				Math.abs(tx.amount).toString().includes(query)
			);
		}

		// Apply advanced filters
		if (selectedTags.length > 0) {
			filtered = filtered.filter(tx => 
				selectedTags.some(tag => 
					tx.tagNames?.what?.toLowerCase().includes(tag.toLowerCase()) ||
					tx.tagNames?.why?.toLowerCase().includes(tag.toLowerCase()) ||
					tx.tagNames?.where?.toLowerCase().includes(tag.toLowerCase())
				)
			);
		}

		if (selectedAccounts.length > 0) {
			filtered = filtered.filter(tx => 
				selectedAccounts.some(account => 
					tx.accountId?.toLowerCase().includes(account.toLowerCase())
				)
			);
		}

		if (amountRange.min !== null) {
			filtered = filtered.filter(tx => Math.abs(tx.amount) >= amountRange.min!);
		}

		if (amountRange.max !== null) {
			filtered = filtered.filter(tx => Math.abs(tx.amount) <= amountRange.max!);
		}

		if (dateRange.start !== null) {
			filtered = filtered.filter(tx => {
				const date = tx.clearedDate ? new Date(tx.clearedDate) : new Date(tx.plannedDate!);
				return date >= dateRange.start!;
			});
		}

		if (dateRange.end !== null) {
			filtered = filtered.filter(tx => {
				const date = tx.clearedDate ? new Date(tx.clearedDate) : new Date(tx.plannedDate!);
				return date <= dateRange.end!;
			});
		}

		// Apply view-specific filters
		switch (selectedView) {
			case 'planning':
				filtered = filtered.filter(tx => tx.plannedDate && !tx.clearedDate);
				break;
			case 'cleared':
				filtered = filtered.filter(tx => tx.clearedDate);
				break;
		}

		// Apply legacy filter options
		switch (transactionStore.selectedFilterIndex) {
			case 1: // This month
				const now = new Date();
				const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
				const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
				filtered = filtered.filter(tx => {
					const date = tx.clearedDate ? new Date(tx.clearedDate) : new Date(tx.plannedDate!);
					return date >= startOfMonth && date <= endOfMonth;
				});
				break;
			case 2: // Food/Groceries
				filtered = filtered.filter(tx => 
					tx.tagNames?.what?.toLowerCase().includes('food') || 
					tx.tagNames?.what?.toLowerCase().includes('grocery')
				);
				break;
			case 3: // Split transactions
				filtered = filtered.filter(tx => tx.splitId);
				break;
			case 4: // Planned
				filtered = filtered.filter(tx => tx.plannedDate && !tx.clearedDate);
				break;
		}

		// Apply sorting
		switch (transactionStore.selectedSortIndex) {
			case 0: // Date
				filtered.sort((a, b) => {
					const dateA = a.clearedDate ? new Date(a.clearedDate) : new Date(a.plannedDate!);
					const dateB = b.clearedDate ? new Date(b.clearedDate) : new Date(b.plannedDate!);
					return dateB.getTime() - dateA.getTime(); // Most recent first
				});
				break;
			case 1: // Amount
				filtered.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
				break;
			case 2: // Tag
				filtered.sort((a, b) => {
					const tagA = a.tagNames?.what || a.tagNames?.why || a.tagNames?.where || a.tagNames?.custom?.[0] || '';
					const tagB = b.tagNames?.what || b.tagNames?.why || b.tagNames?.where || b.tagNames?.custom?.[0] || '';
					return tagA.localeCompare(tagB);
				});
				break;
		}

		return filtered;
	});

	// Multi-select handlers
	const clearSelectedTransactions = () => {
		selectedTransactions = new Set();
		selectionUpdateCounter++;
		transactionStore.isMultiSelectMode = false;
		// Update TopBar back to normal mode
		updateTopBarNormal();
	};

	const updateTopBarNormal = () => {
		topBarTitle = 'Transactions';
		topBarDescription = '';
		topBarChildren = TransactionsTopBarContent;
		topBarChildrenProps = {
			selectedView,
			onViewChange: handleViewChange,
			selectedTags,
			selectedAccounts,
			amountRange,
			dateRange,
			onSearchChange: handleSearchChange,
			onTagsChange: handleTagsChange,
			onAccountsChange: handleAccountsChange,
			onAmountRangeChange: handleAmountRangeChange,
			onDateRangeChange: handleDateRangeChange,
			onClearFilters: handleClearFilters,
			onImport: handleImport,
			onExport: handleExport
		};
	};

	const updateTopBarMultiSelect = () => {
		topBarTitle = 'Transactions';
		topBarDescription = '';
		topBarChildren = TransactionMultiSelect;
		topBarChildrenProps = {
			selectedTransactions: selectedTransactions,
			updateCounter: selectionUpdateCounter,
			onClearSelection: clearSelectedTransactions,
			onBulkCategorize: bulkCategorize,
			onBulkExport: exportSelected,
			onBulkMerge: mergeTransactions,
			onBulkDelete: bulkDelete
		};
	};

	// Transaction handlers
	const handleTransactionClick = (transaction: ProcessedTransaction) => {
		if (transactionStore.isMultiSelectMode) {
			// Toggle selection in multi-select mode
			const newSelection = new Set(selectedTransactions);
			if (newSelection.has(transaction.id)) {
				newSelection.delete(transaction.id);
			} else {
				newSelection.add(transaction.id);
			}
			selectedTransactions = newSelection;
			selectionUpdateCounter++;
			
			// Force TopBar update with new selection
			updateTopBarMultiSelect();
		} else {
			// Normal click - navigate to transaction detail
			goto(`/transaction/${transaction.id}`);
		}
	};

	const handleTransactionLongPress = (transaction: ProcessedTransaction) => {
		// Enter multi-select mode and select this transaction
		transactionStore.isMultiSelectMode = true;
		selectedTransactions = new Set([transaction.id]);
		selectionUpdateCounter++;
		
		// Update TopBar to multi-select mode
		updateTopBarMultiSelect();
		
		console.log(`Longpress triggered multi-select mode. Selected: ${selectedCount}`);
	};

	// Bulk operations
	const bulkCategorize = () => {
		console.log('Bulk categorize:', Array.from(selectedTransactions));
		// TODO: Implement bulk categorize
	};

	const bulkDelete = () => {
		console.log('Bulk delete:', Array.from(selectedTransactions));
		// TODO: Implement bulk delete
	};

	const exportSelected = () => {
		console.log('Export selected:', Array.from(selectedTransactions));
		// TODO: Implement export
	};

	const mergeTransactions = () => {
		console.log('Merge transactions:', Array.from(selectedTransactions));
		// TODO: Implement merge
	};

	// Import/Export handlers
	const handleImport = () => {
		console.log('Import transactions');
		// TODO: Implement import
		loadTransactions(); // Reload after import
	};

	const handleExport = () => {
		console.log('Export transactions');
		// TODO: Implement export
	};

	// Filter handlers
	const handleSearchChange = (query: string) => {
		transactionStore.searchQuery = query;
	};

	const handleTagsChange = (tags: string[]) => {
		selectedTags = tags;
	};

	const handleAccountsChange = (accounts: string[]) => {
		selectedAccounts = accounts;
	};

	const handleAmountRangeChange = (range: { min: number | null; max: number | null }) => {
		amountRange = range;
	};

	const handleDateRangeChange = (range: { start: Date | null; end: Date | null }) => {
		dateRange = range;
	};

	const handleClearFilters = () => {
		selectedTags = [];
		selectedAccounts = [];
		amountRange = { min: null, max: null };
		dateRange = { start: null, end: null };
		transactionStore.searchQuery = '';
		transactionStore.selectedFilterIndex = 0;
		transactionStore.selectedSortIndex = 0;
	};

	// View change handler
	const handleViewChange = (view: string) => {
		selectedView = view;
		// Update TopBar with new view
		updateTopBarNormal();
	};

	// Initial load
	onMount(() => {
		loadTransactions();
		updateTopBarNormal();
	});
</script>

<TopBar 
	title={topBarTitle}
	description={topBarDescription}
	showBackButton={false}
>
	{#if topBarChildren}
		{@render topBarChildren(topBarChildrenProps)}
	{/if}
</TopBar>

<div class="flex flex-col pt-4">
	<!-- Content Area -->
	{#if isLoading}
		<LoadingSpinner message="Loading transactions..." />
	{:else if error}
		<div class="flex items-center justify-center py-8">
			<p class="text-red-500">Error: {error.message}</p>
		</div>
	{:else}
		{#if selectedView === 'analysis'}
			<div class="p-4">
				<TransactionAnalysis transactions={processTransactions} />
			</div>
		{:else if selectedView === 'list' || selectedView === 'planning' || selectedView === 'cleared'}
			{#if transactionStore.isMultiSelectMode && selectedTransactions.size > 0}
				<div class="p-4">
					<BulkOperations
						selectedTransactions={selectedTransactions}
						onBulkCategorize={bulkCategorize}
						onBulkDelete={bulkDelete}
						onBulkExport={exportSelected}
						onBulkMerge={mergeTransactions}
						onClearSelection={clearSelectedTransactions}
					/>
				</div>
			{:else}
				<TransactionList
					transactions={processTransactions}
					onTransactionClick={handleTransactionClick}
					onTransactionLongPress={handleTransactionLongPress}
					selectedTransactions={selectedTransactions}
					selectionMode={transactionStore.isMultiSelectMode ? 'highlight' : 'none'}
					selectionColor="primary"
				/>
			{/if}
		{:else if selectedView === 'calendar'}
			<div class="flex flex-col items-center justify-center py-8 text-center">
				<Calendar class="w-12 h-12 text-text-tertiary mb-4" />
				<p class="text-text-secondary">Calendar View</p>
				<p class="text-sm text-text-tertiary">Coming soon - Visual spending patterns over time</p>
			</div>
		{/if}
	{/if}

	<!-- FAB for quick add -->
	<Fab onclick={() => goto('/transaction/new')} size='md'>
		<Plus/>
	</Fab>
</div>