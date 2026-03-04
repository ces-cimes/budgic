<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import * as Select from '$lib/components/ui/select/index.ts';
  import { PageLayout } from '$lib/components/layouts';
  import { userService } from '$lib/core/services';
  import { db, type UserPreferences, type Currency } from '$lib/core/db';
  import { BarChart2, Target, Lightbulb } from '@lucide/svelte';

  const { data } = $props<{ data: any }>();

  let currentStep = $state(1);
  let totalSteps = 4;
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let isLoading = $state(true);
  let currencies = $state<Array<{ value: string; label: string }>>([]);
  
  let formData = $state({
    username: '',
    currency: 'USD',
    theme: 'dark' as 'light' | 'dark',
    language: 'en' as 'en' | 'ru',
    userMaturityLevel: 'beginner' as 'beginner' | 'intermediate' | 'advanced' | 'expert',
    financialGoals: [] as string[]
  });

  // Load currencies and user preferences on mount
  onMount(async () => {
    try {
      // Load active currencies from database
      const activeCurrencies = await db.getActiveCurrencies();
      currencies = activeCurrencies
        .filter(c => c.isActive)
        .sort((a, b) => {
          // Sort system currencies first, then by code
          if (a.isSystem && !b.isSystem) return -1;
          if (!a.isSystem && b.isSystem) return 1;
          return a.code.localeCompare(b.code);
        })
        .map(c => ({
          value: c.code,
          label: `${c.code} - ${c.name}`
        }));

      // If no currencies found, this is an error state
      if (currencies.length === 0) {
        console.error('No currencies available in database');
      }

      // Load existing preferences if available (but don't redirect)
      const preferences = await userService.getUserPreferences();
      if (preferences.username) formData.username = preferences.username;
      if (preferences.currency && currencies.length > 0) {
        // Validate currency exists in available currencies
        const currencyExists = currencies.some(c => c.value === preferences.currency);
        formData.currency = currencyExists ? preferences.currency : currencies[0]?.value || 'USD';
      } else if (currencies.length > 0) {
        formData.currency = currencies[0].value;
      }
      if (preferences.theme) formData.theme = preferences.theme;
      if (preferences.language) formData.language = preferences.language;
      if (preferences.userMaturityLevel) formData.userMaturityLevel = preferences.userMaturityLevel;
    } catch (err) {
      console.error('Error loading data:', err);
      // Don't set fallback - let the form handle the error
    } finally {
      isLoading = false;
    }
  });

  const goals: Array<{ id: string; label: string }> = [
    { id: 'save_money', label: 'Save more money' },
    { id: 'track_spending', label: 'Track spending habits' },
    { id: 'pay_debt', label: 'Pay off debt' },
    { id: 'invest', label: 'Start investing' },
    { id: 'emergency_fund', label: 'Build an emergency fund' },
    { id: 'budget_better', label: 'Create a better budget' }
  ];

  const experienceLevels: Array<{ value: 'beginner' | 'intermediate' | 'advanced' | 'expert'; label: string }> = [
    { value: 'beginner', label: 'Beginner - New to budgeting' },
    { value: 'intermediate', label: 'Intermediate - Some experience' },
    { value: 'advanced', label: 'Advanced - Experienced budgeter' },
    { value: 'expert', label: 'Expert - Financial professional' }
  ];

  function nextStep() {
    if (currentStep < totalSteps) {
      currentStep++;
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      currentStep--;
    }
  }

  function toggleGoal(goalId: string) {
    const index = formData.financialGoals.indexOf(goalId);
    if (index > -1) {
      formData.financialGoals = formData.financialGoals.filter(id => id !== goalId);
    } else {
      formData.financialGoals = [...formData.financialGoals, goalId];
    }
  }

  async function handleSubmit() {
    if (isSaving) return;
    
    isSaving = true;
    error = null;
    
    try {
      // Create user preferences from onboarding data
      const userPreferences: Partial<UserPreferences> = {
        username: formData.username || 'User',
        currency: formData.currency,
        theme: formData.theme,
        language: formData.language,
        userMaturityLevel: formData.userMaturityLevel,
        onboardingCompleted: true,
        enableAdvancedFeatures: formData.userMaturityLevel === 'advanced' || formData.userMaturityLevel === 'expert',
        enablePredictiveAnalytics: true,
        analyticsEnabled: true,
        backupEnabled: true
      };
      
      // Save user preferences
      await userService.updateUserPreferences(userPreferences);
      
      // Track onboarding completion
      await userService.trackUserAction({
        action: 'onboarding_completed',
        details: JSON.stringify({
          username: formData.username,
          currency: formData.currency,
          maturityLevel: formData.userMaturityLevel,
          goalsSelected: formData.financialGoals.length
        })
      });
      
      // Redirect to main app
      goto('/');
    } catch (err) {
      error = 'Failed to save onboarding data. Please try again.';
      console.error('Onboarding error:', err);
    } finally {
      isSaving = false;
    }
  }

  async function handleSkip() {
    if (isSaving) return;
    
    isSaving = true;
    error = null;
    
    try {
      // Save minimal preferences with onboarding marked as completed
      const userPreferences: Partial<UserPreferences> = {
        username: formData.username || 'User',
        currency: formData.currency,
        theme: formData.theme,
        language: formData.language,
        userMaturityLevel: formData.userMaturityLevel,
        onboardingCompleted: true,
        enableAdvancedFeatures: false,
        enablePredictiveAnalytics: true,
        analyticsEnabled: true,
        backupEnabled: true
      };
      
      // Save user preferences
      await userService.updateUserPreferences(userPreferences);
      
      // Track onboarding skip
      await userService.trackUserAction({
        action: 'onboarding_skipped',
        details: JSON.stringify({
          step: currentStep,
          username: formData.username || 'User',
          currency: formData.currency
        })
      });
      
      // Redirect to main app
      goto('/');
    } catch (err) {
      error = 'Failed to skip onboarding. Please try again.';
      console.error('Onboarding skip error:', err);
    } finally {
      isSaving = false;
    }
  }

  function getStepTitle() {
    switch (currentStep) {
      case 1: return 'Welcome to Budgic';
      case 2: return 'Personal Information';
      case 3: return 'Goals';
      case 4: return 'Experience Level';
      default: return '';
    }
  }

  function getStepDescription() {
    switch (currentStep) {
      case 1: return 'Let\'s get to know you and set up your financial profile';
      case 2: return 'Tell us about yourself and your financial situation';
      case 3: return 'What are your main financial goals?';
      case 4: return 'Help us personalize your experience';
      default: return '';
    }
  }
