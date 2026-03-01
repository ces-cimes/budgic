<script lang="ts">
  import { goto } from '$app/navigation';
  import { toggleMode, mode } from 'mode-watcher';
  import { Switch } from '$lib/components/ui/switch/index.ts';
  import * as Badge from '$lib/components/ui/badge/index.ts';
  import * as Alert from '$lib/components/ui/alert/index.ts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import { Separator } from '$lib/components/ui/separator/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { userService } from '$lib/core/services/index.ts';
  import { populateSampleData, clearAllData } from '$lib/core/test-data';
  import { onMount } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import { PageLayout } from '$lib/components/layouts';

  const { data } = $props<{ data: any }>();

  let userPreferences = $state<any>(null);
  let isLoading = $state(true);
  let isSaving = $state(false);
  let username = $state('');
  let notificationsEnabled = $state(true);
  let autoCategorizationEnabled = $state(true);
  let stressDetectionEnabled = $state(true);
  let darkModeEnabled = $derived(mode.current === "dark");

  // Dev section state
  let isDevActionLoading = $state(false);
  let devActionMessage = $state<string | null>(null);
  
  // Load user preferences on mount
  onMount(async () => {
    try {
      userPreferences = await userService.getUserPreferences();
      if (userPreferences) {
        username = userPreferences.username || 'User';
        notificationsEnabled = userPreferences.analyticsEnabled ?? true;
        autoCategorizationEnabled = userPreferences.enablePredictiveAnalytics ?? true;
        stressDetectionEnabled = userPreferences.enableAdvancedFeatures ?? true;
      } else {
        // Create default preferences if none exist
        userPreferences = await userService.updateUserPreferences({
          username: 'User',
          analyticsEnabled: true,
          enablePredictiveAnalytics: true,
          enableAdvancedFeatures: true,
          theme: 'dark'
        });
        username = userPreferences.username;
        notificationsEnabled = userPreferences.analyticsEnabled;
        autoCategorizationEnabled = userPreferences.enablePredictiveAnalytics;
        stressDetectionEnabled = userPreferences.enableAdvancedFeatures;
      }
    } catch (error) {
      console.error('Failed to load user preferences:', error);
    } finally {
      isLoading = false;
    }
  });
  
  $effect(() => {
    if (darkModeEnabled && mode.current !== "dark") {
      toggleMode();
    } else if (!darkModeEnabled && mode.current !== "light") {
      toggleMode();
    }
  });

  async function savePreferences() {
    if (isSaving) return;
    isSaving = true;
    try {
      const current = await userService.getUserPreferences();
      await userService.updateUserPreferences({
        ...current,
        username,
        analyticsEnabled: notificationsEnabled,
        enablePredictiveAnalytics: autoCategorizationEnabled,
        enableAdvancedFeatures: stressDetectionEnabled,
        theme: darkModeEnabled ? 'dark' : 'light'
      });
    } catch (error) {
      console.error('Failed to save preferences:', error);
    } finally {
      isSaving = false;
    }
  }

  // Auto-save when preferences change
  $effect(() => {
    if (!isLoading && userPreferences) {
      savePreferences();
    }
  });

  // Dev section functions
  async function handleClearAllData() {
    if (isDevActionLoading) return;
    
    isDevActionLoading = true;
    devActionMessage = null;
    
    try {
      await clearAllData();
      devActionMessage = 'All data cleared successfully';
    } catch (error) {
      console.error('Error clearing all data:', error);
      devActionMessage = 'Error clearing data: ' + (error instanceof Error ? error.message : 'Unknown error');
    } finally {
      isDevActionLoading = false;
    }
  }


  async function handlePopulateSampleData() {
    if (isDevActionLoading) return;
    
    isDevActionLoading = true;
    devActionMessage = null;
    
    try {
      await populateSampleData();
      devActionMessage = 'Sample data populated successfully';
    } catch (error) {
      console.error('Error populating sample data:', error);
      devActionMessage = 'Error populating sample data: ' + (error instanceof Error ? error.message : 'Unknown error');
    } finally {
      isDevActionLoading = false;
    }
  }

  const settingsSections = [
    {
      title: 'Personal',
      items: [
        { name: 'Profile', description: 'Update your personal information', icon: '👤', href: '/settings/profile' },
        { name: 'Security & Privacy', description: 'Manage security and privacy preferences', icon: '🔒', href: '/settings/security' }
      ]
    },
    {
      title: 'App',
      items: [
        { name: 'Display', description: 'Theme, language, and currency', icon: '🎨', href: '/settings/display' },
        { name: 'Currency', description: 'Currencies and exchange rates', icon: '💱', href: '/settings/currency' },
        { name: 'Navigation', description: 'Nav order and visibility', icon: '🧭', href: '/settings/navigation' },
        { name: 'Notifications', description: 'Notification preferences', icon: '🔔', href: '/settings/notifications' }
      ]
    },
    {
      title: 'Plan defaults',
      items: [
        { name: 'Budget & allowance', description: 'Overspending, envelope borrowing, rollover', icon: '📋', href: '/settings/plan' }
      ]
    },
    {
      title: 'Data',
      items: [
        { name: 'Export & import', description: 'Backup, restore, or migrate data', icon: '📊', href: '/settings/data' }
      ]
    }
  ];

  function toggleSetting(setting: string) {
    switch(setting) {
      case 'notifications':
        notificationsEnabled = !notificationsEnabled;
        break;
      case 'darkMode':
        toggleMode();
        break;
      case 'autoCategorization':
        autoCategorizationEnabled = !autoCategorizationEnabled;
        break;
      case 'stressDetection':
        stressDetectionEnabled = !stressDetectionEnabled;
        break;
    }
  }
