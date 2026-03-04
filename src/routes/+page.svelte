<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		accountService,
		transactionService,
		userService,
		feeAvoidanceService
	} from '$lib/core/services';
	import { db } from '$lib/core/db';
	import * as Button from '$lib/components/ui/button/index.ts';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { useCurrencyFormatting } from '$lib/hooks/use-currency-formatting';
	import { PageLayout } from '$lib/components/layouts';
	import Fab from '$lib/components/Fab.svelte';
	import { Plus, Shield, TrendingUp, TrendingDown } from '@lucide/svelte';
	import AllowanceSummary from '$lib/components/AllowanceSummary.svelte';
	import {
		planService,
		userService as userServiceImport,
		negativeAllowanceService
	} from '$lib/core/services';
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import type { NegativeAllowanceStatus, RecoverySuggestion } from '$lib/core/services/core/negative-allowance-service';
	import type { FeeRisk } from '$lib/core/services/analytics/fee-avoidance-service';

	const { data } = $props<{ data: any }>();

	let accounts = $state<any[]>([]);
	let totalBalance = $state(0);
	let recentTransactions = $state<any[]>([]);
	let budgetCategories = $state<Record<string, any>>({});
	let userCurrency = $state<string>('USD');
	let username = $state('');
	let globalAllowance = $state<EnhancedAllowance | null>(null);
	let isLoadingAllowance = $state(false);
	let negativeAllowanceStatus = $state<NegativeAllowanceStatus | null>(null);
	let recoverySuggestions = $state<RecoverySuggestion[]>([]);
	let urgentFeeRisks = $state<FeeRisk[]>([]);
	let isLoaded = $state(false);

	onMount(async () => {
		try {
			const preferences = await userService.getUserPreferences();
			userCurrency = preferences?.currency || 'USD';
			username = preferences?.username || '';

			const [accountsData, balanceData, transactionsData, categoriesData] = await Promise.all([
				accountService.getAccounts(),
				accountService.getTotalBalance(),
				transactionService.getAllTransactions(),
				db.getActiveCategories()
			]);

			accounts = accountsData;
			totalBalance = balanceData;
			recentTransactions = transactionsData.filter((t: any) => t && !t.deletedAt).slice(0, 6);
			budgetCategories = categoriesData.reduce(
				(acc: Record<string, any>, category: any) => {
					acc[category.id] = category;
					return acc;
				},
				{} as Record<string, any>
			);

			await loadGlobalAllowance();
			await loadUrgentFeeRisks();
		} catch (error) {
			console.error('Error loading dashboard data:', error);
		} finally {
			isLoaded = true;
		}
	});

	async function loadGlobalAllowance() {
		isLoadingAllowance = true;
		try {
			globalAllowance = await planService.getEnhancedAllowance();
			if (globalAllowance) {
				const prefs = await userServiceImport.getUserPreferences();
				const handling =
					(prefs as { negativeAllowanceHandling?: string }).negativeAllowanceHandling ??
					'allow_with_strong_warning';
				negativeAllowanceStatus = await negativeAllowanceService.checkNegativeAllowance(
					globalAllowance,
					handling as
						| 'block_with_warning'
						| 'allow_with_strong_warning'
						| 'borrow_from_future'
						| 'borrow_from_other_categories'
				);
				recoverySuggestions = negativeAllowanceStatus.isNegative
					? negativeAllowanceService.getRecoverySuggestions(globalAllowance)
					: [];
				if (negativeAllowanceStatus.isNegative) {
					await negativeAllowanceService.recordCurrentNegativeAllowanceIfAny(
						globalAllowance,
						handling as
							| 'block_with_warning'
							| 'allow_with_strong_warning'
							| 'borrow_from_future'
							| 'borrow_from_other_categories'
					);
				}
			} else {
				negativeAllowanceStatus = null;
				recoverySuggestions = [];
			}
		} catch (error) {
			console.error('Error loading global allowance:', error);
		} finally {
			isLoadingAllowance = false;
		}
	}

	async function loadUrgentFeeRisks() {
		try {
			const allRisks = await feeAvoidanceService.detectFeeRisks({
				daysAhead: 30,
				minConfidence: 75
			});
			urgentFeeRisks = allRisks
				.filter((r) => r.likelihood === 'imminent' || r.likelihood === 'high')
				.slice(0, 3);
		} catch (error) {
			console.error('Error loading fee risks:', error);
		}
	}

	const currencyFormat = useCurrencyFormatting();

	function formatBalance(amount: number) {
		return currencyFormat.formatBalance(amount, userCurrency);
	}

	function getCategoryName(transaction: any) {
		if (transaction.categoryId && budgetCategories[transaction.categoryId]) {
			return budgetCategories[transaction.categoryId].name;
		}
		if (transaction.categoryId) {
			return transaction.categoryId
				.replace(/-/g, ' ')
				.replace(/\b\w/g, (l: string) => l.toUpperCase());
		}
		return 'Uncategorized';
	}

	function getAccountName(accountId: string) {
		const account = accounts.find((a) => a.id === accountId);
		return account?.name || 'Unknown';
	}

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		if (date.toDateString() === today.toDateString()) return 'Today';
		if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	// Group transactions by date label
	const groupedTransactions = $derived(() => {
		const groups: Record<string, any[]> = {};
		for (const t of recentTransactions) {
			const label = formatDate(t.clearedDate || t.plannedDate || t.createdAt);
			if (!groups[label]) groups[label] = [];
			groups[label].push(t);
		}
		return Object.entries(groups);
	});
