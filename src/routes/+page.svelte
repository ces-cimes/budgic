<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		accountService,
		budgetService,
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
	import { planService } from '$lib/core/services';
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import type { FeeRisk } from '$lib/core/services/analytics/fee-avoidance-service';
	import { Shield, AlertTriangle } from '@lucide/svelte';

	const { data } = $props<{ data: any }>();

	let accounts = $state<any[]>([]);
	let totalBalance = $state(0);
	let recentTransactions = $state<any[]>([]);
	let budgetCategories = $state<Record<string, any>>({});
	let monthlyIncome = $state(0);
	let monthlyExpenses = $state(0);
	let userCurrency = $state<string>('USD');
	let insights = $state<any[]>([]);
	let globalAllowance = $state<EnhancedAllowance | null>(null);
	let isLoadingAllowance = $state(false);
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

			accounts = accountsData.slice(0, 3); // Show top 3 accounts
			totalBalance = balanceData;
			recentTransactions = transactionsData.slice(0, 5); // Show last 5 transactions
			budgetCategories = categoriesData.reduce(
				(acc: Record<string, any>, category: any) => {
					acc[category.id] = category;
					return acc;
				},
				{} as Record<string, any>
			);

			// Load insights
			insights = []; // Simplified - insights will be loaded from insights page

			// Calculate monthly totals using the simplified transaction system
			const incomeTransactions = transactionsData.filter((t: any) => t.type === 'income');
			const expenseTransactions = transactionsData.filter((t: any) => t.type === 'expense');

			monthlyIncome = incomeTransactions.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
			monthlyExpenses = expenseTransactions.reduce(
				(sum: number, t: any) => sum + (t.amount || 0),
				0
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
	<title>Dashboard | Budgic</title>
</svelte:head>

<PageLayout>
	<div class="container mx-auto max-w-6xl px-4 py-6">
		<!-- Welcome Header -->
		<header class="mb-8">
			<h1 class="text-primary mb-2 text-3xl font-bold">Welcome back!</h1>
			<p class="text-muted-foreground">Here's your financial overview for today</p>
		</header>

		<!-- Quick Stats -->
		<section class="mb-8">
			<div class="grid grid-cols-1 gap-6 md:grid-cols-4">
				<div class="bg-card border-border rounded-xl border p-6 shadow-sm">
					<div class="text-muted-foreground mb-1 text-sm">Total Balance</div>
					<div class="text-primary text-2xl font-bold">{formatAmount(totalBalance)}</div>
					<div class="text-success text-sm">+2.5% from last month</div>
				</div>

				<div class="bg-card border-border rounded-xl border p-6 shadow-sm">
					<div class="text-muted-foreground mb-1 text-sm">Monthly Income</div>
					<div class="text-success text-2xl font-bold">{formatAmount(monthlyIncome)}</div>
					<div class="text-muted-foreground text-sm">This month</div>
				</div>

				<div class="bg-card border-border rounded-xl border p-6 shadow-sm">
					<div class="text-muted-foreground mb-1 text-sm">Monthly Expenses</div>
					<div class="text-alert text-2xl font-bold">{formatAmount(monthlyExpenses)}</div>
					<div class="text-muted-foreground text-sm">This month</div>
				</div>

				<div class="bg-card border-border rounded-xl border p-6 shadow-sm">
					<div class="text-muted-foreground mb-1 text-sm">Net Savings</div>
					<div class="text-info text-2xl font-bold">
						{formatAmount(monthlyIncome - monthlyExpenses)}
					</div>
					<div class="text-muted-foreground text-sm">This month</div>
				</div>
			</div>
		</section>

		<!-- Spending Allowance -->
		<section class="mb-8">
			<AllowanceSummary allowance={globalAllowance} isLoading={isLoadingAllowance} />
		</section>

		<!-- Quick Actions -->
		<section class="mb-8">
			<h2 class="text-primary mb-4 text-xl font-semibold">Quick Actions</h2>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
				<Button.Root
					onclick={() => goto('/transactions/add')}
					class="h-auto flex-col items-start p-4"
				>
					<div class="text-primary mb-1 font-medium">Add Transaction</div>
					<div class="text-muted-foreground text-sm">Record income or expense</div>
				</Button.Root>

				<Button.Root
					onclick={() => goto('/accounts/add')}
					variant="outline"
					class="h-auto flex-col items-start p-4"
				>
					<div class="text-primary mb-1 font-medium">Add Account</div>
					<div class="text-muted-foreground text-sm">Connect new account</div>
				</Button.Root>

				<Button.Root
					onclick={() => goto('/budget')}
					variant="outline"
					class="h-auto flex-col items-start p-4"
				>
					<div class="text-primary mb-1 font-medium">View Budget</div>
					<div class="text-muted-foreground text-sm">Check your plan</div>
				</Button.Root>

				<Button.Root
					onclick={() => goto('/insights')}
					variant="outline"
					class="h-auto flex-col items-start p-4"
				>
					<div class="text-primary mb-1 font-medium">Get Insights</div>
					<div class="text-muted-foreground text-sm">Financial analysis</div>
				</Button.Root>
			</div>
		</section>

		<!-- Recent Activity -->
		<section class="mb-8">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-primary text-xl font-semibold">Recent Transactions</h2>
				<Button.Root variant="ghost" onclick={() => goto('/transactions')}>View All</Button.Root>
			</div>

			<div class="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">
				<div class="divide-border divide-y">
					{#each recentTransactions as transaction (transaction.id)}
						<div class="hover:bg-accent cursor-pointer p-6 transition-colors">
							<div class="flex items-center justify-between">
								<div class="flex items-center space-x-4">
									<div
										class="bg-muted flex h-12 w-12 items-center justify-center rounded-full text-xl"
									>
										{getCategoryIcon(getCategoryName(transaction))}
									</div>
									<div>
										<div class="text-primary font-medium">
											{transaction.description || 'No description'}
										</div>
										<div class="text-muted-foreground text-sm">{getCategoryName(transaction)}</div>
										<div class="text-muted-foreground/70 text-xs">
											{getAccountName(transaction.accountId)} • {formatDate(
												transaction.clearedDate || transaction.plannedDate || transaction.createdAt
											)}
										</div>
										{#if transaction.groupId}
											<div class="text-muted-foreground/70 mt-1 text-xs">Grouped transaction</div>
										{/if}
									</div>
								</div>

								<div class="text-right">
									<div
										class="font-semibold {(transaction.amount ?? 0) >= 0
											? 'text-success'
											: 'text-alert'}"
									>
										{formatTransactionAmount(
											transaction.amount,
											transaction.currency || userCurrency,
											true
										)}
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<!-- Quick Insights -->
		<section class="mb-8">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-primary text-xl font-semibold">Quick Insights</h2>
				<Button.Root variant="ghost" onclick={() => goto('/insights')}>View All</Button.Root>
			</div>

			<div class="bg-card border-border rounded-2xl border p-4 shadow-sm">
				{#if insights.length === 0}
					<div class="text-muted-foreground py-4 text-center">
						<p class="text-sm">No insights to display</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each insights.slice(0, 3) as insight (insight.id)}
							<div class="bg-secondary/30 flex items-start gap-3 rounded-lg p-3">
								<div class="mt-0.5 flex-shrink-0">
									{#if insight.severity === 'alert'}
										<div class="h-2 w-2 rounded-full bg-red-500"></div>
									{:else if insight.severity === 'warning'}
										<div class="h-2 w-2 rounded-full bg-yellow-500"></div>
									{:else if insight.severity === 'success'}
										<div class="h-2 w-2 rounded-full bg-green-500"></div>
									{:else}
										<div class="h-2 w-2 rounded-full bg-blue-500"></div>
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<h3 class="text-foreground text-sm leading-tight font-medium">
										{insight.title}
									</h3>
									<p class="text-muted-foreground mt-1 text-xs">
										{insight.message}
									</p>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>

		<!-- Fee Avoidance Alerts -->
		{#if urgentFeeRisks.length > 0}
			<section class="mb-8">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-primary flex items-center gap-2 text-xl font-semibold">
						<Shield class="h-5 w-5 text-orange-500" />
						Fee Avoidance Alerts
					</h2>
					<Button.Root variant="ghost" onclick={() => goto('/insights?tab=savings')}>
						View All
					</Button.Root>
				</div>

				<div
					class="rounded-2xl border border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-red-500/10 p-4 shadow-sm"
				>
					<div class="space-y-3">
						{#each urgentFeeRisks as risk (risk.id)}
							<div
								class="bg-card/80 flex items-start gap-3 rounded-lg border border-orange-500/20 p-4 backdrop-blur-sm"
							>
								<div class="mt-1 flex-shrink-0">
									<AlertTriangle
										class="h-5 w-5 {risk.likelihood === 'imminent'
											? 'text-red-500'
											: 'text-orange-500'}"
									/>
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex items-start justify-between gap-2">
										<div class="flex-1">
											<h3 class="text-foreground text-sm leading-tight font-semibold">
												{risk.triggerCondition}
											</h3>
											<p class="text-muted-foreground mt-1 text-xs">
												{risk.accountName} • {risk.daysUntilOccurrence !== null
													? `${risk.daysUntilOccurrence} days`
													: 'Soon'}
											</p>
										</div>
										<div class="text-right">
											<div class="text-sm font-bold text-red-500">
												{formatAmount(risk.estimatedAmount)}
											</div>
											<div class="text-muted-foreground text-xs">fee at risk</div>
										</div>
									</div>
									<Button.Root
										variant="outline"
										size="sm"
										class="mt-3"
										onclick={() => goto(`/accounts/${risk.accountId}`)}
									>
										View Account
									</Button.Root>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</section>
		{/if}

		<!-- Budget Overview -->
		<section class="mb-8">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-primary text-xl font-semibold">Budget Overview</h2>
				<Button.Root variant="ghost" onclick={() => goto('/budget')}>View Details</Button.Root>
			</div>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
				{#each Object.values(budgetCategories) as category (category.id)}
					<div class="bg-card border-border rounded-xl border p-4 shadow-sm">
						<div class="mb-2 flex items-center justify-between">
							<div class="h-8 w-8 rounded-full" style="background-color: {category.color}"></div>
							<span class="text-muted-foreground text-sm">
								{Math.round((category.allocatedAmount / category.allocatedAmount) * 100)}%
							</span>
						</div>
						<div class="text-primary mb-1 font-medium">{category.name}</div>
						<div class="text-muted-foreground text-sm">
							{formatAmount(category.allocatedAmount)} / {formatAmount(category.allocatedAmount)}
						</div>
						<div class="bg-muted mt-2 h-2 w-full rounded-full">
							<div
								class="h-2 rounded-full transition-all duration-300"
								style="width: {Math.min(
									(category.allocatedAmount / category.allocatedAmount) * 100,
									100
								)}%; background-color: {category.color}"
							></div>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- Account Summary -->
		<section class="mb-8">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-primary text-xl font-semibold">Your Accounts</h2>
				<Button.Root variant="ghost" onclick={() => goto('/accounts')}>View All</Button.Root>
			</div>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
				{#each accounts as account}
					<div
						class="bg-card border-border cursor-pointer rounded-xl border p-6 shadow-sm transition-shadow hover:shadow-md"
					>
						<div class="mb-4 flex items-center justify-between">
							<div
								class="from-primary to-primary/80 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r"
							>
								<span class="font-bold text-white">{account.name.charAt(0)}</span>
							</div>
							<div class="text-right">
								<div class="text-muted-foreground text-sm capitalize">{account.type}</div>
							</div>
						</div>

						<h3 class="text-primary mb-2 font-semibold">{account.name}</h3>
						<div class="text-primary text-2xl font-bold">{formatAmount(account.balance)}</div>

						<div class="border-border mt-4 border-t pt-4">
							<div class="flex justify-between text-sm">
								<span class="text-muted-foreground">Last updated</span>
								<span class="text-primary">Today</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</section>
	</div>

	<!-- Floating Action Button -->
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