</script>

<svelte:head>
  <title>Settings | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <!-- Header -->
    <Header title="Settings" />
  {/snippet}

  

  <div class="container mx-auto p-2 sm:p-4 max-w-4xl">

  {#if isLoading}
    <div class="flex items-center justify-center py-12">
      <div class="text-muted-foreground">Loading settings...</div>
    </div>
  {:else}
    <!-- Settings hub: link sections first -->
    <section class="mb-8 space-y-6">
      {#each settingsSections as section}
        <div>
          <h2 class="text-primary mb-3 text-lg font-semibold">{section.title}</h2>
          <div class="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
            <div class="divide-border divide-y">
              {#each section.items as item}
                <button
                  type="button"
                  onclick={() => goto(item.href)}
                  class="hover:bg-accent flex w-full items-center gap-4 p-4 text-left transition-colors"
                >
                  <span class="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg">{item.icon}</span>
                  <div class="min-w-0 flex-1">
                    <div class="font-medium text-primary">{item.name}</div>
                    <div class="text-muted-foreground truncate text-sm">{item.description}</div>
                  </div>
                  <span class="text-muted-foreground">→</span>
                </button>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </section>

    <!-- Quick toggles -->
    <section class="mb-8">
      <Card.Root>
        <Card.Header>
          <Card.Title>Quick toggles</Card.Title>
          <Card.Description>Common switches (saved automatically)</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Dark mode</span>
            <Switch bind:checked={darkModeEnabled} aria-label="Toggle dark mode" />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Predictive analytics</span>
            <Switch bind:checked={autoCategorizationEnabled} aria-label="Toggle predictive analytics" />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Analytics</span>
            <Switch bind:checked={notificationsEnabled} aria-label="Toggle analytics" />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Advanced features</span>
            <Switch bind:checked={stressDetectionEnabled} aria-label="Toggle advanced features" />
          </div>
        </Card.Content>
      </Card.Root>
    </section>

    <section class="mb-8">
      <Card.Root>
        <Card.Header>
          <Card.Title>Developer</Card.Title>
          <Card.Description>Development tools for data management</Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="space-y-4">
            {#if devActionMessage}
              <Alert.Root variant={devActionMessage.includes('Error') ? 'destructive' : 'default'}>
                <Alert.Description>{devActionMessage}</Alert.Description>
              </Alert.Root>
            {/if}
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onclick={handleClearAllData} 
                disabled={isDevActionLoading}
                class="w-full px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {#if isDevActionLoading}
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {/if}
                Clear All Data
              </button>
              
              <button 
                onclick={handlePopulateSampleData} 
                disabled={isDevActionLoading}
                class="w-full px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {#if isDevActionLoading}
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                {/if}
                Populate Sample Data
              </button>
            </div>
          </div>
        </Card.Content>
      </Card.Root>
    </section>

    <!-- App info -->
    <section class="mt-8">
      <div class="bg-muted rounded-2xl p-6">
        <div class="text-center">
          <div class="text-2xl mb-2">🎯</div>
          <div class="font-semibold text-primary mb-1">Budgic</div>
          <div class="text-sm text-muted-foreground mb-4">Version 1.0.0</div>
          <div class="text-xs text-muted-foreground">
            © 2024 Budgic. All rights reserved.
          </div>
        </div>
      </div>
    </section>
  {/if}
  </div>
</PageLayout> 