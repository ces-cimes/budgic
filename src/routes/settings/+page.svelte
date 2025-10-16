<script lang="ts">
  import { goto } from '$app/navigation';
  import { toggleMode, mode } from 'mode-watcher';
  import { Switch } from '$lib/components/ui/switch/index.ts';
  import * as Badge from '$lib/components/ui/badge/index.ts';
  import * as Alert from '$lib/components/ui/alert/index.ts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import { Separator } from '$lib/components/ui/separator/index.ts';
  import { Input } from '$lib/components/ui/input/index.ts';
  import { Label } from '$lib/components/ui/label/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { settingsService } from '$lib/core/services/index.ts';
  import { populateSampleData, clearSampleData, clearAllData } from '$lib/core/sample-data-new';
  import { onMount } from 'svelte';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';

  const { data } = $props<{ data: any }>();

  // User preferences state
  let userPreferences = $state<any>(null);
  let isLoading = $state(true);
  let isSaving = $state(false);
  
  // Form fields
  let username = $state('');
  let notificationsEnabled = $state(true);
  let autoCategorizationEnabled = $state(true);
  let stressDetectionEnabled = $state(true);
  let darkModeEnabled = $derived(mode.current === "dark");
  
  // Dev section state
  let isDevActionLoading = $state(false);
  let devActionMessage = $state<string | null>(null);

  // Sidebar context for mobile detection
  const sidebar = Sidebar.useSidebar();
  
  // Load user preferences on mount
  onMount(async () => {
    try {
      userPreferences = await settingsService.getUserPreferences();
      if (userPreferences) {
        username = userPreferences.username || 'User';
        notificationsEnabled = userPreferences.notificationsEnabled ?? true;
        autoCategorizationEnabled = userPreferences.enablePredictiveAnalytics ?? true;
        stressDetectionEnabled = userPreferences.enableEmotionalIntelligence ?? true;
      } else {
        // Create default preferences if none exist
        userPreferences = await settingsService.createUserPreferences({
          username: 'User',
          notificationsEnabled: true,
          enablePredictiveAnalytics: true,
          enableEmotionalIntelligence: true,
          theme: 'dark'
        });
        username = userPreferences.username;
        notificationsEnabled = userPreferences.notificationsEnabled;
        autoCategorizationEnabled = userPreferences.enablePredictiveAnalytics;
        stressDetectionEnabled = userPreferences.enableEmotionalIntelligence;
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

  // Save preferences to database
  async function savePreferences() {
    if (isSaving) return;
    
    isSaving = true;
    try {
      await settingsService.updateUserPreferences({
        username,
        notificationsEnabled,
        enablePredictiveAnalytics: autoCategorizationEnabled,
        enableEmotionalIntelligence: stressDetectionEnabled,
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

  async function handleClearSampleData() {
    if (isDevActionLoading) return;
    
    isDevActionLoading = true;
    devActionMessage = null;
    
    try {
      await clearSampleData();
      devActionMessage = 'Sample data cleared successfully';
    } catch (error) {
      console.error('Error clearing sample data:', error);
      devActionMessage = 'Error clearing sample data: ' + (error instanceof Error ? error.message : 'Unknown error');
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
      title: 'Personal Settings',
      items: [
        { name: 'Profile Settings', description: 'Update your personal information and financial context', icon: '👤', href: '/settings/profile' },
        { name: 'Security & Privacy', description: 'Control data sharing and privacy preferences', icon: '🔒', href: '/settings/security' }
      ]
    },
    {
      title: 'App Preferences',
      items: [
        { name: 'Notifications', description: 'Configure alerts and reminders', icon: '🔔', href: '/settings/notifications' },
        { name: 'Display Settings', description: 'Theme, language, currency, and accessibility', icon: '🎨', href: '/settings/display' },
        { name: 'Data Management', description: 'Export, import, and manage your financial data', icon: '📊', href: '/settings/data' }
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
  {#snippet bottomBar()}
    <!-- Mobile Navigation -->
    {#if sidebar.isMobile}
      <MobileNavigation />
    {/if}
  {/snippet}

  <div class="container mx-auto px-4 py-6 max-w-4xl">
  <!-- Header -->
  <header class="mb-8">
    <h1 class="text-3xl font-bold text-primary mb-2">Settings</h1>
    <p class="text-muted-foreground">Customize your Budgic experience</p>
  </header>

  {#if isLoading}
    <div class="flex items-center justify-center py-12">
      <div class="text-muted-foreground">Loading settings...</div>
    </div>
  {:else}
    <!-- Profile Section -->
    <section class="mb-8">
      <Card.Root>
        <Card.Header>
          <Card.Title>Profile</Card.Title>
          <Card.Description>Update your personal information</Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="space-y-4">
            <div class="space-y-2">
              <Label for="username">Username</Label>
              <Input
                id="username"
                bind:value={username}
                placeholder="Enter your username"
                class="max-w-xs"
              />
            </div>
          </div>
        </Card.Content>
      </Card.Root>
    </section>

    <!-- Quick Toggles -->
    <section class="mb-8">
      <Card.Root>
        <Card.Header>
          <Card.Title>Quick Settings</Card.Title>
        </Card.Header>
        <Card.Content>
          <div class="space-y-4">
            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  🔔
                </div>
                <div>
                  <div class="font-medium text-primary">Push Notifications</div>
                  <div class="text-sm text-muted-foreground">Get alerts for important events</div>
                </div>
              </div>
              <Switch
                bind:checked={notificationsEnabled}
                aria-label="Toggle push notifications"
              />
            </div>
    
            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  🌙
                </div>
                <div>
                  <div class="font-medium text-primary">Dark Mode</div>
                  <div class="text-sm text-muted-foreground">Switch to dark theme</div>
                </div>
              </div>
              <Switch
                bind:checked={darkModeEnabled}
                aria-label="Toggle dark mode"
              />
            </div>
    
            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  🤖
                </div>
                <div>
                  <div class="font-medium text-primary">Auto Categorization</div>
                  <div class="text-sm text-muted-foreground">AI-powered transaction sorting</div>
                </div>
              </div>
              <Switch
                bind:checked={autoCategorizationEnabled}
                aria-label="Toggle auto categorization"
              />
            </div>
    
            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  😌
                </div>
                <div>
                  <div class="font-medium text-primary">Stress Detection</div>
                  <div class="text-sm text-muted-foreground">Monitor financial stress levels</div>
                </div>
              </div>
              <Switch
                bind:checked={stressDetectionEnabled}
                aria-label="Toggle stress detection"
              />
            </div>
          </div>
        </Card.Content>
      </Card.Root>
    </section>

    <!-- Temp Dev Section -->
    <section class="mb-8">
      <Card.Root>
        <Card.Header>
          <Card.Title>Temp Dev</Card.Title>
          <Card.Description>Development tools for data management</Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="space-y-4">
            {#if devActionMessage}
              <Alert.Root variant={devActionMessage.includes('Error') ? 'destructive' : 'default'}>
                <Alert.Description>{devActionMessage}</Alert.Description>
              </Alert.Root>
            {/if}
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                onclick={handleClearSampleData} 
                disabled={isDevActionLoading}
                class="w-full px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {#if isDevActionLoading}
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                {/if}
                Clear Sample Data
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

    <!-- Settings Sections -->
    <section class="space-y-8">
      {#each settingsSections as section}
        <div>
          <h2 class="text-xl font-semibold text-primary mb-4">{section.title}</h2>
          <div class="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div class="divide-y divide-border">
              {#each section.items as item}
                <button
                  onclick={() => goto(item.href)}
                  class="w-full p-6 text-left hover:bg-accent transition-colors"
                >
                  <div class="flex items-center space-x-4">
                    <div class="w-10 h-10 bg-muted rounded-lg flex items-center justify-center text-lg">
                      {item.icon}
                    </div>
                    <div class="flex-1">
                      <div class="font-medium text-primary">{item.name}</div>
                      <div class="text-sm text-muted-foreground">{item.description}</div>
                    </div>
                    <div class="text-muted-foreground">→</div>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </section>

    <!-- Quick Access -->
    <section class="mt-8">
      <h2 class="text-xl font-semibold text-primary mb-4">Quick Access</h2>
      <div class="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div class="divide-y divide-border">
          <button 
            onclick={() => goto('/accounts')}
            class="w-full p-6 text-left hover:bg-accent transition-colors"
          >
            <div class="flex items-center space-x-4">
              <div class="w-10 h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                🏦
              </div>
              <div class="flex-1">
                <div class="font-medium text-primary">Manage Accounts</div>
                <div class="text-sm text-muted-foreground">Add, edit, or remove your financial accounts</div>
              </div>
              <div class="text-muted-foreground">→</div>
            </div>
          </button>
          
          <button 
            onclick={() => goto('/budget')}
            class="w-full p-6 text-left hover:bg-accent transition-colors"
          >
            <div class="flex items-center space-x-4">
              <div class="w-10 h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                🏷️
              </div>
              <div class="flex-1">
                <div class="font-medium text-primary">Manage Categories</div>
                <div class="text-sm text-muted-foreground">Organize your budget categories and tags</div>
              </div>
              <div class="text-muted-foreground">→</div>
            </div>
          </button>
        </div>
      </div>
    </section>

    <!-- Data Management -->
    <section class="mt-8">
      <h2 class="text-xl font-semibold text-primary mb-4">Data Management</h2>
      <div class="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div class="divide-y divide-border">
          <button 
            onclick={() => goto('/settings/data')}
            class="w-full p-6 text-left hover:bg-accent transition-colors"
          >
            <div class="flex items-center space-x-4">
              <div class="w-10 h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                📊
              </div>
              <div class="flex-1">
                <div class="font-medium text-primary">Export & Import Data</div>
                <div class="text-sm text-muted-foreground">Backup, restore, or migrate your financial data</div>
              </div>
              <div class="text-muted-foreground">→</div>
            </div>
          </button>
        </div>
      </div>
    </section>

    <!-- App Info -->
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