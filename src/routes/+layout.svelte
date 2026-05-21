<script lang="ts">
	import '../app.css';
	import { handleOfflineStatus } from '$lib/pwa';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { requestStoragePersistence } from '$lib/storage-persistence';
	import {
		initBackupSyncOnce,
		stopBackupSync,
		restoreFromServerIfEmpty,
		reloadPageAfterRestoreIfNeeded
	} from '$lib/core/services/import-export';
	import { ModeWatcher } from 'mode-watcher';
	import {
		insightsService,
		crossRouteSyncService,
		notificationsService,
		exchangeRateService,
		badgeService,
		recurringTransactionIntelligenceService
	} from '$lib/core/services';
	import { performanceMonitor } from '$lib/core/services/core/performance-monitor';
	import { devLog } from '$lib/utils/dev-log';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';
	import { AppLayout } from '$lib/components/layouts';
	import { Toaster } from '$lib/components/ui/sonner';
	import AchievementNotificationManager from '$lib/components/insights/AchievementNotificationManager.svelte';
	import AlertsPanel from '$lib/components/AlertsPanel.svelte';

	let { children } = $props();

	onMount(() => {
		handleOfflineStatus();

		void requestStoragePersistence().then(({ isStandalone, persisted }) => {
			if (import.meta.env.DEV) {
				devLog('[storage]', { isStandalone, persisted });
			}
			if (!isStandalone && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
				const key = 'budgic_ios_install_hint_shown';
				if (!sessionStorage.getItem(key)) {
					sessionStorage.setItem(key, '1');
					toast.info('Install to Home Screen for reliable saving on iPhone', {
						duration: 8000
					});
				}
			}
		});

		void (async () => {
			try {
				const restored = await restoreFromServerIfEmpty(() =>
					confirm(
						'No local data found. Restore your latest backup from the server? This replaces any local data.'
					)
				);
				if (restored) {
					toast.success('Restored from server backup');
					reloadPageAfterRestoreIfNeeded();
					return;
				}
			} catch (err) {
				console.error('[backup] restore on startup failed:', err);
			}

			initBackupSyncOnce();
		})();

		// In dev, surface slow operations (>500 ms) to the console.
		if (import.meta.env.DEV) {
			performanceMonitor.addListener((report) => {
				const slow = report.services.filter((s) => s.maxExecutionTime > 500);
				if (slow.length > 0) {
					devLog(
						'[perf] slow operations:',
						slow.map((s) => `${s.serviceName} ${s.maxExecutionTime.toFixed(0)}ms`)
					);
				}
			});
		}

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

		// Pre-warm the recurring pattern cache so plan/patterns pages don't cold-start.
		// Runs during browser idle time to avoid competing with startup work.
		const warmPatterns = () =>
			recurringTransactionIntelligenceService.detectPatterns().catch(() => {});
		if (typeof requestIdleCallback !== 'undefined') {
			requestIdleCallback(warmPatterns, { timeout: 30_000 });
		} else {
			setTimeout(warmPatterns, 5_000);
		}

		// Cleanup on unmount
		return () => {
			stopBackupSync();
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
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
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
