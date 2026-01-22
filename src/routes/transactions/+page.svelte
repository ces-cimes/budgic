<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { transactionService, userService, accountService } from '$lib/core/services';
	import { db } from '$lib/core/db';  
	import TransactionList from '$lib/components/transactions/TransactionList.svelte';
	import Header from '$lib/components/Header.svelte';
	import { PageLayout } from '$lib/components/layouts';
	import type { Transaction, Account, Category } from '$lib/core/db';

	const { data } = $props<{ data: any }>();

	let transactions = $state<Transaction[]>([]);
	let accounts = $state<Record<string, Account>>({});
	let budgetCategories = $state<Record<string, Category>>({});
	let userCurrency = $state<string | null>(null);

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
			}, {} as Record<string, Account>);
			
			budgetCategories = budgetCategoriesData.reduce((acc, category) => {
				acc[category.id] = category;
				return acc;
			}, {} as Record<string, Category>);
			
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

	// Handle transaction click
	function handleTransactionClick(transaction: Transaction) {
		// Navigate to transaction detail or edit page
		const transactionId = transaction.id;
		goto(`/transactions/add/${transactionId}`);
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
		<TransactionList
			{transactions}
			{accounts}
			categories={budgetCategories}
			{userCurrency}
			onTransactionClick={handleTransactionClick}
			enableFilters={true}
			enableSearch={true}
			enableBasicToggles={true}
			enableAdvancedFilters={false}
			displayMode="detailed"
			groupingMode="smart"
			showSummary={true}
			showDateNavigation={true}
		/>
	</div>
</PageLayout> 