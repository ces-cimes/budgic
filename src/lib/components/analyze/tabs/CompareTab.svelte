<script lang="ts">
  import type { CompareTabProps } from '../types.js';
  import { TimeRangeSelector } from '$lib/components/shared';
  import * as Card from '$lib/components/ui/card/index.ts';
  import { TrendingUp } from '@lucide/svelte';
  import { formatMainCurrencyAmount } from '$lib/utils/currency-utils';

  interface Props extends CompareTabProps {
    children?: any;
  }

  const { 
    timeRange, 
    onTimeRangeChange, 
    currentPeriodData, 
    previousPeriodData, 
    userCurrency,
    children 
  }: Props = $props();

  const timeRangeOptions = ['month', 'quarter', 'year'];

  function formatAmount(amount: number) {
    return formatMainCurrencyAmount(amount, userCurrency);
  }

  // Calculate comparison metrics
  const spendingChange = $derived(() => {
    if (previousPeriodData.totalSpending === 0) return 0;
    return ((currentPeriodData.totalSpending - previousPeriodData.totalSpending) / previousPeriodData.totalSpending) * 100;
  });

  const transactionChange = $derived(() => {
    if (previousPeriodData.transactionCount === 0) return 0;
    return ((currentPeriodData.transactionCount - previousPeriodData.transactionCount) / previousPeriodData.transactionCount) * 100;
  });

  const savingsRateChange = $derived(() => {
    return currentPeriodData.savingsRate - previousPeriodData.savingsRate;
  });
</script>

<div class="p-4 space-y-6">
  <!-- Comparison Periods -->
  <TimeRangeSelector
    value={timeRange}
    options={timeRangeOptions}
    onChange={onTimeRangeChange}
    label="Compare:"
  />

  <!-- Comparison Cards -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <Card.Root class="p-6">
      <h3 class="text-lg font-semibold text-primary mb-4">Current {timeRange}</h3>
      <div class="space-y-3">
        <div class="flex justify-between">
          <span class="text-sm text-muted-foreground">Total Spending</span>
          <span class="text-sm font-semibold text-primary">{formatAmount(currentPeriodData.totalSpending)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-sm text-muted-foreground">Transactions</span>
          <span class="text-sm font-semibold text-primary">{currentPeriodData.transactionCount}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-sm text-muted-foreground">Avg. Transaction</span>
          <span class="text-sm font-semibold text-primary">{formatAmount(currentPeriodData.averageTransaction)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-sm text-muted-foreground">Savings Rate</span>
          <span class="text-sm font-semibold text-green-500">{currentPeriodData.savingsRate.toFixed(1)}%</span>
        </div>
      </div>
    </Card.Root>

    <Card.Root class="p-6">
      <h3 class="text-lg font-semibold text-primary mb-4">Previous {timeRange}</h3>
      <div class="space-y-3">
        <div class="flex justify-between">
          <span class="text-sm text-muted-foreground">Total Spending</span>
          <span class="text-sm font-semibold text-primary">{formatAmount(previousPeriodData.totalSpending)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-sm text-muted-foreground">Transactions</span>
          <span class="text-sm font-semibold text-primary">{previousPeriodData.transactionCount}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-sm text-muted-foreground">Avg. Transaction</span>
          <span class="text-sm font-semibold text-primary">{formatAmount(previousPeriodData.averageTransaction)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-sm text-muted-foreground">Savings Rate</span>
          <span class="text-sm font-semibold text-green-500">{previousPeriodData.savingsRate.toFixed(1)}%</span>
        </div>
      </div>
    </Card.Root>
  </div>

  <!-- Comparison Analysis -->
  <Card.Root class="p-6">
    <h3 class="text-lg font-semibold text-primary mb-4">Analysis</h3>
    <div class="space-y-4">
      <div class="flex items-center justify-between p-3 {spendingChange() > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-green-500/10 border border-green-500/20'} rounded-lg">
        <div class="flex items-center gap-3">
          <TrendingUp class="w-4 h-4 {spendingChange() > 0 ? 'text-red-500' : 'text-green-500'}" />
          <span class="text-sm font-medium text-primary">Spending {spendingChange() > 0 ? 'increased' : 'decreased'}</span>
        </div>
        <span class="text-sm font-semibold {spendingChange() > 0 ? 'text-red-500' : 'text-green-500'}">
          {spendingChange() > 0 ? '+' : ''}{spendingChange().toFixed(1)}%
        </span>
      </div>
      
      <div class="flex items-center justify-between p-3 {transactionChange() > 0 ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'} rounded-lg">
        <div class="flex items-center gap-3">
          <TrendingUp class="w-4 h-4 {transactionChange() > 0 ? 'text-green-500' : 'text-red-500'}" />
          <span class="text-sm font-medium text-primary">Transaction count</span>
        </div>
        <span class="text-sm font-semibold {transactionChange() > 0 ? 'text-green-500' : 'text-red-500'}">
          {transactionChange() > 0 ? '+' : ''}{transactionChange().toFixed(1)}%
        </span>
      </div>
      
      <div class="flex items-center justify-between p-3 {savingsRateChange() > 0 ? 'bg-green-500/10 border border-green-500/20' : 'bg-yellow-500/10 border border-yellow-500/20'} rounded-lg">
        <div class="flex items-center gap-3">
          <TrendingUp class="w-4 h-4 {savingsRateChange() > 0 ? 'text-green-500' : 'text-yellow-500'}" />
          <span class="text-sm font-medium text-primary">Savings rate</span>
        </div>
        <span class="text-sm font-semibold {savingsRateChange() > 0 ? 'text-green-500' : 'text-yellow-500'}">
          {savingsRateChange() > 0 ? '+' : ''}{savingsRateChange().toFixed(1)}%
        </span>
      </div>
    </div>
  </Card.Root>
  
  {#if children}
    {@render children()}
  {/if}
</div>

