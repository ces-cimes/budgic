<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
  import { Progress } from '$lib/components/ui/progress/index.ts';
  import { 
    DollarSign, 
    TrendingUp, 
    TrendingDown, 
    Plus,
    Target,
    AlertTriangle,
    CheckCircle,
    Clock
  } from '@lucide/svelte';
  import { formatAmount, formatTransactionAmount } from '$lib/utils/currency-utils';
  import type { OverviewTabProps, DailyAllowance } from '../types.js';
  import AllowanceVisualization from '$lib/components/accounts/AllowanceVisualization.svelte';

  const { 
    dailyAllowance,
    enhancedAllowance,
    totalPlannedIncome, 
    totalPlannedExpenses, 
    netProjectedChange, 
    userCurrency, 
    onAddPlannedTransaction, 
    onSetGoal 
  }: OverviewTabProps = $props();

  function getConfidenceColor(confidenceLevel: string) {
    switch (confidenceLevel) {
      case 'high':
        return 'text-success';
      case 'medium':
        return 'text-warning';
      case 'low':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  }

  function getConfidenceIcon(confidenceLevel: string) {
    switch (confidenceLevel) {
      case 'high':
        return CheckCircle;
      case 'medium':
        return Clock;
      case 'low':
        return AlertTriangle;
      default:
        return Clock;
    }
  }

  function formatCurrency(amount: number): string {
    return formatAmount(amount, userCurrency);
  }

  function formatTransactionAmountLocal(amount: number): string {
    return formatTransactionAmount(amount, userCurrency);
  }
</script>

<div class="space-y-6 p-4">
  <!-- Enhanced Allowance Card -->
  {#if enhancedAllowance}
    <div class="bg-card rounded-xl p-6 shadow-sm border border-border">
      <h2 class="text-xl font-semibold text-primary mb-4">Spending Allowance</h2>
      <AllowanceVisualization allowance={enhancedAllowance} showDetails={true} showRecommendations={true} />
    </div>
  {:else if dailyAllowance}
    <!-- Fallback to simple allowance if enhanced not available -->
    <Card class="border-border">
      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
              <DollarSign class="text-primary" size={16} />
            </div>
            <CardTitle class="text-primary text-lg">Daily Allowance</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="text-center">
          <div class="text-primary mb-1 text-3xl font-bold">
            {formatTransactionAmountLocal(dailyAllowance.amount)}
          </div>
          <div class="text-muted-foreground text-sm">per day</div>
          <div class="text-muted-foreground text-xs mt-1">
            {dailyAllowance.daysRemaining} days remaining
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}

  <!-- Financial Summary -->
  <Card class="border-border">
    <CardHeader>
      <CardTitle class="text-lg">Financial Summary</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <!-- Income vs Expenses -->
      <div class="grid grid-cols-2 gap-4">
        <div class="text-center">
          <div class="text-success text-2xl font-bold">
            {formatTransactionAmountLocal(totalPlannedIncome)}
          </div>
          <div class="text-muted-foreground text-sm">Planned Income</div>
        </div>
        <div class="text-center">
          <div class="text-destructive text-2xl font-bold">
            {formatTransactionAmountLocal(totalPlannedExpenses)}
          </div>
          <div class="text-muted-foreground text-sm">Planned Expenses</div>
        </div>
      </div>

      <!-- Net Change -->
      <div class="text-center">
        <div class="flex items-center justify-center gap-2">
          {#if netProjectedChange >= 0}
            <TrendingUp class="text-success" size={20} />
            <div class="text-success text-xl font-bold">
              +{formatTransactionAmountLocal(netProjectedChange)}
            </div>
          {:else}
            <TrendingDown class="text-destructive" size={20} />
            <div class="text-destructive text-xl font-bold">
              {formatTransactionAmountLocal(netProjectedChange)}
            </div>
          {/if}
        </div>
        <div class="text-muted-foreground text-sm">Net Projected Change</div>
      </div>
    </CardContent>
  </Card>

  <!-- Quick Actions -->
  <Card class="border-border">
    <CardHeader>
      <CardTitle class="text-lg">Quick Actions</CardTitle>
    </CardHeader>
    <CardContent class="space-y-3">
      <Button 
        onclick={onAddPlannedTransaction}
        class="w-full justify-start"
        variant="outline"
      >
        <Plus class="mr-2" size={16} />
        Add Planned Transaction
      </Button>
      
      <Button 
        onclick={onSetGoal}
        class="w-full justify-start"
        variant="outline"
      >
        <Target class="mr-2" size={16} />
        Set Financial Goal
      </Button>
    </CardContent>
  </Card>

</div>
