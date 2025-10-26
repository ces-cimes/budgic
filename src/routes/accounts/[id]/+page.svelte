<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as Button from '$lib/components/ui/button/index.ts';
	import * as Tabs from '$lib/components/ui/tabs/index.ts';
	import { accountService, transactionService, userService } from '$lib/core/services';
	import AccountForm from '$lib/components/AccountForm.svelte';
	import type { Account, Transaction } from '$lib/core/db';
	import { page } from '$app/stores';
	import { formatAmount, formatTransactionAmount } from '$lib/utils/currency-utils';
	import { PageLayout } from '$lib/components/layouts';

	const { data } = $props<{ data: any }>();

	let account = $state<Account | null>(null);
	let transactions = $state<Transaction[]>([]);
	let isLoading = $state(true);
	let isEditing = $state(false);
	let activeTab = $state('transactions');
	let userCurrency = $state<string>('USD');


	const accountId = $derived($page.params.id);

	const accountIcons = {
		checking: '🏦',
		savings: '💰',
		credit: '💳',
		cash: '💵',
		investment: '📈',
		crypto: '₿'
	};

	onMount(async () => {
		// Load user currency preference first
		const preferences = await userService.getUserPreferences();
		userCurrency = preferences?.currency || 'USD';
		
		await loadAccount();
		await loadTransactions();
	});

	async function loadAccount() {
		try {
			if (accountId) {
				const accountData = await accountService.getAccount(accountId);
				account = accountData || null;
				if (!account) {
					// Account not found, redirect to accounts list
					goto('/accounts');
					return;
				}
			}
		} catch (error) {
			console.error('Error loading account:', error);
			goto('/accounts');
		} finally {
			isLoading = false;
		}
	}

	async function loadTransactions() {
		try {
			if (accountId) {
				transactions = await transactionService.getTransactionsByAccount(accountId);
			}
		} catch (error) {
			console.error('Error loading transactions:', error);
		}
	}

	async function handleUpdateAccount(accountData: Partial<Account>) {
		if (!account) return;
		
		try {
			await accountService.updateAccount(account.id, accountData);
			await loadAccount(); // Reload account data
			isEditing = false;
		} catch (error) {
			console.error('Failed to update account:', error);
			throw error; // Let the form component handle the error
		}
	}

	function handleCancelEdit() {
		isEditing = false;
	}

	function formatBalance(balance: number, currency: string) {
		return formatTransactionAmount(balance, currency, true);
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString();
	}

	function goBack() {
		goto('/accounts');
	}
</script>

<svelte:head>
	<title>{account ? `${account.name} | Budgic` : 'Account | Budgic'}</title>
</svelte:head>

<PageLayout>
	

	<div class="container mx-auto px-4 py-6 max-w-6xl">
	<!-- Header -->
	<header class="mb-8">
		<Button.Root 
			variant="ghost"
			onclick={goBack}
			class="flex items-center space-x-2 text-muted-foreground hover:text-primary mb-4"
		>
			<span>←</span>
			<span>Back to Accounts</span>
		</Button.Root>
		
		{#if isLoading}
			<div class="animate-pulse">
				<div class="h-8 bg-muted rounded w-1/3 mb-2"></div>
				<div class="h-4 bg-muted rounded w-1/2"></div>
			</div>
		{:else if account}
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-3xl font-bold text-primary mb-2">{account.name}</h1>
					<div class="flex items-center space-x-4 text-muted-foreground">
						<span class="flex items-center space-x-2">
							<span class="text-xl">{accountIcons[account.type]}</span>
							<span class="capitalize">{account.type}</span>
						</span>
						<span>•</span>
						<span>{account.currency}</span>
					</div>
				</div>
				<Button.Root
					variant="outline"
					onclick={() => isEditing = !isEditing}
				>
					{isEditing ? 'Cancel Edit' : 'Edit Account'}
				</Button.Root>
			</div>
		{/if}
	</header>

	{#if account && !isLoading}
		<!-- Account Balance Card -->
		<section class="mb-8">
			<div class="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-6 text-primary-foreground">
				<h2 class="text-lg font-medium mb-2">Current Balance</h2>
				<div class="text-4xl font-bold">
					{formatBalance(account.currentBalance, account.currency)}
				</div>
				<p class="text-primary-foreground/70 mt-2">
					Initial balance: {formatBalance(account.initialBalance, account.currency)}
				</p>
			</div>
		</section>

		<!-- Tabs -->
		<Tabs.Root value={activeTab} onValueChange={(value) => activeTab = value}>
			<Tabs.List class="grid w-full grid-cols-2 mb-8">
				<Tabs.Trigger value="transactions">Transactions</Tabs.Trigger>
				<Tabs.Trigger value="edit">Edit Account</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="transactions" class="space-y-4">
				<div class="flex items-center justify-between">
					<h2 class="text-xl font-semibold text-primary">Recent Transactions</h2>
					<Button.Root onclick={() => goto('/transactions/add')}>
						Add Transaction
					</Button.Root>
				</div>

				{#if transactions.length === 0}
					<div class="text-center py-12">
						<p class="text-muted-foreground mb-4">No transactions found for this account</p>
						<Button.Root onclick={() => goto('/transactions/add')}>
							Add Your First Transaction
						</Button.Root>
					</div>
				{:else}
					<div class="bg-card rounded-lg border border-border">
						{#each transactions.slice(0, 10) as transaction}
							<div class="p-4 border-b border-border last:border-b-0 hover:bg-muted/50">
								<div class="flex items-center justify-between">
									<div>
										<p class="font-medium">{transaction.description || 'No description'}</p>
										<p class="text-sm text-muted-foreground">
											{formatDate(transaction.clearedDate || transaction.plannedDate || transaction.createdAt)}
										</p>
									</div>
									<div class="text-right">
										<p class="font-semibold {(transaction.amount ?? 0) >= 0 ? 'text-success' : 'text-destructive'}">
											{formatBalance(transaction.amount ?? 0, transaction.currency)}
										</p>
										<p class="text-sm text-muted-foreground capitalize">{transaction.type}</p>
									</div>
								</div>
							</div>
						{/each}
					</div>
					
					{#if transactions.length > 10}
						<div class="text-center">
							<Button.Root variant="outline" onclick={() => goto('/transactions')}>
								View All Transactions
							</Button.Root>
						</div>
					{/if}
				{/if}
			</Tabs.Content>

			<Tabs.Content value="edit">
				<div class="max-w-2xl">
					<h2 class="text-xl font-semibold text-primary mb-6">Edit Account</h2>
					<AccountForm 
						account={account}
						onSubmit={handleUpdateAccount}
						onCancel={handleCancelEdit}
						submitLabel="Update Account"
						cancelLabel="Cancel"
					/>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	{/if}
	</div>
</PageLayout> 