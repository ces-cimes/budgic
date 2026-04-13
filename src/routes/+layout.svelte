<script lang="ts">
	import '../app.css';
	import { registerServiceWorker, handleOfflineStatus } from '$lib/pwa';
	import { onMount } from 'svelte';
	import { ModeWatcher } from 'mode-watcher';
	import {
		insightsService,
		crossRouteSyncService,
		notificationsService,
		exchangeRateService,
		badgeService
	} from '$lib/core/services';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';
	import { AppLayout } from '$lib/components/layouts';
	import { Toaster } from '$lib/components/ui/sonner';
	import AchievementNotificationManager from '$lib/components/insights/AchievementNotificationManager.svelte';
	import AlertsPanel from '$lib/components/AlertsPanel.svelte';

	let { children } = $props();

	onMount(() => {
		registerServiceWorker();
		handleOfflineStatus();

		// Start insights service auto-updates
		insightsService.startAutoUpdates();

		// Start cross-route sync service
		crossRouteSyncService.start();

		// Initialize notifications first so alerts DB state is ready before nav badges read it
		notificationsService.initialize().then(() => {
			navigationStore.initialize();
		});

		// Start exchange rate service auto-updates
		exchangeRateService.startAutoUpdates();

		// Initial badge check
		badgeService.checkAllBadges(true).catch(console.error);

		// Cleanup on unmount
		return () => {
			insightsService.stopAutoUpdates();
			crossRouteSyncService.stop();
			notificationsService.stopPolling();
			navigationStore.stopBadgeUpdates();
			exchangeRateService.stopAutoUpdates();
		};
	});
</script>

<svelte:head>
	<title>Budgic - Smart Financial Management</title>
	<meta
		name="description"
		content="Intelligent personal finance management with emotional intelligence"
	/>
	<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
	<meta name="theme-color" content="#3b82f6" />
	<link rel="manifest" href="/manifest.json" />
	<link rel="apple-touch-icon" href="/icon-192.png" />
</svelte:head>

<ModeWatcher />

<AppLayout>
	{@render children?.()}
</AppLayout>

<AlertsPanel />

<Toaster
	position="top-center"
	toastOptions={{
		duration: 3000,
		style: 'margin-top: 1rem;'
	}}
/>

<AchievementNotificationManager enabled={true} checkInterval={60000} />
