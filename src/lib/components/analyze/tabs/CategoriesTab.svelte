<script lang="ts">
  import type { CategoriesTabProps } from '../types.js';
  import * as Card from '$lib/components/ui/card/index.ts';
  import { PieChart, TrendingUp } from '@lucide/svelte';
  import { formatMainCurrencyAmount } from '$lib/utils/currency-utils';

  interface Props extends CategoriesTabProps {
    children?: any;
  }

  const { 
    categoryData, 
    userCurrency, 
    timeRange,
    children 
  }: Props = $props();

  function formatAmount(amount: number) {
    return formatMainCurrencyAmount(amount, userCurrency);
  }
</script>

<div class="p-4 space-y-6">
  <!-- Category Overview -->
  <Card.Root class="p-6">
    <div class="flex items-center gap-4 mb-4">
      <div class="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
        <PieChart class="w-5 h-5 text-primary" />
      </div>
      <div>
        <h3 class="text-lg font-semibold text-primary">Spending by Category</h3>
        <p class="text-sm text-muted-foreground">Current {timeRange} breakdown</p>
      </div>
    </div>
    
    <div class="space-y-4">
      {#each categoryData as category (category.name)}
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-4 h-4 rounded" style="background-color: {category.color}"></div>
            <span class="text-sm font-medium text-primary">{category.name}</span>
          </div>
          <div class="text-right">
            <div class="text-sm font-semibold text-primary">{formatAmount(category.amount)}</div>
            <div class="text-xs text-muted-foreground">{category.percentage.toFixed(1)}%</div>
          </div>
        </div>
      {/each}
    </div>
  </Card.Root>

  <!-- Category Trends -->
  <Card.Root class="p-6">
    <h3 class="text-lg font-semibold text-primary mb-4">Category Trends</h3>
    <div class="space-y-4">
      {#each categoryData.filter(c => c.trend) as category (category.name)}
        <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div class="flex items-center gap-3">
            <TrendingUp class="w-4 h-4 {category.trend?.isPositive ? 'text-green-500' : 'text-red-500'}" />
            <span class="text-sm font-medium text-primary">{category.name}</span>
          </div>
          <div class="text-sm {category.trend?.isPositive ? 'text-green-500' : 'text-red-500'}">
            {category.trend?.isPositive ? '+' : ''}{category.trend?.value.toFixed(1)}%
          </div>
        </div>
      {/each}
    </div>
  </Card.Root>
  
  {#if children}
    {@render children()}
  {/if}
</div>

