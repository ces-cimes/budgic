<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import * as Form from '$lib/components/ui/form/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import * as Progress from '$lib/components/ui/progress/index.ts';
  import * as Select from '$lib/components/ui/select/index.ts';
  import * as Label from '$lib/components/ui/label/index.ts';
  import * as Alert from '$lib/components/ui/alert/index.ts';
  import { PageLayout } from '$lib/components/layouts';
  import { userService } from '$lib/core/services';
  import type { UserPreferences } from '$lib/core/db';

  const { data } = $props<{ data: any }>();

  let currentStep = $state(1);
  let totalSteps = 4;
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  
  let formData = $state({
    username: '',
    currency: 'USD',
    theme: 'dark' as 'light' | 'dark',
    language: 'en' as 'en' | 'ru',
    userMaturityLevel: 'beginner' as 'beginner' | 'intermediate' | 'advanced' | 'expert',
    financialGoals: [] as string[]
  });


  const currencies: Array<{ value: string; label: string }> = [
    { value: 'USD', label: 'USD - US Dollar' },
    { value: 'EUR', label: 'EUR - Euro' },
    { value: 'GBP', label: 'GBP - British Pound' },
    { value: 'JPY', label: 'JPY - Japanese Yen' },
    { value: 'CAD', label: 'CAD - Canadian Dollar' },
    { value: 'AUD', label: 'AUD - Australian Dollar' },
    { value: 'CHF', label: 'CHF - Swiss Franc' },
    { value: 'CNY', label: 'CNY - Chinese Yuan' },
    { value: 'RUB', label: 'RUB - Russian Ruble' }
  ];

  const goals: Array<{ id: string; label: string; icon: string }> = [
    { id: 'save_money', label: 'Save more money', icon: '💰' },
    { id: 'track_spending', label: 'Track spending habits', icon: '📊' },
    { id: 'pay_debt', label: 'Pay off debt', icon: '💳' },
    { id: 'invest', label: 'Start investing', icon: '📈' },
    { id: 'emergency_fund', label: 'Build emergency fund', icon: '🛡️' },
    { id: 'budget_better', label: 'Create better budget', icon: '📋' }
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
        username: formData.username,
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

  function getStepTitle() {
    switch (currentStep) {
      case 1: return 'Welcome to Budgic';
      case 2: return 'Personal Information';
      case 3: return 'Financial Goals';
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
  

  <div class="min-h-screen bg-background flex items-center justify-center p-4">
  <div class="w-full max-w-2xl">
    <!-- Progress Bar -->
    <div class="mb-8">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-muted-foreground">Step {currentStep} of {totalSteps}</span>
        <span class="text-sm text-muted-foreground">{Math.round((currentStep / totalSteps) * 100)}%</span>
      </div>
      <Progress.Root value={(currentStep / totalSteps) * 100} class="h-2" />
    </div>

    <!-- Step Content -->
    <div class="bg-card rounded-2xl p-8 shadow-sm border border-border">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-primary mb-2">{getStepTitle()}</h1>
        <p class="text-muted-foreground">{getStepDescription()}</p>
      </div>

      <!-- Error Message -->
      {#if error}
        <Alert.Root variant="destructive" class="mb-6">
          <Alert.Description>{error}</Alert.Description>
        </Alert.Root>
      {/if}

      <!-- Step 1: Welcome -->
      {#if currentStep === 1}
        <div class="text-center space-y-6">
          <div class="text-6xl mb-4">🎯</div>
          <h2 class="text-xl font-semibold text-primary">Your Financial Journey Starts Here</h2>
          <p class="text-muted-foreground">
            Budgic helps you take control of your finances with smart budgeting, 
            personalized insights, and goal tracking.
          </p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div class="text-center">
              <div class="text-2xl mb-2">📊</div>
              <div class="font-medium text-primary">Smart Tracking</div>
              <div class="text-sm text-muted-foreground">Automated categorization</div>
            </div>
            <div class="text-center">
              <div class="text-2xl mb-2">🎯</div>
              <div class="font-medium text-primary">Goal Setting</div>
              <div class="text-sm text-muted-foreground">Achieve your targets</div>
            </div>
            <div class="text-center">
              <div class="text-2xl mb-2">💡</div>
              <div class="font-medium text-primary">Insights</div>
              <div class="text-sm text-muted-foreground">Personalized advice</div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Step 2: Personal Information -->
      {#if currentStep === 2}
        <form class="space-y-6">
          <div class="space-y-2">
            <Label.Root for="username">Username</Label.Root>
            <input
              id="username"
              type="text"
              bind:value={formData.username}
              placeholder="Enter your username"
              class="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
              required
            />
          </div>

          <div class="space-y-2">
            <Label.Root for="currency">Currency</Label.Root>
            <Select.Root type="single" bind:value={formData.currency}>
              <Select.Trigger>
                {formData.currency ? currencies.find(c => c.value === formData.currency)?.label : "Select your currency"}
              </Select.Trigger>
              <Select.Content>
                {#each currencies as currency}
                  <Select.Item value={currency.value}>{currency.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <div class="space-y-2">
            <Label.Root for="theme">Theme</Label.Root>
            <Select.Root type="single" bind:value={formData.theme}>
              <Select.Trigger>
                {formData.theme === 'light' ? 'Light Theme' : 'Dark Theme'}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="light">Light Theme</Select.Item>
                <Select.Item value="dark">Dark Theme</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>

          <div class="space-y-2">
            <Label.Root for="language">Language</Label.Root>
            <Select.Root type="single" bind:value={formData.language}>
              <Select.Trigger>
                {formData.language === 'en' ? 'English' : 'Русский'}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="en">English</Select.Item>
                <Select.Item value="ru">Русский</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
        </form>
      {/if}

      <!-- Step 3: Financial Goals -->
      {#if currentStep === 3}
        <div class="space-y-4">
          <p class="text-muted-foreground mb-6">Select all that apply:</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {#each goals as goal}
              <button
                class="p-4 border-2 rounded-xl text-left transition-all {formData.financialGoals.includes(goal.id) ? 'border-primary bg-primary/10' : 'border-border hover:border-border/80'}"
                onclick={() => toggleGoal(goal.id)}
              >
                <div class="flex items-center space-x-3">
                  <div class="text-2xl">{goal.icon}</div>
                  <div class="font-medium text-primary">{goal.label}</div>
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Step 4: Experience Level -->
      {#if currentStep === 4}
        <div class="space-y-6">
          <p class="text-muted-foreground">This helps us personalize your experience:</p>
          <div class="space-y-4">
            {#each experienceLevels as level}
              <button
                class="w-full p-4 border-2 rounded-xl text-left transition-all {formData.userMaturityLevel === level.value ? 'border-primary bg-primary/10' : 'border-border hover:border-border/80'}"
                onclick={() => formData.userMaturityLevel = level.value}
              >
                <div class="font-medium text-primary">{level.label}</div>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Navigation Buttons -->
      <div class="flex justify-between mt-8">
        <Button.Root
          variant="outline"
          onclick={prevStep}
          disabled={currentStep === 1}
        >
          Previous
        </Button.Root>

        {#if currentStep === totalSteps}
          <Button.Root onclick={handleSubmit} disabled={isSaving}>
            {#if isSaving}
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            {/if}
            Get Started
          </Button.Root>
        {:else}
          <Button.Root onclick={nextStep}>
            Next
          </Button.Root>
        {/if}
      </div>
    </div>
  </div>
  </div>
</PageLayout> 