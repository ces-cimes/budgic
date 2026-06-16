<script lang="ts">
	import type { CategoriesTabProps } from '../types.js';
	import * as Card from '$lib/components/ui/card/index.ts';
	import { PieChart, TrendingUp, Minus } from '@lucide/svelte';
	import { formatMainCurrencyAmount, formatPercentage } from '$lib/utils/currency-utils';
	import { Skeleton } from '$lib/components/ui/skeleton';

	interface Props extends CategoriesTabProps {
		children?: any;
	}

	const { categoryData, userCurrency, timeRange, isLoading = false, children }: Props = $props();

	function formatAmount(amount: number) {
		return formatMainCurrencyAmount(amount, userCurrency);
	}
</script>

{#if isLoading}
	<div class="space-y-6 py-2 sm:py-4">
		<div class="rounded-xl border p-6">
			<div class="mb-4 flex items-center gap-4">
				<Skeleton class="h-10 w-10 rounded-lg" />
				<div class="flex-1 space-y-2">
					<Skeleton class="h-5 w-44" />
					<Skeleton class="h-4 w-32" />
				</div>
			</div>
			<div class="space-y-4">
				{#each Array(5) as _}
					<div class="flex items-center justify-between">
						<Skeleton class="h-4 w-32" />
						<Skeleton class="h-4 w-20" />
					</div>
				{/each}
			</div>
		</div>

		<div class="rounded-xl border p-6">
			<Skeleton class="mb-4 h-6 w-36" />
			<div class="space-y-4">
				{#each Array(5) as _}
					<Skeleton class="h-12 w-full rounded-lg" />
				{/each}
			</div>
		</div>
	</div>
{:else}
	<div class="space-y-6 py-2 sm:py-4">
		<!-- Category Overview -->
		<Card.Root class="p-6">
			<div class="mb-4 flex items-center gap-4">
				<div class="bg-accent flex h-10 w-10 items-center justify-center rounded-lg">
					<PieChart class="text-primary h-5 w-5" />
				</div>
				<div>
					<h3 class="text-primary text-lg font-semibold">Spending by Category</h3>
					<p class="text-muted-foreground text-sm">Current {timeRange} breakdown</p>
				</div>
			</div>

			<div class="space-y-4">
				{#each categoryData as category (category.name)}
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<div
								class="h-4 w-4 rounded"
								style="background-color: {category.color}"
							></div>
							<span class="text-primary text-sm font-medium">{category.name}</span>
						</div>
						<div class="text-right">
							<div class="text-primary text-sm font-semibold">
								{formatAmount(category.amount)}
							</div>
							<div class="text-muted-foreground text-xs">
								{formatPercentage(category.percentage)}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</Card.Root>

		<!-- Category Trends -->
		<Card.Root class="p-6">
			<h3 class="text-primary mb-4 text-lg font-semibold">Category Trends</h3>
			<div class="space-y-4">
				{#each categoryData as category (category.name)}
					<div class="bg-muted/50 flex items-center justify-between rounded-lg p-3">
						<div class="flex items-center gap-3">
							{#if category.trend}
								<TrendingUp
									class="h-4 w-4 {category.trend.isPositive
										? 'text-green-500'
										: 'text-red-500'}"
								/>
							{:else}
								<Minus class="text-muted-foreground h-4 w-4" aria-hidden="true" />
							{/if}
							<span class="text-primary text-sm font-medium">{category.name}</span>
						</div>
						{#if category.trend}
							<div
								class="text-sm {category.trend.isPositive
									? 'text-green-500'
									: 'text-red-500'}"
							>
								{category.trend.isPositive ? '+' : ''}{formatPercentage(
									category.trend.value
								)}
							</div>
						{:else}
							<div class="text-muted-foreground text-xs">—</div>
						{/if}
					</div>
				{/each}
			</div>
		</Card.Root>

		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}
