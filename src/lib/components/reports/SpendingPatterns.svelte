<script lang="ts">
	import { onMount } from 'svelte';
	import { insightsService } from '$lib/core/services';
	import { formatCurrencyAmount } from '$lib/utils/currency-utils';
	import { TrendingUp, TrendingDown, Minus, Clock, Calendar, AlertTriangle } from '@lucide/svelte';

	interface Props {
		days?: number;
		userCurrency?: string;
		className?: string;
	}

	const { days = 90, userCurrency = 'USD', className = '' }: Props = $props();

	let spendingPatterns = $state<any>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		await loadSpendingPatterns();
	});

	async function loadSpendingPatterns() {
		isLoading = true;
		error = null;
		try {
			spendingPatterns = await insightsService.analyzeSpendingPatternsAsync(days);
		} catch (err) {
			console.error('Error loading spending patterns:', err);
			error = err instanceof Error ? err.message : 'Failed to load spending patterns';
		} finally {
			isLoading = false;
		}
	}

	function getTrendIcon(trend: string) {
		switch (trend) {
			case 'increasing':
				return TrendingUp;
			case 'decreasing':
				return TrendingDown;
			default:
				return Minus;
		}
	}

	function getTrendColor(trend: string): string {
		switch (trend) {
			case 'increasing':
				return 'text-red-600 dark:text-red-400';
			case 'decreasing':
				return 'text-green-600 dark:text-green-400';
			default:
				return 'text-muted-foreground';
		}
	}

	function formatHour(hour: number): string {
		const period = hour >= 12 ? 'PM' : 'AM';
		const displayHour = hour % 12 || 12;
		return `${displayHour}:00 ${period}`;
	}
</script>