</script>

<svelte:head>
	<title>Home · Budgic</title>
</svelte:head>

<PageLayout>
	<div class="flex flex-col min-h-full">

		<!-- ── Balance hero ── -->
		<section
			class="px-5 sm:px-6 pt-10 pb-8 animate-card-enter max-w-sm mx-auto"
			style="animation-delay: 0ms"
		>
			<p class="text-xs tracking-widest uppercase text-muted-foreground mb-3 font-medium">
				{username ? `Hey ${username} ·` : ''} Total balance
			</p>

			{#if isLoaded}
				<div class="text-hero animate-count-up" style="animation-delay: 80ms">
					{formatBalance(totalBalance)}
				</div>
			{:else}
				<div class="h-14 w-48 rounded-lg bg-[var(--color-bg-surface)] animate-pulse"></div>
			{/if}

			<p class="text-xs text-muted-foreground mt-3">
				{#if accounts.length > 0}
					across {accounts.length} account{accounts.length === 1 ? '' : 's'}
				{:else}
					no accounts yet
				{/if}
			</p>
		</section>

		<!-- ── Divider ── -->
		<div class="mx-5 sm:mx-6 h-px bg-border mb-6"></div>

		<div class="px-5 sm:px-6 max-w-2xl mx-auto w-full flex flex-col space-y-8 pb-8">

			<!-- ── Allowance ── -->
			<section class="animate-card-enter" style="animation-delay: 60ms">
				<AllowanceSummary
					allowance={globalAllowance}
					isLoading={isLoadingAllowance}
					negativeStatus={negativeAllowanceStatus}
					recoverySuggestions={recoverySuggestions}
				/>
			</section>

			<!-- ── Urgent alerts ── -->
			{#if urgentFeeRisks.length > 0 || negativeAllowanceStatus?.isNegative}
				<section class="animate-card-enter" style="animation-delay: 120ms">
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
							<Shield class="h-3.5 w-3.5 text-[var(--color-warm-coral)]" />
							Needs attention
						</h2>
						<button
							type="button"
							class="text-xs text-muted-foreground hover:text-[var(--color-text-primary)] transition-colors"
							onclick={() => goto('/insights')}
						>
							All alerts →
						</button>
					</div>
					<div class="space-y-2">
						{#if negativeAllowanceStatus?.isNegative}
							<a
								href="/plan?tab=allowance"
								class="flex items-center justify-between squircle-2xl squircle-border px-4 py-3 transition-colors hover:opacity-90"
								style="--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);"
							>
								<span class="text-sm font-medium text-[var(--color-warm-coral)]">Allowance overspent</span>
								<span class="text-xs text-muted-foreground">View plan →</span>
							</a>
						{/if}
						{#each urgentFeeRisks.slice(0, 2) as risk (risk.id)}
							<a
								href="/accounts/{risk.accountId}"
								class="flex items-center justify-between squircle-2xl squircle-border bg-card px-4 py-3 transition-colors hover:bg-[var(--color-bg-surface)]"
							>
								<div class="min-w-0 flex-1">
									<div class="text-sm font-medium truncate">{risk.triggerCondition}</div>
									<div class="text-xs text-muted-foreground">{risk.accountName}</div>
								</div>
								<div class="text-amount ml-3 text-[var(--color-warm-coral)] shrink-0">
									{formatTransactionAmount(risk.estimatedAmount, userCurrency)}
								</div>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			<!-- ── Recent transactions ── -->
			<section class="animate-card-enter" style="animation-delay: 180ms">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
						Recent
					</h2>
					<button
						type="button"
						class="text-xs text-muted-foreground hover:text-[var(--color-text-primary)] transition-colors"
						onclick={() => goto('/transactions')}
					>
						All transactions →
					</button>
				</div>

				{#if !isLoaded}
					<div class="squircle-4xl squircle-border bg-card overflow-hidden">
						{#each Array(4) as _}
							<div class="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0">
								<div class="flex-1 space-y-1.5">
									<div class="h-3.5 w-32 rounded bg-[var(--color-bg-surface)] animate-pulse"></div>
									<div class="h-2.5 w-20 rounded bg-[var(--color-bg-surface)] animate-pulse"></div>
								</div>
								<div class="h-3.5 w-16 rounded bg-[var(--color-bg-surface)] animate-pulse"></div>
							</div>
						{/each}
					</div>
				{:else if recentTransactions.length === 0}
					<div class="squircle-4xl squircle-border bg-card px-4 py-10 text-center">
						<p class="text-sm text-muted-foreground">Nothing yet.</p>
						<button
							type="button"
							class="mt-1 text-sm text-amber hover:underline"
							onclick={() => goto('/transactions/add')}
						>
							Add your first transaction
						</button>
					</div>
				{:else}
					<div class="squircle-4xl squircle-border bg-card overflow-hidden">
						{#each groupedTransactions() as [dateLabel, txGroup], gi}
							<!-- Date group header -->
							<div class="px-4 py-2 bg-[var(--color-bg-secondary)] border-b border-border">
								<span class="text-xs font-medium uppercase tracking-widest text-muted-foreground">
									{dateLabel}
								</span>
							</div>
							<!-- Transactions in group -->
							{#each txGroup as transaction, ti (transaction.id)}
								<button
									type="button"
									class="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--color-bg-surface)]
										{gi === groupedTransactions().length - 1 && ti === txGroup.length - 1 ? '' : 'border-b border-border'}"
									onclick={() => goto(`/transactions/add/${transaction.id}`)}
								>
									<div class="min-w-0 flex-1">
										<div class="text-sm font-medium truncate leading-snug">
											{transaction.description || 'No description'}
										</div>
										<div class="text-xs text-muted-foreground mt-0.5">
											{getCategoryName(transaction)} · {getAccountName(transaction.accountId)}
										</div>
									</div>
									<div
										class="text-amount shrink-0 {(transaction.amount ?? 0) >= 0
											? 'text-[var(--color-sage-green)]'
											: 'text-foreground'}"
									>
										{formatTransactionAmount(
											transaction.amount,
											transaction.currency || userCurrency,
											true
										)}
									</div>
								</button>
							{/each}
						{/each}
					</div>
				{/if}
			</section>

		</div>
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
