<script lang="ts">
	import { Plus, Search, ChevronLeft, ChevronRight, Clock, CheckCircle, Calendar, Group } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { transactionService, userService, accountService, budgetService } from '$lib/core/services';
	import { db } from '$lib/core/db';  
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Toggle } from '$lib/components/ui/toggle/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import * as ToggleGroup from "$lib/components/ui/toggle-group/index.ts";
	import TransactionItem from '$lib/components/TransactionItem.svelte';
	import { formatMainCurrencyAmount, formatTransactionAmount, formatSummaryAmount } from '$lib/utils/currency-utils';
	import { useCurrencyFormatting } from '$lib/hooks/use-currency-formatting';
	import { searchTransaction } from '$lib/utils/semantic-search';
	import { getGroupKey, getGroupLabel, type DateGroup, type GroupingMode } from '$lib/utils/date-grouping';
	import Header from '$lib/components/Header.svelte';
	import { PageLayout } from '$lib/components/layouts';

	const { data } = $props<{ data: any }>();

	// Currency formatting hook
	const currencyFormat = useCurrencyFormatting();

	let searchQuery = $state('');
	let showPendingOnly = $state(false);
	let dateFilterEnabled = $state(true);
	let groupingMode = $state<GroupingMode>('smart');
	let currentMonth = $state(new Date());
	let transactions = $state<any[]>([]);
	let accounts = $state<Record<string, any>>({});
	let budgetCategories = $state<Record<string, any>>({});
	let userCurrency = $state<string | null>(null);
	let toggleValues = $state<string[]>(['date', 'smart']); // Initialize with date filter enabled and smart grouping

	// Sync toggle values with individual state variables
	$effect(() => {
		showPendingOnly = toggleValues.includes('pending');
		dateFilterEnabled = toggleValues.includes('date');
		groupingMode = toggleValues.includes('smart') ? 'smart' : 'simple';
	});

	// Enhanced fuzzy search function using semantic search utility
	function fuzzySearch(transaction: any, query: string): { match: boolean; score: number } {
		const result = searchTransaction(
			transaction,
			query,
			getCategoryName,
			getAccountName,
			getTransactionAccountId
		);
		
		return { match: result.match, score: result.score };
	}

	// Derived filtered transactions with fuzzy search and date grouping
	let filteredTransactions = $derived(() => {
		// Filter out null, undefined, or deleted transactions
		let filtered = transactions.filter(t => t && !t.deletedAt);
		
		// Filter by search query using fuzzy search
		if (searchQuery.trim()) {
			filtered = filtered
				.map(t => ({ transaction: t, ...fuzzySearch(t, searchQuery) }))
				.filter(({ match }) => match)
				.sort((a, b) => b.score - a.score) // Sort by relevance score
				.map(({ transaction }) => transaction);
		}
		
		// Filter by pending status
		if (showPendingOnly) {
			filtered = filtered.filter(t => {
				return t.status === 'pending' || t.status === 'planned';
			});
		}
		
		// Filter by month (only if date filtering is enabled)
		if (dateFilterEnabled) {
			const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
			const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);
			
			filtered = filtered.filter(t => {
				const transactionDate = new Date(getTransactionDate(t));
				return transactionDate >= monthStart && transactionDate <= monthEnd;
			});
		}
		
		// Sort by date (most recent first)
		filtered.sort((a, b) => {
			const dateA = new Date(getTransactionDate(a));
			const dateB = new Date(getTransactionDate(b));
			return dateB.getTime() - dateA.getTime();
		});
		
		// Group transactions by groupId first, then by date
		const transactionGroups = new Map<string, any[]>();
		const standaloneTransactions: any[] = [];
		
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
				currency: firstTransaction.currency || accounts[firstTransaction?.accountId]?.currency,
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
		
		// Group by date
		const grouped = new Map<string, { group: DateGroup; transactions: any[] }>();
		
		allTransactions.forEach(transaction => {
			const transactionDate = new Date(getTransactionDate(transaction));
			const groupKey = getGroupKey(transactionDate, groupingMode);
			
			if (!grouped.has(groupKey)) {
				grouped.set(groupKey, {
					group: {
						key: groupKey,
						date: transactionDate,
						label: getGroupLabel(groupKey, groupingMode)
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
		currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
	}

	function goToNextMonth() {
		currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
	}

	function goToCurrentMonth() {
		currentMonth = new Date();
	}

	onMount(async () => {
		try {
			// Load user currency preference first
			const preferences = await userService.getUserPreferences();
			userCurrency = preferences?.currency || null;
			
			// Load accounts and budget categories for name resolution
			const [accountsData, budgetCategoriesData] = await Promise.all([
				accountService.getAccounts(),
				db.getActiveCategories()
			]);
			
			accounts = accountsData.reduce((acc, account) => {
				acc[account.id] = account;
				return acc;
			}, {} as Record<string, any>);
			
			budgetCategories = budgetCategoriesData.reduce((acc, category) => {
				acc[category.id] = category;
				return acc;
			}, {} as Record<string, any>);
			
			console.log('Budget categories loaded:', budgetCategoriesData.length, 'categories');
			
			const transactionsData = await transactionService.getAllTransactions();
			console.log('Raw transactions data:', transactionsData);
			// Filter out any null/undefined or deleted transactions as a safety measure
			transactions = transactionsData.filter(t => t && !t.deletedAt);
			console.log('Processed transactions:', transactions);
		} catch (error) {
			console.error('Error loading transactions:', error);
		}
	});

	// Format month display
	function formatMonth(date: Date) {
		return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
	}

	// Handle transaction click
	function handleTransactionClick(transaction: any) {
		// Navigate to transaction detail or edit page
		const transactionId = transaction.id;
		goto(`/transactions/add/${transactionId}`);
	}

	function formatAmount(amount: number) {
		return currencyFormat.formatBalance(amount, userCurrency || 'USD');
	}

	function formatAmountWithSign(amount: number, showPlus: boolean = false) {
		return currencyFormat.formatWithSign(amount, userCurrency || 'USD', showPlus);
	}

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		if (date.toDateString() === today.toDateString()) {
			return 'Today';
		} else if (date.toDateString() === yesterday.toDateString()) {
			return 'Yesterday';
		} else {
			return date.toLocaleDateString();
		}
	}

	function getCategoryIcon(category: string) {
		const icons: Record<string, string> = {
			'Food & Dining': '🍕',
			'Income': '💰',
			'Transportation': '⛽',
			'Shopping': '🛍️',
			'Entertainment': '🎬',
			'Healthcare': '🏥'
		};
		return icons[category] || '📊';
	}

	function getConfidenceColor(confidence: number) {
		if (confidence >= 90) return 'bg-success';
		if (confidence >= 70) return 'bg-warning';
		return 'bg-alert';
	}

	function getAccountName(accountId: string | undefined | null) {
		if (!accountId) return 'Unassigned Account';
		return accounts[accountId]?.name || 'Unknown Account';
	}

	function getCategoryName(transaction: any) {
		if (!transaction) {
			return 'Unknown';
		}
		// Try to resolve category name from budgetCategories
		if (transaction.categoryId && budgetCategories[transaction.categoryId]) {
			return budgetCategories[transaction.categoryId].name;
		}
		
		// Last resort: format the category ID if it exists
		if (transaction.categoryId) {
			return transaction.categoryId.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
		}
		return 'Uncategorized';
	}

	function getConfidencePercentage(transaction: any) {
		if (transaction.confidence === 'confirmed') return 95;
		if (transaction.confidence === 'expected') return 75;
		if (transaction.confidence === 'estimated') return 50;
		return 0;
	}

	function getTransactionDescription(transaction: any) {
		return transaction?.description || 'No description';
	}

	function getTransactionDate(transaction: any) {
		if (!transaction) {
			// Return a default date if transaction is null/undefined
			return new Date().toISOString();
		}
		return transaction.clearedDate || transaction.plannedDate || transaction.createdAt;
	}

	function getTransactionAmount(transaction: any) {
		if (!transaction) {
			return 0;
		}
		return transaction.isGroup ? transaction.totalAmount : (transaction.amount || 0);
	}

	function getTransactionCurrency(transaction: any) {
		return transaction?.currency || accounts[transaction?.accountId]?.currency || userCurrency;
	}

	function getTransactionAccountId(transaction: any) {
		return transaction?.accountId || null;
	}

	// Function to highlight search terms in text
	function highlightSearchTerm(text: string, query: string): string {
		if (!query.trim()) return text;
		
		const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
		return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">$1</mark>');
	}

</script>

<svelte:head>
	<title>Transactions | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<!-- Header -->
		<Header 
			title="Transactions"
			buttonProps={[
				{
					text: "Add Transaction",
					onclick: () => goto('/transactions/add'),
					size: "sm",
					className: "hidden sm:flex",
					target: "_blank",
					rel: "noopener noreferrer",
					icon: Plus
				}
			]}
		>
		</Header>
	{/snippet}

	<div class="container mx-auto p-2 sm:p-4 max-w-4xl">
	<!-- Filter Bar -->
	<div class="mb-4 bg-background sticky">
		<!-- Desktop Layout -->
		<div class="hidden md:flex items-center gap-2">
			<div class="flex items-center gap-2 flex-1">
				<!-- Search -->
				<div class="relative flex-1">
					<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
					<Input
						type="text"
						bind:value={searchQuery}
						placeholder="Search transactions, categories, accounts... (fuzzy search)"
						class="w-full pl-10 pr-4 py-2"
					/>
				</div>
				<!-- Toggle Group -->
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
			</div>

			<!-- Month Navigation (always visible) -->
			<div class="flex items-center gap-1">
				<Button 
					variant="outline" 
					size="square" 
					onclick={goToPreviousMonth}
					disabled={!dateFilterEnabled}
				>
					<ChevronLeft />
				</Button>
				<Button 
					variant="ghost" 
					size="sm" 
					onclick={goToCurrentMonth}
					disabled={!dateFilterEnabled}
				>
					{formatMonth(currentMonth)}
				</Button>
				<Button 
					variant="outline" 
					size="square" 
					onclick={goToNextMonth}
					disabled={!dateFilterEnabled}
				>
					<ChevronRight />
				</Button>
			</div>
		</div>

		<!-- Mobile Layout -->
		<div class="md:hidden space-y-2">
			<!-- Search Row -->
			<div class="relative">
				<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
				<Input
					type="text"
					bind:value={searchQuery}
					placeholder="Search transactions, categories, accounts... (fuzzy search)"
					class="w-full pl-10 pr-4 py-2"
				/>
			</div>

			<!-- Toggle and Date Row -->
			<div class="flex items-center gap-2">
				<!-- Toggle Group -->
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

				<!-- Month Navigation (always visible) - Full width on mobile -->
				<div class="flex-1 flex items-center gap-1">
					<Button 
						variant="outline" 
						size="square" 
						onclick={goToPreviousMonth}
						disabled={!dateFilterEnabled}
					>
						<ChevronLeft />
					</Button>
					<Button 
						variant="ghost" 
						size="sm" 
						class="flex-1" 
						onclick={goToCurrentMonth}
						disabled={!dateFilterEnabled}
					>
						{formatMonth(currentMonth)}
					</Button>
					<Button 
						variant="outline" 
						size="square" 
						onclick={goToNextMonth}
						disabled={!dateFilterEnabled}
					>
						<ChevronRight />
					</Button>
				</div>
			</div>
		</div>
	</div>

	<!-- Compact Summary Stats -->
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

	<!-- Transaction List -->
	<section class="space-y-6">
		{#if searchQuery.trim()}
			<div class="text-center text-sm text-muted-foreground">
				Search results for "{searchQuery}"
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
								groupDescription={getTransactionDescription(transactionOrGroup)}
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
</PageLayout> 