<script lang="ts">
  import { onMount } from 'svelte';
  import { insightsService } from '$lib/core/services';
  import { formatCurrencyAmount } from '$lib/utils/currency-utils';
  import { TrendingUp, TrendingDown, Minus, Clock, Calendar, AlertTriangle } from '@lucide/svelte';

  interface Props {
    days?: number;
    userCurrency?: string;
    className?: string;
  }

  const { days = 90, userCurrency = 'USD', className = '' }: Props = $props();

  let spendingPatterns = $state<any>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    await loadSpendingPatterns();
  });

  async function loadSpendingPatterns() {
    isLoading = true;
    error = null;
    try {
      spendingPatterns = await insightsService.analyzeSpendingPatternsAsync(days);
    } catch (err) {
      console.error('Error loading spending patterns:', err);
      error = err instanceof Error ? err.message : 'Failed to load spending patterns';
    } finally {
      isLoading = false;
    }
  }

  function getTrendIcon(trend: string) {
    switch (trend) {
      case 'increasing':
        return TrendingUp;
      case 'decreasing':
        return TrendingDown;
      default:
        return Minus;
    }
  }

  function getTrendColor(trend: string): string {
    switch (trend) {
      case 'increasing':
        return 'text-red-600 dark:text-red-400';
      case 'decreasing':
        return 'text-green-600 dark:text-green-400';
      default:
        return 'text-muted-foreground';
    }
  }

  function formatHour(hour: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:00 ${period}`;
  }
</script>

<div class="spending-patterns {className}">
  {#if isLoading}
    <div class="text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
        <svg class="w-8 h-8 text-muted-foreground animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <p class="text-muted-foreground">Analyzing spending patterns...</p>
    </div>
  {:else if error}
    <div class="text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
        <AlertTriangle class="w-8 h-8 text-red-600 dark:text-red-400" />
      </div>
      <h3 class="text-lg font-semibold text-foreground mb-2">Error Loading Patterns</h3>
      <p class="text-muted-foreground mb-4">{error}</p>
      <button
        onclick={loadSpendingPatterns}
        class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
      >
        Retry
      </button>
    </div>
  {:else if !spendingPatterns}
    <div class="text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
        <Calendar class="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 class="text-lg font-semibold text-foreground mb-2">No Spending Patterns</h3>
      <p class="text-muted-foreground max-w-md mx-auto">
        We need more transaction data to analyze your spending patterns.
      </p>
    </div>
  {:else}
    <div class="space-y-6">
      <!-- Category Patterns -->
      {#if spendingPatterns.categoryPatterns && spendingPatterns.categoryPatterns.length > 0}
        <div>
          <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp class="w-5 h-5 text-primary" />
            Category Spending Trends
          </h3>
          <div class="space-y-3">
            {#each spendingPatterns.categoryPatterns.slice(0, 5) as category (category.categoryId)}
              {@const TrendIcon = getTrendIcon(category.trend)}
              <div class="bg-card border border-border rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex-1">
                    <h4 class="font-semibold text-foreground text-sm">{category.categoryName}</h4>
                    <p class="text-xs text-muted-foreground mt-0.5">
                      {category.frequency} transactions • {category.percentageOfTotal.toFixed(1)}% of total
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <TrendIcon class="w-4 h-4 {getTrendColor(category.trend)}" />
                    <span class="text-sm font-medium {getTrendColor(category.trend)}">
                      {category.trend}
                    </span>
                  </div>
                </div>
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Avg: {formatCurrencyAmount(category.averageAmount, userCurrency)}</span>
                  <span>{category.percentageOfTotal.toFixed(1)}% of spending</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Timing Patterns -->
      {#if spendingPatterns.timingPatterns}
        <div>
          <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock class="w-5 h-5 text-primary" />
            Transaction Timing
          </h3>
          <div class="bg-card border border-border rounded-lg p-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-xs text-muted-foreground mb-1">Most Active Day</p>
                <p class="text-sm font-semibold text-foreground">{spendingPatterns.timingPatterns.mostActiveDay}</p>
              </div>
              <div>
                <p class="text-xs text-muted-foreground mb-1">Most Active Hour</p>
                <p class="text-sm font-semibold text-foreground">
                  {formatHour(spendingPatterns.timingPatterns.mostActiveHour)}
                </p>
              </div>
              <div class="col-span-2 pt-3 border-t border-border">
                <p class="text-xs text-muted-foreground mb-2">Weekend vs Weekday</p>
                <div class="flex items-center gap-4">
                  <div class="flex-1">
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-xs text-muted-foreground">Weekend</span>
                      <span class="text-xs font-medium text-foreground">
                        {formatCurrencyAmount(spendingPatterns.timingPatterns.weekendVsWeekday.weekend, userCurrency)}
                      </span>
                    </div>
                    <div class="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        class="h-full bg-primary"
                        style="width: {spendingPatterns.timingPatterns.weekendVsWeekday.weekend / (spendingPatterns.timingPatterns.weekendVsWeekday.weekend + spendingPatterns.timingPatterns.weekendVsWeekday.weekday) * 100}%"
                      ></div>
                    </div>
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-xs text-muted-foreground">Weekday</span>
                      <span class="text-xs font-medium text-foreground">
                        {formatCurrencyAmount(spendingPatterns.timingPatterns.weekendVsWeekday.weekday, userCurrency)}
                      </span>
                    </div>
                    <div class="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        class="h-full bg-secondary"
                        style="width: {spendingPatterns.timingPatterns.weekendVsWeekday.weekday / (spendingPatterns.timingPatterns.weekendVsWeekday.weekend + spendingPatterns.timingPatterns.weekendVsWeekday.weekday) * 100}%"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Velocity Patterns -->
      {#if spendingPatterns.velocityPatterns}
        <div>
          <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp class="w-5 h-5 text-primary" />
            Spending Velocity
          </h3>
          <div class="bg-card border border-border rounded-lg p-4">
            <div class="grid grid-cols-3 gap-4">
              <div>
                <p class="text-xs text-muted-foreground mb-1">Avg Transaction</p>
                <p class="text-sm font-semibold text-foreground">
                  {formatCurrencyAmount(spendingPatterns.velocityPatterns.averageTransactionAmount, userCurrency)}
                </p>
              </div>
              <div>
                <p class="text-xs text-muted-foreground mb-1">Frequency</p>
                <p class="text-sm font-semibold text-foreground">
                  {spendingPatterns.velocityPatterns.transactionFrequency.toFixed(1)}/day
                </p>
              </div>
              <div>
                <p class="text-xs text-muted-foreground mb-1">Velocity</p>
                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {
                  spendingPatterns.velocityPatterns.spendingVelocity === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                  spendingPatterns.velocityPatterns.spendingVelocity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                  'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                }">
                  {spendingPatterns.velocityPatterns.spendingVelocity}
                </span>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Anomalies -->
      {#if spendingPatterns.anomalyPatterns && spendingPatterns.anomalyPatterns.length > 0}
        <div>
          <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle class="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            Unusual Patterns
          </h3>
          <div class="space-y-2">
            {#each spendingPatterns.anomalyPatterns.slice(0, 3) as anomaly (anomaly.transactionId)}
              <div class="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p class="text-sm text-foreground mb-1">{anomaly.description}</p>
                <p class="text-xs text-muted-foreground">
                  {anomaly.confidence}% confidence
                </p>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
