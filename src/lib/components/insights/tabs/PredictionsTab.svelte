<script lang="ts">
  import type { PredictionsTabProps, PredictionInsight } from '../types';
  import { insightsService } from '$lib/core/services';
  import { formatAmount, getUserMainCurrency } from '$lib/utils/currency-utils';
  import { onMount } from 'svelte';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Button } from '$lib/components/ui/button/index.ts';
  import {
    TrendingUp,
    Target,
    AlertTriangle,
    DollarSign,
    Calendar,
    Search,
    Sparkles,
    Clock,
    BarChart3,
    ArrowRight
  } from '@lucide/svelte';

  interface Props {
    isLoading: boolean;
    onAction?: (predictionId: string) => void;
    className?: string;
  }

  const { isLoading, onAction, className = '' }: Props = $props();

  // Real predictions from insights service
  let predictions = $state<PredictionInsight[]>([]);
  let localLoading = $state(false);
  let userCurrency = $state<string>('');

  // Load predictions function
  async function loadPredictions() {
    localLoading = true;
    try {
      predictions = await insightsService.getPredictionInsights();
    } catch (error) {
      console.error('Error loading predictions:', error);
      predictions = [];
    } finally {
      localLoading = false;
    }
  }

  // Load currency and predictions on mount
  onMount(async () => {
    // Get user currency preference
    userCurrency = await getUserMainCurrency();
    await loadPredictions();
  });

  function handleAction(predictionId: string) {
    if (onAction) {
      onAction(predictionId);
    }
  }

  function getPredictionIcon(type: string) {
    switch (type) {
      case 'spending_forecast':
        return TrendingUp;
      case 'goal_completion':
        return Target;
      case 'budget_risk':
        return AlertTriangle;
      case 'income_timing':
        return DollarSign;
      case 'seasonal_pattern':
        return Calendar;
      case 'anomaly_detection':
        return Search;
      default:
        return Sparkles;
    }
  }

  function getRiskBadgeVariant(riskLevel: string): 'default' | 'destructive' | 'secondary' | 'outline' {
    switch (riskLevel) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'secondary';
      case 'low':
        return 'default';
      default:
        return 'outline';
    }
  }

  function formatCurrency(amount: number) {
    // Use currency if available, otherwise format will handle it
    return formatAmount(amount, userCurrency || 'USD');
  }

  function formatTimeRemaining(expiresAt: string) {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) return 'Expired';
    if (diffDays === 1) return '1 day left';
    return `${diffDays} days left`;
  }
</script>

<div class="predictions-tab h-full overflow-y-auto {className}">
  <div class="py-2 sm:py-4 space-y-4 sm:space-y-6">

    <!-- Loading State -->
    {#if isLoading || localLoading}
      <div class="space-y-3">
        {#each Array(3) as _}
          <div class="h-20 animate-pulse rounded-xl bg-[var(--color-bg-tertiary)]"></div>
        {/each}
      </div>
    {:else if predictions.length === 0}
      <div class="text-center py-12">
        <div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-muted rounded-full flex items-center justify-center">
          <Sparkles class="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" />
        </div>
        <h3 class="text-lg sm:text-xl font-semibold text-foreground mb-2">No predictions available</h3>
        <p class="text-sm text-muted-foreground mb-6 max-w-md mx-auto px-4">
          We need more data to generate accurate predictions. Keep tracking your finances and we'll start providing forecasts soon.
        </p>
      </div>
    {:else}
      <div class="space-y-3 sm:space-y-4">
        {#each predictions as prediction (prediction.id)}
          {@const Icon = getPredictionIcon(prediction.type)}
          <div class="bg-card border border-border rounded-lg p-3 sm:p-4">
            <div class="flex items-start gap-2 sm:gap-3">
              <!-- Prediction Icon -->
              <div class="flex-shrink-0">
                <div class="w-7 h-7 sm:w-8 sm:h-8 bg-secondary rounded-full flex items-center justify-center">
                  <Icon class="w-4 h-4 sm:w-5 sm:h-5 text-secondary-foreground" />
                </div>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <!-- Header: Title and Risk Badge -->
                <div class="flex items-start justify-between gap-2 mb-2">
                  <h3 class="font-semibold text-foreground text-sm sm:text-base leading-tight flex-1 min-w-0">
                    {prediction.title}
                  </h3>
                  <Badge variant={getRiskBadgeVariant(prediction.riskLevel)} class="text-[10px] sm:text-xs flex-shrink-0">
                    {prediction.riskLevel}
                  </Badge>
                </div>

                <!-- Prediction Metrics - Compact Grid -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-2">
                  {#if prediction.predictedValue !== undefined && prediction.predictedValue !== null}
                    <div class="min-w-0">
                      <div class="text-[10px] sm:text-xs text-muted-foreground truncate">Predicted</div>
                      <div class="text-xs sm:text-sm font-semibold text-foreground truncate">
                        {formatCurrency(prediction.predictedValue)}
                      </div>
                    </div>
                  {/if}
                  
                  {#if prediction.currentValue !== undefined && prediction.currentValue !== null && prediction.currentValue > 0}
                    <div class="min-w-0">
                      <div class="text-[10px] sm:text-xs text-muted-foreground truncate">Current</div>
                      <div class="text-xs sm:text-sm font-semibold text-foreground truncate">
                        {formatCurrency(prediction.currentValue)}
                      </div>
                    </div>
                  {/if}
                  
                  <div class="min-w-0">
                    <div class="text-[10px] sm:text-xs text-muted-foreground truncate">Confidence</div>
                    <div class="text-xs sm:text-sm font-semibold text-foreground truncate">
                      {prediction.confidence}%
                    </div>
                  </div>
                  
                  <div class="min-w-0">
                    <div class="text-[10px] sm:text-xs text-muted-foreground truncate">Timeframe</div>
                    <div class="text-xs sm:text-sm font-semibold text-foreground truncate">
                      {prediction.timeframe}
                    </div>
                  </div>
                </div>

                <!-- Footer: Metadata and Action -->
                <div class="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-muted-foreground">
                  <span class="flex items-center gap-1 flex-shrink-0">
                    <Clock class="w-3 h-3" />
                    {formatTimeRemaining(prediction.expiresAt)}
                  </span>
                  
                  {#if prediction.metadata.algorithm}
                    <span class="flex items-center gap-1 flex-shrink-0">
                      <BarChart3 class="w-3 h-3" />
                      <span class="truncate max-w-[100px] sm:max-w-none">{prediction.metadata.algorithm}</span>
                    </span>
                  {/if}

                  {#if prediction.actionable && prediction.actionText}
                    <Button
                      onclick={() => handleAction(prediction.id)}
                      variant="outline"
                      size="sm"
                      class="ml-auto h-auto py-1 px-2 sm:px-3 text-[10px] sm:text-xs flex-shrink-0"
                    >
                      {prediction.actionText}
                      <ArrowRight class="w-3 h-3 ml-1" />
                    </Button>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
