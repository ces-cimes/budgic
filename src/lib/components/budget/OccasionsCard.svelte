<script lang="ts">
	import { occasionService } from '$lib/core/services';
	import type { OccasionInPeriod } from '$lib/core/services/analytics/occasion-service';
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { CalendarDays, Plus, RefreshCw } from '@lucide/svelte';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';

	interface Props {
		accountId?: string;
		allowance: EnhancedAllowance | null;
	}

	const { accountId, allowance }: Props = $props();

	let occasionsInPeriod = $state<OccasionInPeriod[]>([]);
	let totalDelta = $state(0);
	let currency = $state('USD');
	let loading = $state(true);

	async function load() {
		if (!allowance) {
			occasionsInPeriod = [];
			totalDelta = 0;
			loading = false;
			return;
		}
		loading = true;
		try {
			const periodStart =
				allowance.periodStart instanceof Date
					? allowance.periodStart
					: new Date(allowance.periodStart);
			const periodEnd =
				allowance.periodEnd instanceof Date ? allowance.periodEnd : new Date(allowance.periodEnd);
			const adj = await occasionService.getAllowanceAdjustmentForPeriod(
				accountId,
				periodStart,
				periodEnd,
				allowance.total.currency
			);
			occasionsInPeriod = adj.occasions;
			totalDelta = adj.totalDelta;
			currency = adj.currency;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	function openManage() {
		goto('/settings/plan#occasions');
	}
</script>

{#if allowance}
	<Card class="border-border">
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<CalendarDays class="h-5 w-5" />
				Occasions this period
			</CardTitle>
			<CardDescription>Recurring spending events that adjust your allowance</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if loading}
				<p class="text-muted-foreground text-sm">Loading…</p>
			{:else if occasionsInPeriod.length === 0}
				<p class="text-muted-foreground text-sm">
					No occasions this period. Add or detect occasions to adjust your allowance for recurring
					spending (e.g. Friday nights, first weekend).
				</p>
			{:else}
				<ul class="space-y-2">
					{#each occasionsInPeriod as item}
						<li class="flex justify-between text-sm">
							<span>{item.occasion.title}</span>
							<span class={item.amountDelta >= 0 ? 'text-success' : 'text-muted-foreground'}>
								{item.amountDelta >= 0 ? '+' : ''}{formatTransactionAmount(
									item.amountDelta,
									item.occasion.currency
								)}
								{#if item.occurrences > 1}
									<span class="text-muted-foreground"> ×{item.occurrences}</span>
								{/if}
							</span>
						</li>
					{/each}
				</ul>
				{#if totalDelta !== 0}
					<div class="flex justify-between border-t pt-2 text-sm font-medium">
						<span>Total adjustment</span>
						<span class={totalDelta >= 0 ? 'text-success' : 'text-muted-foreground'}>
							{totalDelta >= 0 ? '+' : ''}{formatTransactionAmount(totalDelta, currency)}
						</span>
					</div>
				{/if}
			{/if}
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={openManage}>Manage occasions</Button>
			</div>
		</CardContent>
	</Card>
{/if}
