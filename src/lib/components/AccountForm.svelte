<script lang="ts">
  import * as Form from '$lib/components/ui/form/index.ts';
  import * as Select from '$lib/components/ui/select/index.ts';
  import { Label } from '$lib/components/ui/label/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { Input } from '$lib/components/ui/input/index.ts';
  import * as Switch from '$lib/components/ui/switch/index.ts';
  import { onMount } from 'svelte';
  import type { Account } from '$lib/core/db';
  import { formSchema } from './AccountForm.schema';

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

  let currencies = $state<any[]>([]);
  let isLoadingCurrencies = $state(false);

  // Static currency list since currencyService was removed
  const staticCurrencies = [
    {
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      placement: 'before',
      decimalPlaces: 2
    },
    {
      code: 'EUR',
      name: 'Euro',
      symbol: '€',
      placement: 'before',
      decimalPlaces: 2
    },
    {
      code: 'GBP',
      name: 'British Pound',
      symbol: '£',
      placement: 'before',
      decimalPlaces: 2
    },
    {
      code: 'JPY',
      name: 'Japanese Yen',
      symbol: '¥',
      placement: 'before',
      decimalPlaces: 0
    },
    {
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: 'C$',
      placement: 'before',
      decimalPlaces: 2
    },
    {
      code: 'AUD',
      name: 'Australian Dollar',
      symbol: 'A$',
      placement: 'before',
      decimalPlaces: 2
    }
  ];

  // Use actual account types from the database schema
  const accountTypes = [
    { value: 'checking' as const, label: 'Checking Account', icon: '🏦' },
    { value: 'savings' as const, label: 'Savings Account', icon: '💰' },
    { value: 'credit' as const, label: 'Credit Card', icon: '💳' },
    { value: 'cash' as const, label: 'Cash', icon: '💵' },
    { value: 'investment' as const, label: 'Investment', icon: '📈' },
    { value: 'crypto' as const, label: 'Cryptocurrency', icon: '₿' }
  ];

  const triggerContent = $derived(
    currencies.find((c: any) => c.code === currency)?.name ?? 'Select currency'
  );

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
        isActive: isActive
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
    // Use static currencies since currencyService was removed
    currencies = staticCurrencies.map(curr => ({
      ...curr,
      label: `${curr.code} - ${curr.name}`,
    }));
  });
</script>

<!-- General Error Display -->
{#if errors.general}
  <div class="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
    <p class="text-sm text-destructive">{errors.general}</p>
  </div>
{/if}

<!-- Account Form -->
<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
  <div class="space-y-2">
    <Label for="accountName">Account Name</Label>
    <Input 
      id="accountName"
      bind:value={accountName}
      placeholder="e.g., Main Checking, Emergency Fund"
      class={errors.accountName ? 'border-destructive' : ''}
    />
    {#if errors.accountName}
      <p class="text-sm text-destructive">{errors.accountName}</p>
    {/if}
  </div>

  <div class="space-y-2">
    <Label for="accountType">Account Type</Label>
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
      <p class="text-sm text-destructive">{errors.accountType}</p>
    {/if}
  </div>

  <div class="space-y-2">
    <Label for="initialBalance">Initial Balance</Label>
    <div class="relative">
      <span class="absolute {currencies.find((c: any) => c.code === currency)?.placement === 'before' ? 'left-3' : 'right-3'} top-1/2 transform -translate-y-1/2 text-muted-foreground">{currencies.find((c: any) => c.code === currency)?.symbol}</span>
      <Input
        id="initialBalance"
        bind:value={initialBalance}
        placeholder={(() => {
          const decimalPlaces = currencies.find((c: any) => c.code === currency)?.decimalPlaces ?? 2;
          return `0.${'0'.repeat(decimalPlaces)}`;
        })()}
        step={10 ** -currencies.find((c: any) => c.code === currency)?.decimalPlaces}
        class={`${currencies.find((c: any) => c.code === currency)?.placement === 'before' ? 'pl-8' : 'pr-8'} ${errors.initialBalance ? 'border-destructive' : ''}`}
      />
    </div>
    {#if errors.initialBalance}
      <p class="text-sm text-destructive">{errors.initialBalance}</p>
    {/if}
  </div>

  <div class="space-y-2">
    <Label for="currency">Currency</Label>
    <Select.Root type="single" bind:value={currency}>
      <Select.Trigger class="w-full">
        {#if isLoadingCurrencies}
          Loading currencies...
        {:else}
          {triggerContent}
        {/if}
      </Select.Trigger>
      <Select.Content>
        <Select.Group>
          {#each currencies as curr (curr.code)}
            <Select.Item
              value={curr.code}
              label={curr.label}
            >
              {curr.label}
            </Select.Item>
          {/each}
        </Select.Group>
      </Select.Content>
    </Select.Root>
    {#if errors.currency}
      <p class="text-sm text-destructive">{errors.currency}</p>
    {/if}
  </div>

  <div class="space-y-2">
    <div class="flex items-center space-x-2">
      <Switch.Root bind:checked={isActive} />
      <Label for="isActive">Account is active</Label>
    </div>
    <p class="text-xs text-muted-foreground">
      Inactive accounts won't appear in transaction forms but will be preserved for historical data
    </p>
  </div>

  <div class="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 md:left-64 z-50">
    <div class="flex justify-end space-x-4 max-w-2xl mx-auto">
      <Button.Root
        type="button"
        variant="outline"
        onclick={onCancel}
        disabled={isSubmitting || isLoading}
      >
        {cancelLabel}
      </Button.Root>
      <Button.Root
        type="submit"
        disabled={isSubmitting || isLoading}
      >
        {#if isSubmitting}
          Saving...
        {:else}
          {submitLabel}
        {/if}
      </Button.Root>
    </div>
  </div>
</form> 