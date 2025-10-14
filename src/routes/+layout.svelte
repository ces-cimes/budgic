<script lang="ts">
  import '../app.css';
  import { registerServiceWorker, handleOfflineStatus } from '$lib/pwa';
  import { onMount } from 'svelte';
  import { ModeWatcher } from 'mode-watcher';
  import { insightsService } from '$lib/core/services';
  import { AppLayout } from '$lib/components/layouts';

  let { children } = $props();

  onMount(() => {
    registerServiceWorker();
    handleOfflineStatus();
    
    // Start insights service auto-updates
    insightsService.startAutoUpdates();
    
    // Cleanup on unmount
    return () => {
      insightsService.stopAutoUpdates();
    };
  });
</script>

<svelte:head>
  <title>Budgic - Smart Financial Management</title>
  <meta name="description" content="Intelligent personal finance management with emotional intelligence" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#3b82f6" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/icon-192.png" />
</svelte:head>

<ModeWatcher />

<AppLayout>
  {@render children?.()}
</AppLayout>
