<script lang="ts">
	import type { TrendsTabProps } from '../types.js';
	import { TimeRangeSelector } from '$lib/components/shared';
	import * as Card from '$lib/components/ui/card/index.ts';
	import { TrendingUp, BarChart3 } from '@lucide/svelte';
	import SpendingPatterns from '../SpendingPatterns.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';

	interface Props extends TrendsTabProps {
		children?: any;
	}

	const {
		timeRange,
		onTimeRangeChange,
		analytics,
		userCurrency,
		isLoading = false,
		children
	}: Props = $props();

	const timeRangeOptions = ['week', 'month', 'quarter', 'year'];
</script>

{#if isLoading}
	<div class="space-y-6 py-2 sm:py-4">
		<Skeleton class="h-10 w-full max-w-xs rounded-lg" />

		<div class="space-y-4">
			<Skeleton class="h-36 w-full rounded-xl" />
			<Skeleton class="h-52 w-full rounded-xl" />
		</div>

		<div>
			<Skeleton class="mb-4 h-6 w-40" />
			<Skeleton class="h-32 w-full rounded-xl" />
		</div>
	</div>
{:else}
	<div class="space-y-6 py-2 sm:py-4">
		<!-- Time Range Selector -->
		<TimeRangeSelector
			value={timeRange}
			options={timeRangeOptions}
			onChange={onTimeRangeChange}
		/>

		<!-- Trend Cards -->
		<div class="space-y-4">
			<Card.Root class="p-6">
				<div class="mb-4 flex items-center gap-4">
					<div class="bg-accent flex h-10 w-10 items-center justify-center rounded-lg">
						<TrendingUp class="text-primary h-5 w-5" />
					</div>
					<div>
						<h3 class="text-primary text-lg font-semibold">Spending Trend</h3>
						<p class="text-muted-foreground text-sm">vs last {timeRange}</p>
					</div>
				</div>

				<div class="flex items-center justify-between">
					<div class="text-3xl font-bold text-red-500">+12.5%</div>
					<div class="text-muted-foreground text-sm">$2,847 → $3,203</div>
				</div>
			</Card.Root>

			<Card.Root class="p-6">
				<div class="mb-4 flex items-center gap-4">
					<div class="bg-accent flex h-10 w-10 items-center justify-center rounded-lg">
						<BarChart3 class="text-primary h-5 w-5" />
					</div>
					<div>
						<h3 class="text-primary text-lg font-semibold">Category Changes</h3>
						<p class="text-muted-foreground text-sm">Top spending categories</p>
					</div>
				</div>

				<div class="space-y-3">
					<div class="bg-muted/50 flex items-center justify-between rounded-lg p-3">
						<span class="text-primary text-sm font-medium">Food & Dining</span>
						<span class="text-sm text-red-500">+8.2%</span>
					</div>
					<div class="bg-muted/50 flex items-center justify-between rounded-lg p-3">
						<span class="text-primary text-sm font-medium">Transportation</span>
						<span class="text-sm text-red-500">+15.7%</span>
					</div>
					<div class="bg-muted/50 flex items-center justify-between rounded-lg p-3">
						<span class="text-primary text-sm font-medium">Entertainment</span>
						<span class="text-sm text-green-500">-5.3%</span>
					</div>
				</div>
			</Card.Root>
		</div>

		<!-- Spending Patterns -->
		<div>
			<h3 class="text-foreground mb-4 text-lg font-semibold">Spending Patterns</h3>
			<SpendingPatterns {userCurrency} />
		</div>

		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}
