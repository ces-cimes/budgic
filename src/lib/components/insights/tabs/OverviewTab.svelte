<script lang="ts">
  import InsightList from '../shared/InsightList.svelte';
  import RecommendationsList from '../RecommendationsList.svelte';
  import type { OverviewTabProps, UnifiedInsight } from '../types';

  interface Props {
    insights: UnifiedInsight[];
    userCurrency: string;
    isLoading: boolean;
    onDismiss?: (insightId: string) => void;
    onAction?: (insightId: string) => void;
    className?: string;
  }

  const { insights, userCurrency, isLoading, onDismiss, onAction, className = '' }: Props = $props();

  // Group insights by category
  const insightsByCategory = $derived(() => {
    const groups: Record<string, UnifiedInsight[]> = {
      alerts: [],
      warnings: [],
      info: [],
      celebrations: []
    };

    insights.forEach(insight => {
      switch (insight.severity) {
        case 'alert':
          groups.alerts.push(insight);
          break;
        case 'warning':
          groups.warnings.push(insight);
          break;
        case 'info':
          groups.info.push(insight);
          break;
        case 'success':
        case 'celebration':
          groups.celebrations.push(insight);
          break;
      }
    });

    return groups;
  });

  // Get insights count by severity
  const insightsCount = $derived(() => {
    return {
      total: insights.length,
      alerts: insightsByCategory().alerts.length,
      warnings: insightsByCategory().warnings.length,
      info: insightsByCategory().info.length,
      celebrations: insightsByCategory().celebrations.length
    };
  });

  function handleViewAll(category: string) {
    // TODO: Implement view all for specific category
    console.log('View all insights for category:', category);
  }
</script>

<div class="overview-tab h-full overflow-y-auto {className}">
  <div class="p-4 space-y-6">
    <!-- Summary Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-card border border-border rounded-lg p-4">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 bg-red-500 rounded-full"></div>
          <span class="text-sm font-medium text-muted-foreground">Alerts</span>
        </div>
        <div class="text-2xl font-bold text-foreground mt-1">
          {insightsCount().alerts}
        </div>
      </div>

      <div class="bg-card border border-border rounded-lg p-4">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
          <span class="text-sm font-medium text-muted-foreground">Warnings</span>
        </div>
        <div class="text-2xl font-bold text-foreground mt-1">
          {insightsCount().warnings}
        </div>
      </div>

      <div class="bg-card border border-border rounded-lg p-4">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
          <span class="text-sm font-medium text-muted-foreground">Info</span>
        </div>
        <div class="text-2xl font-bold text-foreground mt-1">
          {insightsCount().info}
        </div>
      </div>

      <div class="bg-card border border-border rounded-lg p-4">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 bg-green-500 rounded-full"></div>
          <span class="text-sm font-medium text-muted-foreground">Success</span>
        </div>
        <div class="text-2xl font-bold text-foreground mt-1">
          {insightsCount().celebrations}
        </div>
      </div>
    </div>

    <!-- Priority Insights (Alerts & Warnings) -->
    {#if insightsByCategory().alerts.length > 0 || insightsByCategory().warnings.length > 0}
      <div>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-foreground">Priority Insights</h2>
          <span class="text-sm text-muted-foreground">
            {insightsByCategory().alerts.length + insightsByCategory().warnings.length} items
          </span>
        </div>
        <InsightList 
          insights={[...insightsByCategory().alerts, ...insightsByCategory().warnings]}
          onDismiss={onDismiss}
          onAction={onAction}
        />
      </div>
    {/if}

    <!-- Informational Insights -->
    {#if insightsByCategory().info.length > 0}
      <div>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-foreground">Informational</h2>
          <span class="text-sm text-muted-foreground">
            {insightsByCategory().info.length} items
          </span>
        </div>
        <InsightList 
          insights={insightsByCategory().info}
          maxItems={5}
          showViewAll={insightsByCategory().info.length > 5}
          onViewAll={() => handleViewAll('info')}
          onDismiss={onDismiss}
          onAction={onAction}
        />
      </div>
    {/if}

    <!-- Celebrations -->
    {#if insightsByCategory().celebrations.length > 0}
      <div>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-foreground">Celebrations</h2>
          <span class="text-sm text-muted-foreground">
            {insightsByCategory().celebrations.length} items
          </span>
        </div>
        <InsightList 
          insights={insightsByCategory().celebrations}
          maxItems={3}
          showViewAll={insightsByCategory().celebrations.length > 3}
          onViewAll={() => handleViewAll('celebrations')}
          onDismiss={onDismiss}
          onAction={onAction}
        />
      </div>
    {/if}

    <!-- Recommendations -->
    <div>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-foreground">Personalized Recommendations</h2>
      </div>
      <svelte:component this={RecommendationsList} maxItems={5} />
    </div>

    <!-- Empty State -->
    {#if insights.length === 0}
      <div class="text-center py-12">
        <div class="w-20 h-20 mx-auto mb-6 bg-muted rounded-full flex items-center justify-center">
          <svg class="w-10 h-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-foreground mb-2">No insights yet</h3>
        <p class="text-muted-foreground mb-6 max-w-md mx-auto">
          Insights will appear here as we analyze your financial patterns, spending habits, and goal progress.
        </p>
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onclick={() => onAction?.('refresh')}
            class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh Insights
          </button>
          <button
            onclick={() => onAction?.('add-transaction')}
            class="inline-flex items-center gap-2 px-4 py-2 border border-border text-foreground rounded-lg hover:bg-secondary transition-colors"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Transaction
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
