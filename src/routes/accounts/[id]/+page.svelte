<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as Button from '$lib/components/ui/button/index.ts';
	import { accountService, transactionService, userService } from '$lib/core/services';
	import type { Account, Transaction } from '$lib/core/db';
	import { page } from '$app/stores';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { Pencil } from '@lucide/svelte';

	const { data } = $props<{ data: any }>();

	let account = $state<Account | null>(null);
	let transactions = $state<Transaction[]>([]);
	let isLoading = $state(true);
	let userCurrency = $state<string>('USD');

	const accountId = $derived($page.params.id);

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
				const transactionsData = await transactionService.getTransactionsByAccount(accountId);
				// Filter out any null/undefined or deleted transactions as a safety measure
				transactions = transactionsData.filter(t => t && !t.deletedAt);
			}
		} catch (error) {
			console.error('Error loading transactions:', error);
		}
	}

	function handleEdit() {
		if (account) {
			goto(`/accounts/add/${account.id}`);
		}
	}

	function formatBalance(balance: number, currency: string) {
		return formatTransactionAmount(balance, currency, true);
	}

	function formatDate(dateString: string) {
		if (!dateString) return 'No date';
		try {
			return new Date(dateString).toLocaleDateString();
		} catch {
			return 'Invalid date';
		}
	}

</script>

<svelte:head>
	<title>{account ? `${account.name} | Budgic` : 'Account | Budgic'}</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header 
			title={account ? account.name : 'Account'}
			showBackButton={true}
			backButtonLink="/accounts"
			backButtonLabel="Back to Accounts"
			buttonProps={account ? [{
				text: 'Edit',
				onclick: handleEdit,
				variant: 'outline',
				size: 'sm',
				icon: Pencil,
				className: 'hidden sm:flex'
			}] : []}
		/>
	{/snippet}

	<div class="container mx-auto px-4 py-4 md:py-6 max-w-6xl">
	{#if account && !isLoading}
		<!-- Account Balance Card -->
		<section class="mb-8">
			<div class="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-6 text-primary-foreground">
				<div class="flex items-start justify-between">
					<div class="flex-1">
						<h2 class="text-lg font-medium mb-2">Current Balance</h2>
						<div class="text-4xl font-bold">
							{formatBalance(account.currentBalance, account.currency)}
						</div>
						<p class="text-primary-foreground/70 mt-2">
							Initial balance: {formatBalance(account.initialBalance, account.currency)}
						</p>
					</div>
					<!-- Edit button for mobile -->
					<Button.Root
						variant="outline"
						size="sm"
						onclick={handleEdit}
						class="sm:hidden text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/10"
					>
						<Pencil size={16} />
						<span class="ml-2">Edit</span>
					</Button.Root>
				</div>
			</div>
		</section>

		<!-- Transactions List -->
		<section class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-semibold text-primary">Recent Transactions</h2>
				<Button.Root onclick={() => goto('/transactions/add')}>
					Add Transaction
				</Button.Root>
			</div>

			{#if transactions.length === 0}
				<div class="text-center py-12 bg-card rounded-lg border border-border">
					<p class="text-muted-foreground mb-4">No transactions found for this account</p>
					<Button.Root onclick={() => goto('/transactions/add')}>
						Add Your First Transaction
					</Button.Root>
				</div>
			{:else}
				<div class="bg-card rounded-lg border border-border">
					{#each transactions.slice(0, 10).filter(t => t) as transaction (transaction.id)}
						<div class="p-4 border-b border-border last:border-b-0 hover:bg-muted/50">
							<div class="flex items-center justify-between">
								<div>
									<p class="font-medium">{transaction?.description || 'No description'}</p>
									<p class="text-sm text-muted-foreground">
										{formatDate(transaction?.clearedDate || transaction?.plannedDate || transaction?.createdAt || '')}
									</p>
								</div>
								<div class="text-right">
									<p class="font-semibold {((transaction?.amount ?? 0) >= 0 ? 'text-success' : 'text-destructive')}">
										{formatBalance(transaction?.amount ?? 0, transaction?.currency || 'USD')}
									</p>
									<p class="text-sm text-muted-foreground capitalize">{transaction?.type || 'unknown'}</p>
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
		</section>
	{/if}
	</div>
</PageLayout> 