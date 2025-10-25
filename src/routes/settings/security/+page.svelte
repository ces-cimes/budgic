<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { userService } from '$lib/core/services';
  import { PageLayout } from '$lib/components/layouts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { Switch } from '$lib/components/ui/switch/index.ts';
  import * as Alert from '$lib/components/ui/alert/index.ts';
  import type { UserPreferences } from '$lib/core/db';

  // State
  let isLoading = $state(true);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  
  // Privacy settings - only fields that exist in schema
  let analyticsEnabled = $state(true);
  let backupEnabled = $state(true);

  // Load user preferences on mount
  onMount(async () => {
    try {
      const preferences = await userService.getUserPreferences();
      if (preferences) {
        analyticsEnabled = preferences.analyticsEnabled ?? true;
        backupEnabled = preferences.backupEnabled ?? true;
      }
    } catch (err) {
      error = 'Failed to load security settings';
      console.error('Error loading preferences:', err);
    } finally {
      isLoading = false;
    }
  });

  // Save preferences
  async function savePreferences() {
    if (isSaving) return;
    
    isSaving = true;
    error = null;
    success = null;
    
    try {
      await userService.updateUserPreferences({
        analyticsEnabled,
        backupEnabled
      });
      success = 'Security settings saved successfully';
    } catch (err) {
      error = 'Failed to save security settings';
      console.error('Error saving preferences:', err);
    } finally {
      isSaving = false;
    }
  }
</script>

<svelte:head>
  <title>Security & Privacy Settings | Budgic</title>
</svelte:head>

<PageLayout>
  <div class="container mx-auto px-4 py-6 max-w-4xl">
    <!-- Header -->
    <header class="mb-8">
      <div class="flex items-center gap-4 mb-4">
        <Button.Root variant="ghost" size="sm" onclick={() => goto('/settings')}>
          ← Back to Settings
        </Button.Root>
      </div>
      <h1 class="text-3xl font-bold text-primary mb-2">Security & Privacy</h1>
      <p class="text-muted-foreground">Control your data privacy and security preferences</p>
    </header>

    {#if isLoading}
      <div class="flex items-center justify-center py-12">
        <div class="text-muted-foreground">Loading security settings...</div>
      </div>
    {:else}
      <!-- Error/Success Messages -->
      {#if error}
        <Alert.Root variant="destructive" class="mb-6">
          <Alert.Description>{error}</Alert.Description>
        </Alert.Root>
      {/if}
      
      {#if success}
        <Alert.Root variant="default" class="mb-6">
          <Alert.Description>{success}</Alert.Description>
        </Alert.Root>
      {/if}

      <!-- Privacy Settings -->
      <form onsubmit={(e) => { e.preventDefault(); savePreferences(); }} class="space-y-8">
        <!-- Data Privacy -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Data Privacy</Card.Title>
            <Card.Description>Control how your data is used and shared</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-6">
            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  📊
                </div>
                <div>
                  <div class="font-medium text-primary">Analytics</div>
                  <div class="text-sm text-muted-foreground">Help improve the app by sharing usage data</div>
                </div>
              </div>
              <Switch
                bind:checked={analyticsEnabled}
                aria-label="Toggle analytics"
              />
            </div>

            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  💾
                </div>
                <div>
                  <div class="font-medium text-primary">Data Backup</div>
                  <div class="text-sm text-muted-foreground">Automatically backup your financial data</div>
                </div>
              </div>
              <Switch
                bind:checked={backupEnabled}
                aria-label="Toggle data backup"
              />
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Actions -->
        <div class="flex gap-4">
          <Button.Root type="submit" disabled={isSaving}>
            {#if isSaving}
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            {/if}
            Save Settings
          </Button.Root>
          
          <Button.Root variant="outline" onclick={() => goto('/settings')}>
            Cancel
          </Button.Root>
        </div>
      </form>
    {/if}
  </div>
</PageLayout>