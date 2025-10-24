<script lang="ts">
  import type { OverviewTabProps } from '../types.js';
  import { QuickStatsCard, ActionButton } from '$lib/components/shared';
  import { InsightList } from '../analytics/index.js';
  import { BarChart3, TrendingUp, Download, Calendar } from '@lucide/svelte';
  import { formatMainCurrencyAmount } from '$lib/utils/currency-utils';

  interface Props extends OverviewTabProps {
    children?: any;
  }

  const { 
    totalSpending, 
    savingsRate, 
    timeRange, 
    insights, 
    userCurrency,
    onExportReport = () => {},
    onSetReminder = () => {},
    children 
  }: Props = $props();

  function formatAmount(amount: number) {
    return formatMainCurrencyAmount(amount, userCurrency);
  }
</script>

<div class="p-4 space-y-6">
  <!-- Quick Stats -->
  <div class="grid grid-cols-2 gap-4">
    <QuickStatsCard
      title="Total Spending"
      value={formatAmount(totalSpending)}
      subtitle="This {timeRange}"
      icon={BarChart3}
    />
    
    <QuickStatsCard
      title="Savings Rate"
      value="{savingsRate.toFixed(1)}%"
      subtitle={savingsRate > 20 ? 'Above target' : 'Below target'}
      icon={TrendingUp}
    />
  </div>

  <!-- Recent Alerts -->
  <div class="bg-secondary border border-border rounded-lg p-4">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-primary">Recent Alerts</h3>
      <button class="text-sm text-primary hover:text-primary/80">
        View All
      </button>
    </div>
    
    <InsightList {insights} />
  </div>

  <!-- Quick Actions -->
  <div class="bg-secondary border border-border rounded-lg p-4">
    <h3 class="font-semibold text-primary mb-4">Quick Actions</h3>
    <div class="grid grid-cols-2 gap-3">
      <ActionButton
        icon={Download}
        label="Export Report"
        onClick={onExportReport}
      />
      <ActionButton
        icon={Calendar}
        label="Set Reminder"
        onClick={onSetReminder}
      />
    </div>
  </div>
  
  {#if children}
    {@render children()}
  {/if}
</div>

