<script lang="ts">
	import { onMount } from 'svelte';
	import { planService, userService } from '$lib/core/services';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { Wallet } from '@lucide/svelte';
	import { Progress } from '$lib/components/ui/progress';

	let dailySafe = $state<number | null>(null);
	let spentSoFar = $state<number | null>(null);
	let monthly = $state<number | null>(null);
	let currency = $state<string>('USD');
	let daysRemaining = $state<number | null>(null);
	let loading = $state(true);

	const progressPercent = $derived(
		monthly != null && monthly > 0 && spentSoFar != null
			? Math.min(100, (spentSoFar / monthly) * 100)
			: 0
	);

	onMount(async () => {
		try {
			const prefs = await userService.getUserPreferences();
			currency = prefs?.currency ?? 'USD';
			const allowance = await planService.getEnhancedAllowance();
			if (allowance) {
				dailySafe = allowance.total.dailySafe;
				spentSoFar = allowance.total.spentSoFar;
				monthly = allowance.total.monthly;
				daysRemaining = allowance.total.daysRemaining;
			} else {
				const daily = await planService.getDailyAllowance();
				if (daily) {
					dailySafe = daily.amount;
					currency = daily.currency;
					daysRemaining = daily.daysRemaining;
					spentSoFar = null;
					monthly = null;
				}
			}
		} catch (e) {
			console.error('SidebarFooterCardTodayAllowance:', e);
			dailySafe = 0;
		} finally {
			loading = false;
		}
	});
</script>

<div
	class="glass flex flex-col gap-1.5 px-3 py-2.5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2"
	title="Today's allowance"
>
	<div class="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
		<div class="flex items-center gap-2">
			<Wallet class="size-3.5 shrink-0 text-[var(--color-amber)]" />
			<span class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] group-data-[collapsible=icon]:hidden">Safe to spend</span>
		</div>
	</div>
	{#if loading}
		<div class="h-4 w-16 animate-pulse rounded bg-[var(--color-bg-surface)] group-data-[collapsible=icon]:w-10"></div>
	{:else if dailySafe != null}
		<div class="flex items-baseline gap-1">
			<span class="text-amount truncate text-[var(--color-text-primary)]">
				{formatTransactionAmount(dailySafe, currency)}
			</span>
			<span class="text-[10px] text-[var(--color-text-tertiary)] group-data-[collapsible=icon]:hidden">/day</span>
		</div>
		{#if monthly != null && monthly > 0}
			<div class="budget-progress group-data-[collapsible=icon]:hidden">
				<div
					class="budget-progress-fill"
					style="width: {progressPercent}%; --fill-pct: {progressPercent}"
				></div>
			</div>
		{/if}
	{:else}
		<span class="text-[var(--color-text-tertiary)] text-xs">—</span>
	{/if}
</div>
