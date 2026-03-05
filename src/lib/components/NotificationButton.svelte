<script lang="ts">
	import { notificationsService } from '$lib/core/services';
	import { alertsPanelStore } from '$lib/stores/alerts-panel-store.svelte';
	import { onMount } from 'svelte';
	import Bell from '@lucide/svelte/icons/bell';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';

	let unreadCount = $state(0);
	let badgeVariant = $state<'destructive' | 'warning' | null>(null);
	let updateInterval: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		notificationsService.initialize().then(() => refreshData());
		updateInterval = setInterval(() => {
			refreshData();
		}, 30 * 1000);
		return () => {
			notificationsService.stopPolling();
			if (updateInterval) clearInterval(updateInterval);
		};
	});

	async function refreshData() {
		await notificationsService.refresh();
		unreadCount = notificationsService.unreadCount;
		badgeVariant = notificationsService.badgeVariant;
	}

	function openPanel() {
		alertsPanelStore.openPanel();
	}
</script>

<Button
	variant="ghost"
	size="square"
	class="relative"
	onclick={openPanel}
	aria-label="Alerts"
>
	<Bell size={20} />
	{#if unreadCount > 0}
		<Badge
			variant={badgeVariant === 'warning' ? 'secondary' : 'destructive'}
			class="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-xs {badgeVariant === 'warning' ? 'bg-amber-500 text-white hover:bg-amber-600' : ''}"
		>
			{unreadCount > 99 ? '99+' : unreadCount}
		</Badge>
	{/if}
</Button>
