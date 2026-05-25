<script lang="ts">
	import { onMount } from 'svelte';
	import { accountService, userService } from '$lib/core/services';
	import { formatAmount } from '$lib/utils/currency-utils';
	import { Wallet } from '@lucide/svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';

	interface Props {
		/** When embedded in the hotswap strip (no outer card wrapper). */
		embedded?: boolean;
	}

	let { embedded = false }: Props = $props();

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

{#snippet inner()}
	<div class="flex w-full flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
		<!-- Label row -->
		<div class="flex items-center gap-1.5 group-data-[collapsible=icon]:justify-center">
			<Wallet class="size-3 shrink-0 text-[var(--color-amber)]" />
			<span
				class="text-[9px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase group-data-[collapsible=icon]:hidden"
				>Balance</span
			>
		</div>
		<!-- Amount row -->
		{#if loading}
			<Skeleton
				class="mt-0.5 h-[18px] w-20 rounded bg-[var(--color-bg-surface)]/60 group-data-[collapsible=icon]:w-10"
			/>
		{:else}
			<span
				class="text-sm leading-tight font-semibold break-all text-[var(--color-text-primary)] tabular-nums group-data-[collapsible=icon]:text-xs"
				title={formatAmount(balance ?? 0, currency)}
			>
				{formatAmount(balance ?? 0, currency)}
			</span>
		{/if}
	</div>
{/snippet}

{#if embedded}
	{@render inner()}
{:else}
	<div
		class="glass rounded-xl px-3 py-2.5 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2"
		title="Total balance"
	>
		{@render inner()}
	</div>
{/if}
