<script lang="ts">
	import type { AccountPaceResult } from '$lib/core/services/core/account-pace-service';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { TrendingDown, TrendingUp, Minus } from '@lucide/svelte';

	interface Props {
		pace: AccountPaceResult | null;
		loading?: boolean;
	}

	const { pace, loading = false }: Props = $props();

	const velocityCopy = $derived.by(() => {
		if (!pace) return '';
		switch (pace.velocityLabel) {
			case 'faster':
				return pace.velocityRatio != null
					? `Spending ${Math.round((pace.velocityRatio - 1) * 100)}% faster than the same days last month`
					: 'Spending this month with no comparable spend last month';
			case 'slower':
				return pace.velocityRatio != null
					? `Spending ${Math.round((1 - pace.velocityRatio) * 100)}% slower than the same days last month`
					: 'Lower spend than last month';
			case 'similar':
				return 'Spending pace is similar to the same days last month';
			default:
				return 'Not enough prior-month data for a velocity comparison';
		}
	});

	const VelocityIcon = $derived(
		pace?.velocityLabel === 'faster'
			? TrendingUp
			: pace?.velocityLabel === 'slower'
				? TrendingDown
				: Minus
	);
</script>

{#if loading}
	<div class="space-y-3 py-4">
		<div class="h-4 w-1/2 animate-pulse rounded bg-[var(--color-bg-surface)]"></div>
		<div class="h-3 w-2/3 animate-pulse rounded bg-[var(--color-bg-surface)]"></div>
	</div>
{:else if pace}
	<div class="space-y-4">
		<p class="text-muted-foreground text-sm">
			Account spending pace for the first {pace.daysElapsedInMonth} day{pace.daysElapsedInMonth ===
			1
				? ''
				: 's'} of the month (main currency).
		</p>
		<div class="grid grid-cols-2 gap-4">
			<div>
				<p class="text-muted-foreground text-xs">This month (MTD)</p>
				<p class="text-lg font-semibold">
					{formatTransactionAmount(pace.mtdSpend, pace.currency)}
				</p>
			</div>
			<div>
				<p class="text-muted-foreground text-xs">Same window last month</p>
				<p class="text-lg font-semibold">
					{formatTransactionAmount(pace.priorPeriodSpend, pace.currency)}
				</p>
			</div>
		</div>
		<div class="border-border bg-muted/30 flex items-start gap-2 rounded-lg border px-3 py-2">
			<VelocityIcon
				class="mt-0.5 size-4 shrink-0 {pace.velocityLabel === 'faster'
					? 'text-destructive'
					: pace.velocityLabel === 'slower'
						? 'text-success'
						: 'text-muted-foreground'}"
			/>
			<p class="text-sm">{velocityCopy}</p>
		</div>
	</div>
{:else}
	<p class="text-muted-foreground py-4 text-sm">Unable to load account pace.</p>
{/if}
