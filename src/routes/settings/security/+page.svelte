<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { settingsService } from '$lib/core/services/settings-service';
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
  
  // Privacy settings
  let dataSharingEnabled = $state(false);
  let analyticsEnabled = $state(true);
  let backupEnabled = $state(true);
  let userActionsTrackingEnabled = $state(true);
  
  // User actions tracking preferences
  let trackingPreferences = $state({
    transaction_timing: true,
    budget_adherence: true,
    spending_patterns: true,
    habit_formation: true
  });


  // Load user preferences on mount
  onMount(async () => {
    try {
      const preferences = await settingsService.getUserPreferences();
      if (preferences) {
        dataSharingEnabled = preferences.dataSharingEnabled ?? false;
        analyticsEnabled = preferences.analyticsEnabled ?? true;
        backupEnabled = preferences.backupEnabled ?? true;
        userActionsTrackingEnabled = preferences.userActionsTrackingEnabled ?? true;
        trackingPreferences = preferences.userActionsTrackingPreferences ?? {
          transaction_timing: true,
          budget_adherence: true,
          spending_patterns: true,
          habit_formation: true
        };
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
      await settingsService.updateUserPreferences({
        dataSharingEnabled,
        analyticsEnabled,
        backupEnabled,
        userActionsTrackingEnabled,
        userActionsTrackingPreferences: trackingPreferences
      });
      success = 'Security settings saved successfully';
    } catch (err) {
      error = 'Failed to save security settings';
      console.error('Error saving preferences:', err);
    } finally {
      isSaving = false;
    }
  }

  // Reset to defaults
  function resetToDefaults() {
    dataSharingEnabled = false;
    analyticsEnabled = true;
    backupEnabled = true;
    userActionsTrackingEnabled = true;
    trackingPreferences = {
      transaction_timing: true,
      budget_adherence: true,
      spending_patterns: true,
      habit_formation: true
    };
  }
</script>

<svelte:head>
  <title>Security Settings | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet bottomBar()}
    <!-- Bottom bar content can be added here if needed -->
  {/snippet}

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
        <Alert.Root class="mb-6">
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
                  🔒
                </div>
                <div>
                  <div class="font-medium text-primary">Data Sharing</div>
                  <div class="text-sm text-muted-foreground">Allow anonymized data sharing for app improvement</div>
                </div>
              </div>
              <Switch
                bind:checked={dataSharingEnabled}
                aria-label="Toggle data sharing"
              />
            </div>

            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  📊
                </div>
                <div>
                  <div class="font-medium text-primary">Analytics</div>
                  <div class="text-sm text-muted-foreground">Help improve the app with usage analytics</div>
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
                  <div class="font-medium text-primary">Automatic Backup</div>
                  <div class="text-sm text-muted-foreground">Automatically backup your data locally</div>
                </div>
              </div>
              <Switch
                bind:checked={backupEnabled}
                aria-label="Toggle automatic backup"
              />
            </div>
          </Card.Content>
        </Card.Root>

        <!-- User Behavior Tracking -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Behavior Tracking</Card.Title>
            <Card.Description>Control what user behavior data is collected to improve your experience</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-6">
            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  👤
                </div>
                <div>
                  <div class="font-medium text-primary">User Actions Tracking</div>
                  <div class="text-sm text-muted-foreground">Track user interactions to personalize experience</div>
                </div>
              </div>
              <Switch
                bind:checked={userActionsTrackingEnabled}
                aria-label="Toggle user actions tracking"
              />
            </div>

            {#if userActionsTrackingEnabled}
              <div class="ml-13 space-y-4">
                <div class="flex items-center justify-between space-x-4">
                  <div>
                    <div class="font-medium text-primary">Transaction Timing</div>
                    <div class="text-sm text-muted-foreground">Track when you enter transactions</div>
                  </div>
                  <Switch
                    bind:checked={trackingPreferences.transaction_timing}
                    aria-label="Toggle transaction timing tracking"
                  />
                </div>

                <div class="flex items-center justify-between space-x-4">
                  <div>
                    <div class="font-medium text-primary">Budget Adherence</div>
                    <div class="text-sm text-muted-foreground">Track how well you stick to budgets</div>
                  </div>
                  <Switch
                    bind:checked={trackingPreferences.budget_adherence}
                    aria-label="Toggle budget adherence tracking"
                  />
                </div>

                <div class="flex items-center justify-between space-x-4">
                  <div>
                    <div class="font-medium text-primary">Spending Patterns</div>
                    <div class="text-sm text-muted-foreground">Analyze your spending habits</div>
                  </div>
                  <Switch
                    bind:checked={trackingPreferences.spending_patterns}
                    aria-label="Toggle spending patterns tracking"
                  />
                </div>

                <div class="flex items-center justify-between space-x-4">
                  <div>
                    <div class="font-medium text-primary">Habit Formation</div>
                    <div class="text-sm text-muted-foreground">Track financial habit development</div>
                  </div>
                  <Switch
                    bind:checked={trackingPreferences.habit_formation}
                    aria-label="Toggle habit formation tracking"
                  />
                </div>
              </div>
            {/if}
          </Card.Content>
        </Card.Root>

        <!-- Security Notice -->
        <Alert.Root>
          <Alert.Description>
            <strong>Your data is secure:</strong> All data is stored locally on your device. 
            No financial information is transmitted to external servers unless you explicitly enable data sharing.
          </Alert.Description>
        </Alert.Root>

        <!-- Actions -->
        <div class="flex gap-4">
          <Button.Root type="submit" disabled={isSaving}>
            {#if isSaving}
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            {/if}
            Save Changes
          </Button.Root>
          
          <Button.Root type="button" variant="outline" onclick={resetToDefaults}>
            Reset to Defaults
          </Button.Root>
        </div>
      </form>
    {/if}
  </div>
</PageLayout>
