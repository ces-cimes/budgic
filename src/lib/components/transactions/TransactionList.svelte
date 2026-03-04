<script lang="ts">
	import { Search, ChevronLeft, ChevronRight, Clock, Calendar, Group, Receipt } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.ts";
	import TransactionItem from '$lib/components/TransactionItem.svelte';
	import { useCurrencyFormatting } from '$lib/hooks/use-currency-formatting';
	import { searchTransaction } from '$lib/utils/semantic-search';
	import { getGroupKey, getGroupLabel, type DateGroup, type GroupingMode } from '$lib/utils/date-grouping';
	import { dateUtils } from '$lib/utils/date-utils';
	import { transactionService } from '$lib/core/services';
	import type { Transaction, Account, Category } from '$lib/core/db';
	import FilterButton from './filters/FilterButton.svelte';
	import FilterSheet from './filters/FilterSheet.svelte';
	import { getActiveFilterCount } from './filters/filter-utils';

	// Filter state interface
	export interface FilterState {
		// Search
		searchQuery: string;
		
		// Basic filters (always visible)
		showPendingOnly: boolean;
		dateFilterEnabled: boolean;
		groupingMode: GroupingMode;
		currentMonth: Date;
		
		// Status filter (enhanced)
		statuses?: ('cleared' | 'pending' | 'planned' | 'cancelled' | 'upcoming' | 'overdue')[];
		
		// Category filter
		categoryIds?: string[];
		categoryType?: 'expense' | 'income';
		waterfallTier?: ('survival' | 'security' | 'growth' | 'lifestyle')[];
		
		// Account filter
		accountIds?: string[];
		accountTypes?: ('checking' | 'savings' | 'credit' | 'cash' | 'investment' | 'crypto')[];
		
		// Amount filter
		minAmount?: number;
		maxAmount?: number;
		
		// Date range filter (enhanced)
		dateRange?: { start: Date; end: Date };
		dateType?: 'cleared' | 'planned';
		
		// Transaction type filter
		types?: ('income' | 'expense' | 'transfer' | 'adjustment')[];
		
		// Recurring filter
		recurring?: boolean;
		
		// Grouped transactions filter
		grouped?: boolean;
		
		// Variance filter
		hasVariance?: boolean;
		underBudget?: boolean;
		overBudget?: boolean;
		
		// Confidence level filter
		confidence?: ('confirmed' | 'expected' | 'estimated')[];
		
		// Currency filter
		currencies?: string[];
		
		// Import source filter
		importSource?: string;
		hasNotes?: boolean;
		hasReference?: boolean;
	}

	interface TransactionListProps {
		// Transactions data
		transactions: Transaction[];
		accounts: Record<string, Account>;
		categories: Record<string, Category>;
		
		// Filter configuration
		filters?: FilterState; // Optional external filter control
		enableFilters?: boolean; // Show/hide filter UI
		enableSearch?: boolean; // Show/hide search bar
		enableBasicToggles?: boolean; // Show/hide pending/date/grouping toggles
		enableAdvancedFilters?: boolean; // Show/hide advanced filter button
		
		// Display configuration
		displayMode?: 'compact' | 'detailed';
		groupingMode?: GroupingMode | 'none';
		showSummary?: boolean; // Show income/expense/net summary
		showDateNavigation?: boolean; // Show month navigation
		
		// Selection mode (for bulk editing)
		enableSelection?: boolean; // Enable selection mode
		selectionMode?: boolean; // Current selection mode state
		selectedIds?: Set<string>; // Selected transaction IDs
		onSelectionChange?: (ids: Set<string>) => void;
		
		// Callbacks
		onTransactionClick?: (transaction: Transaction) => void;
		onFiltersChange?: (filters: FilterState) => void;
		/** When provided, empty state shows an "Add transaction" CTA button */
		onAddTransaction?: () => void;
		
		// User currency for formatting
		userCurrency?: string | null;
	}

	const {
		transactions,
		accounts,
		categories,
		filters: externalFilters,
		enableFilters = true,
		enableSearch = true,
		enableBasicToggles = true,
		enableAdvancedFilters = false,
		displayMode = 'detailed',
		groupingMode: propGroupingMode = 'smart',
		showSummary = true,
		showDateNavigation = true,
		enableSelection = false,
		selectionMode: externalSelectionMode = false,
		selectedIds: externalSelectedIds,
		onSelectionChange,
		onTransactionClick,
		onFiltersChange,
		onAddTransaction,
		userCurrency = null
	}: TransactionListProps = $props();

	// Currency formatting hook
	const currencyFormat = useCurrencyFormatting();

	// Internal filter state (used when filters prop is not provided)
	let internalFilters = $state<FilterState>({
		searchQuery: '',
		showPendingOnly: false,
		dateFilterEnabled: true,
		groupingMode: propGroupingMode === 'none' ? 'simple' : propGroupingMode,
		currentMonth: new Date()
	});

	// Internal selection state
	let internalSelectedIds = $state<Set<string>>(new Set());
	let internalSelectionMode = $state(false);

	// Filter sheet state
	let filterSheetOpen = $state(false);

	// Use external or internal state based on props
	const filters = $derived(externalFilters ?? internalFilters);
	const selectionMode = $derived(enableSelection ? (externalSelectionMode ?? internalSelectionMode) : false);
	const selectedIds = $derived(enableSelection ? (externalSelectedIds ?? internalSelectedIds) : new Set<string>());

	// Sync toggle values with filter state
	let toggleValues = $state<string[]>([]);
	
	// Initialize toggle values
	$effect(() => {
		const currentFilters = filters;
		const values: string[] = [];
		if (currentFilters.showPendingOnly) values.push('pending');
		if (currentFilters.dateFilterEnabled) values.push('date');
		if (currentFilters.groupingMode === 'smart') values.push('smart');
		toggleValues = values;
	});

	// Update toggle values when filters change (from external source)
	$effect(() => {
		if (externalFilters) {
			const values: string[] = [];
			if (externalFilters.showPendingOnly) values.push('pending');
			if (externalFilters.dateFilterEnabled) values.push('date');
			if (externalFilters.groupingMode === 'smart') values.push('smart');
			toggleValues = values;
		}
	});

	// Sync toggle values back to filter state
	$effect(() => {
		const currentFilters = filters;
		const newFilters: FilterState = {
			...currentFilters,
			showPendingOnly: toggleValues.includes('pending'),
			dateFilterEnabled: toggleValues.includes('date'),
			groupingMode: toggleValues.includes('smart') ? 'smart' : 'simple'
		};
		
		// Only update if something actually changed to avoid loops
		if (
			newFilters.showPendingOnly !== currentFilters.showPendingOnly ||
			newFilters.dateFilterEnabled !== currentFilters.dateFilterEnabled ||
			newFilters.groupingMode !== currentFilters.groupingMode
		) {
			if (!externalFilters) {
				internalFilters = newFilters;
			} else {
				// Update external filters via callback
				onFiltersChange?.(newFilters);
			}
		}
	});

	// Helper functions for search and display
	function getCategoryName(transaction: Transaction | any): string {
		if (!transaction) {
			return 'Unknown';
		}
		if (!transaction.categoryId) return 'Uncategorized';
		if (categories[transaction.categoryId]) {
			return categories[transaction.categoryId].name;
		}
		// Last resort: format the category ID if it exists
		return transaction.categoryId.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
	}

	function getAccountName(accountId: string | undefined | null): string {
		if (!accountId) return 'Unassigned Account';
		return accounts[accountId]?.name || 'Unknown Account';
	}

	function getTransactionAccountId(transaction: Transaction): string {
		return transaction.accountId || '';
	}

	// Enhanced fuzzy search function using semantic search utility
	function fuzzySearch(transaction: Transaction, query: string): { match: boolean; score: number } {
		const result = searchTransaction(
			transaction,
			query,
			getCategoryName,
			getAccountName,
			getTransactionAccountId
		);
		
		return { match: result.match, score: result.score };
	}

	function getTransactionDate(transaction: Transaction | any): string {
		if (!transaction) {
			return new Date().toISOString();
		}
		return transaction.clearedDate || transaction.plannedDate || transaction.createdAt;
	}

	// Derived filtered transactions with fuzzy search and date grouping
	let filteredTransactions = $derived(() => {
		const currentFilters = filters;
		
		// Filter out null, undefined, or deleted transactions
		let filtered = transactions.filter(t => t && !t.deletedAt);
		
		// Filter by search query using fuzzy search
		if (currentFilters.searchQuery.trim()) {
			filtered = filtered
				.map(t => ({ transaction: t, ...fuzzySearch(t, currentFilters.searchQuery) }))
				.filter(({ match }) => match)
				.sort((a, b) => b.score - a.score) // Sort by relevance score
				.map(({ transaction }) => transaction);
		}
		
		// Filter by pending status
		if (currentFilters.showPendingOnly) {
			filtered = filtered.filter(t => {
				return t.status === 'pending' || t.status === 'planned';
			});
		}
		
		// Filter by month (only if date filtering is enabled)
		if (currentFilters.dateFilterEnabled) {
			const monthStart = new Date(
				currentFilters.currentMonth.getFullYear(),
				currentFilters.currentMonth.getMonth(),
				1
			);
			const monthEnd = new Date(
				currentFilters.currentMonth.getFullYear(),
				currentFilters.currentMonth.getMonth() + 1,
				0,
				23,
				59,
				59
			);
			
			filtered = filtered.filter(t => {
				const transactionDate = new Date(getTransactionDate(t));
				return transactionDate >= monthStart && transactionDate <= monthEnd;
			});
		}
		
		// Apply status filter (enhanced)
		if (currentFilters.statuses && currentFilters.statuses.length > 0) {
			filtered = filtered.filter(t => {
				const now = new Date();
				// Check each selected status
				for (const status of currentFilters.statuses!) {
					if (status === 'upcoming') {
						if (t.status === 'pending' && t.plannedDate) {
							const plannedDate = new Date(t.plannedDate);
							if (plannedDate > now) return true;
						}
					} else if (status === 'overdue') {
						if (t.status === 'pending' && t.plannedDate) {
							const plannedDate = new Date(t.plannedDate);
							if (plannedDate < now) return true;
						}
					} else if (t.status === status) {
						return true;
					}
				}
				return false;
			});
		}
		
		// Apply category filter
		if (currentFilters.categoryIds && currentFilters.categoryIds.length > 0) {
			filtered = filtered.filter(t => {
				if (currentFilters.categoryIds!.includes('__uncategorized__')) {
					return !t.categoryId || currentFilters.categoryIds!.includes(t.categoryId);
				}
				return t.categoryId && currentFilters.categoryIds!.includes(t.categoryId);
			});
		}
		
		if (currentFilters.categoryType) {
			filtered = filtered.filter(t => {
				if (!t.categoryId) return false;
				const category = categories[t.categoryId];
				return category && category.type === currentFilters.categoryType;
			});
		}
		
		if (currentFilters.waterfallTier && currentFilters.waterfallTier.length > 0) {
			filtered = filtered.filter(t => {
				if (!t.categoryId) return false;
				const category = categories[t.categoryId];
				return category && currentFilters.waterfallTier!.includes(category.waterfallTier);
			});
		}
		
		// Apply account filter
		if (currentFilters.accountIds && currentFilters.accountIds.length > 0) {
			filtered = filtered.filter(t => t.accountId && currentFilters.accountIds!.includes(t.accountId));
		}
		
		if (currentFilters.accountTypes && currentFilters.accountTypes.length > 0) {
			filtered = filtered.filter(t => {
				if (!t.accountId) return false;
				const account = accounts[t.accountId];
				return account && currentFilters.accountTypes!.includes(account.type);
			});
		}
		
		// Apply amount filter
		if (currentFilters.minAmount !== undefined) {
			filtered = filtered.filter(t => {
				const amount = Math.abs(t.amount || 0);
				return amount >= currentFilters.minAmount!;
			});
		}
		
		if (currentFilters.maxAmount !== undefined) {
			filtered = filtered.filter(t => {
				const amount = Math.abs(t.amount || 0);
				return amount <= currentFilters.maxAmount!;
			});
		}
		
		// Apply date range filter (enhanced)
		if (currentFilters.dateRange) {
			filtered = filtered.filter(t => {
				const dateType = currentFilters.dateType || 'cleared';
				const transactionDate = dateType === 'planned' 
					? (t.plannedDate ? new Date(t.plannedDate) : null)
					: (t.clearedDate ? new Date(t.clearedDate) : null);
				
				if (!transactionDate) return false;
				return transactionDate >= currentFilters.dateRange!.start && transactionDate <= currentFilters.dateRange!.end;
			});
		}
		
		// Apply transaction type filter
		if (currentFilters.types && currentFilters.types.length > 0) {
			filtered = filtered.filter(t => currentFilters.types!.includes(t.type));
		}
		
		// Apply recurring filter
		if (currentFilters.recurring !== undefined) {
			filtered = filtered.filter(t => {
				const isRecurring = !!t.recurrenceRule;
				return currentFilters.recurring ? isRecurring : !isRecurring;
			});
		}
		
		// Apply grouped filter
		if (currentFilters.grouped !== undefined) {
			filtered = filtered.filter(t => {
				const isGrouped = !!t.groupId;
				return currentFilters.grouped ? isGrouped : !isGrouped;
			});
		}
		
		// Apply variance filters
		if (currentFilters.hasVariance !== undefined && currentFilters.hasVariance) {
			filtered = filtered.filter(t => {
				return t.status === 'cleared' && 
					t.plannedAmount !== undefined && 
					t.amount !== undefined &&
					t.plannedAmount !== t.amount;
			});
		}
		
		if (currentFilters.underBudget !== undefined && currentFilters.underBudget) {
			filtered = filtered.filter(t => {
				return t.status === 'cleared' && 
					t.plannedAmount !== undefined && 
					t.amount !== undefined &&
					t.amount < t.plannedAmount;
			});
		}
		
		if (currentFilters.overBudget !== undefined && currentFilters.overBudget) {
			filtered = filtered.filter(t => {
				return t.status === 'cleared' && 
					t.plannedAmount !== undefined && 
					t.amount !== undefined &&
					t.amount > t.plannedAmount;
			});
		}
		
		// Apply confidence filter
		if (currentFilters.confidence && currentFilters.confidence.length > 0) {
			filtered = filtered.filter(t => {
				return t.confidence && currentFilters.confidence!.includes(t.confidence);
			});
		}
		
		// Apply currency filter
		if (currentFilters.currencies && currentFilters.currencies.length > 0) {
			filtered = filtered.filter(t => {
				return t.currency && currentFilters.currencies!.includes(t.currency);
			});
		}
		
		// Apply import source filter
		if (currentFilters.importSource) {
			filtered = filtered.filter(t => {
				if (!t.importMetadata) return false;
				try {
					const metadata = JSON.parse(t.importMetadata);
					return metadata.source === currentFilters.importSource;
				} catch {
					return false;
				}
			});
		}
		
		// Apply notes/reference filters
		if (currentFilters.hasNotes !== undefined) {
			filtered = filtered.filter(t => {
				const hasNotes = !!(t.description && t.description.trim().length > 0);
				return currentFilters.hasNotes ? hasNotes : !hasNotes;
			});
		}
		
		if (currentFilters.hasReference !== undefined) {
			filtered = filtered.filter(t => {
				// Assuming reference might be in importMetadata or a separate field
				const hasReference = !!(t.importMetadata && t.importMetadata.includes('reference'));
				return currentFilters.hasReference ? hasReference : !hasReference;
			});
		}
		
		// Sort by date (most recent first)
		filtered.sort((a, b) => {
			const dateA = new Date(getTransactionDate(a));
			const dateB = new Date(getTransactionDate(b));
			return dateB.getTime() - dateA.getTime();
		});
		
		// Group transactions by groupId first, then by date
		const transactionGroups = new Map<string, Transaction[]>();
		const standaloneTransactions: Transaction[] = [];
		
		filtered.forEach(transaction => {
			if (transaction.groupId) {
				if (!transactionGroups.has(transaction.groupId)) {
					transactionGroups.set(transaction.groupId, []);
				}
				transactionGroups.get(transaction.groupId)!.push(transaction);
			} else {
				standaloneTransactions.push(transaction);
			}
		});
		
		// Create group objects for grouped transactions
		const groupedTransactions: any[] = [];
		transactionGroups.forEach((groupTransactions, groupId) => {
			// Sort group transactions by date
			groupTransactions.sort((a, b) => {
				const dateA = new Date(getTransactionDate(a));
				const dateB = new Date(getTransactionDate(b));
				return dateB.getTime() - dateA.getTime();
			});
			
			// Create a group object representing the entire group
			const firstTransaction = groupTransactions[0];
			const totalAmount = groupTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
			
			groupedTransactions.push({
				id: groupId,
				type: firstTransaction.type,
				groupId: groupId,
				isGroup: true,
				groupName: firstTransaction.groupName || 'Grouped Transaction',
				description: firstTransaction.description || 'Grouped Transaction',
				amount: totalAmount,
				currency: firstTransaction.currency || (firstTransaction.accountId ? accounts[firstTransaction.accountId]?.currency : undefined),
				status: firstTransaction.status,
				clearedDate: firstTransaction.clearedDate,
				plannedDate: firstTransaction.plannedDate,
				createdAt: firstTransaction.createdAt,
				accountId: firstTransaction.accountId,
				categoryId: firstTransaction.categoryId,
				transactions: groupTransactions,
				totalAmount: totalAmount
			});
		});
		
		// Combine grouped and standalone transactions
		const allTransactions = [...groupedTransactions, ...standaloneTransactions];
		
		// Sort all transactions by date (most recent first)
		allTransactions.sort((a, b) => {
			const dateA = new Date(getTransactionDate(a));
			const dateB = new Date(getTransactionDate(b));
			return dateB.getTime() - dateA.getTime();
		});
		
		// Group by date if grouping mode is not 'none'
		if (propGroupingMode === 'none') {
			// Return as single group with no date grouping
			return [{
				group: {
					key: 'all',
					date: new Date(),
					label: 'All Transactions'
				},
				transactions: allTransactions
			}];
		}
		
		// Group by date
		const grouped = new Map<string, { group: DateGroup; transactions: any[] }>();
		
		allTransactions.forEach(transaction => {
			const transactionDate = new Date(getTransactionDate(transaction));
			const groupKey = getGroupKey(transactionDate, currentFilters.groupingMode);
			
			if (!grouped.has(groupKey)) {
				grouped.set(groupKey, {
					group: {
						key: groupKey,
						date: transactionDate,
						label: getGroupLabel(groupKey, currentFilters.groupingMode)
					},
					transactions: []
				});
			}
			
			grouped.get(groupKey)!.transactions.push(transaction);
		});
		
		// Convert to array and sort groups by date (most recent first)
		return Array.from(grouped.values()).sort((a, b) => {
			return b.group.date.getTime() - a.group.date.getTime();
		});
	});

	// Summary stats and per-date-group totals, converted to main currency (async)
	let summaryStats = $state<{ income: number; expenses: number; net: number }>({ income: 0, expenses: 0, net: 0 });
	let dateGroupTotals = $state<Record<string, { income: number; expenses: number; net: number }>>({});

	$effect(() => {
		const groups = filteredTransactions();
		const main = userCurrency || 'USD';
		const accts = accounts;
		(async () => {
			const flat = groups.flatMap((g) => g.transactions);
			const summary = await transactionService.getTransactionStatisticsForTransactions(flat, accts, main);
			summaryStats = summary;
			const map: Record<string, { income: number; expenses: number; net: number }> = {};
			for (const g of groups) {
				map[g.group.key] = await transactionService.getTransactionStatisticsForTransactions(g.transactions, accts, main);
			}
			dateGroupTotals = map;
		})();
	});

	// Month navigation functions
	function goToPreviousMonth() {
		const currentFilters = filters;
		const newMonth = new Date(currentFilters.currentMonth.getFullYear(), currentFilters.currentMonth.getMonth() - 1);
		updateFilters({ ...currentFilters, currentMonth: newMonth });
	}

	function goToNextMonth() {
		const currentFilters = filters;
		const newMonth = new Date(currentFilters.currentMonth.getFullYear(), currentFilters.currentMonth.getMonth() + 1);
		updateFilters({ ...currentFilters, currentMonth: newMonth });
	}

	function goToCurrentMonth() {
		const currentFilters = filters;
		updateFilters({ ...currentFilters, currentMonth: new Date() });
	}

	// Update filters helper
	function updateFilters(newFilters: FilterState) {
		if (externalFilters) {
			onFiltersChange?.(newFilters);
		} else {
			internalFilters = newFilters;
		}
	}

	// Update search query
	function updateSearchQuery(query: string) {
		const currentFilters = filters;
		updateFilters({ ...currentFilters, searchQuery: query });
	}

	// Format month display
	function formatMonth(date: Date) {
		return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
	}

	// Handle transaction click
	function handleTransactionClick(transaction: Transaction | any) {
		onTransactionClick?.(transaction);
	}

	function formatAmountWithSign(amount: number, showPlus: boolean = false) {
		return currencyFormat.formatWithSign(amount, userCurrency || 'USD', showPlus);
	}

	function getTransactionAmount(transaction: Transaction | any) {
		if (!transaction) {
			return 0;
		}
		return transaction.isGroup ? transaction.totalAmount : (transaction.amount || 0);
	}

	function getTransactionCurrency(transaction: Transaction | any) {
		return transaction?.currency || accounts[transaction?.accountId]?.currency || userCurrency;
	}

	// Selection mode handlers
	function toggleSelectionMode() {
		if (enableSelection) {
			if (externalSelectionMode !== undefined) {
				// External control - notify parent
				// This would need to be handled by parent component
			} else {
				internalSelectionMode = !internalSelectionMode;
				if (!internalSelectionMode) {
					internalSelectedIds = new Set();
					onSelectionChange?.(new Set());
				}
			}
		}
	}

	function toggleTransactionSelection(transactionId: string) {
		if (!enableSelection || !selectionMode) return;
		
		const newSelectedIds = new Set<string>(selectedIds);
		if (newSelectedIds.has(transactionId)) {
			newSelectedIds.delete(transactionId);
		} else {
			newSelectedIds.add(transactionId);
		}
		
		if (externalSelectedIds !== undefined) {
			onSelectionChange?.(newSelectedIds);
		} else {
			internalSelectedIds = newSelectedIds;
			onSelectionChange?.(newSelectedIds);
		}
	}

	function isTransactionSelected(transaction: Transaction | any): boolean {
		const id = transaction.id || transaction.groupId;
		return selectedIds.has(id);
	}
