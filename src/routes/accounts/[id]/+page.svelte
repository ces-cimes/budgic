<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as Button from '$lib/components/ui/button/index.ts';
	import {
		accountService,
		transactionService,
		userService,
		reconciliationService,
		insightsService
	} from '$lib/core/services';
	import type { Account, Insight, Transaction } from '$lib/core/db';
	import InlineAlertBadge from '$lib/components/InlineAlertBadge.svelte';
	import { page } from '$app/stores';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { formatTransferLabel } from '$lib/utils/transfer-utils';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { Pencil, Scale } from '@lucide/svelte';
	import BufferVisualization from '$lib/components/accounts/BufferVisualization.svelte';
	import AllowanceVisualization from '$lib/components/accounts/AllowanceVisualization.svelte';
	import EnvelopeBorrowingCard from '$lib/components/budget/EnvelopeBorrowingCard.svelte';
	import CountUpHero from '$lib/components/CountUpHero.svelte';
	import BalanceProjectionChart from '$lib/components/accounts/BalanceProjectionChart.svelte';
	import CreditUtilizationVisualization from '$lib/components/accounts/CreditUtilizationVisualization.svelte';
	import InterestOptimizationVisualization from '$lib/components/accounts/InterestOptimizationVisualization.svelte';
	import EmergencyFundVisualization from '$lib/components/accounts/EmergencyFundVisualization.svelte';
	import FeeAvoidancePanel from '$lib/components/insights/FeeAvoidancePanel.svelte';
	import UpdateBalanceSheet from '$lib/components/accounts/UpdateBalanceSheet.svelte';
	import { passiveAccountService } from '$lib/core/services';
	import { planService, negativeAllowanceService } from '$lib/core/services';
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import type {
		NegativeAllowanceStatus,
		RecoverySuggestion
	} from '$lib/core/services/core/negative-allowance-service';

	const { data } = $props<{ data: any }>();

	let account = $state<Account | null>(null);
	let transactions = $state<Transaction[]>([]);
	let isLoading = $state(true);
	let userCurrency = $state<string | null>(null);
	let enhancedAllowance = $state<EnhancedAllowance | null>(null);
	let negativeAllowanceStatus = $state<NegativeAllowanceStatus | null>(null);
	let recoverySuggestions = $state<RecoverySuggestion[]>([]);
	let isLoadingAllowance = $state(false);
	let reconciliationSummary = $state<{
		lastReconciledDate: string | null;
		daysSinceLastReconciliation: number;
		unresolvedDiscrepancies: number;
	} | null>(null);
	let accountInlineInsights = $state<Insight[]>([]);
	let accountsLookup = $state<Account[]>([]);
	let overdraftChip = $state<string | null>(null);
	let repaymentChip = $state<string | null>(null);
	let updateBalanceOpen = $state(false);
	let taxWithheldYtd = $state<number | null>(null);

	const accountId = $derived($page.params.id);

	onMount(async () => {
		// Load user currency preference first
		const preferences = await userService.getUserPreferences();
		userCurrency = preferences?.currency || null;

		await loadAccount();
		try {
			accountsLookup = await accountService.getAccounts();
		} catch {
			accountsLookup = [];
		}
		await loadTransactions();
		await loadAccountInlineInsights();
		await loadEnhancedAllowance();
		if (accountId) {
			try {
				const summary = await reconciliationService.getReconciliationSummary(accountId);
				reconciliationSummary = {
					lastReconciledDate: summary.lastReconciledDate ?? null,
					daysSinceLastReconciliation: summary.daysSinceLastReconciliation,
					unresolvedDiscrepancies: summary.unresolvedDiscrepancies ?? 0
				};
			} catch {
				reconciliationSummary = null;
			}
		}
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
				try {
					taxWithheldYtd = await accountService.getTaxWithheldYtdForAccount(accountId);
				} catch {
					taxWithheldYtd = null;
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
				if (
					account?.type === 'checking' &&
					account.overdraftFacility &&
					account.currentBalance < 0
				) {
					if (account.overdraftStartedAt) {
						const deadline = new Date(
							new Date(account.overdraftStartedAt).getTime() +
								account.overdraftFacility.gracePeriodDays * 86400000
						);
						const days = Math.max(
							0,
							Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
						);
						overdraftChip =
							days === 0
								? `Overdraft overdue: ${formatTransactionAmount(Math.abs(account.currentBalance), account.currency)}`
								: `Overdraft - due in ${days} day${days === 1 ? '' : 's'}: ${formatTransactionAmount(Math.abs(account.currentBalance), account.currency)}`;
					} else {
						overdraftChip = `Overdraft: ${formatTransactionAmount(Math.abs(account.currentBalance), account.currency)}`;
					}
				} else {
					overdraftChip = null;
				}
				if (account?.type === 'credit') {
					const repayments = transactions.filter(
						(tx) => tx.status === 'planned' && (tx.reference?.startsWith('repayment:') ?? false)
					);
					if (repayments.length > 0) {
						const total = repayments.reduce(
							(sum, tx) => sum + Math.abs(tx.transferDetails?.transferAmount ?? tx.amount ?? 0),
							0
						);
						repaymentChip = `${repayments.length} repayment${repayments.length === 1 ? '' : 's'} remaining: ${formatTransactionAmount(total, account.currency)}`;
					} else {
						repaymentChip = null;
					}
				} else {
					repaymentChip = null;
				}
			}
		} catch (error) {
			console.error('Error loading transactions:', error);
		}
	}

	async function loadAccountInlineInsights() {
		if (!accountId) return;
		try {
			accountInlineInsights = await insightsService.getAccountScopedInlineInsights(accountId);
		} catch {
			accountInlineInsights = [];
		}
	}

	async function dismissAccountInlineAlert(insightId: string) {
		await insightsService.dismissInsight(insightId);
		await loadAccountInlineInsights();
		window.dispatchEvent(new CustomEvent('alerts-updated'));
	}

	async function loadEnhancedAllowance() {
		if (!accountId || !account) return;

		isLoadingAllowance = true;
		try {
			enhancedAllowance = await planService.getEnhancedAllowance(accountId);
			if (enhancedAllowance) {
				const prefs = await userService.getUserPreferences();
				const handling =
					(prefs as { negativeAllowanceHandling?: string }).negativeAllowanceHandling ??
					'allow_with_strong_warning';
				negativeAllowanceStatus = await negativeAllowanceService.checkNegativeAllowance(
					enhancedAllowance,
					handling as
						| 'block_with_warning'
						| 'allow_with_strong_warning'
						| 'borrow_from_future'
						| 'borrow_from_other_categories',
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

	async function afterBalanceUpdate() {
		await loadAccount();
		await loadTransactions();
		if (accountId) {
			try {
				taxWithheldYtd = await accountService.getTaxWithheldYtdForAccount(accountId);
			} catch {
				taxWithheldYtd = null;
			}
		}
	}

	function transactionRowLabel(tx: Transaction): string {
		if (tx.type === 'transfer' && tx.transferDetails) {
			return formatTransferLabel(tx, accountsLookup);
		}
		return tx?.description || 'No description';
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
			backButtonLabel="Back to accounts"
			buttonProps={account
				? [{ text: 'Edit', onclick: handleEdit, variant: 'ghost', size: 'sm', icon: Pencil }]
				: []}
		/>
	{/snippet}

	<div class="mx-auto max-w-4xl space-y-8 px-5 py-6 sm:px-6">
		{#if account && !isLoading}
			{@const currency = account.currency}
			<!-- Hero: account balance -->
			<section class="mb-10 pt-10 text-center">
				<p
					class="mb-3 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					{account.type} balance
				</p>
				<CountUpHero value={account.currentBalance} format={(n) => formatBalance(n, currency)} />
				{#if account.rateProfile && account.lastConfirmedAt}
					<p class="text-muted-foreground mt-2 text-xs">
						Projected: {formatBalance(
							passiveAccountService.projectBalance(account, new Date()),
							currency
						)}
					</p>
				{/if}
				{#if account.type === 'savings' || account.type === 'credit' || account.type === 'loan'}
					<div class="mt-4 flex flex-wrap items-center justify-center gap-3">
						<Button.Root variant="outline" size="sm" onclick={() => (updateBalanceOpen = true)}>
							Update balance
						</Button.Root>
					</div>
				{/if}
				{#if taxWithheldYtd != null && taxWithheldYtd > 0 && account.rateProfile?.taxRate}
					<p class="text-muted-foreground mt-2 text-xs">
						Tax withheld year-to-date: {formatBalance(taxWithheldYtd, currency)}
					</p>
				{/if}
				{#if account.initialBalance !== account.currentBalance}
					<p class="mt-2 text-xs text-[var(--color-text-tertiary)]">
						Started at {formatBalance(account.initialBalance, account.currency)}
					</p>
				{/if}
				{#if overdraftChip}
					<p class="mt-2 text-xs text-[var(--color-amber)]">{overdraftChip}</p>
				{/if}
				{#if repaymentChip}
					<p class="mt-1 text-xs text-[var(--color-amber)]">{repaymentChip}</p>
				{/if}
				{#if accountInlineInsights.length > 0}
					<div class="mt-4 flex justify-center">
						<InlineAlertBadge
							insights={accountInlineInsights}
							onDismiss={dismissAccountInlineAlert}
						/>
					</div>
				{/if}
			</section>

			<!-- Reconciliation status row -->
			{#if reconciliationSummary}
				{@const needsAttention =
					reconciliationSummary.daysSinceLastReconciliation > 30 ||
					reconciliationSummary.daysSinceLastReconciliation === -1 ||
					reconciliationSummary.unresolvedDiscrepancies > 0}
				<section class="mb-6">
					<button
						type="button"
						class="flex w-full items-center justify-between rounded-xl border px-5 py-3.5 text-left transition-colors
							{needsAttention
							? 'border-[var(--color-warm-coral)]/30 bg-[var(--color-warm-coral)]/8 hover:bg-[var(--color-warm-coral)]/12'
							: 'border-border bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-surface)]'}"
						onclick={() => goto(`/accounts/reconciliation?account=${account?.id ?? ''}`)}
					>
						<div class="flex items-center gap-3">
							<Scale
								class="size-4 shrink-0 {needsAttention
									? 'text-[var(--color-warm-coral)]'
									: 'text-[var(--color-text-tertiary)]'}"
							/>
							<div>
								<p class="text-sm font-medium text-[var(--color-text-primary)]">Reconciliation</p>
								<p class="text-xs text-[var(--color-text-tertiary)]">
									{#if reconciliationSummary.lastReconciledDate}
										Last reconciled {reconciliationSummary.daysSinceLastReconciliation} days ago
										{#if reconciliationSummary.unresolvedDiscrepancies > 0}
											· {reconciliationSummary.unresolvedDiscrepancies} discrepancy(ies)
										{/if}
									{:else}
										Not reconciled yet
									{/if}
								</p>
							</div>
						</div>
						<span
							class="text-xs font-medium {needsAttention
								? 'text-[var(--color-warm-coral)]'
								: 'text-[var(--color-text-tertiary)]'}"
						>
							{needsAttention ? 'Reconcile →' : 'View →'}
						</span>
					</button>
				</section>
			{/if}

			<!-- Visualizations — each with section label -->
			{#if account.type === 'checking' || account.type === 'savings'}
				<section class="mb-6">
					<h2
						class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
					>
						Buffer status
					</h2>
					<div class="border-border rounded-2xl border bg-[var(--color-bg-tertiary)] p-6">
						<BufferVisualization {account} showDetails={true} />
					</div>
				</section>
			{/if}

			{#if account.type === 'credit'}
				<section class="mb-6">
					<h2
						class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
					>
						Credit utilization
					</h2>
					<div class="border-border rounded-2xl border bg-[var(--color-bg-tertiary)] p-6">
						<CreditUtilizationVisualization
							{account}
							showDetails={true}
							showRecommendations={true}
						/>
					</div>
				</section>
			{/if}

			{#if account.metadata?.interestRate || account.metadata?.apr}
				<section class="mb-6">
					<h2
						class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
					>
						Interest analysis
					</h2>
					<div class="border-border rounded-2xl border bg-[var(--color-bg-tertiary)] p-6">
						<InterestOptimizationVisualization
							{account}
							showDetails={true}
							showRecommendations={true}
						/>
					</div>
				</section>
			{/if}

			{#if account.metadata?.isEmergencyFund}
				<section class="mb-6">
					<h2
						class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
					>
						Emergency fund
					</h2>
					<div class="border-border rounded-2xl border bg-[var(--color-bg-tertiary)] p-6">
						<EmergencyFundVisualization showDetails={true} showRecommendations={true} />
					</div>
				</section>
			{/if}

			{#if account.type === 'checking' || account.type === 'savings'}
				<section class="mb-6">
					<h2
						class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
					>
						Safe to spend
					</h2>
					<div class="border-border rounded-2xl border bg-[var(--color-bg-tertiary)] p-6">
						{#if isLoadingAllowance}
							<div class="space-y-3 py-4">
								<div class="h-4 w-1/2 animate-pulse rounded bg-[var(--color-bg-surface)]"></div>
								<div class="h-3 w-1/3 animate-pulse rounded bg-[var(--color-bg-surface)]"></div>
							</div>
						{:else if enhancedAllowance}
							<AllowanceVisualization
								allowance={enhancedAllowance}
								showDetails={true}
								showRecommendations={true}
								negativeStatus={negativeAllowanceStatus}
								{recoverySuggestions}
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
							<p class="py-4 text-sm text-[var(--color-text-tertiary)]">
								Unable to calculate allowance.
							</p>
						{/if}
					</div>
				</section>

				<section class="mb-6">
					<h2
						class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
					>
						Balance projection
					</h2>
					<div class="border-border rounded-2xl border bg-[var(--color-bg-tertiary)] p-6">
						<BalanceProjectionChart accountId={account.id} daysAhead={90} showDetails={true} />
					</div>
				</section>
			{/if}

			<section class="mb-6">
				<h2
					class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Fee avoidance
				</h2>
				<div class="border-border rounded-2xl border bg-[var(--color-bg-tertiary)] p-6">
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

			<!-- Recent transactions -->
			<section>
				<div class="mb-4 flex items-center justify-between">
					<h2
						class="text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
					>
						Recent transactions
					</h2>
					<Button.Root
						variant="ghost"
						size="sm"
						onclick={() => goto('/transactions/add')}
						class="text-xs text-[var(--color-amber)]"
					>
						Add transaction
					</Button.Root>
				</div>

				{#if transactions.length === 0}
					<div class="flex flex-col items-center py-12 text-center">
						<p class="text-sm text-[var(--color-text-secondary)]">No transactions yet.</p>
					</div>
				{:else}
					<div class="border-border overflow-hidden rounded-2xl border">
						{#each transactions.slice(0, 10).filter((t) => t) as transaction (transaction.id)}
							<button
								type="button"
								class="border-border flex w-full items-center justify-between gap-4 border-b px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-[var(--color-bg-surface)]"
								onclick={() => goto(`/transactions/add/${transaction.id}`)}
							>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-[var(--color-text-primary)]">
										{transactionRowLabel(transaction)}
									</p>
									<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
										{formatDate(
											transaction?.clearedDate ||
												transaction?.plannedDate ||
												transaction?.createdAt ||
												''
										)}
									</p>
								</div>
								<span
									class="text-amount shrink-0 {transaction?.type === 'income'
										? 'text-[var(--color-sage-green)]'
										: 'text-foreground'}"
								>
									{formatBalance(
										transaction?.amount ?? 0,
										transaction?.currency || account?.currency || userCurrency || 'USD'
									)}
								</span>
							</button>
						{/each}
					</div>

					{#if transactions.length > 10}
						<div class="mt-4 text-center">
							<Button.Root
								variant="ghost"
								size="sm"
								onclick={() => goto('/transactions')}
								class="text-[var(--color-text-tertiary)]"
							>
								View all transactions
							</Button.Root>
						</div>
					{/if}
				{/if}
			</section>
		{/if}
	</div>

	<UpdateBalanceSheet
		open={updateBalanceOpen}
		{account}
		onOpenChange={(v) => (updateBalanceOpen = v)}
		onSuccess={afterBalanceUpdate}
	/>
</PageLayout>
