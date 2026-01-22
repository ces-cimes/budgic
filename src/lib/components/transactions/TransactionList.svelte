<script lang="ts">
	import { Search, ChevronLeft, ChevronRight, Clock, Calendar, Group } from '@lucide/svelte';
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

	// Filter state interface
	export interface FilterState {
		searchQuery: string;
		showPendingOnly: boolean;
		dateFilterEnabled: boolean;
		groupingMode: GroupingMode;
		currentMonth: Date;
		// Advanced filters can be added here later
		accountIds?: string[];
		categoryIds?: string[];
		status?: string[];
		minAmount?: number;
		maxAmount?: number;
		dateRange?: { start: Date; end: Date };
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
		
		// Apply advanced filters if provided
		if (currentFilters.accountIds && currentFilters.accountIds.length > 0) {
			filtered = filtered.filter(t => t.accountId && currentFilters.accountIds!.includes(t.accountId));
		}
		
		if (currentFilters.categoryIds && currentFilters.categoryIds.length > 0) {
			filtered = filtered.filter(t => t.categoryId && currentFilters.categoryIds!.includes(t.categoryId));
		}
		
		if (currentFilters.status && currentFilters.status.length > 0) {
			filtered = filtered.filter(t => currentFilters.status!.includes(t.status));
		}
		
		if (currentFilters.minAmount !== undefined) {
			filtered = filtered.filter(t => {
				const amount = t.amount || 0;
				return Math.abs(amount) >= currentFilters.minAmount!;
			});
		}
		
		if (currentFilters.maxAmount !== undefined) {
			filtered = filtered.filter(t => {
				const amount = t.amount || 0;
				return Math.abs(amount) <= currentFilters.maxAmount!;
			});
		}
		
		if (currentFilters.dateRange) {
			filtered = filtered.filter(t => {
				const transactionDate = new Date(getTransactionDate(t));
				return transactionDate >= currentFilters.dateRange!.start && transactionDate <= currentFilters.dateRange!.end;
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
						<Button variant="outline" size="sm">
							<!-- FilterButton component would go here -->
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
							</svg>
						</Button>
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

	<!-- Compact Summary Stats -->
	{#if showSummary}
		<section class="mb-4">
			<div class="bg-card rounded-xl p-4 shadow-sm border border-border">
				<div class="grid grid-cols-3 gap-4 text-center">
					<div>
						<div class="text-base font-bold {summaryStats.income === 0 ? 'text-primary' : 'text-[var(--color-sage-green)]'}">
							{formatAmountWithSign(summaryStats.income, true)}
						</div>
						<div class="text-xs text-tertiary">Income</div>
					</div>
					<div>
						<div class="text-base font-bold {summaryStats.expenses === 0 ? 'text-primary' : 'text-[var(--color-warm-coral)]'}">{formatAmountWithSign(summaryStats.expenses)}</div>
						<div class="text-xs text-tertiary">Expenses</div>
					</div>
					<div>
						<div class="text-base font-bold {summaryStats.net === 0 ? 'text-primary' : (summaryStats.net >= 0 ? 'text-[var(--color-sage-green)]' : 'text-[var(--color-warm-coral)]')}">
							{formatAmountWithSign(summaryStats.net, true)}
						</div>
						<div class="text-xs text-tertiary">Net</div>
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
				<!-- Date Group Header with Transaction Count -->
				<div class="flex items-center justify-between px-1">
					<h3 class="text-lg font-semibold text-primary">
						{dateGroup.group.label}
					</h3>
					<div class="flex items-center space-x-2">
						<span class="text-xs text-muted-foreground">{dateGroup.transactions.length}tx</span>
						<div class="flex space-x-1">
							<span class="px-2 py-1 rounded-full {totals.income === 0 ? 'bg-muted text-primary' : 'bg-[var(--color-sage-green)]/10 text-[var(--color-sage-green)]'} text-xs font-medium">
								{formatAmountWithSign(totals.income, true)}
							</span>
							<span class="px-2 py-1 rounded-full {totals.expenses === 0 ? 'bg-muted text-primary' : 'bg-[var(--color-warm-coral)]/10 text-[var(--color-warm-coral)]'} text-xs font-medium">
								{formatAmountWithSign(totals.expenses)}
							</span>
						</div>
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
			<div class="bg-card rounded-2xl shadow-sm border border-border">
				<div class="p-8 text-center text-muted-foreground">
					<div class="text-lg mb-2">No transactions found</div>
					<div class="text-sm">Try adjusting your filters or add a new transaction</div>
				</div>
			</div>
		{/if}
	</section>
</div>
