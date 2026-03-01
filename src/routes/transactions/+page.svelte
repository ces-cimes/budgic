<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { transactionService, userService, accountService } from '$lib/core/services';
	import { db } from '$lib/core/db';
	import TransactionList from '$lib/components/transactions/TransactionList.svelte';
	import Header from '$lib/components/Header.svelte';
	import Fab from '$lib/components/Fab.svelte';
	import { PageLayout } from '$lib/components/layouts';
	import type { Transaction, Account, Category } from '$lib/core/db';

	const { data } = $props<{ data: any }>();

	let transactions = $state<Transaction[]>([]);
	let accounts = $state<Record<string, Account>>({});
	let budgetCategories = $state<Record<string, Category>>({});
	let userCurrency = $state<string | null>(null);
	let isLoading = $state(true);

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

			const transactionsData = await transactionService.getAllTransactions();
			transactions = transactionsData.filter((t) => t && !t.deletedAt);
		} catch (error) {
			console.error('Error loading transactions:', error);
		} finally {
			isLoading = false;
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
		{#if isLoading}
			<div class="bg-card border-border flex min-h-[200px] items-center justify-center rounded-xl border p-8">
				<div class="text-muted-foreground flex flex-col items-center gap-3 text-center">
					<div class="bg-muted h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
					<p class="text-sm">Loading transactions…</p>
				</div>
			</div>
		{:else}
		<TransactionList
			{transactions}
			{accounts}
			categories={budgetCategories}
			{userCurrency}
			onTransactionClick={handleTransactionClick}
			onAddTransaction={() => goto('/transactions/add')}
			enableFilters={true}
			enableSearch={true}
			enableBasicToggles={true}
			enableAdvancedFilters={true}
			displayMode="detailed"
			groupingMode="smart"
			showSummary={true}
			showDateNavigation={true}
		/>
		{/if}
	</div>

	<Fab
		position="bottom-right"
		size="md"
		variant="default"
		onclick={() => goto('/transactions/add')}
	>
		{#snippet children()}
			<Plus />
		{/snippet}
	</Fab>
</PageLayout> 