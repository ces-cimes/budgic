<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { userService } from '$lib/core/services';
  import { PageLayout } from '$lib/components/layouts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { Input } from '$lib/components/ui/input/index.ts';
  import { Label } from '$lib/components/ui/label/index.ts';
  import type { UserPreferences } from '$lib/core/db';

  // State
  let isLoading = $state(true);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  
  // Form fields
  let username = $state('');
  let userMaturityLevel = $state<'beginner' | 'intermediate' | 'advanced' | 'expert'>('beginner');


  // User maturity options
  const userMaturityOptions = [
    { value: 'beginner', label: 'Beginner', description: 'New to budgeting and financial planning' },
    { value: 'intermediate', label: 'Intermediate', description: 'Some experience with budgeting' },
    { value: 'advanced', label: 'Advanced', description: 'Experienced with complex financial planning' },
    { value: 'expert', label: 'Expert', description: 'Financial planning professional or enthusiast' }
  ];

  // Load user preferences on mount
  onMount(async () => {
    try {
      const preferences = await userService.getUserPreferences();
      if (preferences) {
        username = preferences.username || 'User';
        userMaturityLevel = preferences.userMaturityLevel || 'beginner';
      }
    } catch (err) {
      error = 'Failed to load profile settings';
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
        username,
        userMaturityLevel
      });
      success = 'Profile settings saved successfully';
    } catch (err) {
      error = 'Failed to save profile settings';
      console.error('Error saving preferences:', err);
    } finally {
      isSaving = false;
    }
  }

  // Reset to defaults
  function resetToDefaults() {
    username = 'User';
    userMaturityLevel = 'beginner';
  }
</script>

<svelte:head>
  <title>Profile Settings | Budgic</title>
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
      <h1 class="text-3xl font-bold text-primary mb-2">Profile Settings</h1>
      <p class="text-muted-foreground">Update your personal information and financial context</p>
    </header>

    {#if isLoading}
      <div class="flex items-center justify-center py-12">
        <div class="text-muted-foreground">Loading profile settings...</div>
      </div>
    {:else}
      <!-- Error/Success Messages -->
      {#if error}
        <div class="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p class="text-destructive">{error}</p>
        </div>
      {/if}
      
      {#if success}
        <div class="mb-6 p-4 bg-success/10 border border-success/20 rounded-lg">
          <p class="text-success">{success}</p>
        </div>
      {/if}

      <!-- Profile Form -->
      <form onsubmit={(e) => { e.preventDefault(); savePreferences(); }} class="space-y-8">
        <!-- Basic Information -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Basic Information</Card.Title>
            <Card.Description>Your personal details</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-4">
            <div class="space-y-2">
              <Label for="username">Username</Label>
              <Input
                id="username"
                bind:value={username}
                placeholder="Enter your username"
                required
                class="max-w-xs"
              />
              <p class="text-sm text-muted-foreground">This will be displayed throughout the app</p>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Life Context -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Life Context</Card.Title>
            <Card.Description>Help us personalize your financial experience</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-6">
            <div class="space-y-2">
              <Label for="userMaturityLevel">Experience Level</Label>
              <select 
                id="userMaturityLevel"
                bind:value={userMaturityLevel}
                class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
              >
                {#each userMaturityOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
              <p class="text-sm text-muted-foreground">This helps us customize features for your experience level</p>
            </div>
          </Card.Content>
        </Card.Root>


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