<div class="spending-patterns {className}">
	{#if isLoading}
		<div class="py-12 text-center">
			<div class="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
				<svg class="text-muted-foreground h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
			</div>
			<p class="text-muted-foreground">Analyzing spending patterns...</p>
		</div>
	{:else if error}
		<div class="py-12 text-center">
			<div
				class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20"
			>
				<AlertTriangle class="h-8 w-8 text-red-600 dark:text-red-400" />
			</div>
			<h3 class="text-foreground mb-2 text-lg font-semibold">Error Loading Patterns</h3>
			<p class="text-muted-foreground mb-4">{error}</p>
			<button
				onclick={loadSpendingPatterns}
				class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 transition-colors"
			>
				Retry
			</button>
		</div>
	{:else if !spendingPatterns}
		<div class="py-12 text-center">
			<div class="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
				<Calendar class="text-muted-foreground h-8 w-8" />
			</div>
			<h3 class="text-foreground mb-2 text-lg font-semibold">No Spending Patterns</h3>
			<p class="text-muted-foreground mx-auto max-w-md">
				We need more transaction data to analyze your spending patterns.
			</p>
		</div>
	{:else}
		<div class="space-y-6">
			<!-- Category Patterns -->
			{#if spendingPatterns.categoryPatterns && spendingPatterns.categoryPatterns.length > 0}
				<div>
					<h3 class="text-foreground mb-4 flex items-center gap-2 text-lg font-semibold">
						<TrendingUp class="text-primary h-5 w-5" />
						Category Spending Trends
					</h3>
					<div class="space-y-3">
						{#each spendingPatterns.categoryPatterns.slice(0, 5) as category (category.categoryId)}
							{@const TrendIcon = getTrendIcon(category.trend)}
							<div class="bg-card border-border rounded-lg border p-4">
								<div class="mb-2 flex items-center justify-between">
									<div class="flex-1">
										<h4 class="text-foreground text-sm font-semibold">{category.categoryName}</h4>
										<p class="text-muted-foreground mt-0.5 text-xs">
											{category.frequency} transactions • {category.percentageOfTotal.toFixed(1)}%
											of total
										</p>
									</div>
									<div class="flex items-center gap-2">
										<TrendIcon class="h-4 w-4 {getTrendColor(category.trend)}" />
										<span class="text-sm font-medium {getTrendColor(category.trend)}">
											{category.trend}
										</span>
									</div>
								</div>
								<div class="text-muted-foreground flex items-center justify-between text-xs">
									<span>Avg: {formatCurrencyAmount(category.averageAmount, userCurrency)}</span>
									<span>{category.percentageOfTotal.toFixed(1)}% of spending</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Timing Patterns -->
			{#if spendingPatterns.timingPatterns}
				<div>
					<h3 class="text-foreground mb-4 flex items-center gap-2 text-lg font-semibold">
						<Clock class="text-primary h-5 w-5" />
						Transaction Timing
					</h3>
					<div class="bg-card border-border rounded-lg border p-4">
						<div class="grid grid-cols-2 gap-4">
							<div>
								<p class="text-muted-foreground mb-1 text-xs">Most Active Day</p>
								<p class="text-foreground text-sm font-semibold">
									{spendingPatterns.timingPatterns.mostActiveDay}
								</p>
							</div>
							<div>
								<p class="text-muted-foreground mb-1 text-xs">Most Active Hour</p>
								<p class="text-foreground text-sm font-semibold">
									{formatHour(spendingPatterns.timingPatterns.mostActiveHour)}
								</p>
							</div>
							<div class="border-border col-span-2 border-t pt-3">
								<p class="text-muted-foreground mb-2 text-xs">Weekend vs Weekday</p>
								<div class="flex items-center gap-4">
									<div class="flex-1">
										<div class="mb-1 flex items-center justify-between">
											<span class="text-muted-foreground text-xs">Weekend</span>
											<span class="text-foreground text-xs font-medium">
												{formatCurrencyAmount(
													spendingPatterns.timingPatterns.weekendVsWeekday.weekend,
													userCurrency
												)}
											</span>
										</div>
										<div class="bg-muted h-2 overflow-hidden rounded-full">
											<div
												class="bg-primary h-full"
												style="width: {(spendingPatterns.timingPatterns.weekendVsWeekday.weekend /
													(spendingPatterns.timingPatterns.weekendVsWeekday.weekend +
														spendingPatterns.timingPatterns.weekendVsWeekday.weekday)) *
													100}%"
											></div>
										</div>
									</div>
									<div class="flex-1">
										<div class="mb-1 flex items-center justify-between">
											<span class="text-muted-foreground text-xs">Weekday</span>
											<span class="text-foreground text-xs font-medium">
												{formatCurrencyAmount(
													spendingPatterns.timingPatterns.weekendVsWeekday.weekday,
													userCurrency
												)}
											</span>
										</div>
										<div class="bg-muted h-2 overflow-hidden rounded-full">
											<div
												class="bg-secondary h-full"
												style="width: {(spendingPatterns.timingPatterns.weekendVsWeekday.weekday /
													(spendingPatterns.timingPatterns.weekendVsWeekday.weekend +
														spendingPatterns.timingPatterns.weekendVsWeekday.weekday)) *
													100}%"
											></div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Velocity Patterns -->
			{#if spendingPatterns.velocityPatterns}
				<div>
					<h3 class="text-foreground mb-4 flex items-center gap-2 text-lg font-semibold">
						<TrendingUp class="text-primary h-5 w-5" />
						Spending Velocity
					</h3>
					<div class="bg-card border-border rounded-lg border p-4">
						<div class="grid grid-cols-3 gap-4">
							<div>
								<p class="text-muted-foreground mb-1 text-xs">Avg Transaction</p>
								<p class="text-foreground text-sm font-semibold">
									{formatCurrencyAmount(
										spendingPatterns.velocityPatterns.averageTransactionAmount,
										userCurrency
									)}
								</p>
							</div>
							<div>
								<p class="text-muted-foreground mb-1 text-xs">Frequency</p>
								<p class="text-foreground text-sm font-semibold">
									{spendingPatterns.velocityPatterns.transactionFrequency.toFixed(1)}/day
								</p>
							</div>
							<div>
								<p class="text-muted-foreground mb-1 text-xs">Velocity</p>
								<span
									class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {spendingPatterns
										.velocityPatterns.spendingVelocity === 'high'
										? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
										: spendingPatterns.velocityPatterns.spendingVelocity === 'medium'
											? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
											: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'}"
								>
									{spendingPatterns.velocityPatterns.spendingVelocity}
								</span>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Anomalies -->
			{#if spendingPatterns.anomalyPatterns && spendingPatterns.anomalyPatterns.length > 0}
				<div>
					<h3 class="text-foreground mb-4 flex items-center gap-2 text-lg font-semibold">
						<AlertTriangle class="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
						Unusual Patterns
					</h3>
					<div class="space-y-2">
						{#each spendingPatterns.anomalyPatterns.slice(0, 3) as anomaly (anomaly.transactionId)}
							<div
								class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/10"
							>
								<p class="text-foreground mb-1 text-sm">{anomaly.description}</p>
								<p class="text-muted-foreground text-xs">
									{anomaly.confidence}% confidence
								</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
