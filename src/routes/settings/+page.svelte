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
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger
  } from '$lib/components/ui/select/index.ts';
  import { userService } from '$lib/core/services/index.ts';
  import type { NegativeAllowanceHandling } from '$lib/core/services/core/negative-allowance-service';

  const NEGATIVE_ALLOWANCE_LABELS: Record<NegativeAllowanceHandling, string> = {
    block_with_warning: 'Block with warning – alert and require override',
    allow_with_strong_warning: 'Allow with strong warning – permit but flag for review (default)',
    borrow_from_future: "Borrow from future – use next period's allowance",
    borrow_from_other_categories: 'Borrow from other categories – envelope borrowing'
  };
  import { populateSampleData, clearAllData } from '$lib/core/test-data';
  import { onMount } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import { PageLayout } from '$lib/components/layouts';

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
  let negativeAllowanceHandling = $state<NegativeAllowanceHandling>('allow_with_strong_warning');
  let envelopeBorrowMaxPerCategoryPercent = $state(50);
  let envelopeBorrowRepaymentPeriods = $state(2);
  let envelopeBorrowTotalLimit = $state<string>('');
  let envelopeBorrowRequireConfirmationRepeated = $state(true);
  let rolloverSurplusBehavior = $state<'rollover_next' | 'to_savings_goals' | 'hybrid'>('rollover_next');
  let rolloverSurplusHybridRatio = $state(50);
  let rolloverDeficitBehavior = $state<'reduce_next_period' | 'borrow_from_other' | 'one_time_exception'>('reduce_next_period');
  let savingsOpportunityMinSurplus = $state<string>('');

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
        const nah = (userPreferences as { negativeAllowanceHandling?: NegativeAllowanceHandling }).negativeAllowanceHandling;
        negativeAllowanceHandling = nah ?? 'allow_with_strong_warning';
        const prefs = userPreferences as Record<string, unknown>;
        const maxPct = prefs.envelopeBorrowMaxPerCategoryPercent;
        envelopeBorrowMaxPerCategoryPercent = Math.round((typeof maxPct === 'number' ? maxPct : 0.5) * 100);
        envelopeBorrowRepaymentPeriods = (prefs.envelopeBorrowRepaymentPeriods as number) ?? 2;
        envelopeBorrowTotalLimit = (prefs.envelopeBorrowTotalLimit as number) != null ? String(prefs.envelopeBorrowTotalLimit) : '';
        envelopeBorrowRequireConfirmationRepeated = (prefs.envelopeBorrowRequireConfirmationRepeated as boolean) ?? true;
        const rsb = prefs.rolloverSurplusBehavior;
        rolloverSurplusBehavior = (rsb === 'rollover_next' || rsb === 'to_savings_goals' || rsb === 'hybrid') ? rsb : 'rollover_next';
        const rsh = prefs.rolloverSurplusHybridRatio;
        rolloverSurplusHybridRatio = typeof rsh === 'number' ? Math.round(rsh * 100) : 50;
        const rdb = prefs.rolloverDeficitBehavior;
        rolloverDeficitBehavior = (rdb === 'reduce_next_period' || rdb === 'borrow_from_other' || rdb === 'one_time_exception') ? rdb : 'reduce_next_period';
        const soms = prefs.savingsOpportunityMinSurplus;
        savingsOpportunityMinSurplus = typeof soms === 'number' ? String(soms) : '';
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

  // Save preferences to database
  async function savePreferences() {
    if (isSaving) return;
    
    isSaving = true;
    try {
      await userService.updateUserPreferences({
        username,
        analyticsEnabled: notificationsEnabled,
        enablePredictiveAnalytics: autoCategorizationEnabled,
        enableAdvancedFeatures: stressDetectionEnabled,
        theme: darkModeEnabled ? 'dark' : 'light',
        negativeAllowanceHandling,
        envelopeBorrowMaxPerCategoryPercent: envelopeBorrowMaxPerCategoryPercent / 100,
        envelopeBorrowRepaymentPeriods,
        envelopeBorrowTotalLimit: envelopeBorrowTotalLimit === '' ? undefined : Number(envelopeBorrowTotalLimit),
        envelopeBorrowRequireConfirmationRepeated,
        rolloverSurplusBehavior,
        rolloverSurplusHybridRatio: rolloverSurplusHybridRatio / 100,
        rolloverDeficitBehavior,
        savingsOpportunityMinSurplus:
          savingsOpportunityMinSurplus !== '' && !Number.isNaN(Number(savingsOpportunityMinSurplus))
            ? Number(savingsOpportunityMinSurplus)
            : undefined
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
      title: 'Personal Settings',
      items: [
        { name: 'Profile Settings', description: 'Update your personal information', icon: '👤', href: '/settings/profile' },
        { name: 'Security & Privacy', description: 'Manage security and privacy preferences', icon: '🔒', href: '/settings/security' }
      ]
    },
    {
      title: 'App Preferences',
      items: [
        { name: 'Display Settings', description: 'Theme, language, and currency preferences', icon: '🎨', href: '/settings/display' },
        { name: 'Currency Settings', description: 'Configure currencies and exchange rates', icon: '💱', href: '/settings/currency' },
        { name: 'Navigation Settings', description: 'Customize navigation order and visibility', icon: '🧭', href: '/settings/navigation' },
        { name: 'Notification Settings', description: 'Configure notification preferences', icon: '🔔', href: '/settings/notifications' }
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
                  <div class="font-medium text-primary">Predictive Analytics</div>
                  <div class="text-sm text-muted-foreground">AI-powered insights and recommendations</div>
                </div>
              </div>
              <Switch
                bind:checked={autoCategorizationEnabled}
                aria-label="Toggle predictive analytics"
              />
            </div>
    
            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  📊
                </div>
                <div>
                  <div class="font-medium text-primary">Analytics</div>
                  <div class="text-sm text-muted-foreground">Track usage and improve the app</div>
                </div>
              </div>
              <Switch
                bind:checked={notificationsEnabled}
                aria-label="Toggle analytics"
              />
            </div>
    
            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  ⚡
                </div>
                <div>
                  <div class="font-medium text-primary">Advanced Features</div>
                  <div class="text-sm text-muted-foreground">Enable advanced financial tools</div>
                </div>
              </div>
              <Switch
                bind:checked={stressDetectionEnabled}
                aria-label="Toggle advanced features"
              />
            </div>
          </div>
        </Card.Content>
      </Card.Root>
    </section>

    <!-- Budget & Allowance -->
    <section class="mb-8">
      <Card.Root>
        <Card.Header>
          <Card.Title>Budget &amp; Allowance</Card.Title>
          <Card.Description>When spending exceeds your allowance this period</Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="space-y-2">
            <Label for="negative-allowance-handling">Negative allowance handling</Label>
            <Select
              type="single"
              value={negativeAllowanceHandling}
              onValueChange={(v) => v && (negativeAllowanceHandling = v as NegativeAllowanceHandling)}
            >
              <SelectTrigger id="negative-allowance-handling" class="max-w-md" aria-label="Choose how to handle overspending">
                {NEGATIVE_ALLOWANCE_LABELS[negativeAllowanceHandling] ?? 'Choose behaviour'}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block_with_warning">{NEGATIVE_ALLOWANCE_LABELS.block_with_warning}</SelectItem>
                <SelectItem value="allow_with_strong_warning">{NEGATIVE_ALLOWANCE_LABELS.allow_with_strong_warning}</SelectItem>
                <SelectItem value="borrow_from_future">{NEGATIVE_ALLOWANCE_LABELS.borrow_from_future}</SelectItem>
                <SelectItem value="borrow_from_other_categories">{NEGATIVE_ALLOWANCE_LABELS.borrow_from_other_categories}</SelectItem>
              </SelectContent>
            </Select>
            <p class="text-xs text-muted-foreground">
              &quot;Allow with strong warning&quot; shows a prominent warning and recovery suggestions without blocking. All negative allowances are tracked for accountability.
            </p>
          </div>

          <!-- Envelope borrowing limits (when using borrow from other categories) -->
          <div class="space-y-4 pt-4 border-t border-border">
            <h3 class="text-sm font-medium">Envelope borrowing limits</h3>
            <p class="text-xs text-muted-foreground">
              When you use &quot;Borrow from other categories&quot;, these limits apply.
            </p>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <Label for="envelope-borrow-max-pct">Max borrow per category (% of next period)</Label>
                <Input
                  id="envelope-borrow-max-pct"
                  type="number"
                  min="0"
                  max="100"
                  bind:value={envelopeBorrowMaxPerCategoryPercent}
                  class="max-w-[120px]"
                />
                <p class="text-xs text-muted-foreground">e.g. 50 = up to 50% of next period&apos;s allowance</p>
              </div>
              <div class="space-y-2">
                <Label for="envelope-borrow-repayment">Repayment periods</Label>
                <Input
                  id="envelope-borrow-repayment"
                  type="number"
                  min="1"
                  max="6"
                  bind:value={envelopeBorrowRepaymentPeriods}
                  class="max-w-[80px]"
                />
                <p class="text-xs text-muted-foreground">Must repay within this many periods</p>
              </div>
            </div>
            <div class="space-y-2">
              <Label for="envelope-borrow-total-limit">Total borrowing limit (optional)</Label>
              <Input
                id="envelope-borrow-total-limit"
                type="number"
                min="0"
                placeholder="No limit"
                bind:value={envelopeBorrowTotalLimit}
                class="max-w-[140px]"
              />
            </div>
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="envelope-borrow-confirm-repeated"
                bind:checked={envelopeBorrowRequireConfirmationRepeated}
                class="rounded border-input"
              />
              <Label for="envelope-borrow-confirm-repeated">Require confirmation for repeated borrowing</Label>
            </div>
          </div>

          <!-- Rollover logic (period-end surplus/deficit) -->
          <div class="space-y-4 pt-4 border-t border-border">
            <h3 class="text-sm font-medium">Rollover (period end)</h3>
            <p class="text-xs text-muted-foreground">
              What to do with leftover or overspent allowance at the end of each period.
            </p>
            <div class="space-y-2">
              <Label for="rollover-surplus">Surplus (unspent)</Label>
              <Select type="single" value={rolloverSurplusBehavior} onValueChange={(v) => v && (rolloverSurplusBehavior = v as typeof rolloverSurplusBehavior)}>
                <SelectTrigger id="rollover-surplus" class="max-w-md">
                  {rolloverSurplusBehavior === 'rollover_next' ? 'Roll over to next period' : rolloverSurplusBehavior === 'to_savings_goals' ? 'Reallocate to savings goals' : 'Hybrid (split)'}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rollover_next">Roll over to next period</SelectItem>
                  <SelectItem value="to_savings_goals">Reallocate to savings goals</SelectItem>
                  <SelectItem value="hybrid">Hybrid (split)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {#if rolloverSurplusBehavior === 'hybrid'}
              <div class="space-y-2">
                <Label for="rollover-hybrid-ratio">Share to next period (%)</Label>
                <Input id="rollover-hybrid-ratio" type="number" min="0" max="100" bind:value={rolloverSurplusHybridRatio} class="max-w-[80px]" />
              </div>
            {/if}
            <div class="space-y-2">
              <Label for="rollover-deficit">Deficit (overspent)</Label>
              <Select type="single" value={rolloverDeficitBehavior} onValueChange={(v) => v && (rolloverDeficitBehavior = v as typeof rolloverDeficitBehavior)}>
                <SelectTrigger id="rollover-deficit" class="max-w-md">
                  {rolloverDeficitBehavior === 'reduce_next_period' ? 'Reduce next period allowance' : rolloverDeficitBehavior === 'borrow_from_other' ? 'Borrow from other categories' : 'One-time exception'}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reduce_next_period">Reduce next period allowance</SelectItem>
                  <SelectItem value="borrow_from_other">Borrow from other categories</SelectItem>
                  <SelectItem value="one_time_exception">One-time exception (no adjustment)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <!-- Savings opportunity detection (Phase 2.2) -->
          <div class="space-y-4 pt-4 border-t border-border">
            <h3 class="text-sm font-medium">Savings opportunities</h3>
            <p class="text-xs text-muted-foreground">
              On the Goals page, suggest contributing surplus to goals when projected surplus exceeds this amount (default 50).
            </p>
            <div class="space-y-2">
              <Label for="savings-opportunity-threshold">Minimum surplus to suggest</Label>
              <Input
                id="savings-opportunity-threshold"
                type="number"
                min="0"
                step="10"
                placeholder="50 (default)"
                bind:value={savingsOpportunityMinSurplus}
                class="max-w-[140px]"
              />
            </div>
          </div>

          <div class="pt-4 border-t border-border">
            <p class="text-sm text-muted-foreground mb-2">Occasion awareness uses recurring spending events (e.g. Friday nights, holidays) to adjust your allowance.</p>
            <Button.Root variant="outline" size="sm" onclick={() => goto('/settings/occasions')}>
              Manage occasions
            </Button.Root>
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