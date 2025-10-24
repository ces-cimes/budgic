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
  
  // Notification settings
  let notificationsEnabled = $state(true);
  let dailyBudgetReminders = $state(true);
  let overspendingAlerts = $state(true);
  let goalMilestoneAlerts = $state(true);


  // Load user preferences on mount
  onMount(async () => {
    try {
      const preferences = await settingsService.getUserPreferences();
      if (preferences) {
        notificationsEnabled = preferences.notificationsEnabled ?? true;
        dailyBudgetReminders = preferences.dailyBudgetReminders ?? true;
        overspendingAlerts = preferences.overspendingAlerts ?? true;
        goalMilestoneAlerts = preferences.goalMilestoneAlerts ?? true;
      }
    } catch (err) {
      error = 'Failed to load notification settings';
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
        notificationsEnabled,
        dailyBudgetReminders,
        overspendingAlerts,
        goalMilestoneAlerts
      });
      success = 'Notification settings saved successfully';
    } catch (err) {
      error = 'Failed to save notification settings';
      console.error('Error saving preferences:', err);
    } finally {
      isSaving = false;
    }
  }

  // Reset to defaults
  function resetToDefaults() {
    notificationsEnabled = true;
    dailyBudgetReminders = true;
    overspendingAlerts = true;
    goalMilestoneAlerts = true;
  }
</script>

<svelte:head>
  <title>Notification Settings | Budgic</title>
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
      <h1 class="text-3xl font-bold text-primary mb-2">Notifications</h1>
      <p class="text-muted-foreground">Configure alerts and reminders to stay on track</p>
    </header>

    {#if isLoading}
      <div class="flex items-center justify-center py-12">
        <div class="text-muted-foreground">Loading notification settings...</div>
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

      <!-- Notification Settings -->
      <form onsubmit={(e) => { e.preventDefault(); savePreferences(); }} class="space-y-8">
        <!-- General Notifications -->
        <Card.Root>
          <Card.Header>
            <Card.Title>General Notifications</Card.Title>
            <Card.Description>Master control for all notifications</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-4">
            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  🔔
                </div>
                <div>
                  <div class="font-medium text-primary">Enable Notifications</div>
                  <div class="text-sm text-muted-foreground">Turn all notifications on or off</div>
                </div>
              </div>
              <Switch
                bind:checked={notificationsEnabled}
                aria-label="Toggle notifications"
              />
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Budget Reminders -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Budget Reminders</Card.Title>
            <Card.Description>Stay on track with your financial goals</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-4">
            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  📅
                </div>
                <div>
                  <div class="font-medium text-primary">Daily Budget Reminders</div>
                  <div class="text-sm text-muted-foreground">Get daily updates on your budget status</div>
                </div>
              </div>
              <Switch
                bind:checked={dailyBudgetReminders}
                disabled={!notificationsEnabled}
                aria-label="Toggle daily budget reminders"
              />
            </div>

            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  ⚠️
                </div>
                <div>
                  <div class="font-medium text-primary">Overspending Alerts</div>
                  <div class="text-sm text-muted-foreground">Get notified when you exceed budget limits</div>
                </div>
              </div>
              <Switch
                bind:checked={overspendingAlerts}
                disabled={!notificationsEnabled}
                aria-label="Toggle overspending alerts"
              />
            </div>

            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  🎯
                </div>
                <div>
                  <div class="font-medium text-primary">Goal Milestone Alerts</div>
                  <div class="text-sm text-muted-foreground">Celebrate when you reach financial milestones</div>
                </div>
              </div>
              <Switch
                bind:checked={goalMilestoneAlerts}
                disabled={!notificationsEnabled}
                aria-label="Toggle goal milestone alerts"
              />
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Notification Info -->
        <Alert.Root>
          <Alert.Description>
            <strong>Note:</strong> Notifications are currently browser-based. 
            For push notifications, ensure your browser has permission to show notifications for this site.
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
