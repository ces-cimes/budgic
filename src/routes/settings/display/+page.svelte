<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { userService } from '$lib/core/services';
  import { PageLayout } from '$lib/components/layouts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import * as Alert from '$lib/components/ui/alert/index.ts';
  import type { UserPreferences } from '$lib/core/db';

  // State
  let isLoading = $state(true);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  
  // Display settings - only fields that exist in schema
  let theme = $state<'light' | 'dark'>('dark');
  let language = $state<'en' | 'ru'>('en');
  let currency = $state('USD');

  // Currency options (common currencies)
  const currencyOptions = [
    { value: 'USD', label: 'US Dollar (USD)', symbol: '$' },
    { value: 'EUR', label: 'Euro (EUR)', symbol: '€' },
    { value: 'GBP', label: 'British Pound (GBP)', symbol: '£' },
    { value: 'JPY', label: 'Japanese Yen (JPY)', symbol: '¥' },
    { value: 'CAD', label: 'Canadian Dollar (CAD)', symbol: 'C$' },
    { value: 'AUD', label: 'Australian Dollar (AUD)', symbol: 'A$' },
    { value: 'CHF', label: 'Swiss Franc (CHF)', symbol: 'CHF' },
    { value: 'CNY', label: 'Chinese Yuan (CNY)', symbol: '¥' },
    { value: 'RUB', label: 'Russian Ruble (RUB)', symbol: '₽' }
  ];

  // Language options
  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'ru', label: 'Русский' }
  ];

  // Load user preferences on mount
  onMount(async () => {
    try {
      const preferences = await userService.getUserPreferences();
      if (preferences) {
        theme = preferences.theme || 'dark';
        language = preferences.language || 'en';
        currency = preferences.currency || 'USD';
      }
    } catch (err) {
      error = 'Failed to load display settings';
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
        theme,
        language,
        currency
      });
      success = 'Display settings saved successfully';
    } catch (err) {
      error = 'Failed to save display settings';
      console.error('Error saving preferences:', err);
    } finally {
      isSaving = false;
    }
  }
</script>

<svelte:head>
  <title>Display Settings | Budgic</title>
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
      <h1 class="text-3xl font-bold text-primary mb-2">Display Settings</h1>
      <p class="text-muted-foreground">Customize your app appearance and preferences</p>
    </header>

    {#if isLoading}
      <div class="flex items-center justify-center py-12">
        <div class="text-muted-foreground">Loading display settings...</div>
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

      <!-- Display Settings Form -->
      <form onsubmit={(e) => { e.preventDefault(); savePreferences(); }} class="space-y-8">
        <!-- Theme and Language -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Appearance</Card.Title>
            <Card.Description>Choose your preferred theme and language</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-6">
            <div class="space-y-2">
              <label for="theme-select" class="text-sm font-medium text-primary">Theme</label>
              <select 
                id="theme-select"
                bind:value={theme}
                class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
              <p class="text-sm text-muted-foreground">Choose between light and dark themes</p>
            </div>

            <div class="space-y-2">
              <label for="language-select" class="text-sm font-medium text-primary">Language</label>
              <select 
                id="language-select"
                bind:value={language}
                class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
              >
                {#each languageOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
              <p class="text-sm text-muted-foreground">Select your preferred language</p>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Currency -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Currency</Card.Title>
            <Card.Description>Set your default currency for financial data</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-6">
            <div class="space-y-2">
              <label for="currency-select" class="text-sm font-medium text-primary">Default Currency</label>
              <select 
                id="currency-select"
                bind:value={currency}
                class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
              >
                {#each currencyOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
              <p class="text-sm text-muted-foreground">This will be used as the default currency for new accounts and transactions</p>
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