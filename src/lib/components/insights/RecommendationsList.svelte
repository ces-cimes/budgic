<script lang="ts">
  import { onMount } from 'svelte';
  import { recommendationService, type Recommendation } from '$lib/core/services';
  import { Lightbulb, AlertCircle, Target, TrendingUp, Settings, Clock, Tag } from '@lucide/svelte';
  import { goto } from '$app/navigation';

  interface Props {
    days?: number;
    maxItems?: number;
    className?: string;
  }

  const { days = 90, maxItems, className = '' }: Props = $props();

  let recommendations = $state<Recommendation[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    await loadRecommendations();
  });

  async function loadRecommendations() {
    isLoading = true;
    error = null;
    try {
      const allRecommendations = await recommendationService.generateRecommendations(days);
      recommendations = maxItems ? allRecommendations.slice(0, maxItems) : allRecommendations;
    } catch (err) {
      console.error('Error loading recommendations:', err);
      error = err instanceof Error ? err.message : 'Failed to load recommendations';
    } finally {
      isLoading = false;
    }
  }

  function getRecommendationIcon(type: Recommendation['type']) {
    switch (type) {
      case 'budget':
        return TrendingUp;
      case 'spending':
        return AlertCircle;
      case 'goal':
        return Target;
      case 'behavior':
        return Lightbulb;
      case 'feature':
        return Settings;
      case 'timing':
        return Clock;
      case 'category':
        return Tag;
      default:
        return Lightbulb;
    }
  }

  function getPriorityColor(priority: Recommendation['priority']): string {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400 border-orange-200 dark:border-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
      case 'low':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800';
      default:
        return 'bg-secondary text-secondary-foreground border-border';
    }
  }

  function getImpactColor(impact: Recommendation['estimatedImpact']): string {
    switch (impact) {
      case 'high':
        return 'text-green-600 dark:text-green-400';
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'low':
        return 'text-muted-foreground';
      default:
        return 'text-muted-foreground';
    }
  }

  function handleAction(recommendation: Recommendation) {
    if (recommendation.actionUrl) {
      goto(recommendation.actionUrl);
    }
  }
</script>

<div class="recommendations-list {className}">
  {#if isLoading}
    <div class="text-center py-8">
      <div class="w-12 h-12 mx-auto mb-3 bg-muted rounded-full flex items-center justify-center">
        <svg class="w-6 h-6 text-muted-foreground animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <p class="text-sm text-muted-foreground">Generating recommendations...</p>
    </div>
  {:else if error}
    <div class="text-center py-8">
      <div class="w-12 h-12 mx-auto mb-3 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
        <AlertCircle class="w-6 h-6 text-red-600 dark:text-red-400" />
      </div>
      <h3 class="text-sm font-semibold text-foreground mb-1">Error Loading Recommendations</h3>
      <p class="text-xs text-muted-foreground mb-3">{error}</p>
      <button
        onclick={loadRecommendations}
        class="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
      >
        Retry
      </button>
    </div>
  {:else if recommendations.length === 0}
    <div class="text-center py-8">
      <div class="w-12 h-12 mx-auto mb-3 bg-muted rounded-full flex items-center justify-center">
        <Lightbulb class="w-6 h-6 text-muted-foreground" />
      </div>
      <h3 class="text-sm font-semibold text-foreground mb-1">No Recommendations Yet</h3>
      <p class="text-xs text-muted-foreground max-w-sm mx-auto">
        We'll provide personalized recommendations as we learn more about your financial patterns.
      </p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each recommendations as recommendation (recommendation.id)}
        {@const Icon = getRecommendationIcon(recommendation.type)}
        <div class="bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-colors">
          <div class="flex items-start gap-3">
            <!-- Icon -->
            <div class="flex-shrink-0 mt-0.5">
              <div class="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <Icon class="w-4 h-4 text-primary" />
              </div>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2 mb-1">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <h3 class="font-semibold text-foreground text-sm">
                      {recommendation.title}
                    </h3>
                    <span class="px-2 py-0.5 text-xs font-medium rounded-full border {getPriorityColor(recommendation.priority)}">
                      {recommendation.priority}
                    </span>
                  </div>
                  <p class="text-xs text-muted-foreground leading-relaxed">
                    {recommendation.description}
                  </p>
                </div>
              </div>

              <!-- Metadata -->
              <div class="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                <span class="flex items-center gap-1 {getImpactColor(recommendation.estimatedImpact)}">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {recommendation.estimatedImpact} impact
                </span>
                
                <span class="flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {recommendation.confidence}% confidence
                </span>
              </div>

              <!-- Action Button -->
              {#if recommendation.actionable && recommendation.actionText}
                <div class="mt-2">
                  <button
                    onclick={() => handleAction(recommendation)}
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-md transition-colors"
                  >
                    {recommendation.actionText}
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
