<script lang="ts">
  import { onMount } from 'svelte';
  import { userService, currencyConfigService, exchangeRateService } from '$lib/core/services';
  import { db } from '$lib/core/db';
  import { PageLayout } from '$lib/components/layouts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import * as Input from '$lib/components/ui/input/index.ts';
  import * as Label from '$lib/components/ui/label/index.ts';
  import * as Alert from '$lib/components/ui/alert/index.ts';
  import { formatAmount } from '$lib/utils/currency-utils';
  import type { CurrencyConfiguration, Currency, ExchangeRate } from '$lib/core/db';
  import { Settings, RefreshCw, Save, Edit2, Trash2, Plus, Download } from '@lucide/svelte';

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
  
  // Exchange rates
  let exchangeRates = $state<ExchangeRate[]>([]);
  let editingRate = $state<string | null>(null);
  let editedRates = $state<Map<string, { fromCurrency: string; toCurrency: string; rate: number }>>(new Map());
  let showAddRateForm = $state(false);
  let newRate = $state({ fromCurrency: 'USD', toCurrency: 'EUR', rate: 1 });
  
  // Currency management
  let showAddCurrencyForm = $state(false);
  let newCurrency = $state({
    code: '',
    name: '',
    symbol: '',
    placement: 'before' as 'before' | 'after',
    decimalPlaces: 2
  });

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
      
      // Load exchange rates
      await loadExchangeRates();
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

  // Load exchange rates
  async function loadExchangeRates() {
    try {
      const today = new Date();
      const rates = await exchangeRateService.getRatesForDate(today);
      exchangeRates = rates.sort((a, b) => {
        if (a.fromCurrency !== b.fromCurrency) {
          return a.fromCurrency.localeCompare(b.fromCurrency);
        }
        return a.toCurrency.localeCompare(b.toCurrency);
      });
    } catch (err) {
      console.error('Error loading exchange rates:', err);
    }
  }

  // Start editing a rate
  function startEditingRate(rateId: string) {
    const rate = exchangeRates.find(r => r.id === rateId);
    if (rate) {
      editedRates.set(rateId, {
        fromCurrency: rate.fromCurrency,
        toCurrency: rate.toCurrency,
        rate: rate.rate
      });
      editingRate = rateId;
    }
  }

  // Cancel editing rate
  function cancelEditingRate() {
    editedRates.clear();
    editingRate = null;
  }

  // Save exchange rate
  async function saveExchangeRate(rateId: string) {
    if (isSaving) return;
    
    const edited = editedRates.get(rateId);
    if (!edited) return;
    
    isSaving = true;
    error = null;
    success = null;
    
    try {
      await exchangeRateService.setExchangeRate(
        edited.fromCurrency,
        edited.toCurrency,
        edited.rate
      );
      await loadExchangeRates();
      editedRates.delete(rateId);
      editingRate = null;
      success = 'Exchange rate updated successfully';
    } catch (err) {
      error = `Failed to save exchange rate: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('Error saving exchange rate:', err);
    } finally {
      isSaving = false;
    }
  }

  // Add new exchange rate
  async function addExchangeRate() {
    if (isSaving) return;
    
    isSaving = true;
    error = null;
    success = null;
    
    try {
      await exchangeRateService.setExchangeRate(
        newRate.fromCurrency,
        newRate.toCurrency,
        newRate.rate
      );
      await loadExchangeRates();
      showAddRateForm = false;
      newRate = { fromCurrency: 'USD', toCurrency: 'EUR', rate: 1 };
      success = 'Exchange rate added successfully';
    } catch (err) {
      error = `Failed to add exchange rate: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('Error adding exchange rate:', err);
    } finally {
      isSaving = false;
    }
  }

  // Update exchange rates from API
  async function updateRatesFromAPI() {
    if (isSaving) return;
    
    isSaving = true;
    error = null;
    success = null;
    
    try {
      await exchangeRateService.updateAllRates();
      await loadExchangeRates();
      success = 'Exchange rates updated from API';
    } catch (err) {
      error = `Failed to update rates: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('Error updating rates:', err);
    } finally {
      isSaving = false;
    }
  }

  // Get edited rate value
  function getRateValue(rateId: string, field: 'fromCurrency' | 'toCurrency' | 'rate'): string | number {
    const edited = editedRates.get(rateId);
    if (edited) {
      return edited[field];
    }
    const rate = exchangeRates.find(r => r.id === rateId);
    return rate ? rate[field] : (field === 'rate' ? 0 : '');
  }

  // Update edited rate value
  function updateRateValue(rateId: string, field: 'fromCurrency' | 'toCurrency' | 'rate', value: string | number) {
    const edited = editedRates.get(rateId) || { fromCurrency: '', toCurrency: '', rate: 1 };
    if (field === 'fromCurrency') {
      edited.fromCurrency = value as string;
    } else if (field === 'toCurrency') {
      edited.toCurrency = value as string;
    } else {
      edited.rate = value as number;
    }
    editedRates.set(rateId, edited);
  }

  // Add custom currency
  async function addCurrency() {
    if (isSaving) return;
    
    // Validate currency code
    if (!/^[A-Z]{3}$/.test(newCurrency.code)) {
      error = 'Currency code must be 3 uppercase letters (ISO 4217 format)';
      return;
    }
    
    // Check if currency already exists
    const existing = await db.getCurrencyByCode(newCurrency.code);
    if (existing) {
      error = `Currency ${newCurrency.code} already exists`;
      return;
    }
    
    isSaving = true;
    error = null;
    success = null;
    
    try {
      const { generateUUID } = await import('$lib/core/db');
      await db.currencies.add({
        id: generateUUID(),
        code: newCurrency.code.toUpperCase(),
        name: newCurrency.name,
        symbol: newCurrency.symbol,
        placement: newCurrency.placement,
        decimalPlaces: newCurrency.decimalPlaces,
        isSystem: false,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null
      });
      
      // Reload currencies
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
      
      showAddCurrencyForm = false;
      newCurrency = { code: '', name: '', symbol: '', placement: 'before', decimalPlaces: 2 };
      success = `Currency ${newCurrency.code} added successfully`;
    } catch (err) {
      error = `Failed to add currency: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('Error adding currency:', err);
    } finally {
      isSaving = false;
    }
  }

  // Toggle currency active status
  async function toggleCurrencyActive(currency: Currency) {
    if (isSaving) return;
    
    // System currencies cannot be deactivated if they're the only active currency
    if (!currency.isActive && currency.isSystem) {
      const accounts = await db.getActiveAccounts();
      const accountsUsingCurrency = accounts.filter(a => a.currency === currency.code);
      if (accountsUsingCurrency.length > 0) {
        error = `Cannot deactivate ${currency.code} - it's used by ${accountsUsingCurrency.length} account(s)`;
        return;
      }
    }
    
    isSaving = true;
    error = null;
    success = null;
    
    try {
      await db.currencies.update(currency.id, {
        isActive: !currency.isActive,
        updatedAt: new Date().toISOString()
      });
      
      // Reload currencies
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
      
      success = `Currency ${currency.code} ${!currency.isActive ? 'activated' : 'deactivated'}`;
    } catch (err) {
      error = `Failed to update currency: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('Error updating currency:', err);
    } finally {
      isSaving = false;
    }
  }

  // Delete custom currency (soft delete)
  async function deleteCurrency(currency: Currency) {
    if (isSaving) return;
    
    // System currencies cannot be deleted
    if (currency.isSystem) {
      error = 'System currencies cannot be deleted';
      return;
    }
    
    // Check if currency is used by accounts
    const accounts = await db.getActiveAccounts();
    const accountsUsingCurrency = accounts.filter(a => a.currency === currency.code);
    if (accountsUsingCurrency.length > 0) {
      error = `Cannot delete ${currency.code} - it's used by ${accountsUsingCurrency.length} account(s). Please change those accounts to another currency first.`;
      return;
    }
    
    if (!confirm(`Are you sure you want to delete ${currency.name} (${currency.code})?`)) {
      return;
    }
    
    isSaving = true;
    error = null;
    success = null;
    
    try {
      await db.currencies.update(currency.id, {
        deletedAt: new Date().toISOString(),
        isActive: false,
        updatedAt: new Date().toISOString()
      });
      
      // Reload currencies
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
      
      success = `Currency ${currency.code} deleted successfully`;
    } catch (err) {
      error = `Failed to delete currency: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('Error deleting currency:', err);
    } finally {
      isSaving = false;
    }
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

      <!-- Currency Management -->
      <Card.Root>
        <Card.Header>
          <Card.Title>Manage Currencies</Card.Title>
          <Card.Description>
            Add custom currencies or manage existing ones. System currencies cannot be deleted.
          </Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="flex justify-end">
            <Button.Root
              onclick={() => showAddCurrencyForm = true}
              disabled={isSaving || showAddCurrencyForm}
            >
              <Plus class="h-4 w-4 mr-2" />
              Add Currency
            </Button.Root>
          </div>

          {#if showAddCurrencyForm}
            <div class="border rounded-lg p-4 space-y-4">
              <h3 class="font-semibold">Add Custom Currency</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label.Root for="new-currency-code">Currency Code (ISO 4217)</Label.Root>
                  <Input.Root
                    id="new-currency-code"
                    type="text"
                    placeholder="USD"
                    value={newCurrency.code}
                    oninput={(e) => {
                      const target = e.currentTarget as HTMLInputElement;
                      newCurrency.code = target.value.toUpperCase();
                    }}
                  />
                  <p class="text-xs text-muted-foreground">3 uppercase letters (e.g., USD, EUR, INR)</p>
                </div>
                <div class="space-y-2">
                  <Label.Root for="new-currency-name">Currency Name</Label.Root>
                  <Input.Root
                    id="new-currency-name"
                    type="text"
                    placeholder="US Dollar"
                    bind:value={newCurrency.name}
                  />
                </div>
                <div class="space-y-2">
                  <Label.Root for="new-currency-symbol">Symbol</Label.Root>
                  <Input.Root
                    id="new-currency-symbol"
                    type="text"
                    placeholder="$"
                    bind:value={newCurrency.symbol}
                  />
                </div>
                <div class="space-y-2">
                  <Label.Root for="new-currency-placement">Symbol Placement</Label.Root>
                  <select
                    id="new-currency-placement"
                    bind:value={newCurrency.placement}
                    class="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="before">Before amount ($100)</option>
                    <option value="after">After amount (100₽)</option>
                  </select>
                </div>
                <div class="space-y-2">
                  <Label.Root for="new-currency-decimals">Decimal Places</Label.Root>
                  <Input.Root
                    id="new-currency-decimals"
                    type="number"
                    min="0"
                    max="18"
                    value={newCurrency.decimalPlaces.toString()}
                    oninput={(e) => {
                      const target = e.currentTarget as HTMLInputElement;
                      const parsed = parseInt(target.value);
                      if (!isNaN(parsed)) {
                        newCurrency.decimalPlaces = parsed;
                      }
                    }}
                  />
                </div>
              </div>
              <div class="flex gap-2">
                <Button.Root
                  onclick={addCurrency}
                  disabled={isSaving || !newCurrency.code || !newCurrency.name || !newCurrency.symbol}
                >
                  <Save class="h-4 w-4 mr-2" />
                  Add Currency
                </Button.Root>
                <Button.Root
                  variant="outline"
                  onclick={() => {
                    showAddCurrencyForm = false;
                    newCurrency = { code: '', name: '', symbol: '', placement: 'before', decimalPlaces: 2 };
                  }}
                  disabled={isSaving}
                >
                  Cancel
                </Button.Root>
              </div>
            </div>
          {/if}

          <div class="border rounded-lg overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="bg-muted">
                  <tr>
                    <th class="px-4 py-3 text-left text-sm font-medium">Code</th>
                    <th class="px-4 py-3 text-left text-sm font-medium">Name</th>
                    <th class="px-4 py-3 text-left text-sm font-medium">Symbol</th>
                    <th class="px-4 py-3 text-left text-sm font-medium">Type</th>
                    <th class="px-4 py-3 text-left text-sm font-medium">Status</th>
                    <th class="px-4 py-3 text-right text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each currencies as currency}
                    <tr class="border-t">
                      <td class="px-4 py-3 font-mono">{currency.code}</td>
                      <td class="px-4 py-3">{currency.name}</td>
                      <td class="px-4 py-3">{currency.symbol}</td>
                      <td class="px-4 py-3">
                        <span class="text-xs text-muted-foreground">
                          {currency.isSystem ? 'System' : 'Custom'}
                        </span>
                      </td>
                      <td class="px-4 py-3">
                        <span class="text-xs {currency.isActive ? 'text-green-600' : 'text-muted-foreground'}">
                          {currency.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-right">
                        <div class="flex gap-2 justify-end">
                          <Button.Root
                            variant="outline"
                            size="sm"
                            onclick={() => toggleCurrencyActive(currency)}
                            disabled={isSaving}
                          >
                            {currency.isActive ? 'Deactivate' : 'Activate'}
                          </Button.Root>
                          {#if !currency.isSystem}
                            <Button.Root
                              variant="outline"
                              size="sm"
                              onclick={() => deleteCurrency(currency)}
                              disabled={isSaving}
                            >
                              <Trash2 class="h-4 w-4" />
                            </Button.Root>
                          {/if}
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
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

