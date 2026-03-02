<script lang="ts">
	import { onMount } from 'svelte';
	import { userService } from '$lib/core/services';
	import { SIDEBAR_FOOTER_CARD_IDS, type SidebarFooterCardId } from '$lib/config/sidebar-footer-cards';
	import SidebarFooterCardTotalBalance from './SidebarFooterCardTotalBalance.svelte';
	import SidebarFooterCardTodayAllowance from './SidebarFooterCardTodayAllowance.svelte';

	let cardIds = $state<SidebarFooterCardId[]>([]);
	let loading = $state(true);

	onMount(async () => {
		try {
			const prefs = await userService.getUserPreferences();
			const raw = prefs?.sidebarFooterCards;
			if (Array.isArray(raw) && raw.length > 0) {
				cardIds = raw.filter((id): id is SidebarFooterCardId =>
					SIDEBAR_FOOTER_CARD_IDS.includes(id as SidebarFooterCardId)
				);
			} else {
				cardIds = ['total_balance', 'today_allowance'];
			}
		} catch (e) {
			console.error('SidebarFooterCards:', e);
			cardIds = ['total_balance', 'today_allowance'];
		} finally {
			loading = false;
		}
	});
</script>

{#if !loading && cardIds.length > 0}
	<div class="flex flex-col gap-1.5 px-2 group-data-[collapsible=icon]:px-1">
		{#each cardIds as cardId (cardId)}
			{#if cardId === 'total_balance'}
				<SidebarFooterCardTotalBalance />
			{:else if cardId === 'today_allowance'}
				<SidebarFooterCardTodayAllowance />
			{/if}
		{/each}
	</div>
{/if}
