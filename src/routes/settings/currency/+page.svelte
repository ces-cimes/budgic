<script lang="ts">
  import { onMount } from 'svelte';
  import { userService, currencyConfigService } from '$lib/core/services';
  import { db } from '$lib/core/db';
  import { PageLayout } from '$lib/components/layouts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import * as Input from '$lib/components/ui/input/index.ts';
  import * as Label from '$lib/components/ui/label/index.ts';
  import * as Alert from '$lib/components/ui/alert/index.ts';
  import { formatAmount } from '$lib/utils/currency-utils';
  import type { CurrencyConfiguration, Currency } from '$lib/core/db';
  import { Settings, RefreshCw, Save } from '@lucide/svelte';

  // State
  let isLoading = $state(true);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  
  // Main currency selection
  let mainCurrency = $state('USD');
  let currencyOptions = $state<Array<{ value: string; label: string; symbol: string }>>([]);
  
  // Currency configurations
  let currencyConfigs = $state<Map<string, CurrencyConfiguration>>(new Map());
  let currencies = $state<Currency[]>([]);
  let editingCurrency = $state<string | null>(null);
  let editedConfigs = $state<Map<string, Partial<CurrencyConfiguration>>>(new Map());

  // Load data on mount
  onMount(async () => {
    try {
      // Load active currencies
      const activeCurrencies = await db.getActiveCurrencies();
      currencies = activeCurrencies.filter(c => c.isActive).sort((a, b) => {
        if (a.isSystem && !b.isSystem) return -1;
        if (!a.isSystem && b.isSystem) return 1;
        return a.code.localeCompare(b.code);
      });

      currencyOptions = currencies.map(c => ({
        value: c.code,
        label: `${c.name} (${c.code})`,
        symbol: c.symbol
      }));

      // Load user preferences for main currency
      const preferences = await userService.getUserPreferences();
      if (preferences?.currency) {
        mainCurrency = preferences.currency;
      } else if (currencyOptions.length > 0) {
        mainCurrency = currencyOptions[0].value;
      }

      // Load all currency configurations
      await loadCurrencyConfigurations();
    } catch (err) {
      error = 'Failed to load currency settings';
      console.error('Error loading currency settings:', err);
    } finally {
      isLoading = false;
    }
  });

  // Load currency configurations
  async function loadCurrencyConfigurations() {
    try {
      const configs = await currencyConfigService.getAllConfigurations();
      const configMap = new Map<string, CurrencyConfiguration>();
      
      for (const config of configs) {
        configMap.set(config.currencyCode, config);
      }
      
      currencyConfigs = configMap;
    } catch (err) {
      console.error('Error loading currency configurations:', err);
    }
  }

  // Get configuration for a currency
  function getConfig(currencyCode: string): CurrencyConfiguration | null {
    return currencyConfigs.get(currencyCode) || null;
  }

  // Get currency info
  function getCurrencyInfo(currencyCode: string): Currency | null {
    return currencies.find(c => c.code === currencyCode) || null;
  }

  // Start editing a currency configuration
  function startEditing(currencyCode: string) {
    const config = getConfig(currencyCode);
    if (config) {
      editedConfigs.set(currencyCode, {
        defaultCheckingBuffer: config.defaultCheckingBuffer,
        defaultSavingsBuffer: config.defaultSavingsBuffer,
        defaultMinimumBalance: config.defaultMinimumBalance,
        defaultOverdraftLimit: config.defaultOverdraftLimit,
        defaultOverdraftFee: config.defaultOverdraftFee,
        maxAmountLimit: config.maxAmountLimit,
        defaultBudgetAllocation: config.defaultBudgetAllocation,
        notes: config.notes
      });
      editingCurrency = currencyCode;
    }
  }

  // Cancel editing
  function cancelEditing() {
    editedConfigs.clear();
    editingCurrency = null;
  }

  // Save currency configuration
  async function saveCurrencyConfig(currencyCode: string) {
    if (isSaving) return;
    
    isSaving = true;
    error = null;
    success = null;
    
    try {
      const updates = editedConfigs.get(currencyCode);
      if (updates) {
        await currencyConfigService.updateCurrencyConfig(currencyCode, updates);
        await loadCurrencyConfigurations();
        editedConfigs.delete(currencyCode);
        editingCurrency = null;
        success = `Currency configuration for ${currencyCode} saved successfully`;
      }
    } catch (err) {
      error = `Failed to save currency configuration: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('Error saving currency configuration:', err);
    } finally {
      isSaving = false;
    }
  }

  // Reset to system defaults
  async function resetToDefaults(currencyCode: string) {
    if (isSaving) return;
    
    if (!confirm(`Reset ${currencyCode} configuration to system defaults?`)) {
      return;
    }
    
    isSaving = true;
    error = null;
    success = null;
    
    try {
      await currencyConfigService.resetToDefaults(currencyCode);
      await loadCurrencyConfigurations();
      editedConfigs.delete(currencyCode);
      editingCurrency = null;
      success = `Currency configuration for ${currencyCode} reset to defaults`;
    } catch (err) {
      error = `Failed to reset currency configuration: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('Error resetting currency configuration:', err);
    } finally {
      isSaving = false;
    }
  }

  // Save main currency preference
  async function saveMainCurrency() {
    if (isSaving) return;
    
    isSaving = true;
    error = null;
    success = null;
    
    try {
      await userService.updateUserPreferences({ currency: mainCurrency });
      success = 'Main currency updated successfully';
    } catch (err) {
      error = 'Failed to update main currency';
      console.error('Error saving main currency:', err);
    } finally {
      isSaving = false;
    }
  }

  // Get edited value or current value
  function getValue(currencyCode: string, field: keyof CurrencyConfiguration): number | string | undefined {
    const edited = editedConfigs.get(currencyCode);
    if (edited && field in edited) {
      return edited[field as keyof typeof edited] as number | string | undefined;
    }
    const config = getConfig(currencyCode);
    if (!config) return undefined;
    const value = config[field];
    // Filter out null and boolean values, only return number, string, or undefined
    if (value === null || typeof value === 'boolean') return undefined;
    return value as number | string | undefined;
  }

  // Update edited value
  function updateValue(currencyCode: string, field: keyof CurrencyConfiguration, value: number | string | undefined) {
    const edited = editedConfigs.get(currencyCode) || {};
    edited[field as keyof typeof edited] = value as any;
    editedConfigs.set(currencyCode, edited);
  }
