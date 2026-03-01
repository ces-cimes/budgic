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
import BufferVisualization from '$lib/components/accounts/BufferVisualization.svelte';
import AllowanceVisualization from '$lib/components/accounts/AllowanceVisualization.svelte';
	import EnvelopeBorrowingCard from '$lib/components/budget/EnvelopeBorrowingCard.svelte';
import BalanceProjectionChart from '$lib/components/accounts/BalanceProjectionChart.svelte';
import CreditUtilizationVisualization from '$lib/components/accounts/CreditUtilizationVisualization.svelte';
import InterestOptimizationVisualization from '$lib/components/accounts/InterestOptimizationVisualization.svelte';
import EmergencyFundVisualization from '$lib/components/accounts/EmergencyFundVisualization.svelte';
import FeeAvoidancePanel from '$lib/components/insights/FeeAvoidancePanel.svelte';
	import { planService, negativeAllowanceService } from '$lib/core/services';
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import type { NegativeAllowanceStatus, RecoverySuggestion } from '$lib/core/services/core/negative-allowance-service';

	const { data } = $props<{ data: any }>();

	let account = $state<Account | null>(null);
	let transactions = $state<Transaction[]>([]);
	let isLoading = $state(true);
	let userCurrency = $state<string | null>(null);
	let enhancedAllowance = $state<EnhancedAllowance | null>(null);
	let negativeAllowanceStatus = $state<NegativeAllowanceStatus | null>(null);
	let recoverySuggestions = $state<RecoverySuggestion[]>([]);
	let isLoadingAllowance = $state(false);

	const accountId = $derived($page.params.id);

	onMount(async () => {
		// Load user currency preference first
		const preferences = await userService.getUserPreferences();
		userCurrency = preferences?.currency || null;

		await loadAccount();
		await loadTransactions();
		await loadEnhancedAllowance();
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
				transactions = transactionsData.filter((t) => t && !t.deletedAt);
			}
		} catch (error) {
			console.error('Error loading transactions:', error);
		}
	}

	async function loadEnhancedAllowance() {
		if (!accountId || !account) return;

		isLoadingAllowance = true;
		try {
			enhancedAllowance = await planService.getEnhancedAllowance(accountId);
			if (enhancedAllowance) {
				const prefs = await userService.getUserPreferences();
				const handling = (prefs as { negativeAllowanceHandling?: string }).negativeAllowanceHandling ?? 'allow_with_strong_warning';
				negativeAllowanceStatus = await negativeAllowanceService.checkNegativeAllowance(
					enhancedAllowance,
					handling as 'block_with_warning' | 'allow_with_strong_warning' | 'borrow_from_future' | 'borrow_from_other_categories',
					accountId
				);
				recoverySuggestions = negativeAllowanceStatus.isNegative
					? negativeAllowanceService.getRecoverySuggestions(enhancedAllowance)
					: [];
			} else {
				negativeAllowanceStatus = null;
				recoverySuggestions = [];
			}
		} catch (error) {
			console.error('Error loading enhanced allowance:', error);
		} finally {
			isLoadingAllowance = false;
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
			buttonProps={account
				? [
						{
							text: 'Edit',
							onclick: handleEdit,
							variant: 'outline',
							size: 'sm',
							icon: Pencil,
							className: 'hidden sm:flex'
						}
					]
				: []}
		/>
	{/snippet}

	<div class="container mx-auto max-w-6xl p-2 sm:p-4">
		{#if account && !isLoading}
			<!-- Account Balance Card -->
			<section class="mb-8">
				<div
					class="from-primary to-primary/80 text-primary-foreground rounded-2xl bg-gradient-to-r p-6"
				>
					<div class="flex items-start justify-between">
						<div class="flex-1">
							<h2 class="mb-2 text-lg font-medium">Current Balance</h2>
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
							class="text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/10 sm:hidden"
						>
							<Pencil size={16} />
							<span class="ml-2">Edit</span>
						</Button.Root>
					</div>
				</div>
			</section>

			<!-- Buffer Status -->
			{#if account && (account.type === 'checking' || account.type === 'savings')}
				<section class="mb-8">
					<div class="bg-card border-border rounded-xl border p-6 shadow-sm">
						<h2 class="text-primary mb-4 text-xl font-semibold">Buffer Status</h2>
						<BufferVisualization {account} showDetails={true} />
					</div>
				</section>
			{/if}

			<!-- Credit Utilization -->
			{#if account && account.type === 'credit'}
				<section class="mb-8">
					<div class="bg-card border-border rounded-xl border p-6 shadow-sm">
						<h2 class="text-primary mb-4 text-xl font-semibold">Credit Utilization</h2>
						<CreditUtilizationVisualization {account} showDetails={true} showRecommendations={true} />
					</div>
				</section>
			{/if}

			<!-- Interest Optimization -->
			{#if account && (account.metadata?.interestRate || account.metadata?.apr)}
				<section class="mb-8">
					<div class="bg-card border-border rounded-xl border p-6 shadow-sm">
						<h2 class="text-primary mb-4 text-xl font-semibold">Interest Analysis</h2>
						<InterestOptimizationVisualization {account} showDetails={true} showRecommendations={true} />
					</div>
				</section>
			{/if}

			<!-- Emergency Fund Status -->
			{#if account && account.metadata?.isEmergencyFund}
				<section class="mb-8">
					<div class="bg-card border-border rounded-xl border p-6 shadow-sm">
						<h2 class="text-primary mb-4 text-xl font-semibold">Emergency Fund Status</h2>
						<EmergencyFundVisualization showDetails={true} showRecommendations={true} />
					</div>
				</section>
			{/if}

			<!-- Enhanced Allowance -->
			{#if account && (account.type === 'checking' || account.type === 'savings')}
				<section class="mb-8">
					<div class="bg-card border-border rounded-xl border p-6 shadow-sm">
						<h2 class="text-primary mb-4 text-xl font-semibold">Spending Allowance</h2>
						{#if isLoadingAllowance}
							<div class="text-muted-foreground py-8 text-center">
								Loading allowance calculation...
							</div>
						{:else if enhancedAllowance}
							<AllowanceVisualization
								allowance={enhancedAllowance}
								showDetails={true}
								showRecommendations={true}
								negativeStatus={negativeAllowanceStatus}
								recoverySuggestions={recoverySuggestions}
							/>
							<EnvelopeBorrowingCard
								accountId={account?.id}
								allowance={enhancedAllowance}
								negativeStatus={negativeAllowanceStatus}
								onBorrowCreated={async () => {
									await loadAccount();
								}}
							/>
						{:else}
							<div class="text-muted-foreground py-8 text-center">
								Unable to calculate allowance
							</div>
						{/if}
					</div>
				</section>
			{/if}

			<!-- Balance Projection -->
			{#if account && (account.type === 'checking' || account.type === 'savings')}
				<section class="mb-8">
					<div class="bg-card border-border rounded-xl border p-6 shadow-sm">
						<h2 class="text-primary mb-4 text-xl font-semibold">Balance Projection</h2>
						<BalanceProjectionChart accountId={account.id} daysAhead={90} showDetails={true} />
					</div>
				</section>
			{/if}

			<!-- Fee Avoidance -->
			<section class="mb-8">
				<div class="bg-card border-border rounded-xl border p-6 shadow-sm">
					<h2 class="text-primary mb-4 text-xl font-semibold">Fee Avoidance</h2>
					<FeeAvoidancePanel
						accountId={account.id}
						initialMaxRisks={5}
						onRecommendationApplied={async () => {
							await loadAccount();
							await loadTransactions();
							await loadEnhancedAllowance();
						}}
					/>
				</div>
			</section>

			<!-- Transactions List -->
			<section class="space-y-4">
				<div class="flex items-center justify-between">
					<h2 class="text-primary text-xl font-semibold">Recent Transactions</h2>
					<Button.Root onclick={() => goto('/transactions/add')}>Add Transaction</Button.Root>
				</div>

				{#if transactions.length === 0}
					<div class="bg-card border-border rounded-lg border py-12 text-center">
						<p class="text-muted-foreground mb-4">No transactions found for this account</p>
						<Button.Root onclick={() => goto('/transactions/add')}>
							Add Your First Transaction
						</Button.Root>
					</div>
				{:else}
					<div class="bg-card border-border rounded-lg border">
						{#each transactions.slice(0, 10).filter((t) => t) as transaction (transaction.id)}
							<div class="border-border hover:bg-muted/50 border-b p-4 last:border-b-0">
								<div class="flex items-center justify-between">
									<div>
										<p class="font-medium">{transaction?.description || 'No description'}</p>
										<p class="text-muted-foreground text-sm">
											{formatDate(
												transaction?.clearedDate ||
													transaction?.plannedDate ||
													transaction?.createdAt ||
													''
											)}
										</p>
									</div>
									<div class="text-right">
										<p
											class="font-semibold {(transaction?.amount ?? 0) >= 0
												? 'text-success'
												: 'text-destructive'}"
										>
											{formatBalance(
												transaction?.amount ?? 0,
												transaction?.currency || account?.currency || userCurrency || 'USD'
											)}
										</p>
										<p class="text-muted-foreground text-sm capitalize">
											{transaction?.type || 'unknown'}
										</p>
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
