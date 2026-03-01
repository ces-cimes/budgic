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
	import { formatMainCurrencyAmount, formatTransactionAmount } from '$lib/utils/currency-utils';
	import { useCurrencyFormatting } from '$lib/hooks/use-currency-formatting';
	import { PageLayout } from '$lib/components/layouts';
	import Fab from '$lib/components/Fab.svelte';
	import { Plus } from '@lucide/svelte';
	import AllowanceSummary from '$lib/components/AllowanceSummary.svelte';
	import {
		planService,
		userService as userServiceImport,
		negativeAllowanceService
	} from '$lib/core/services';
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import type { NegativeAllowanceStatus, RecoverySuggestion } from '$lib/core/services/core/negative-allowance-service';
	import type { FeeRisk } from '$lib/core/services/analytics/fee-avoidance-service';
	import { Shield, AlertTriangle } from '@lucide/svelte';

	const { data } = $props<{ data: any }>();

	let accounts = $state<any[]>([]);
	let totalBalance = $state(0);
	let recentTransactions = $state<any[]>([]);
	let budgetCategories = $state<Record<string, any>>({});
	let userCurrency = $state<string>('USD');
	let globalAllowance = $state<EnhancedAllowance | null>(null);
	let isLoadingAllowance = $state(false);
	let negativeAllowanceStatus = $state<NegativeAllowanceStatus | null>(null);
	let recoverySuggestions = $state<RecoverySuggestion[]>([]);
	let urgentFeeRisks = $state<FeeRisk[]>([]);
	let isLoadingFeeRisks = $state(false);

	onMount(async () => {
		try {
			// Load user currency preference first
			const preferences = await userService.getUserPreferences();
			userCurrency = preferences?.currency || 'USD';

			const [accountsData, balanceData, transactionsData, categoriesData] = await Promise.all([
				accountService.getAccounts(),
				accountService.getTotalBalance(),
				transactionService.getAllTransactions(), // Get all transactions
				db.getActiveCategories()
			]);

			accounts = accountsData;
			totalBalance = balanceData;
			recentTransactions = transactionsData.filter((t: any) => t && !t.deletedAt).slice(0, 5);
			budgetCategories = categoriesData.reduce(
				(acc: Record<string, any>, category: any) => {
					acc[category.id] = category;
					return acc;
				},
				{} as Record<string, any>
			);

			// Load global allowance
			await loadGlobalAllowance();

			// Load urgent fee risks
			await loadUrgentFeeRisks();
		} catch (error) {
			console.error('Error loading dashboard data:', error);
		}
	});

	async function loadGlobalAllowance() {
		isLoadingAllowance = true;
		try {
			globalAllowance = await planService.getEnhancedAllowance();
			if (globalAllowance) {
				const prefs = await userServiceImport.getUserPreferences();
				const handling =
					(prefs as { negativeAllowanceHandling?: string }).negativeAllowanceHandling ?? 'allow_with_strong_warning';
				negativeAllowanceStatus = await negativeAllowanceService.checkNegativeAllowance(
					globalAllowance,
					handling as 'block_with_warning' | 'allow_with_strong_warning' | 'borrow_from_future' | 'borrow_from_other_categories'
				);
				recoverySuggestions = negativeAllowanceStatus.isNegative
					? negativeAllowanceService.getRecoverySuggestions(globalAllowance)
					: [];
				if (negativeAllowanceStatus.isNegative) {
					await negativeAllowanceService.recordCurrentNegativeAllowanceIfAny(
						globalAllowance,
						handling as 'block_with_warning' | 'allow_with_strong_warning' | 'borrow_from_future' | 'borrow_from_other_categories'
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
		isLoadingFeeRisks = true;
		try {
			const allRisks = await feeAvoidanceService.detectFeeRisks({
				daysAhead: 30,
				minConfidence: 75
			});
			// Only show imminent and high risks on home page
			urgentFeeRisks = allRisks
				.filter((r) => r.likelihood === 'imminent' || r.likelihood === 'high')
				.slice(0, 3); // Max 3 risks
		} catch (error) {
			console.error('Error loading fee risks:', error);
		} finally {
			isLoadingFeeRisks = false;
		}
	}

	// Currency formatting hook
	const currencyFormat = useCurrencyFormatting();

	function formatAmount(amount: number) {
		return currencyFormat.formatBalance(amount, userCurrency);
	}

	function getCategoryName(transaction: any) {
		// Try to resolve category name from budgetCategories
		if (transaction.categoryId && budgetCategories[transaction.categoryId]) {
			return budgetCategories[transaction.categoryId].name;
		}

		// Last resort: format the category ID if it exists
		if (transaction.categoryId) {
			return transaction.categoryId
				.replace(/-/g, ' ')
				.replace(/\b\w/g, (l: string) => l.toUpperCase());
		}

		return 'Uncategorized';
	}

	function getAccountName(accountId: string) {
		const account = accounts.find((a) => a.id === accountId);
		return account?.name || 'Unknown Account';
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
			Income: '💰',
			Transportation: '⛽',
			Shopping: '🛍️',
			Entertainment: '🎬',
			Healthcare: '🏥'
		};
		return icons[category] || '📊';
	}
</script>

<svelte:head>
	<title>Home | Budgic</title>
</svelte:head>

<PageLayout>
	<div class="container mx-auto max-w-2xl px-4 py-6">
		<header class="mb-6">
			<h1 class="text-primary mb-1 text-2xl font-bold">Welcome back!</h1>
			<p class="text-muted-foreground text-sm">Your financial status at a glance</p>
		</header>

		<!-- Primary metric: total balance -->
		<section class="mb-6">
			<div class="bg-primary/10 border-border rounded-2xl border p-6">
				<div class="text-muted-foreground mb-1 text-sm">Total balance</div>
				<div class="text-primary text-3xl font-bold">{formatAmount(totalBalance)}</div>
			</div>
		</section>

		<!-- Safe to spend (allowance) -->
		<section class="mb-6">
			<AllowanceSummary
				allowance={globalAllowance}
				isLoading={isLoadingAllowance}
				negativeStatus={negativeAllowanceStatus}
				recoverySuggestions={recoverySuggestions}
			/>
		</section>

		<!-- Urgent alerts (fee risks + negative allowance) -->
		{#if urgentFeeRisks.length > 0 || (negativeAllowanceStatus?.isNegative)}
			<section class="mb-6">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-primary flex items-center gap-2 text-sm font-semibold">
						<Shield class="h-4 w-4 text-orange-500" />
						Needs attention
					</h2>
					<Button.Root variant="ghost" size="sm" onclick={() => goto('/insights')}>
						All alerts
					</Button.Root>
				</div>
				<div class="space-y-2">
					{#if negativeAllowanceStatus?.isNegative}
						<a
							href="/plan?tab=allowance"
							class="bg-warning/10 border-warning/30 flex items-center justify-between rounded-xl border p-3 transition-colors hover:bg-warning/20"
						>
							<span class="text-sm font-medium text-primary">Allowance overspent</span>
							<span class="text-muted-foreground text-xs">View plan →</span>
						</a>
					{/if}
					{#each urgentFeeRisks.slice(0, 2) as risk (risk.id)}
						<a
							href="/accounts/{risk.accountId}"
							class="bg-card border-border flex items-center justify-between rounded-xl border p-3 transition-colors hover:bg-accent"
						>
							<div class="min-w-0 flex-1">
								<div class="text-sm font-medium text-primary truncate">{risk.triggerCondition}</div>
								<div class="text-muted-foreground text-xs">{risk.accountName}</div>
							</div>
							<div class="text-right text-sm font-semibold text-red-500">
								{formatAmount(risk.estimatedAmount)}
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Quick actions -->
		<section class="mb-6">
			<div class="grid grid-cols-2 gap-3">
				<Button.Root
					onclick={() => goto('/transactions/add')}
					class="h-auto flex-col items-center justify-center gap-1 py-4"
				>
					<Plus class="h-5 w-5" />
					<span class="text-sm font-medium">Add transaction</span>
				</Button.Root>
				<Button.Root
					onclick={() => goto('/plan')}
					variant="outline"
					class="h-auto flex-col items-center justify-center gap-1 py-4"
				>
					<span class="text-sm font-medium">View plan</span>
				</Button.Root>
			</div>
		</section>

		<!-- Recent activity (compact) -->
		<section class="mb-8">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-primary text-sm font-semibold">Recent transactions</h2>
				<Button.Root variant="ghost" size="sm" onclick={() => goto('/transactions')}>
					View all
				</Button.Root>
			</div>
			<div class="bg-card border-border divide-border divide-y overflow-hidden rounded-xl border shadow-sm">
				{#each recentTransactions as transaction (transaction.id)}
					<button
						type="button"
						class="hover:bg-accent flex w-full items-center justify-between gap-3 p-4 text-left transition-colors"
						onclick={() => goto(`/transactions/add/${transaction.id}`)}
					>
						<div class="min-w-0 flex-1">
							<div class="text-primary truncate text-sm font-medium">
								{transaction.description || 'No description'}
							</div>
							<div class="text-muted-foreground text-xs">
								{getCategoryName(transaction)} • {formatDate(
									transaction.clearedDate || transaction.plannedDate || transaction.createdAt
								)}
							</div>
						</div>
						<div
							class="flex-shrink-0 text-sm font-semibold {(transaction.amount ?? 0) >= 0
								? 'text-success'
								: 'text-alert'}"
						>
							{formatTransactionAmount(
								transaction.amount,
								transaction.currency || userCurrency,
								true
							)}
						</div>
					</button>
				{/each}
				{#if recentTransactions.length === 0}
					<div class="text-muted-foreground p-6 text-center text-sm">
						No recent transactions.
						<button
							type="button"
							class="text-primary underline hover:no-underline"
							onclick={() => goto('/transactions/add')}
						>
							Add one
						</button>
					</div>
				{/if}
			</div>
		</section>
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
