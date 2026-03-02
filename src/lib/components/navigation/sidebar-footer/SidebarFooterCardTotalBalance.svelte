<script lang="ts">
	import { onMount } from 'svelte';
	import { accountService, userService } from '$lib/core/services';
	import { formatAmount } from '$lib/utils/currency-utils';
	import { Wallet } from '@lucide/svelte';

	let balance = $state<number | null>(null);
	let currency = $state<string>('USD');
	let loading = $state(true);

	onMount(async () => {
		try {
			const prefs = await userService.getUserPreferences();
			currency = prefs?.currency ?? 'USD';
			balance = await accountService.getTotalBalance();
		} catch (e) {
			console.error('SidebarFooterCardTotalBalance:', e);
			balance = 0;
		} finally {
			loading = false;
		}
	});
</script>

<div
	class="glass flex items-center justify-between gap-2 px-3 py-2.5 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2"
	title="Total balance"
>
	<div class="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
		<Wallet class="size-3.5 shrink-0 text-[var(--color-amber)]" />
		{#if !loading}
			<span class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] group-data-[collapsible=icon]:hidden">Balance</span>
		{:else}
			<span class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] group-data-[collapsible=icon]:hidden">Balance</span>
		{/if}
	</div>
	{#if loading}
		<div class="h-4 w-20 animate-pulse rounded bg-[var(--color-bg-surface)] group-data-[collapsible=icon]:w-10"></div>
	{:else}
		<span class="text-amount truncate text-[var(--color-text-primary)]">
			{formatAmount(balance ?? 0, currency)}
		</span>
	{/if}
</div>
