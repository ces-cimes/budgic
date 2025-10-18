<script lang="ts">
  import type { TrendsTabProps } from '../types.js';
  import { TimeRangeSelector } from '../shared/index.js';
  import * as Card from '$lib/components/ui/card/index.ts';
  import { TrendingUp, BarChart3 } from '@lucide/svelte';

  interface Props extends TrendsTabProps {
    children?: any;
  }

  const { 
    timeRange, 
    onTimeRangeChange, 
    analytics, 
    userCurrency,
    children 
  }: Props = $props();

  const timeRangeOptions = ['week', 'month', 'quarter', 'year'];
</script>

<div class="p-4 space-y-6">
  <!-- Time Range Selector -->
  <TimeRangeSelector
    value={timeRange}
    options={timeRangeOptions}
    onChange={onTimeRangeChange}
  />

  <!-- Trend Cards -->
  <div class="space-y-4">
    <Card.Root class="p-6">
      <div class="flex items-center gap-4 mb-4">
        <div class="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
          <TrendingUp class="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 class="text-lg font-semibold text-primary">Spending Trend</h3>
          <p class="text-sm text-muted-foreground">vs last {timeRange}</p>
        </div>
      </div>
      
      <div class="flex items-center justify-between">
        <div class="text-3xl font-bold text-red-500">+12.5%</div>
        <div class="text-sm text-muted-foreground">$2,847 → $3,203</div>
      </div>
    </Card.Root>

    <Card.Root class="p-6">
      <div class="flex items-center gap-4 mb-4">
        <div class="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
          <BarChart3 class="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 class="text-lg font-semibold text-primary">Category Changes</h3>
          <p class="text-sm text-muted-foreground">Top spending categories</p>
        </div>
      </div>
      
      <div class="space-y-3">
        <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <span class="text-sm font-medium text-primary">Food & Dining</span>
          <span class="text-sm text-red-500">+8.2%</span>
        </div>
        <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <span class="text-sm font-medium text-primary">Transportation</span>
          <span class="text-sm text-red-500">+15.7%</span>
        </div>
        <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <span class="text-sm font-medium text-primary">Entertainment</span>
          <span class="text-sm text-green-500">-5.3%</span>
        </div>
      </div>
    </Card.Root>
  </div>
  
  {#if children}
    {@render children()}
  {/if}
</div>

