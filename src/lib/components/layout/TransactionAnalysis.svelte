<script lang="ts">
	import Card from '$lib/components/primitives/Card.svelte';
	import { TrendingUp, TrendingDown, Calendar, DollarSign, PieChart, BarChart3 } from '@lucide/svelte';
	import { flattenProcessedTransactionGroups, type ProcessedTransaction } from '$lib/utils/transaction-display';

	interface Props {
		transactions: ProcessedTransaction[];
	}

	let { transactions }: Props = $props();

	// Calculate insights from transactions
	const insights = $derived.by(() => {
		if (transactions.length === 0) return null;

		const now = new Date();
		const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

		// Filter transactions by month
		const thisMonthTransactions = transactions.filter(tx => {
			const date = tx.clearedDate ? new Date(tx.clearedDate) : new Date(tx.plannedDate!);
			return date >= thisMonth;
		});

		const lastMonthTransactions = transactions.filter(tx => {
			const date = tx.clearedDate ? new Date(tx.clearedDate) : new Date(tx.plannedDate!);
			return date >= lastMonth && date < thisMonth;
		});

		// Calculate totals
		const thisMonthTotal = thisMonthTransactions.reduce((sum, tx) => sum + tx.amount, 0);
		const lastMonthTotal = lastMonthTransactions.reduce((sum, tx) => sum + tx.amount, 0);

		// Calculate spending by category
		const categorySpending = thisMonthTransactions.reduce((acc, tx) => {
			const category = tx.tagNames?.what || 'Uncategorized';
			acc[category] = (acc[category] || 0) + Math.abs(tx.amount);
			return acc;
		}, {} as Record<string, number>);

		// Top spending categories
		const topCategories = Object.entries(categorySpending)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 5);

		// Spending velocity (daily average)
		const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
		const dailyAverage = Math.abs(thisMonthTotal) / daysInMonth;

		// Recurring transactions
		const recurringTransactions = transactions.filter(tx => 
			tx.description?.toLowerCase().includes('monthly') ||
			tx.description?.toLowerCase().includes('rent') ||
			tx.description?.toLowerCase().includes('subscription')
		);

		return {
			thisMonthTotal,
			lastMonthTotal,
			monthOverMonthChange: thisMonthTotal - lastMonthTotal,
			monthOverMonthPercent: lastMonthTotal !== 0 ? ((thisMonthTotal - lastMonthTotal) / Math.abs(lastMonthTotal)) * 100 : 0,
			dailyAverage,
			topCategories,
			recurringTransactions: recurringTransactions.length,
			totalTransactions: thisMonthTransactions.length
		};
	});

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
	};

	const formatPercent = (percent: number) => {
		return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
	};
</script>

{#if !insights}
	<div class="flex flex-col items-center justify-center py-8 text-center">
		<BarChart3 class="w-12 h-12 text-text-tertiary mb-4" />
		<p class="text-text-secondary">No transaction data available</p>
		<p class="text-sm text-text-tertiary">Add some transactions to see insights</p>
	</div>
{:else}
	<div class="space-y-6">
		<!-- Monthly Overview -->
		<Card class="p-6">
			<div class="flex items-center gap-2 mb-4">
				<Calendar class="size-5 text-primary" />
				<h3 class="text-lg font-semibold">Monthly Overview</h3>
			</div>
			
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div class="text-center">
					<div class="text-2xl font-bold {insights.thisMonthTotal >= 0 ? 'text-success' : 'text-error'}">
						{formatCurrency(insights.thisMonthTotal)}
					</div>
					<div class="text-sm text-text-tertiary">This Month</div>
				</div>
				
				<div class="text-center">
					<div class="text-lg font-semibold {insights.monthOverMonthChange >= 0 ? 'text-success' : 'text-error'}">
						{formatPercent(insights.monthOverMonthPercent)}
					</div>
					<div class="text-sm text-text-tertiary">vs Last Month</div>
				</div>
				
				<div class="text-center">
					<div class="text-lg font-semibold text-text-primary">
						{formatCurrency(insights.dailyAverage)}
					</div>
					<div class="text-sm text-text-tertiary">Daily Average</div>
				</div>
			</div>
		</Card>

		<!-- Top Spending Categories -->
		<Card class="p-6">
			<div class="flex items-center gap-2 mb-4">
				<PieChart class="size-5 text-primary" />
				<h3 class="text-lg font-semibold">Top Spending Categories</h3>
			</div>
			
			<div class="space-y-3">
				{#each insights.topCategories as [category, amount]}
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<div class="w-3 h-3 rounded-full bg-primary"></div>
							<span class="font-medium">{category}</span>
						</div>
						<span class="text-lg font-semibold">{formatCurrency(amount)}</span>
					</div>
				{/each}
			</div>
		</Card>

		<!-- Quick Stats -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<Card class="p-6">
				<div class="flex items-center gap-2 mb-2">
					<TrendingUp class="size-4 text-success" />
					<h4 class="font-medium">Transactions</h4>
				</div>
				<div class="text-2xl font-bold">{insights.totalTransactions}</div>
				<div class="text-sm text-text-tertiary">This month</div>
			</Card>

			<Card class="p-6">
				<div class="flex items-center gap-2 mb-2">
					<TrendingDown class="size-4 text-warning" />
					<h4 class="font-medium">Recurring</h4>
				</div>
				<div class="text-2xl font-bold">{insights.recurringTransactions}</div>
				<div class="text-sm text-text-tertiary">Monthly payments</div>
			</Card>
		</div>

		<!-- Spending Velocity Alert -->
		{#if insights.dailyAverage > 100}
			<Card class="p-4 bg-warning/10 border-warning/20">
				<div class="flex items-center gap-2">
					<TrendingUp class="size-4 text-warning" />
					<div>
						<div class="font-medium text-warning">High Spending Velocity</div>
						<div class="text-sm text-text-secondary">
							You're spending {formatCurrency(insights.dailyAverage)} per day on average this month.
						</div>
					</div>
				</div>
			</Card>
		{/if}
	</div>
{/if} 