</script>

<svelte:head>
  <title>Welcome to Budgic</title>
</svelte:head>

<PageLayout>
  <div class="flex min-h-screen items-center justify-center px-4 py-12 bg-[var(--color-bg-primary)]">
    <div class="w-full max-w-lg">
      {#if isLoading}
        <div class="space-y-4">
          <div class="h-2 animate-pulse rounded-full bg-[var(--color-bg-tertiary)]"></div>
          <div class="h-64 animate-pulse rounded-2xl bg-[var(--color-bg-tertiary)]"></div>
        </div>
      {:else}
        <!-- Wordmark -->
        <div class="text-center mb-8">
          <p class="font-display text-2xl text-[var(--color-hero-number)]">Budgic</p>
        </div>

        <!-- Progress -->
        <div class="mb-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-[var(--color-text-tertiary)]">Step {currentStep} of {totalSteps}</span>
            <span class="text-xs text-[var(--color-text-tertiary)]">{Math.round((currentStep / totalSteps) * 100)}%</span>
          </div>
          <div class="budget-progress">
            <div class="budget-progress-fill" style="width: {(currentStep / totalSteps) * 100}%"></div>
          </div>
        </div>

        <!-- Card -->
        <div class="squircle-4xl squircle-border squircle-fill-tertiary p-8">
          <div class="mb-6">
            <h1 class="text-xl font-semibold text-[var(--color-text-primary)]">{getStepTitle()}</h1>
            <p class="text-sm text-[var(--color-text-tertiary)] mt-1">{getStepDescription()}</p>
          </div>

          {#if error}
            <div class="mb-5 squircle-2xl squircle-border px-4 py-3" style="--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);">
              <p class="text-sm text-[var(--color-warm-coral)]">{error}</p>
            </div>
          {/if}

          <!-- Step 1: Welcome -->
          {#if currentStep === 1}
            <div class="space-y-6">
              <div class="grid grid-cols-3 gap-3">
                <div class="squircle-2xl squircle-border squircle-fill-surface p-4 text-center">
                  <div class="mx-auto mb-2 flex size-9 items-center justify-center squircle-xl bg-[var(--color-amber-subtle)]">
                    <BarChart2 class="size-4 text-[var(--color-amber)]" />
                  </div>
                  <p class="text-xs font-medium text-[var(--color-text-primary)]">Smart tracking</p>
                  <p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">Auto-categorized</p>
                </div>
                <div class="squircle-2xl squircle-border squircle-fill-surface p-4 text-center">
                  <div class="mx-auto mb-2 flex size-9 items-center justify-center squircle-xl bg-[var(--color-amber-subtle)]">
                    <Target class="size-4 text-[var(--color-amber)]" />
                  </div>
                  <p class="text-xs font-medium text-[var(--color-text-primary)]">Goal setting</p>
                  <p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">Achieve targets</p>
                </div>
                <div class="squircle-2xl squircle-border squircle-fill-surface p-4 text-center">
                  <div class="mx-auto mb-2 flex size-9 items-center justify-center squircle-xl bg-[var(--color-amber-subtle)]">
                    <Lightbulb class="size-4 text-[var(--color-amber)]" />
                  </div>
                  <p class="text-xs font-medium text-[var(--color-text-primary)]">Insights</p>
                  <p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">Personalised</p>
                </div>
              </div>
            </div>
          {/if}

          <!-- Step 2: Personal Information -->
          {#if currentStep === 2}
            <div class="space-y-4">
              <div class="space-y-1.5">
                <label for="ob-username" class="text-sm font-medium text-[var(--color-text-primary)]">Your name</label>
                <input
                  id="ob-username"
                  type="text"
                  bind:value={formData.username}
                  placeholder="What should we call you?"
                  class="w-full rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
                />
              </div>
              <div class="space-y-1.5">
                <label for="ob-currency" class="text-sm font-medium text-[var(--color-text-primary)]">Currency</label>
                <Select.Root type="single" bind:value={formData.currency}>
                  <Select.Trigger id="ob-currency" class="w-full">
                    {formData.currency ? (currencies.find(c => c.value === formData.currency)?.label ?? formData.currency) : 'Select currency'}
                  </Select.Trigger>
                  <Select.Content>
                    {#each currencies as currency}
                      <Select.Item value={currency.value}>{currency.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1.5">
                  <label for="ob-theme" class="text-sm font-medium text-[var(--color-text-primary)]">Theme</label>
                  <Select.Root type="single" bind:value={formData.theme}>
                    <Select.Trigger id="ob-theme" class="w-full">
                      {formData.theme === 'light' ? 'Light' : 'Dark'}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="light">Light</Select.Item>
                      <Select.Item value="dark">Dark</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
                <div class="space-y-1.5">
                  <label for="ob-language" class="text-sm font-medium text-[var(--color-text-primary)]">Language</label>
                  <Select.Root type="single" bind:value={formData.language}>
                    <Select.Trigger id="ob-language" class="w-full">
                      {formData.language === 'en' ? 'English' : 'Русский'}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="en">English</Select.Item>
                      <Select.Item value="ru">Русский</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
              </div>
            </div>
          {/if}

          <!-- Step 3: Goals -->
          {#if currentStep === 3}
            <div class="space-y-2">
              <p class="text-xs text-[var(--color-text-tertiary)] mb-3">Select all that apply</p>
              <div class="grid grid-cols-2 gap-2">
                {#each goals as goal}
                  <button
                    type="button"
                    onclick={() => toggleGoal(goal.id)}
                    class="rounded-xl border p-3 text-left text-sm font-medium transition-colors {formData.financialGoals.includes(goal.id)
                      ? 'border-[var(--color-amber)] bg-[var(--color-amber-subtle)] text-[var(--color-amber)]'
                      : 'border-border text-[var(--color-text-secondary)] hover:border-[var(--color-amber)]/40'}"
                  >
                    {goal.label}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Step 4: Experience Level -->
          {#if currentStep === 4}
            <div class="space-y-2">
              {#each experienceLevels as level}
                <button
                  type="button"
                  onclick={() => formData.userMaturityLevel = level.value}
                  class="w-full rounded-xl border p-3.5 text-left transition-colors {formData.userMaturityLevel === level.value
                    ? 'border-[var(--color-amber)] bg-[var(--color-amber-subtle)]'
                    : 'border-border hover:border-[var(--color-amber)]/40'}"
                >
                  <p class="text-sm font-medium {formData.userMaturityLevel === level.value ? 'text-[var(--color-amber)]' : 'text-[var(--color-text-primary)]'}">{level.label}</p>
                </button>
              {/each}
            </div>
          {/if}

          <!-- Navigation -->
          <div class="flex items-center justify-between mt-8 gap-3">
            <div class="flex gap-2">
              {#if currentStep > 1}
                <button
                  type="button"
                  onclick={prevStep}
                  disabled={isSaving}
                  class="rounded-xl border border-border px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
                >
                  Previous
                </button>
              {/if}
              {#if currentStep > 1}
                <button
                  type="button"
                  onclick={handleSkip}
                  disabled={isSaving}
                  class="rounded-xl px-4 py-2 text-sm text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  Skip
                </button>
              {/if}
            </div>

            {#if currentStep === totalSteps}
              <button
                type="button"
                onclick={handleSubmit}
                disabled={isSaving}
                class="rounded-xl bg-[var(--color-amber)] px-6 py-2 text-sm font-semibold text-[var(--color-bg-primary)] transition-opacity disabled:opacity-60"
              >
                {isSaving ? 'Setting up…' : 'Get started'}
              </button>
            {:else}
              <button
                type="button"
                onclick={nextStep}
                disabled={isSaving}
                class="rounded-xl bg-[var(--color-amber)] px-6 py-2 text-sm font-semibold text-[var(--color-bg-primary)] transition-opacity disabled:opacity-60"
              >
                Next
              </button>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
</PageLayout>