</script>

<div class="transaction-list">
	{#if enableFilters}
		<!-- Filter Bar -->
		<div class="mb-4 bg-background sticky">
			<!-- Desktop Layout -->
			<div class="hidden md:flex items-center gap-2">
				<div class="flex items-center gap-2 flex-1">
					<!-- Search -->
					{#if enableSearch}
						<div class="relative flex-1">
							<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
							<Input
								type="text"
								value={filters.searchQuery}
								oninput={(e) => updateSearchQuery(e.currentTarget.value)}
								placeholder="Search transactions, categories, accounts... (fuzzy search)"
								class="w-full pl-10 pr-4 py-2"
							/>
						</div>
					{/if}
					<!-- Toggle Group -->
					{#if enableBasicToggles}
						<div class="flex items-center gap-2">
							<ToggleGroup.Root type="multiple" bind:value={toggleValues}>
								<ToggleGroup.Item value="pending" size="sm" title="Show pending transactions only">
									<Clock size={16} />
								</ToggleGroup.Item>
								<ToggleGroup.Item value="smart" size="sm" title="Smart grouping (Today, Yesterday, etc.) vs Simple date grouping">
									<Group size={16} />
								</ToggleGroup.Item>
								<ToggleGroup.Item value="date" size="sm" title="Filter by current month">
									<Calendar size={16} />
								</ToggleGroup.Item>
							</ToggleGroup.Root>
						</div>
					{/if}
					<!-- Advanced Filters Button -->
					{#if enableAdvancedFilters}
						<FilterButton 
							activeFilterCount={getActiveFilterCount(filters)} 
							onClick={() => filterSheetOpen = true} 
						/>
					{/if}
				</div>

				<!-- Month Navigation -->
				{#if showDateNavigation}
					<div class="flex items-center gap-1">
						<Button 
							variant="outline" 
							size="square" 
							onclick={goToPreviousMonth}
							disabled={!filters.dateFilterEnabled}
						>
							<ChevronLeft />
						</Button>
						<Button 
							variant="ghost" 
							size="sm" 
							onclick={goToCurrentMonth}
							disabled={!filters.dateFilterEnabled}
						>
							{formatMonth(filters.currentMonth)}
						</Button>
						<Button 
							variant="outline" 
							size="square" 
							onclick={goToNextMonth}
							disabled={!filters.dateFilterEnabled}
						>
							<ChevronRight />
						</Button>
					</div>
				{/if}
			</div>

			<!-- Mobile Layout -->
			<div class="md:hidden space-y-2">
				<!-- Search Row -->
				{#if enableSearch}
					<div class="relative">
						<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
						<Input
							type="text"
							value={filters.searchQuery}
							oninput={(e) => updateSearchQuery(e.currentTarget.value)}
							placeholder="Search transactions, categories, accounts... (fuzzy search)"
							class="w-full pl-10 pr-4 py-2"
						/>
					</div>
				{/if}

				<!-- Toggle and Date Row -->
				<div class="flex items-center gap-2">
					<!-- Toggle Group -->
					{#if enableBasicToggles}
						<div class="flex items-center gap-2">
							<ToggleGroup.Root type="multiple" bind:value={toggleValues}>
								<ToggleGroup.Item value="pending" size="sm" title="Show pending transactions only">
									<Clock />
								</ToggleGroup.Item>
								<ToggleGroup.Item value="smart" size="sm" title="Smart grouping (Today, Yesterday, etc.) vs Simple date grouping">
									<Group />
								</ToggleGroup.Item>
								<ToggleGroup.Item value="date" size="sm" title="Filter by current month">
									<Calendar />
								</ToggleGroup.Item>
							</ToggleGroup.Root>
						</div>
					{/if}
					<!-- Advanced Filters Button (Mobile) -->
					{#if enableAdvancedFilters}
						<FilterButton 
							activeFilterCount={getActiveFilterCount(filters)} 
							onClick={() => filterSheetOpen = true} 
						/>
					{/if}

					<!-- Month Navigation - Full width on mobile -->
					{#if showDateNavigation}
						<div class="flex-1 flex items-center gap-1">
							<Button 
								variant="outline" 
								size="square" 
								onclick={goToPreviousMonth}
								disabled={!filters.dateFilterEnabled}
							>
								<ChevronLeft />
							</Button>
							<Button 
								variant="ghost" 
								size="sm" 
								class="flex-1" 
								onclick={goToCurrentMonth}
								disabled={!filters.dateFilterEnabled}
							>
								{formatMonth(filters.currentMonth)}
							</Button>
							<Button 
								variant="outline" 
								size="square" 
								onclick={goToNextMonth}
								disabled={!filters.dateFilterEnabled}
							>
								<ChevronRight />
							</Button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Filter Sheet -->
	{#if enableAdvancedFilters}
		<FilterSheet
			bind:open={filterSheetOpen}
			filters={filters}
			{accounts}
			{categories}
			{userCurrency}
			activeFilterCount={getActiveFilterCount(filters)}
			onFiltersChange={updateFilters}
			onClearAll={() => {}}
			onApply={() => filterSheetOpen = false}
		/>
	{/if}

	<!-- Compact Summary Stats -->
	{#if showSummary}
		<section class="mb-4">
			<div class="bg-[var(--color-bg-tertiary)] rounded-xl px-5 py-3.5 border border-border">
				<div class="grid grid-cols-3 gap-4 text-center">
					<div>
						<div class="text-amount {summaryStats.income === 0 ? 'text-[var(--color-text-tertiary)]' : 'text-[var(--color-sage-green)]'}">
							{formatAmountWithSign(summaryStats.income, true)}
						</div>
						<div class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mt-0.5">Income</div>
					</div>
					<div>
						<div class="text-amount {summaryStats.expenses === 0 ? 'text-[var(--color-text-tertiary)]' : 'text-foreground'}">{formatAmountWithSign(summaryStats.expenses)}</div>
						<div class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mt-0.5">Expenses</div>
					</div>
					<div>
						<div class="text-amount {summaryStats.net === 0 ? 'text-[var(--color-text-tertiary)]' : (summaryStats.net >= 0 ? 'text-[var(--color-sage-green)]' : 'text-[var(--color-warm-coral)]')}">
							{formatAmountWithSign(summaryStats.net, true)}
						</div>
						<div class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mt-0.5">Net</div>
					</div>
				</div>
			</div>
		</section>
	{/if}

	<!-- Transaction List -->
	<section class="space-y-6">
		{#if filters.searchQuery.trim()}
			<div class="text-center text-sm text-muted-foreground">
				Search results for "{filters.searchQuery}"
			</div>
		{/if}

		{#each filteredTransactions() as dateGroup}
			{@const totals = dateGroupTotals[dateGroup.group.key] ?? { income: 0, expenses: 0, net: 0 }}
			<!-- Date Group Section -->
			<div class="space-y-1">
				<!-- Date Group Header -->
				<div class="flex items-center justify-between px-4 py-2 bg-[var(--color-bg-secondary)] rounded-lg">
					<h3 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">
						{dateGroup.group.label}
					</h3>
					<div class="flex items-center gap-3">
						{#if totals.income > 0}
							<span class="text-amount-sm text-[var(--color-sage-green)]">{formatAmountWithSign(totals.income, true)}</span>
						{/if}
						{#if totals.expenses !== 0}
							<span class="text-amount-sm text-[var(--color-text-secondary)]">{formatAmountWithSign(totals.expenses)}</span>
						{/if}
					</div>
				</div>
				
				<!-- Transactions in this date group -->
				<div class="space-y-1">
					{#each dateGroup.transactions as transactionOrGroup}
						{#if selectionMode}
							<!-- Selection checkbox -->
							<div class="flex items-center gap-2">
								<input
									type="checkbox"
									checked={isTransactionSelected(transactionOrGroup)}
									onchange={() => toggleTransactionSelection(transactionOrGroup.id || transactionOrGroup.groupId || '')}
									class="w-4 h-4"
								/>
								<div class="flex-1">
									{#if transactionOrGroup.isGroup}
										<TransactionItem 
											transaction={transactionOrGroup}
											onClick={handleTransactionClick}
											context="transactions"
											showDate={false}
											isGroup={true}
											groupTransactions={transactionOrGroup.transactions}
											totalAmount={getTransactionAmount(transactionOrGroup)}
											groupDescription={transactionOrGroup.description || 'Grouped Transaction'}
											groupCategory={getCategoryName(transactionOrGroup)}
											groupCurrency={getTransactionCurrency(transactionOrGroup)}
										/>
									{:else}
										<TransactionItem 
											transaction={transactionOrGroup}
											onClick={() => handleTransactionClick(transactionOrGroup)}
											context="transactions"
											showDate={false}
										/>
									{/if}
								</div>
							</div>
						{:else}
							{#if transactionOrGroup.isGroup}
								<!-- Grouped Transaction -->
								<TransactionItem 
									transaction={transactionOrGroup}
									onClick={handleTransactionClick}
									context="transactions"
									showDate={false}
									isGroup={true}
									groupTransactions={transactionOrGroup.transactions}
									totalAmount={getTransactionAmount(transactionOrGroup)}
									groupDescription={transactionOrGroup.description || 'Grouped Transaction'}
									groupCategory={getCategoryName(transactionOrGroup)}
									groupCurrency={getTransactionCurrency(transactionOrGroup)}
								/>
							{:else}
								<!-- Single Transaction -->
								<TransactionItem 
									transaction={transactionOrGroup}
									onClick={() => handleTransactionClick(transactionOrGroup)}
									context="transactions"
									showDate={false}
								/>
							{/if}
						{/if}
					{/each}
				</div>
			</div>
		{/each}
		
		{#if filteredTransactions().reduce((count, group) => count + group.transactions.length, 0) === 0}
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<Receipt class="mb-4 size-8 text-[var(--color-text-disabled)]" />
				<p class="text-sm text-[var(--color-text-secondary)]">
					{#if filters.searchQuery.trim() || getActiveFilterCount(filters) > 0}
						No transactions match your filters.
					{:else}
						Nothing yet. Add your first transaction.
					{/if}
				</p>
				{#if filters.searchQuery.trim() || getActiveFilterCount(filters) > 0}
					<Button
						variant="ghost"
						size="sm"
						class="mt-3 text-[var(--color-text-tertiary)]"
						onclick={() => updateFilters({ searchQuery: '', showPendingOnly: false, dateFilterEnabled: true, groupingMode: 'smart', currentMonth: new Date() })}
					>
						Clear filters
					</Button>
				{:else if onAddTransaction}
					<Button variant="ghost" size="sm" class="mt-3 text-[var(--color-amber)]" onclick={onAddTransaction}>Add transaction</Button>
				{/if}
			</div>
		{/if}
	</section>
</div>
