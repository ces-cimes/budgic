<script lang="ts">
  import type { PatternsTabProps, BehavioralPattern } from '../types';

  interface Props {
    userCurrency: string;
    isLoading: boolean;
    onRecommendation?: (patternId: string) => void;
    className?: string;
  }

  const { userCurrency, isLoading, onRecommendation, className = '' }: Props = $props();

  // Mock patterns for demonstration
  const mockPatterns = $derived(() => {
    return [
      {
        id: '1',
        type: 'transaction_timing',
        title: 'Evening Transaction Pattern',
        description: 'You typically add transactions in the evening (7-9 PM)',
        confidence: 85,
        frequency: 'daily',
        impact: 'medium',
        actionable: true,
        recommendation: 'Consider setting up recurring transactions for frequent expenses',
        metadata: {
          pattern: 'Evening logging',
          percentage: 78,
          timeframe: '7-9 PM',
          category: 'system'
        },
        createdAt: new Date().toISOString(),
        lastObserved: new Date().toISOString()
      },
      {
        id: '2',
        type: 'budget_adherence',
        title: 'Weekday Budget Success',
        description: 'You\'re 15% better at staying within budget on weekdays',
        confidence: 72,
        frequency: 'weekly',
        impact: 'high',
        actionable: true,
        recommendation: 'Plan weekend spending in advance',
        metadata: {
          pattern: 'Weekday adherence',
          percentage: 15,
          timeframe: 'Monday-Friday',
          category: 'security'
        },
        createdAt: new Date().toISOString(),
        lastObserved: new Date().toISOString()
      },
      {
        id: '3',
        type: 'engagement',
        title: 'Monday Budget Checking',
        description: 'You check your budget most frequently on Mondays',
        confidence: 68,
        frequency: 'weekly',
        impact: 'low',
        actionable: false,
        metadata: {
          pattern: 'Monday engagement',
          percentage: 45,
          timeframe: 'Monday',
          category: 'system'
        },
        createdAt: new Date().toISOString(),
        lastObserved: new Date().toISOString()
      }
    ] as BehavioralPattern[];
  });

  function handleRecommendation(patternId: string) {
    if (onRecommendation) {
      onRecommendation(patternId);
    }
  }

  function getPatternIcon(type: string) {
    switch (type) {
      case 'transaction_timing':
        return '🕐';
      case 'budget_adherence':
        return '📊';
      case 'engagement':
        return '👀';
      case 'spending_timing':
        return '💳';
      case 'app_usage':
        return '📱';
      case 'category_usage':
        return '🏷️';
      case 'alert_response':
        return '⚡';
      default:
        return '📈';
    }
  }

  function getImpactColor(impact: string) {
    switch (impact) {
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

  function getFrequencyLabel(frequency: string) {
    switch (frequency) {
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'monthly':
        return 'Monthly';
      case 'irregular':
        return 'Irregular';
      default:
        return frequency;
    }
  }
</script>

<div class="patterns-tab h-full overflow-y-auto {className}">
  <div class="p-4 space-y-6">
    <!-- Header -->
    <div>
      <h2 class="text-lg font-semibold text-foreground mb-2">Behavioral Patterns</h2>
      <p class="text-sm text-muted-foreground">
        Discover patterns in your financial behavior and app usage
      </p>
    </div>

    <!-- Patterns List -->
    {#if mockPatterns().length === 0}
      <div class="text-center py-12">
        <div class="w-20 h-20 mx-auto mb-6 bg-muted rounded-full flex items-center justify-center">
          <svg class="w-10 h-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-foreground mb-2">No patterns detected yet</h3>
        <p class="text-muted-foreground mb-6 max-w-md mx-auto">
          We need more data to identify your behavioral patterns. Keep using the app and we'll start detecting patterns soon.
        </p>
      </div>
    {:else}
      <div class="space-y-4">
        {#each mockPatterns() as pattern (pattern.id)}
          <div class="bg-card border border-border rounded-lg p-4">
            <div class="flex items-start gap-3">
              <!-- Pattern Icon -->
              <div class="flex-shrink-0 mt-1">
                <div class="w-8 h-8 bg-secondary rounded-full flex items-center justify-center text-lg">
                  {getPatternIcon(pattern.type)}
                </div>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1">
                    <h3 class="font-semibold text-foreground text-sm leading-tight">
                      {pattern.title}
                    </h3>
                    <p class="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {pattern.description}
                    </p>
                  </div>

                  <!-- Confidence Badge -->
                  <div class="flex-shrink-0">
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {pattern.confidence}% confidence
                    </span>
                  </div>
                </div>

                <!-- Metadata -->
                <div class="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {getFrequencyLabel(pattern.frequency)}
                  </span>
                  
                  <span class="flex items-center gap-1 {getImpactColor(pattern.impact)}">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {pattern.impact} impact
                  </span>

                  {#if pattern.metadata.percentage}
                    <span class="flex items-center gap-1">
                      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      {pattern.metadata.percentage}% of time
                    </span>
                  {/if}
                </div>

                <!-- Recommendation -->
                {#if pattern.actionable && pattern.recommendation}
                  <div class="mt-3 p-3 bg-secondary/50 rounded-lg">
                    <div class="flex items-start gap-2">
                      <svg class="w-4 h-4 text-primary mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      <div class="flex-1">
                        <p class="text-sm font-medium text-foreground mb-1">Recommendation</p>
                        <p class="text-sm text-muted-foreground">{pattern.recommendation}</p>
                      </div>
                      <button
                        onclick={() => handleRecommendation(pattern.id)}
                        class="flex-shrink-0 px-3 py-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        Apply
                      </button>
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
</div>
