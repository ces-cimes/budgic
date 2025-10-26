<script lang="ts">
  import type { PredictionsTabProps, PredictionInsight } from '../types';
  import { insightsService } from '$lib/core/services';
  import { onMount } from 'svelte';

  interface Props {
    userCurrency: string;
    isLoading: boolean;
    onAction?: (predictionId: string) => void;
    className?: string;
  }

  const { userCurrency, isLoading, onAction, className = '' }: Props = $props();

  // Real predictions from insights service
  let predictions = $state<PredictionInsight[]>([]);
  let localLoading = $state(false);

  // Load predictions on mount
  onMount(async () => {
    localLoading = true;
    try {
      predictions = await insightsService.getPredictionInsights();
    } catch (error) {
      console.error('Error loading predictions:', error);
      predictions = [];
    } finally {
      localLoading = false;
    }
  });

  function handleAction(predictionId: string) {
    if (onAction) {
      onAction(predictionId);
    }
  }

  function getPredictionIcon(type: string) {
    switch (type) {
      case 'spending_forecast':
        return '📊';
      case 'goal_completion':
        return '🎯';
      case 'budget_risk':
        return '⚠️';
      case 'income_timing':
        return '💰';
      case 'seasonal_pattern':
        return '📅';
      case 'anomaly_detection':
        return '🔍';
      default:
        return '🔮';
    }
  }

  function getRiskColor(riskLevel: string) {
    switch (riskLevel) {
      case 'high':
        return 'text-red-600 dark:text-red-400';
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'low':
        return 'text-green-600 dark:text-green-400';
      default:
        return 'text-muted-foreground';
    }
  }

  function getRiskBadgeColor(riskLevel: string) {
    switch (riskLevel) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
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
  <div class="p-4 space-y-6">
    <!-- Header -->
    <div>
      <h2 class="text-lg font-semibold text-foreground mb-2">Financial Predictions</h2>
      <p class="text-sm text-muted-foreground">
        AI-powered forecasts based on your spending patterns and financial behavior
      </p>
    </div>

    <!-- Loading State -->
    {#if isLoading || localLoading}
      <div class="text-center py-12">
        <div class="w-20 h-20 mx-auto mb-6 bg-muted rounded-full flex items-center justify-center">
          <svg class="w-10 h-10 text-muted-foreground animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
        <p class="text-muted-foreground">Loading predictions...</p>
      </div>
    {:else if predictions.length === 0}
      <div class="text-center py-12">
        <div class="w-20 h-20 mx-auto mb-6 bg-muted rounded-full flex items-center justify-center">
          <svg class="w-10 h-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-foreground mb-2">No predictions available</h3>
        <p class="text-muted-foreground mb-6 max-w-md mx-auto">
          We need more data to generate accurate predictions. Keep tracking your finances and we'll start providing forecasts soon.
        </p>
      </div>
    {:else}
      <div class="space-y-4">
        {#each predictions as prediction (prediction.id)}
          <div class="bg-card border border-border rounded-lg p-4">
            <div class="flex items-start gap-3">
              <!-- Prediction Icon -->
              <div class="flex-shrink-0 mt-1">
                <div class="w-8 h-8 bg-secondary rounded-full flex items-center justify-center text-lg">
                  {getPredictionIcon(prediction.type)}
                </div>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1">
                    <h3 class="font-semibold text-foreground text-sm leading-tight">
                      {prediction.title}
                    </h3>
                    <p class="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {prediction.description}
                    </p>
                  </div>

                  <!-- Risk Badge -->
                  <div class="flex-shrink-0">
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getRiskBadgeColor(prediction.riskLevel)}">
                      {prediction.riskLevel} risk
                    </span>
                  </div>
                </div>

                <!-- Prediction Details -->
                <div class="mt-3 p-3 bg-secondary/30 rounded-lg">
                  <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span class="text-muted-foreground">Predicted:</span>
                      <span class="font-medium text-foreground ml-1">
                        {formatCurrency(prediction.predictedValue || 0)}
                      </span>
                    </div>
                    <div>
                      <span class="text-muted-foreground">Current:</span>
                      <span class="font-medium text-foreground ml-1">
                        {formatCurrency(prediction.currentValue || 0)}
                      </span>
                    </div>
                    <div>
                      <span class="text-muted-foreground">Confidence:</span>
                      <span class="font-medium text-foreground ml-1">
                        {prediction.confidence}%
                      </span>
                    </div>
                    <div>
                      <span class="text-muted-foreground">Timeframe:</span>
                      <span class="font-medium text-foreground ml-1">
                        {prediction.timeframe}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Metadata -->
                <div class="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {formatTimeRemaining(prediction.expiresAt)}
                  </span>
                  
                  <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    {prediction.metadata.algorithm}
                  </span>
                </div>

                <!-- Action Button -->
                {#if prediction.actionable && prediction.actionText}
                  <div class="mt-3">
                    <button
                      onclick={() => handleAction(prediction.id)}
                      class="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors border border-primary/20 hover:border-primary/40 rounded-md"
                    >
                      {prediction.actionText}
                      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
