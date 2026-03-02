<script lang="ts">
  import * as Select from '$lib/components/ui/select/index.ts';
  import * as Label from '$lib/components/ui/label/index.ts';
  import { Input } from '$lib/components/ui/input/index.ts';
  import * as Switch from '$lib/components/ui/switch/index.ts';
  import { onMount } from 'svelte';
  import { db, type Account, type AccountMetadata } from '$lib/core/db';
  import { formSchema } from './AccountForm.schema';
  import AccountMetadataForm from './AccountMetadataForm.svelte';
  import { FormFieldGrid, FormErrorAlert, CurrencyInput, AdvancedOptionsSection } from '$lib/components/forms';
  import { createMobileInputFocusHandler } from '$lib/utils/mobile-input-utils';
  import { Wallet, PiggyBank, CreditCard } from '@lucide/svelte';

  interface Props {
    account?: Partial<Account>;
    onSubmit: (accountData: Partial<Account>) => Promise<void>;
    onCancel: () => void;
    submitLabel?: string;
    cancelLabel?: string;
    isLoading?: boolean;
  }

  const { 
    account = {}, 
    onSubmit, 
    onCancel, 
    submitLabel = 'Create Account', 
    cancelLabel = 'Cancel',
    isLoading = false 
  }: Props = $props();

  // Form state
  let accountName = $state(account.name || '');
  let accountType = $state<Account['type']>(account.type || 'checking');
  let initialBalance = $state(account.initialBalance?.toString() || '');
  let currency = $state<string | null>(account.currency || null);
  let isActive = $state(account.isActive ?? true);
  let errors = $state<Record<string, string>>({});
  let isSubmitting = $state(false);

  let currencies = $state<Array<{ code: string; name: string; symbol: string; placement: 'before' | 'after'; decimalPlaces: number; label: string }>>([]);
  let isLoadingCurrencies = $state(false);
  let accountMetadata = $state<Partial<AccountMetadata>>(account.metadata || {});
  let initialBalanceNumber = $state(account.initialBalance || 0);
  
  const formId = 'account-form';
  const handleFocus = createMobileInputFocusHandler();

  // Use actual account types from the database schema
  const accountTypes = [
    { value: 'checking' as const, label: 'Checking Account', icon: '🏦' },
    { value: 'savings' as const, label: 'Savings Account', icon: '💰' },
    { value: 'credit' as const, label: 'Credit Card', icon: '💳' },
    { value: 'cash' as const, label: 'Cash', icon: '💵' },
    { value: 'investment' as const, label: 'Investment', icon: '📈' },
    { value: 'crypto' as const, label: 'Cryptocurrency', icon: '₿' }
  ];

  // Sync initialBalance string with number
  $effect(() => {
    const num = parseFloat(initialBalance);
    if (!isNaN(num)) {
      initialBalanceNumber = num;
    }
  });
  
  $effect(() => {
    initialBalance = initialBalanceNumber.toString();
  });

  const accountTypeTriggerContent = $derived(
    accountTypes.find(type => type.value === accountType)?.label ?? 'Select account type'
  );

  function validateForm() {
    // Ensure currency is set before validation
    if (!currency && currencies.length > 0) {
      currency = currencies[0].code;
    }
    
    if (!currency) {
      errors.currency = 'Currency is required';
      return false;
    }

    const result = formSchema.safeParse({
      accountName,
      accountType,
      initialBalance,
      currency
    });

    if (!result.success) {
      errors = {};
      result.error.errors.forEach(error => {
        if (error.path[0]) {
          errors[error.path[0] as string] = error.message;
        }
      });
      return false;
    }
    
    // Additional validation
    if (accountName.trim().length === 0) {
      errors.accountName = 'Account name is required';
      return false;
    }

    if (accountName.trim().length > 100) {
      errors.accountName = 'Account name must be less than 100 characters';
      return false;
    }

    const balance = parseFloat(initialBalance);
    if (isNaN(balance)) {
      errors.initialBalance = 'Initial balance must be a valid number';
      return false;
    }

    // Currency-agnostic validation - will be validated by currency config service
    // Using a reasonable default limit, actual limit should come from currency config
    if (Math.abs(balance) > 1000000) {
      errors.initialBalance = 'Initial balance is too large';
      return false;
    }
    
    errors = {};
    return true;
  }

  async function handleSubmit() {
    if (!validateForm()) {
      return;
    }

    isSubmitting = true;
    
    try {
      // Parse initial balance as number, default to 0 if empty
      const balance = initialBalance.trim() === '' ? 0 : parseFloat(initialBalance) || 0;
      
      // Ensure currency is set
      if (!currency && currencies.length > 0) {
        currency = currencies[0].code;
      }
      
      if (!currency) {
        errors.currency = 'Currency is required';
        return;
      }

      // Convert metadata proxy to plain object using JSON serialization
      // This ensures all proxies are removed and we have a plain object
      let plainMetadata: AccountMetadata | undefined = undefined;
      if (accountMetadata && Object.keys(accountMetadata).length > 0) {
        try {
          // JSON serialization removes proxies and creates a plain object
          plainMetadata = JSON.parse(JSON.stringify(accountMetadata)) as AccountMetadata;
          // Remove any undefined/null values
          Object.keys(plainMetadata).forEach(key => {
            if ((plainMetadata as any)[key] === undefined || (plainMetadata as any)[key] === null) {
              delete (plainMetadata as any)[key];
            }
          });
          // If no valid properties remain, set to undefined
          if (Object.keys(plainMetadata).length === 0) {
            plainMetadata = undefined;
          }
        } catch (e) {
          console.warn('Failed to serialize metadata, using empty object:', e);
          plainMetadata = undefined;
        }
      }

      // Prepare account data - create plain object to avoid proxy cloning issues with IndexedDB
      const accountData: Partial<Account> = {
        name: accountName.trim(),
        type: accountType,
        currency: currency, // currency is now guaranteed to be string
        initialBalance: balance,
        isActive: isActive,
        metadata: plainMetadata
      };

      // If editing, preserve the current balance
      if (account.id) {
        accountData.id = account.id;
        // Extract currentBalance as plain value (not proxy)
        accountData.currentBalance = typeof account.currentBalance === 'number' 
          ? account.currentBalance 
          : (account.currentBalance ? Number(account.currentBalance) : 0);
      } else {
        // For new accounts, set current balance to initial balance
        accountData.currentBalance = balance;
      }

      // AccountData is already a plain object with no proxies, safe to pass to IndexedDB
      await onSubmit(accountData);
    } catch (error) {
      console.error('Failed to submit account:', error);
      
      // Handle validation errors from the service
      if (error instanceof Error) {
        if (error.message.includes('Invalid account data:')) {
          const errorMessage = error.message.replace('Invalid account data: ', '');
          errors.general = errorMessage;
        } else {
          errors.general = error.message;
        }
      } else {
        errors.general = 'Failed to save account. Please try again.';
      }
    } finally {
      isSubmitting = false;
    }
  }

  onMount(async () => {
    isLoadingCurrencies = true;
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
        .map(curr => ({
          code: curr.code,
          name: curr.name,
          symbol: curr.symbol,
          placement: curr.placement,
          decimalPlaces: curr.decimalPlaces,
          label: `${curr.code} - ${curr.name}`
        }));

      // If no currencies found, this is an error state - currencies should always be available
      if (currencies.length === 0) {
        console.error('No currencies available in database');
        // Don't set a fallback - let the form show an error
      }

      // Set default currency from user preferences if not already set
      if (!currency) {
        try {
          const { userService } = await import('$lib/core/services');
          const preferences = await userService.getUserPreferences();
          if (preferences?.currency && currencies.some(c => c.code === preferences.currency)) {
            currency = preferences.currency;
          } else if (currencies.length > 0) {
            currency = currencies[0].code;
          }
        } catch (err) {
          console.error('Error loading user preferences:', err);
          if (currencies.length > 0) {
            currency = currencies[0].code;
          }
        }
      }

      // Validate current currency selection
      if (currency && !currencies.some(c => c.code === currency)) {
        currency = currencies[0]?.code || null;
      }
    } catch (err) {
      console.error('Error loading currencies:', err);
      // Don't set fallback - let the form handle the error
    } finally {
      isLoadingCurrencies = false;
    }
  });
