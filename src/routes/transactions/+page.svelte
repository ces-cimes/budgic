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
		<Header 
			title="Transactions"
			buttonProps={[
				{
					text: "Add transaction",
					onclick: () => goto('/transactions/add'),
					size: "sm",
					className: "hidden sm:flex",
					icon: Plus
				}
			]}
		/>
	{/snippet}

	<div class="mx-auto max-w-4xl px-5 sm:px-6 py-4">
		{#if isLoading}
			<!-- Skeleton loading state — no spinners -->
			<div class="mb-4 squircle-2xl squircle-border squircle-fill-tertiary px-5 py-3.5">
				<div class="grid grid-cols-3 gap-4">
					{#each [1, 2, 3] as _}
						<div class="flex flex-col items-center gap-1.5">
							<div class="h-4 w-16 animate-pulse rounded bg-[var(--color-bg-surface)]"></div>
							<div class="h-2.5 w-10 animate-pulse rounded bg-[var(--color-bg-surface)]"></div>
						</div>
					{/each}
				</div>
			</div>
			<div class="space-y-2">
				{#each [1, 2, 3, 4, 5, 6, 7, 8] as i}
					<div
						class="flex items-center gap-3 squircle-2xl squircle-border squircle-fill-tertiary px-4 py-3"
						style="animation-delay: {i * 40}ms"
					>
						<div class="size-9 shrink-0 animate-pulse rounded-full bg-[var(--color-bg-surface)]"></div>
						<div class="flex-1 space-y-2">
							<div class="h-3.5 w-2/3 animate-pulse rounded bg-[var(--color-bg-surface)]"></div>
							<div class="h-2.5 w-1/3 animate-pulse rounded bg-[var(--color-bg-surface)]"></div>
						</div>
						<div class="h-3.5 w-14 animate-pulse rounded bg-[var(--color-bg-surface)]"></div>
					</div>
				{/each}
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