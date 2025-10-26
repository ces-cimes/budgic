<script lang="ts">
  import { onMount } from 'svelte';
  import { Plus, Calendar, DollarSign, Type } from '@lucide/svelte';
  import { transactionService, accountService, userService } from '$lib/core/services';
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Input } from '$lib/components/ui/input/index.ts';
  import { Label } from '$lib/components/ui/label/index.ts';
  import { Select, SelectContent, SelectItem, SelectTrigger, Root } from '$lib/components/ui/select/index.ts';
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '$lib/components/ui/dialog/index.ts';
  import type { Account, TransactionType } from '$lib/core/db';
  import { formatAmount } from '$lib/utils/currency-utils';

  interface Props {
    onTransactionAdded?: () => void;
    accountId: string;
  }

  const { onTransactionAdded, accountId }: Props = $props();

  let isOpen = $state(false);
  let isLoading = $state(false);
  let accounts = $state<Account[]>([]);
  let userCurrency = $state<string>('USD');
  
  // Form data
  let amount = $state('');
  let description = $state('');
  let transactionType = $state('expense');
  let plannedDate = $state('');
  let confidence = $state('confirmed');

  onMount(async () => {
    // Get user's preferred currency
    const preferences = await userService.getUserPreferences();
    userCurrency = preferences?.currency || 'USD';
    
    accounts = await accountService.getAccounts();
    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    plannedDate = tomorrow.toISOString().split('T')[0];
  });

  async function handleSubmit() {
    if (!amount || !description || !plannedDate) return;

    try {
      isLoading = true;
      
      const transactionData = {
        accountId,
        type: transactionType as TransactionType,
        amount: parseFloat(amount),
        description,
        plannedDate: new Date(plannedDate).toISOString(),
        confidence: confidence as 'confirmed' | 'expected' | 'estimated',
        status: 'planned' as const,
        currency: userCurrency
      };

      await transactionService.createTransaction(transactionData);
      
      // Reset form
      amount = '';
      description = '';
      transactionType = 'expense';
      confidence = 'confirmed';
      
      isOpen = false;
      onTransactionAdded?.();
    } catch (error) {
      console.error('Failed to create planned transaction:', error);
    } finally {
      isLoading = false;
    }
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  }
</script>

<Dialog bind:open={isOpen}>
  <DialogTrigger>
    <Button class="w-full">
      <Plus size={16} class="mr-2" />
      Add Planned Transaction
    </Button>
  </DialogTrigger>
  
  <DialogContent class="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Add Planned Transaction</DialogTitle>
    </DialogHeader>
    
    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
      <!-- Amount -->
      <div class="space-y-2">
        <Label for="amount">Amount</Label>
        <div class="relative">
          <DollarSign class="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            id="amount"
            type="number"
            step="0.01"
            placeholder="0.00"
            bind:value={amount}
            class="pl-10"
            required
          />
        </div>
      </div>

      <!-- Description -->
      <div class="space-y-2">
        <Label for="description">Description</Label>
        <div class="relative">
          <Type class="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            id="description"
            placeholder="e.g., Groceries, Salary"
            bind:value={description}
            class="pl-10"
            required
          />
        </div>
      </div>

      <!-- Transaction Type -->
      <div class="space-y-2">
        <Label for="type">Type</Label>
        <Root type="single" bind:value={transactionType}>
          <SelectTrigger>
            <span class="text-muted-foreground">Select type</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Root>
      </div>

      <!-- Planned Date -->
      <div class="space-y-2">
        <Label for="date">Planned Date</Label>
        <div class="relative">
          <Calendar class="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            id="date"
            type="date"
            bind:value={plannedDate}
            class="pl-10"
            required
          />
        </div>
      </div>

      <!-- Confidence Level -->
      <div class="space-y-2">
        <Label for="confidence">Confidence</Label>
        <Root type="single" bind:value={confidence}>
          <SelectTrigger>
            <span class="text-muted-foreground">Select confidence</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="expected">Expected</SelectItem>
            <SelectItem value="estimated">Estimated</SelectItem>
          </SelectContent>
        </Root>
      </div>

      <!-- Preview -->
      {#if amount && description && plannedDate}
        <div class="bg-muted/50 rounded-lg p-3 text-sm">
          <div class="font-medium mb-1">Preview:</div>
          <div class="text-muted-foreground">
            {transactionType === 'income' ? '+' : '-'}{formatAmount(parseFloat(amount) || 0, userCurrency)} • {description} • {formatDate(plannedDate)}
          </div>
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex gap-3 pt-4">
        <Button type="button" variant="outline" class="flex-1" onclick={() => isOpen = false}>
          Cancel
        </Button>
        <Button type="submit" class="flex-1" disabled={isLoading || !amount || !description || !plannedDate}>
          {isLoading ? 'Adding...' : 'Add Transaction'}
        </Button>
      </div>
    </form>
  </DialogContent>
</Dialog>
