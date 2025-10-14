<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { settingsService } from '$lib/core/services/settings-service';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { Switch } from '$lib/components/ui/switch/index.ts';
  import * as Alert from '$lib/components/ui/alert/index.ts';
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
  import type { UserPreferences } from '$lib/core/db';

  // State
  let isLoading = $state(true);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  
  // Display settings
  let theme = $state<'light' | 'dark'>('dark');
  let language = $state<'en' | 'ru'>('en');
  let currency = $state('USD');
  let firstDayOfWeek = $state(0);
  let dateDisplayFormat = $state<'date' | 'time' | 'datetime'>('time');
  let plannedDateDisplayFormat = $state<'date' | 'time' | 'datetime'>('date');
  let clearedDateDisplayFormat = $state<'date' | 'time' | 'datetime'>('time');
  
  // Accessibility settings
  let highContrastMode = $state(false);
  let reducedMotion = $state(false);
  let fontSize = $state<'small' | 'medium' | 'large'>('medium');

  // Sidebar context for mobile detection
  const sidebar = Sidebar.useSidebar();

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

  // First day of week options
  const weekStartOptions = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
  ];

  // Date format options
  const dateFormatOptions = [
    { value: 'date', label: 'Date only', example: 'Jan 15, 2024' },
    { value: 'time', label: 'Time only', example: '2:30 PM' },
    { value: 'datetime', label: 'Date and time', example: 'Jan 15, 2024 2:30 PM' }
  ];

  // Font size options
  const fontSizeOptions = [
    { value: 'small', label: 'Small', description: 'Compact interface' },
    { value: 'medium', label: 'Medium', description: 'Standard size' },
    { value: 'large', label: 'Large', description: 'Easier to read' }
  ];

  // Load user preferences on mount
  onMount(async () => {
    try {
      const preferences = await settingsService.getUserPreferences();
      if (preferences) {
        theme = preferences.theme || 'dark';
        language = preferences.language || 'en';
        currency = preferences.currency || 'USD';
        firstDayOfWeek = preferences.firstDayOfWeek ?? 0;
        dateDisplayFormat = preferences.dateDisplayFormat || 'time';
        plannedDateDisplayFormat = preferences.plannedDateDisplayFormat || 'date';
        clearedDateDisplayFormat = preferences.clearedDateDisplayFormat || 'time';
        highContrastMode = preferences.highContrastMode ?? false;
        reducedMotion = preferences.reducedMotion ?? false;
        fontSize = preferences.fontSize || 'medium';
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
      await settingsService.updateUserPreferences({
        theme,
        language,
        currency,
        firstDayOfWeek,
        dateDisplayFormat,
        plannedDateDisplayFormat,
        clearedDateDisplayFormat,
        highContrastMode,
        reducedMotion,
        fontSize
      });
      success = 'Display settings saved successfully';
    } catch (err) {
      error = 'Failed to save display settings';
      console.error('Error saving preferences:', err);
    } finally {
      isSaving = false;
    }
  }

  // Reset to defaults
  function resetToDefaults() {
    theme = 'dark';
    language = 'en';
    currency = 'USD';
    firstDayOfWeek = 0;
    dateDisplayFormat = 'time';
    plannedDateDisplayFormat = 'date';
    clearedDateDisplayFormat = 'time';
    highContrastMode = false;
    reducedMotion = false;
    fontSize = 'medium';
  }
</script>

<svelte:head>
  <title>Display Settings | Budgic</title>
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
      <div class="flex items-center gap-4 mb-4">
        <Button.Root variant="ghost" size="sm" onclick={() => goto('/settings')}>
          ← Back to Settings
        </Button.Root>
      </div>
      <h1 class="text-3xl font-bold text-primary mb-2">Display Settings</h1>
      <p class="text-muted-foreground">Customize the appearance and behavior of the app</p>
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
        <Alert.Root class="mb-6">
          <Alert.Description>{success}</Alert.Description>
        </Alert.Root>
      {/if}

      <!-- Display Settings -->
      <form onsubmit={(e) => { e.preventDefault(); savePreferences(); }} class="space-y-8">
        <!-- Theme and Language -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Appearance</Card.Title>
            <Card.Description>Choose your preferred theme and language</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-6">
            <div class="space-y-2">
              <label class="text-sm font-medium text-primary">Theme</label>
              <select 
                bind:value={theme}
                class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-primary">Language</label>
              <select 
                bind:value={language}
                class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
              >
                {#each languageOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Currency and Regional -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Currency & Regional</Card.Title>
            <Card.Description>Set your preferred currency and regional settings</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-6">
            <div class="space-y-2">
              <label class="text-sm font-medium text-primary">Default Currency</label>
              <select 
                bind:value={currency}
                class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
              >
                {#each currencyOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-primary">First Day of Week</label>
              <select 
                bind:value={firstDayOfWeek}
                class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
              >
                {#each weekStartOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Date Display Formats -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Date Display Formats</Card.Title>
            <Card.Description>Customize how dates and times are displayed</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-6">
            <div class="space-y-2">
              <label class="text-sm font-medium text-primary">General Date Format</label>
              <select 
                bind:value={dateDisplayFormat}
                class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
              >
                {#each dateFormatOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-primary">Planned Transaction Dates</label>
              <select 
                bind:value={plannedDateDisplayFormat}
                class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
              >
                {#each dateFormatOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-primary">Cleared Transaction Dates</label>
              <select 
                bind:value={clearedDateDisplayFormat}
                class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
              >
                {#each dateFormatOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Accessibility -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Accessibility</Card.Title>
            <Card.Description>Make the app more accessible for your needs</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-6">
            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  🔍
                </div>
                <div>
                  <div class="font-medium text-primary">High Contrast Mode</div>
                  <div class="text-sm text-muted-foreground">Increase contrast for better visibility</div>
                </div>
              </div>
              <Switch
                bind:checked={highContrastMode}
                aria-label="Toggle high contrast mode"
              />
            </div>

            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  🎬
                </div>
                <div>
                  <div class="font-medium text-primary">Reduced Motion</div>
                  <div class="text-sm text-muted-foreground">Minimize animations and transitions</div>
                </div>
              </div>
              <Switch
                bind:checked={reducedMotion}
                aria-label="Toggle reduced motion"
              />
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-primary">Font Size</label>
              <select 
                bind:value={fontSize}
                class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
              >
                {#each fontSizeOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
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
