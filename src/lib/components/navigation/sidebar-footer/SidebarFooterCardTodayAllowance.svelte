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
	class="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2"
	title="Today's allowance"
>
	<div class="flex items-center gap-2">
		<Wallet class="size-4 shrink-0 text-muted-foreground" />
		<span class="text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">Allowance</span>
	</div>
	{#if loading}
		<span class="truncate text-sm font-medium">…</span>
	{:else if dailySafe != null}
		<span class="truncate text-sm font-medium">
			{formatTransactionAmount(dailySafe, currency)}<span class="text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">/day</span>
		</span>
		{#if monthly != null && monthly > 0}
			<div class="group-data-[collapsible=icon]:hidden">
				<Progress value={progressPercent} max={100} class="h-1.5" />
			</div>
		{/if}
	{:else}
		<span class="text-muted-foreground text-xs">—</span>
	{/if}
</div>
