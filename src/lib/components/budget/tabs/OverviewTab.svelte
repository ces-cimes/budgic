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

  const { 
    dailyAllowance, 
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
  <!-- Daily Allowance Card -->
  {#if dailyAllowance}
    <Card class="border-border">
      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
              <DollarSign class="text-primary" size={16} />
            </div>
            <CardTitle class="text-primary text-lg">Daily Allowance</CardTitle>
          </div>
          <Badge
            variant={dailyAllowance.confidenceLevel === 'high'
              ? 'default'
              : dailyAllowance.confidenceLevel === 'medium'
                ? 'secondary'
                : 'destructive'}
            class="text-xs"
          >
            {dailyAllowance.confidenceLevel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- Main Allowance -->
        <div class="text-center">
          <div class="text-primary mb-1 text-3xl font-bold">
            {formatTransactionAmountLocal(dailyAllowance.dailyAllowance)}
          </div>
          <div class="text-muted-foreground text-sm">per day</div>
        </div>

        <!-- Breakdown Grid -->
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="bg-muted/50 rounded-lg p-3">
            <div class="text-muted-foreground">Available</div>
            <div class="text-primary font-semibold">
              {formatTransactionAmountLocal(dailyAllowance.availableAmount)}
            </div>
          </div>
          <div class="bg-muted/50 rounded-lg p-3">
            <div class="text-muted-foreground">This Week</div>
            <div class="text-primary font-semibold">
              {formatTransactionAmountLocal(dailyAllowance.weeklyAllowance)}
            </div>
          </div>
        </div>

        <!-- Days until next income -->
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">Days until next income:</span>
          <span class="text-primary font-medium">
            {dailyAllowance.daysUntilNextIncome}
          </span>
        </div>

        <!-- Buffer recommendation -->
        {#if dailyAllowance.availableAmount < dailyAllowance.bufferRecommendation}
          <div class="bg-warning/10 border-warning/20 rounded-lg border p-3">
            <div class="flex items-center gap-2 text-warning">
              <AlertTriangle size={14} />
              <span class="text-sm font-medium">Low Buffer</span>
            </div>
            <p class="text-warning text-xs mt-1">
              Consider maintaining a {formatTransactionAmountLocal(dailyAllowance.bufferRecommendation)} buffer
            </p>
          </div>
        {/if}
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

  <!-- Confidence Level Explanation -->
  {#if dailyAllowance}
    <Card class="border-border">
      <CardHeader>
        <CardTitle class="text-lg flex items-center gap-2">
          {@const ConfidenceIcon = getConfidenceIcon(dailyAllowance.confidenceLevel)}
          <ConfidenceIcon class={getConfidenceColor(dailyAllowance.confidenceLevel)} size={18} />
          Planning Confidence
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="text-sm text-muted-foreground">
          {#if dailyAllowance.confidenceLevel === 'high'}
            Your planning data is highly reliable with most transactions confirmed.
          {:else if dailyAllowance.confidenceLevel === 'medium'}
            Your planning data has moderate reliability. Consider confirming more transactions.
          {:else}
            Your planning data has low reliability. Please review and confirm your planned transactions.
          {/if}
        </div>
      </CardContent>
    </Card>
  {/if}
</div>
