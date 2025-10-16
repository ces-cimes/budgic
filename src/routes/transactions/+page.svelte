<script lang="ts">
	import { Plus, Search, ChevronLeft, ChevronRight, Clock, CheckCircle, Calendar, Group } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { transactionService, settingsService, accountService, budgetService } from '$lib/core/services';
	import { calculateTransactionImpact } from '$lib/core/db';  
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
	import { PageLayout, MobileNavigation } from '$lib/components/layouts';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';

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
	let userCurrency = $state<string>('USD');
	let toggleValues = $state<string[]>(['date', 'smart']); // Initialize with date filter enabled and smart grouping

	// Sidebar context for mobile detection
	const sidebar = Sidebar.useSidebar();

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
		let filtered = [...transactions];
		
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
				const transaction = t.representative || t;
				return transaction.status === 'pending' || transaction.status === 'planned';
			});
		}
		
		// Filter by month (only if date filtering is enabled)
		if (dateFilterEnabled) {
			const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
			const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);
			
			filtered = filtered.filter(t => {
				const transaction = t.representative || t;
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
		
		// Group by date
		const grouped = new Map<string, { group: DateGroup; transactions: any[] }>();
		
		filtered.forEach(transaction => {
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

	// Derived summary stats
	let summaryStats = $derived(() => {
		// Flatten the grouped transactions for stats calculation
		const allTransactions = filteredTransactions().flatMap(group => group.transactions);
		
		// Calculate income: sum of positive income transactions + negative income transactions (both contribute to income total)
		// Exclude transfers as they are internal movements between accounts
		const income = allTransactions
			.filter(t => (t.representative || t).type === 'income')
			.reduce((sum, t) => {
				const amount = t.totalAmount || t.amount || 0;
				return sum + amount; // Income can be positive or negative
			}, 0);
		
		// Calculate expenses: sum of positive expense transactions + negative expense transactions (both contribute to expense total)
		// Exclude transfers as they are internal movements between accounts
		const expenses = allTransactions
			.filter(t => (t.representative || t).type === 'expense')
			.reduce((sum, t) => {
				const amount = t.totalAmount || t.amount || 0;
				return sum + amount; // Expenses can be positive or negative
			}, 0);
		
		// Calculate net using the proper transaction impact calculation
		// For transfers, use the amount directly since they are internal movements
		const net = allTransactions.reduce((sum, t) => {
			const transaction = t.representative || t;
			const amount = t.totalAmount || t.amount || 0;
			
			// For transfers, use the amount directly (they are internal movements)
			if (transaction.type === 'transfer') {
				return sum + amount;
			}
			
			// For other transactions, use the proper impact calculation
			return sum + calculateTransactionImpact({ ...transaction, amount });
		}, 0);
		
		return { income, expenses, net };
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
			userCurrency = await settingsService.getCurrency();
			
			// Load accounts and budget categories for name resolution
			const [accountsData, budgetCategoriesData] = await Promise.all([
				accountService.getAccounts(),
				budgetService.getTransactionBudgetCategories()
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
			
			const transactionsData = await transactionService.getTransactions();
			console.log('Raw transactions data:', transactionsData);
			transactions = transactionsData;
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
		const transactionId = transaction.representative?.id || transaction.id;
		goto(`/transactions/add/${transactionId}`);
	}

	function formatAmount(amount: number) {
		return currencyFormat.formatBalance(amount, userCurrency);
	}

	function formatAmountWithSign(amount: number, showPlus: boolean = false) {
		return currencyFormat.formatWithSign(amount, userCurrency, showPlus);
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

	function getAccountName(accountId: string) {
		return accounts[accountId]?.name || 'Unknown Account';
	}

	function getCategoryName(transactionOrGroup: any) {
		const transaction = transactionOrGroup.representative || transactionOrGroup;
		
		// First try to resolve budget category name
		if (transaction.budgetCategoryId && budgetCategories[transaction.budgetCategoryId]) {
			return budgetCategories[transaction.budgetCategoryId].name;
		}
		
		// Fallback to whatTag if available
		if (transaction.whatTag) {
			return transaction.whatTag.charAt(0).toUpperCase() + transaction.whatTag.slice(1).replace(/_/g, ' ');
		}
		
		// Last resort: format the budget category ID if it exists
		if (transaction.budgetCategoryId) {
			return transaction.budgetCategoryId.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
		}
		return 'Uncategorized';
	}

	function getConfidencePercentage(transactionOrGroup: any) {
		const transaction = transactionOrGroup.representative || transactionOrGroup;
		if (transaction.confidence === 'confirmed') return 95;
		if (transaction.confidence === 'expected') return 75;
		if (transaction.confidence === 'estimated') return 50;
		return 0;
	}

	function getTransactionDescription(transactionOrGroup: any) {
		const transaction = transactionOrGroup.representative || transactionOrGroup;
		return transaction.description || 'No description';
	}

	function getTransactionDate(transactionOrGroup: any) {
		const transaction = transactionOrGroup.representative || transactionOrGroup;
		return transaction.clearedDate || transaction.plannedDate || transaction.createdAt;
	}

	function getTransactionAmount(transactionOrGroup: any) {
		return transactionOrGroup.totalAmount || transactionOrGroup.amount || 0;
	}

	function getTransactionCurrency(transactionOrGroup: any) {
		const transaction = transactionOrGroup.representative || transactionOrGroup;
		return transaction.currency || userCurrency;
	}

	function getTransactionAccountId(transactionOrGroup: any) {
		return (transactionOrGroup.commonFields || transactionOrGroup).accountId;
	}

	// Calculate totals for a date group
	function calculateDateGroupTotals(transactions: any[]) {
		// Calculate income: sum of all income transactions (positive and negative)
		const income = transactions
			.filter(t => (t.representative || t).type === 'income')
			.reduce((sum, t) => {
				const amount = t.totalAmount || t.amount || 0;
				return sum + amount; // Income can be positive or negative
			}, 0);
		
		// Calculate expenses: sum of all expense transactions (positive and negative)
		const expenses = transactions
			.filter(t => (t.representative || t).type === 'expense')
			.reduce((sum, t) => {
				const amount = t.totalAmount || t.amount || 0;
				return sum + amount; // Expenses can be positive or negative
			}, 0);
		
		// Calculate net using the proper transaction impact calculation
		// For transfers, use the amount directly since they are internal movements
		const net = transactions.reduce((sum, t) => {
			const transaction = t.representative || t;
			const amount = t.totalAmount || t.amount || 0;
			
			// For transfers, use the amount directly (they are internal movements)
			if (transaction.type === 'transfer') {
				return sum + amount;
			}
			
			// For other transactions, use the proper impact calculation
			return sum + calculateTransactionImpact({ ...transaction, amount });
		}, 0);
		
		return { income, expenses, net };
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
			<div class="text-sm text-muted-foreground">
				Showing 5 transactions
		  	</div>
		</Header>
	{/snippet}

	{#snippet bottomBar()}
		<!-- Mobile Navigation -->
		{#if sidebar.isMobile}
			<MobileNavigation />
		{/if}
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
					<div class="text-base font-bold
						{summaryStats().income === 0 ? 
							'text-primary' : 
							'text-[var(--color-sage-green)]'
						}"
					>
							{formatAmountWithSign(summaryStats().income, true)}
					</div>
					<div class="text-xs text-tertiary">Income</div>
				</div>
				<div>
					<div class="text-base font-bold {summaryStats().expenses === 0 ? 'text-primary' : 'text-[var(--color-warm-coral)]'}">{formatAmountWithSign(summaryStats().expenses)}</div>
					<div class="text-xs text-tertiary">Expenses</div>
				</div>
				<div>
					<div class="text-base font-bold {summaryStats().net === 0 ? 'text-primary' : (summaryStats().net >= 0 ? 'text-[var(--color-sage-green)]' : 'text-[var(--color-warm-coral)]')}">
						{formatAmountWithSign(summaryStats().net, true)}
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
			{@const totals = calculateDateGroupTotals(dateGroup.transactions)}
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
						{#if transactionOrGroup.type === 'split'}
							<!-- Split Transaction Group -->
							<TransactionItem 
								transaction={transactionOrGroup.representative || transactionOrGroup}
								onClick={handleTransactionClick}
								context="transactions"
								showDate={false}
								isSplitGroup={true}
								splitTransactions={transactionOrGroup.transactions}
								totalAmount={getTransactionAmount(transactionOrGroup)}
								splitDescription={getTransactionDescription(transactionOrGroup)}
								splitCategory={getCategoryName(transactionOrGroup)}
								splitCurrency={getTransactionCurrency(transactionOrGroup)}
							/>
						{:else}
							<!-- Single Transaction -->
							<TransactionItem 
								transaction={transactionOrGroup.representative || transactionOrGroup}
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