</script>

<svelte:head>
  <title>Currency Settings | Budgic</title>
</svelte:head>

<PageLayout>
  <div class="container mx-auto py-6 space-y-6">
    <div class="flex items-center gap-2">
      <Settings class="h-6 w-6" />
      <h1 class="text-3xl font-bold">Currency Settings</h1>
    </div>

    {#if error}
      <Alert.Root variant="destructive">
        <Alert.Title>Error</Alert.Title>
        <Alert.Description>{error}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if success}
      <Alert.Root variant="default">
        <Alert.Title>Success</Alert.Title>
        <Alert.Description>{success}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if isLoading}
      <div class="text-center py-8">Loading currency settings...</div>
    {:else}
      <!-- Main Currency Selection -->
      <Card.Root>
        <Card.Header>
          <Card.Title>Main Currency</Card.Title>
          <Card.Description>
            Select your primary currency for displaying amounts throughout the app
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="space-y-2">
            <Label.Root for="main-currency">Currency</Label.Root>
            <select
              id="main-currency"
              bind:value={mainCurrency}
              class="w-full px-3 py-2 border rounded-md"
            >
              {#each currencyOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
          <Button.Root onclick={saveMainCurrency} disabled={isSaving}>
            <Save class="h-4 w-4 mr-2" />
            Save Main Currency
          </Button.Root>
        </Card.Content>
      </Card.Root>

      <!-- Currency-Specific Defaults -->
      <Card.Root>
        <Card.Header>
          <Card.Title>Currency-Specific Defaults</Card.Title>
          <Card.Description>
            Configure default values for each currency. These values are used when creating accounts and calculating buffers.
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-6">
          {#each currencies as currency}
            {@const config = getConfig(currency.code)}
            {@const isEditing = editingCurrency === currency.code}
            {@const currencyInfo = getCurrencyInfo(currency.code)}
            
            <div class="border rounded-lg p-4 space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-semibold text-lg">
                    {currency.name} ({currency.code})
                  </h3>
                  {#if config?.isCustom}
                    <span class="text-xs text-muted-foreground">Customized</span>
                  {:else}
                    <span class="text-xs text-muted-foreground">System Default</span>
                  {/if}
                </div>
                <div class="flex gap-2">
                  {#if isEditing}
                    <Button.Root
                      variant="outline"
                      size="sm"
                      onclick={() => cancelEditing()}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button.Root>
                    <Button.Root
                      size="sm"
                      onclick={() => saveCurrencyConfig(currency.code)}
                      disabled={isSaving}
                    >
                      <Save class="h-4 w-4 mr-2" />
                      Save
                    </Button.Root>
                  {:else}
                    <Button.Root
                      variant="outline"
                      size="sm"
                      onclick={() => resetToDefaults(currency.code)}
                      disabled={isSaving}
                    >
                      <RefreshCw class="h-4 w-4 mr-2" />
                      Reset to Defaults
                    </Button.Root>
                    <Button.Root
                      size="sm"
                      onclick={() => startEditing(currency.code)}
                      disabled={isSaving}
                    >
                      Edit
                    </Button.Root>
                  {/if}
                </div>
              </div>

              {#if isEditing}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <Label.Root for="checking-buffer-{currency.code}">Checking Buffer</Label.Root>
                    <Input.Root
                      id="checking-buffer-{currency.code}"
                      type="number"
                      min="0"
                      step="0.01"
                      value={getValue(currency.code, 'defaultCheckingBuffer')?.toString() || ''}
                      oninput={(e) => {
                        const target = e.currentTarget as HTMLInputElement;
                        updateValue(currency.code, 'defaultCheckingBuffer', parseFloat(target.value) || 0);
                      }}
                    />
                  </div>
                  <div class="space-y-2">
                    <Label.Root for="savings-buffer-{currency.code}">Savings Buffer</Label.Root>
                    <Input.Root
                      id="savings-buffer-{currency.code}"
                      type="number"
                      min="0"
                      step="0.01"
                      value={getValue(currency.code, 'defaultSavingsBuffer')?.toString() || ''}
                      oninput={(e) => {
                        const target = e.currentTarget as HTMLInputElement;
                        updateValue(currency.code, 'defaultSavingsBuffer', parseFloat(target.value) || 0);
                      }}
                    />
                  </div>
                  <div class="space-y-2">
                    <Label.Root for="min-balance-{currency.code}">Minimum Balance</Label.Root>
                    <Input.Root
                      id="min-balance-{currency.code}"
                      type="number"
                      min="0"
                      step="0.01"
                      value={getValue(currency.code, 'defaultMinimumBalance')?.toString() || ''}
                      oninput={(e) => {
                        const target = e.currentTarget as HTMLInputElement;
                        updateValue(currency.code, 'defaultMinimumBalance', parseFloat(target.value) || 0);
                      }}
                    />
                  </div>
                  <div class="space-y-2">
                    <Label.Root for="max-amount-{currency.code}">Max Amount Limit</Label.Root>
                    <Input.Root
                      id="max-amount-{currency.code}"
                      type="number"
                      min="0"
                      step="0.01"
                      value={getValue(currency.code, 'maxAmountLimit')?.toString() || ''}
                      oninput={(e) => {
                        const target = e.currentTarget as HTMLInputElement;
                        updateValue(currency.code, 'maxAmountLimit', parseFloat(target.value) || 0);
                      }}
                    />
                  </div>
                </div>
              {:else}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span class="text-muted-foreground">Checking Buffer:</span>
                    <span class="ml-2 font-medium">
                      {#if config?.defaultCheckingBuffer !== undefined}
                        {formatAmount(config.defaultCheckingBuffer, currency.code)}
                      {:else}
                        Not set
                      {/if}
                    </span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">Savings Buffer:</span>
                    <span class="ml-2 font-medium">
                      {#if config?.defaultSavingsBuffer !== undefined}
                        {formatAmount(config.defaultSavingsBuffer, currency.code)}
                      {:else}
                        Not set
                      {/if}
                    </span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">Minimum Balance:</span>
                    <span class="ml-2 font-medium">
                      {#if config?.defaultMinimumBalance !== undefined}
                        {formatAmount(config.defaultMinimumBalance, currency.code)}
                      {:else}
                        Not set
                      {/if}
                    </span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">Max Amount Limit:</span>
                    <span class="ml-2 font-medium">
                      {#if config?.maxAmountLimit !== undefined}
                        {formatAmount(config.maxAmountLimit, currency.code)}
                      {:else}
                        Not set
                      {/if}
                    </span>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    {/if}
  </div>
</PageLayout>

