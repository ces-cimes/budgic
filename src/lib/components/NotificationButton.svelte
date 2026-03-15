<script lang="ts">
	import { notificationsService } from '$lib/core/services';
	import { alertsPanelStore } from '$lib/stores/alerts-panel-store.svelte';
	import { onMount } from 'svelte';
	import Bell from '@lucide/svelte/icons/bell';
	import { Button } from '$lib/components/ui/button';
	import AlertBadge from '$lib/components/AlertBadge.svelte';

	let unreadCount = $state(0);
	let badgeVariant = $state<'destructive' | 'warning' | null>(null);
	let updateInterval: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		notificationsService.initialize().then(() => refreshData());
		updateInterval = setInterval(() => {
			refreshData();
		}, 30 * 1000);
		const onAlertsUpdated = () => refreshData();
		window.addEventListener('alerts-updated', onAlertsUpdated);
		return () => {
			window.removeEventListener('alerts-updated', onAlertsUpdated);
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

	const variant = $derived((badgeVariant === 'warning' ? 'warning' : 'destructive') as 'destructive' | 'warning');
</script>

<Button
	variant="ghost"
	size="square"
	class="relative overflow-visible"
	onclick={openPanel}
	aria-label="Alerts"
>
	<Bell size={20} />
	<AlertBadge
		count={unreadCount}
		variant={variant}
		compact={true}
		class="absolute -top-1 -right-1"
	/>
</Button>
