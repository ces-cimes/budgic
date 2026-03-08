<script lang="ts">
	import { onMount } from 'svelte';
	import { planService, userService } from '$lib/core/services';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { Wallet } from '@lucide/svelte';

	interface Props {
		/** When embedded in the hotswap strip (no outer card wrapper). */
		embedded?: boolean;
	}

	let { embedded = false }: Props = $props();

	let dailySafe = $state<number | null>(null);
	let spentSoFar = $state<number | null>(null);
	let monthly = $state<number | null>(null);
	let currency = $state<string>('USD');
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
			} else {
				const daily = await planService.getDailyAllowance();
				if (daily) {
					dailySafe = daily.amount;
					currency = daily.currency;
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

{#snippet inner()}
	<div class="flex flex-col gap-0.5 w-full group-data-[collapsible=icon]:items-center">
		<!-- Label row -->
		<div class="flex items-center gap-1.5 group-data-[collapsible=icon]:justify-center">
			<Wallet class="size-3 shrink-0 text-[var(--color-amber)]" />
			<span class="text-[9px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] group-data-[collapsible=icon]:hidden">Allowance</span>
		</div>
		<!-- Amount + /day -->
		{#if loading}
			<div class="flex flex-col gap-1 mt-0.5">
				<div class="h-[18px] w-20 rounded bg-[var(--color-bg-surface)]/60 animate-pulse"></div>
				<div class="h-1.5 w-16 rounded-full bg-[var(--color-bg-surface)]/40 animate-pulse group-data-[collapsible=icon]:hidden"></div>
			</div>
		{:else if dailySafe != null}
			<div class="flex items-baseline gap-1 min-w-0">
				<span class="text-sm font-semibold tabular-nums text-[var(--color-text-primary)] leading-tight break-all group-data-[collapsible=icon]:text-xs">
					{formatTransactionAmount(dailySafe, currency)}
				</span>
				<span class="text-[9px] text-[var(--color-text-tertiary)] shrink-0 group-data-[collapsible=icon]:hidden">/day</span>
			</div>
			{#if monthly != null && monthly > 0}
				<div class="budget-progress mt-0.5 group-data-[collapsible=icon]:hidden">
					<div
						class="budget-progress-fill"
						style="width: {progressPercent}%; --fill-pct: {progressPercent}"
					></div>
				</div>
			{/if}
		{:else}
			<span class="text-xs text-[var(--color-text-tertiary)]">—</span>
		{/if}
	</div>
{/snippet}

{#if embedded}
	{@render inner()}
{:else}
	<div
		class="glass rounded-xl px-3 py-2.5 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2"
		title="Today's allowance"
	>
		{@render inner()}
	</div>
{/if}
