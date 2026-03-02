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
	class="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2"
	title="Total balance"
>
	<div class="flex items-center gap-2">
		<Wallet class="size-4 shrink-0 text-muted-foreground" />
		{#if loading}
			<span class="text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">…</span>
			<span class="truncate text-sm font-medium group-data-[collapsible=icon]:text-xs">…</span>
		{:else}
			<span class="text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">Balance</span>
		{/if}
	</div>
	{#if !loading}
		<span class="truncate text-sm font-medium">
			{formatAmount(balance ?? 0, currency)}
		</span>
	{/if}
</div>
