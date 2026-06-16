<script lang="ts">
	import type { CompareTabProps } from '../types.js';
	import { TimeRangeSelector } from '$lib/components/shared';
	import * as Card from '$lib/components/ui/card/index.ts';
	import { TrendingUp } from '@lucide/svelte';
	import { formatMainCurrencyAmount } from '$lib/utils/currency-utils';
	import { Skeleton } from '$lib/components/ui/skeleton';

	interface Props extends CompareTabProps {
		children?: any;
	}

	const {
		timeRange,
		onTimeRangeChange,
		currentPeriodData,
		previousPeriodData,
		userCurrency,
		isLoading = false,
		children
	}: Props = $props();

	const timeRangeOptions = ['month', 'quarter', 'year'];

	function formatAmount(amount: number) {
		return formatMainCurrencyAmount(amount, userCurrency);
	}

	// Calculate comparison metrics
	const spendingChange = $derived(() => {
		if (previousPeriodData.totalSpending === 0) return 0;
		return (
			((currentPeriodData.totalSpending - previousPeriodData.totalSpending) /
				previousPeriodData.totalSpending) *
			100
		);
	});

	const transactionChange = $derived(() => {
		if (previousPeriodData.transactionCount === 0) return 0;
		return (
			((currentPeriodData.transactionCount - previousPeriodData.transactionCount) /
				previousPeriodData.transactionCount) *
			100
		);
	});

	const savingsRateChange = $derived(() => {
		return currentPeriodData.savingsRate - previousPeriodData.savingsRate;
	});
</script>

{#if isLoading}
	<div class="space-y-6 py-2 sm:py-4">
		<Skeleton class="h-10 w-full max-w-xs rounded-lg" />

		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<Skeleton class="h-48 w-full rounded-xl" />
			<Skeleton class="h-48 w-full rounded-xl" />
		</div>

		<Skeleton class="h-44 w-full rounded-xl" />
	</div>
{:else}
	<div class="space-y-6 py-2 sm:py-4">
		<!-- Comparison Periods -->
		<TimeRangeSelector
			value={timeRange}
			options={timeRangeOptions}
			onChange={onTimeRangeChange}
			label="Compare:"
		/>

		<!-- Comparison Cards -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<Card.Root class="p-6">
				<h3 class="text-primary mb-4 text-lg font-semibold">Current {timeRange}</h3>
				<div class="space-y-3">
					<div class="flex justify-between">
						<span class="text-muted-foreground text-sm">Total Spending</span>
						<span class="text-primary text-sm font-semibold"
							>{formatAmount(currentPeriodData.totalSpending)}</span
						>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground text-sm">Transactions</span>
						<span class="text-primary text-sm font-semibold"
							>{currentPeriodData.transactionCount}</span
						>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground text-sm">Avg. Transaction</span>
						<span class="text-primary text-sm font-semibold"
							>{formatAmount(currentPeriodData.averageTransaction)}</span
						>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground text-sm">Savings Rate</span>
						<span class="text-sm font-semibold text-green-500"
							>{currentPeriodData.savingsRate.toFixed(1)}%</span
						>
					</div>
				</div>
			</Card.Root>

			<Card.Root class="p-6">
				<h3 class="text-primary mb-4 text-lg font-semibold">Previous {timeRange}</h3>
				<div class="space-y-3">
					<div class="flex justify-between">
						<span class="text-muted-foreground text-sm">Total Spending</span>
						<span class="text-primary text-sm font-semibold"
							>{formatAmount(previousPeriodData.totalSpending)}</span
						>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground text-sm">Transactions</span>
						<span class="text-primary text-sm font-semibold"
							>{previousPeriodData.transactionCount}</span
						>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground text-sm">Avg. Transaction</span>
						<span class="text-primary text-sm font-semibold"
							>{formatAmount(previousPeriodData.averageTransaction)}</span
						>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground text-sm">Savings Rate</span>
						<span class="text-sm font-semibold text-green-500"
							>{previousPeriodData.savingsRate.toFixed(1)}%</span
						>
					</div>
				</div>
			</Card.Root>
		</div>

		<!-- Comparison Analysis -->
		<Card.Root class="p-6">
			<h3 class="text-primary mb-4 text-lg font-semibold">Analysis</h3>
			<div class="space-y-4">
				<div
					class="flex items-center justify-between p-3 {spendingChange() > 0
						? 'border border-red-500/20 bg-red-500/10'
						: 'border border-green-500/20 bg-green-500/10'} rounded-lg"
				>
					<div class="flex items-center gap-3">
						<TrendingUp
							class="h-4 w-4 {spendingChange() > 0
								? 'text-red-500'
								: 'text-green-500'}"
						/>
						<span class="text-primary text-sm font-medium"
							>Spending {spendingChange() > 0 ? 'increased' : 'decreased'}</span
						>
					</div>
					<span
						class="text-sm font-semibold {spendingChange() > 0
							? 'text-red-500'
							: 'text-green-500'}"
					>
						{spendingChange() > 0 ? '+' : ''}{spendingChange().toFixed(1)}%
					</span>
				</div>

				<div
					class="flex items-center justify-between p-3 {transactionChange() > 0
						? 'border border-green-500/20 bg-green-500/10'
						: 'border border-red-500/20 bg-red-500/10'} rounded-lg"
				>
					<div class="flex items-center gap-3">
						<TrendingUp
							class="h-4 w-4 {transactionChange() > 0
								? 'text-green-500'
								: 'text-red-500'}"
						/>
						<span class="text-primary text-sm font-medium">Transaction count</span>
					</div>
					<span
						class="text-sm font-semibold {transactionChange() > 0
							? 'text-green-500'
							: 'text-red-500'}"
					>
						{transactionChange() > 0 ? '+' : ''}{transactionChange().toFixed(1)}%
					</span>
				</div>

				<div
					class="flex items-center justify-between p-3 {savingsRateChange() > 0
						? 'border border-green-500/20 bg-green-500/10'
						: 'border border-yellow-500/20 bg-yellow-500/10'} rounded-lg"
				>
					<div class="flex items-center gap-3">
						<TrendingUp
							class="h-4 w-4 {savingsRateChange() > 0
								? 'text-green-500'
								: 'text-yellow-500'}"
						/>
						<span class="text-primary text-sm font-medium">Savings rate</span>
					</div>
					<span
						class="text-sm font-semibold {savingsRateChange() > 0
							? 'text-green-500'
							: 'text-yellow-500'}"
					>
						{savingsRateChange() > 0 ? '+' : ''}{savingsRateChange().toFixed(1)}%
					</span>
				</div>
			</div>
		</Card.Root>

		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}