</script>

<!-- General Error Display -->
<FormErrorAlert error={errors.general || null} />

<!-- Account Form -->
<form id={formId} onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
  <FormFieldGrid>
    <!-- Account Name -->
    <Label.Root for="accountName" class="">Account Name *</Label.Root>
    <div>
      <Input 
        id="accountName"
        bind:value={accountName}
        placeholder="e.g., Main Checking, Emergency Fund"
        class={errors.accountName ? 'border-destructive' : ''}
        onfocus={handleFocus}
      />
      {#if errors.accountName}
        <p class="text-sm text-destructive mt-1" role="alert">{errors.accountName}</p>
      {/if}
    </div>

    <!-- Account Type -->
    <Label.Root for="accountType" class="">Account type *</Label.Root>
    <div class="space-y-2">
      <div class="grid grid-cols-3 gap-2">
        {#each [
          { value: 'checking', label: 'Checking', Icon: Wallet },
          { value: 'savings', label: 'Savings', Icon: PiggyBank },
          { value: 'credit', label: 'Credit', Icon: CreditCard }
        ] as typeOption}
          <button
            type="button"
            onclick={() => { accountType = typeOption.value as Account['type']; }}
            class="flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 text-sm font-medium transition-all
              {accountType === typeOption.value
                ? 'border-[var(--color-amber)] bg-[var(--color-amber-subtle)] text-[var(--color-amber)]'
                : 'border-border bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:border-[var(--color-amber)]/40'}"
          >
            <typeOption.Icon class="size-5" />
            {typeOption.label}
          </button>
        {/each}
      </div>
      {#if errors.accountType}
        <p class="text-sm text-destructive mt-1" role="alert">{errors.accountType}</p>
      {/if}
    </div>

    <!-- Initial Balance -->
    <Label.Root for="initialBalance" class="">Initial Balance</Label.Root>
    {#if currency}
      <CurrencyInput
        id="initialBalance"
        value={initialBalanceNumber}
        currency={currency}
        currencies={currencies}
        onValueChange={(val) => {
          initialBalanceNumber = val;
          initialBalance = val.toString();
        }}
        onCurrencyChange={(code) => {
          currency = code;
        }}
        error={errors.initialBalance}
      />
    {:else}
      <div class="text-sm text-muted-foreground">Loading currencies...</div>
    {/if}
    {#if errors.currency}
      <p class="text-sm text-destructive mt-1" role="alert">{errors.currency}</p>
    {/if}

    <!-- Account Active -->
    <Label.Root for="isActive" class="">Active</Label.Root>
    <div class="space-y-2">
      <div class="flex items-center space-x-2">
        <Switch.Root bind:checked={isActive} />
        <Label.Root for="isActive" class="font-normal">Account is active</Label.Root>
      </div>
      <p class="text-xs text-muted-foreground">
        Inactive accounts won't appear in transaction forms but will be preserved for historical data
      </p>
    </div>
  </FormFieldGrid>

  <!-- Advanced Options -->
  <div class="border-t border-border pt-6 mt-6">
    <div class="mb-4 space-y-2">
      <h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wide">Advanced Options</h3>
      <p class="text-xs text-muted-foreground mb-4">
        Configure account-specific settings to enable optimization features like fee avoidance,
        credit utilization tracking, and buffer management.
      </p>
    </div>
    <FormFieldGrid>
      <AccountMetadataForm
        accountType={accountType}
        metadata={accountMetadata}
        currency={currency || undefined}
        onMetadataChange={(metadata) => {
          accountMetadata = metadata;
        }}
      />
    </FormFieldGrid>
  </div>
</form> 