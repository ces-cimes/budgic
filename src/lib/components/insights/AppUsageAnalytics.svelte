<script lang="ts">
  import { onMount } from 'svelte';
  import { appUsageAnalyticsService, type AppUsageMetrics, type FeatureUsage } from '$lib/core/services';
  import { Activity, Clock, Calendar, TrendingUp, Smartphone } from '@lucide/svelte';

  interface Props {
    days?: number;
    className?: string;
  }

  const { days = 30, className = '' }: Props = $props();

  let metrics = $state<AppUsageMetrics | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    await loadMetrics();
  });

  async function loadMetrics() {
    isLoading = true;
    error = null;
    try {
      metrics = await appUsageAnalyticsService.getUsageMetrics(days);
    } catch (err) {
      console.error('Error loading app usage metrics:', err);
      error = err instanceof Error ? err.message : 'Failed to load usage metrics';
    } finally {
      isLoading = false;
    }
  }

  function formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  }

  function getEngagementColor(score: number): string {
    if (score >= 70) return 'text-green-600 dark:text-green-400';
    if (score >= 40) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  }

  function getEngagementLabel(score: number): string {
    if (score >= 70) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
  }
</script>

<div class="app-usage-analytics {className}">
  {#if isLoading}
    <div class="text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
        <svg class="w-8 h-8 text-muted-foreground animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <p class="text-muted-foreground">Loading usage analytics...</p>
    </div>
  {:else if error}
    <div class="text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
        <Activity class="w-8 h-8 text-red-600 dark:text-red-400" />
      </div>
      <h3 class="text-lg font-semibold text-foreground mb-2">Error Loading Analytics</h3>
      <p class="text-muted-foreground mb-4">{error}</p>
      <button
        onclick={loadMetrics}
        class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
      >
        Retry
      </button>
    </div>
  {:else if !metrics}
    <div class="text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
        <Smartphone class="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 class="text-lg font-semibold text-foreground mb-2">No Usage Data</h3>
      <p class="text-muted-foreground max-w-md mx-auto">
        Start using the app to see your usage analytics.
      </p>
    </div>
  {:else}
    <div class="space-y-6">
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-card border border-border rounded-lg p-4">
          <div class="flex items-center gap-2 mb-2">
            <Activity class="w-4 h-4 text-primary" />
            <span class="text-xs text-muted-foreground">Sessions</span>
          </div>
          <div class="text-2xl font-bold text-foreground">{metrics.totalSessions}</div>
        </div>

        <div class="bg-card border border-border rounded-lg p-4">
          <div class="flex items-center gap-2 mb-2">
            <TrendingUp class="w-4 h-4 text-primary" />
            <span class="text-xs text-muted-foreground">Actions</span>
          </div>
          <div class="text-2xl font-bold text-foreground">{metrics.totalActions}</div>
        </div>

        <div class="bg-card border border-border rounded-lg p-4">
          <div class="flex items-center gap-2 mb-2">
            <Clock class="w-4 h-4 text-primary" />
            <span class="text-xs text-muted-foreground">Avg Session</span>
          </div>
          <div class="text-lg font-bold text-foreground">
            {formatDuration(metrics.averageSessionDuration)}
          </div>
        </div>

        <div class="bg-card border border-border rounded-lg p-4">
          <div class="flex items-center gap-2 mb-2">
            <Calendar class="w-4 h-4 text-primary" />
            <span class="text-xs text-muted-foreground">Engagement</span>
          </div>
          <div class="text-lg font-bold {getEngagementColor(metrics.engagementScore)}">
            {metrics.engagementScore}
          </div>
          <div class="text-xs text-muted-foreground mt-0.5">
            {getEngagementLabel(metrics.engagementScore)}
          </div>
        </div>
      </div>

      <!-- Engagement Score -->
      <div class="bg-card border border-border rounded-lg p-4">
        <h3 class="text-sm font-semibold text-foreground mb-3">Engagement Score</h3>
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Overall Score</span>
            <span class="font-semibold {getEngagementColor(metrics.engagementScore)}">
              {metrics.engagementScore}/100
            </span>
          </div>
          <div class="h-3 bg-muted rounded-full overflow-hidden">
            <div
              class="h-full transition-all {
                metrics.engagementScore >= 70 ? 'bg-green-500' :
                metrics.engagementScore >= 40 ? 'bg-yellow-500' :
                'bg-red-500'
              }"
              style="width: {metrics.engagementScore}%"
            ></div>
          </div>
          <p class="text-xs text-muted-foreground">
            Based on session frequency, actions per session, and session duration
          </p>
        </div>
      </div>

      <!-- Usage Patterns -->
      <div class="bg-card border border-border rounded-lg p-4">
        <h3 class="text-sm font-semibold text-foreground mb-3">Usage Patterns</h3>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p class="text-xs text-muted-foreground mb-1">Most Active Day</p>
            <p class="font-semibold text-foreground">{metrics.mostActiveDay}</p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground mb-1">Most Active Hour</p>
            <p class="font-semibold text-foreground">
              {metrics.mostActiveHour}:00
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground mb-1">Session Frequency</p>
            <p class="font-semibold text-foreground capitalize">{metrics.sessionFrequency}</p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground mb-1">Avg Actions/Session</p>
            <p class="font-semibold text-foreground">
              {metrics.averageActionsPerSession.toFixed(1)}
            </p>
          </div>
        </div>
      </div>

      <!-- Feature Usage -->
      {#if metrics.featureUsage && metrics.featureUsage.length > 0}
        <div class="bg-card border border-border rounded-lg p-4">
          <h3 class="text-sm font-semibold text-foreground mb-3">Feature Usage</h3>
          <div class="space-y-3">
            {#each metrics.featureUsage.slice(0, 5) as feature (feature.feature)}
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <p class="text-sm font-medium text-foreground">{feature.feature}</p>
                  <p class="text-xs text-muted-foreground">
                    {feature.usageCount} uses • {feature.percentage.toFixed(1)}%
                  </p>
                </div>
                {#if feature.averageTimeSpent}
                  <div class="text-xs text-muted-foreground">
                    {formatDuration(feature.averageTimeSpent)} avg
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
