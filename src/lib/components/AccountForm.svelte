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
  let currency = $state(account.currency || 'USD');
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

    if (Math.abs(balance) > 1000000) {
      errors.initialBalance = 'Initial balance cannot exceed $1,000,000';
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
      
      // Prepare account data
      const accountData: Partial<Account> = {
        name: accountName.trim(),
        type: accountType,
        currency: currency,
        initialBalance: balance,
        isActive: isActive,
        metadata: accountMetadata && Object.keys(accountMetadata).length > 0 ? accountMetadata : undefined
      };

      // If editing, preserve the current balance
      if (account.id) {
        accountData.id = account.id;
        accountData.currentBalance = account.currentBalance;
      } else {
        // For new accounts, set current balance to initial balance
        accountData.currentBalance = balance;
      }

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

      // If no currencies found, use default USD
      if (currencies.length === 0) {
        currencies = [{
          code: 'USD',
          name: 'US Dollar',
          symbol: '$',
          placement: 'before' as const,
          decimalPlaces: 2,
          label: 'USD - US Dollar'
        }];
      }

      // Validate current currency selection
      if (currency && !currencies.some(c => c.code === currency)) {
        currency = currencies[0]?.code || 'USD';
      }
    } catch (err) {
      console.error('Error loading currencies:', err);
      // Fallback to default currency if loading fails
      if (currencies.length === 0) {
        currencies = [{
          code: 'USD',
          name: 'US Dollar',
          symbol: '$',
          placement: 'before' as const,
          decimalPlaces: 2,
          label: 'USD - US Dollar'
        }];
      }
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
    <Label.Root for="accountType" class="">Account Type *</Label.Root>
    <div>
      <Select.Root type="single" bind:value={accountType}>
        <Select.Trigger class="w-full">
          {accountTypeTriggerContent}
        </Select.Trigger>
        <Select.Content>
          <Select.Group>
            {#each accountTypes as type (type.value)}
              <Select.Item
                value={type.value}
                label={type.label}
              >
                <div class="flex items-center space-x-2">
                  <span>{type.icon}</span>
                  <span>{type.label}</span>
                </div>
              </Select.Item>
            {/each}
          </Select.Group>
        </Select.Content>
      </Select.Root>
      {#if errors.accountType}
        <p class="text-sm text-destructive mt-1" role="alert">{errors.accountType}</p>
      {/if}
    </div>

    <!-- Initial Balance -->
    <Label.Root for="initialBalance" class="">Initial Balance</Label.Root>
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
        currency={currency}
        onMetadataChange={(metadata) => {
          accountMetadata = metadata;
        }}
      />
    </FormFieldGrid>
  </div>
</form> 