<script lang="ts">
  import { onMount } from 'svelte';
  import { behavioralAnalysisService, type BehaviorPattern } from '$lib/core/services';
  import { TrendingUp, Calendar, Clock, BarChart3 } from '@lucide/svelte';

  interface Props {
    days?: number;
    className?: string;
  }

  const { days = 90, className = '' }: Props = $props();

  let patterns = $state<BehaviorPattern[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    await loadPatterns();
  });

  async function loadPatterns() {
    isLoading = true;
    error = null;
    try {
      patterns = await behavioralAnalysisService.detectAllPatterns(days);
    } catch (err) {
      console.error('Error loading behavioral patterns:', err);
      error = err instanceof Error ? err.message : 'Failed to load patterns';
    } finally {
      isLoading = false;
    }
  }

  function getPatternIcon(type: BehaviorPattern['type']) {
    switch (type) {
      case 'day_of_week':
        return Calendar;
      case 'weekly':
      case 'monthly':
      case 'seasonal':
        return TrendingUp;
      case 'transaction_timing':
        return Clock;
      default:
        return BarChart3;
    }
  }

  function getPatternTypeLabel(type: BehaviorPattern['type']): string {
    switch (type) {
      case 'day_of_week':
        return 'Day of Week';
      case 'weekly':
        return 'Weekly Cycle';
      case 'monthly':
        return 'Monthly Cycle';
      case 'seasonal':
        return 'Seasonal Pattern';
      case 'transaction_timing':
        return 'Transaction Timing';
      default:
        return 'Pattern';
    }
  }

  function formatFrequency(frequency: string): string {
    return frequency.charAt(0).toUpperCase() + frequency.slice(1);
  }
</script>

<div class="behavioral-patterns {className}">
  {#if isLoading}
    <div class="text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
        <svg class="w-8 h-8 text-muted-foreground animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <p class="text-muted-foreground">Analyzing behavioral patterns...</p>
    </div>
  {:else if error}
    <div class="text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
        <svg class="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-foreground mb-2">Error Loading Patterns</h3>
      <p class="text-muted-foreground mb-4">{error}</p>
      <button
        onclick={loadPatterns}
        class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
      >
        Retry
      </button>
    </div>
  {:else if patterns.length === 0}
    <div class="text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
        <BarChart3 class="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 class="text-lg font-semibold text-foreground mb-2">No Patterns Detected</h3>
      <p class="text-muted-foreground max-w-md mx-auto">
        We need more data to identify behavioral patterns. Keep using the app and we'll start detecting patterns soon.
      </p>
    </div>
  {:else}
    <div class="space-y-4">
      {#each patterns as pattern (pattern.id)}
        {@const Icon = getPatternIcon(pattern.type)}
        <div class="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors">
          <div class="flex items-start gap-3">
            <!-- Icon -->
            <div class="flex-shrink-0 mt-1">
              <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Icon class="w-5 h-5 text-primary" />
              </div>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2 mb-2">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <h3 class="font-semibold text-foreground text-sm">
                      {pattern.title}
                    </h3>
                    <span class="px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-full">
                      {getPatternTypeLabel(pattern.type)}
                    </span>
                  </div>
                  <p class="text-sm text-muted-foreground leading-relaxed">
                    {pattern.description}
                  </p>
                </div>

                <!-- Confidence Badge -->
                <div class="flex-shrink-0">
                  <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {pattern.confidence}%
                  </span>
                </div>
              </div>

              <!-- Metadata -->
              <div class="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                <span class="flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formatFrequency(pattern.frequency)}
                </span>
                
                <span class="flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  {pattern.metadata.occurrences} occurrences
                </span>

                {#if pattern.metadata.timeframe}
                  <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {pattern.metadata.timeframe}
                  </span>
                {/if}
              </div>

              <!-- Recommendation -->
              {#if pattern.actionable && pattern.recommendation}
                <div class="mt-3 p-3 bg-secondary/50 rounded-lg border border-border">
                  <div class="flex items-start gap-2">
                    <svg class="w-4 h-4 text-primary mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <div class="flex-1">
                      <p class="text-xs font-medium text-foreground mb-1">Recommendation</p>
                      <p class="text-xs text-muted-foreground">{pattern.recommendation}</p>
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
