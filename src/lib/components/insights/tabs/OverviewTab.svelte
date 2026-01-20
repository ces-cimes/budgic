<script lang="ts">
  import InsightList from '../shared/InsightList.svelte';
  import RecommendationsList from '../RecommendationsList.svelte';
  import { Loader2, Lightbulb, RefreshCw, Plus, AlertCircle, AlertTriangle, Info, CheckCircle2 } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button/index.ts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import type { OverviewTabProps, UnifiedInsight } from '../types';

  interface Props {
    insights: UnifiedInsight[];
    isLoading: boolean;
    onDismiss?: (insightId: string) => void;
    onAction?: (insightId: string) => void;
    className?: string;
  }

  const { insights, isLoading, onDismiss, onAction, className = '' }: Props = $props();

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
  <div class="p-2 sm:p-4 max-w-4xl mx-auto space-y-4 sm:space-y-6">
    <!-- Loading State -->
    {#if isLoading}
      <div class="text-center py-12">
        <div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-muted rounded-full flex items-center justify-center">
          <Loader2 class="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground animate-spin" />
        </div>
        <p class="text-sm text-muted-foreground">Loading insights...</p>
      </div>
    {:else}
      <!-- Summary Stats -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      <Card.Root class="py-0">
        <Card.Content class="p-3 sm:p-4">
          <div class="flex items-center gap-2">
            <AlertCircle class="w-3 h-3 text-red-500" />
            <span class="text-xs sm:text-sm font-medium text-muted-foreground">Alerts</span>
          </div>
          <div class="text-lg sm:text-2xl font-bold text-foreground mt-1">
            {insightsCount().alerts}
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root class="py-0">
        <Card.Content class="p-3 sm:p-4">
          <div class="flex items-center gap-2">
            <AlertTriangle class="w-3 h-3 text-yellow-500" />
            <span class="text-xs sm:text-sm font-medium text-muted-foreground">Warnings</span>
          </div>
          <div class="text-lg sm:text-2xl font-bold text-foreground mt-1">
            {insightsCount().warnings}
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root class="py-0">
        <Card.Content class="p-3 sm:p-4">
          <div class="flex items-center gap-2">
            <Info class="w-3 h-3 text-blue-500" />
            <span class="text-xs sm:text-sm font-medium text-muted-foreground">Info</span>
          </div>
          <div class="text-lg sm:text-2xl font-bold text-foreground mt-1">
            {insightsCount().info}
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root class="py-0">
        <Card.Content class="p-3 sm:p-4">
          <div class="flex items-center gap-2">
            <CheckCircle2 class="w-3 h-3 text-green-500" />
            <span class="text-xs sm:text-sm font-medium text-muted-foreground">Success</span>
          </div>
          <div class="text-lg sm:text-2xl font-bold text-foreground mt-1">
            {insightsCount().celebrations}
          </div>
        </Card.Content>
      </Card.Root>
    </div>

    <!-- Priority Insights (Alerts & Warnings) -->
    {#if insightsByCategory().alerts.length > 0 || insightsByCategory().warnings.length > 0}
      <div>
        <div class="flex items-center justify-between mb-3 sm:mb-4">
          <h2 class="text-base sm:text-lg font-semibold text-foreground">Priority Insights</h2>
          <span class="text-xs sm:text-sm text-muted-foreground">
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
        <div class="flex items-center justify-between mb-3 sm:mb-4">
          <h2 class="text-base sm:text-lg font-semibold text-foreground">Informational</h2>
          <span class="text-xs sm:text-sm text-muted-foreground">
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
        <div class="flex items-center justify-between mb-3 sm:mb-4">
          <h2 class="text-base sm:text-lg font-semibold text-foreground">Celebrations</h2>
          <span class="text-xs sm:text-sm text-muted-foreground">
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
      <div class="flex items-center justify-between mb-3 sm:mb-4">
        <h2 class="text-base sm:text-lg font-semibold text-foreground">Personalized Recommendations</h2>
      </div>
      <svelte:component this={RecommendationsList} maxItems={5} />
    </div>

      <!-- Empty State -->
      {#if insights.length === 0}
        <div class="text-center py-12">
          <div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-muted rounded-full flex items-center justify-center">
            <Lightbulb class="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" />
          </div>
          <h3 class="text-lg sm:text-xl font-semibold text-foreground mb-2">No insights yet</h3>
          <p class="text-sm text-muted-foreground mb-6 max-w-md mx-auto px-4">
            Insights will appear here as we analyze your financial patterns, spending habits, and goal progress.
          </p>
          <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onclick={() => onAction?.('refresh')}
              size="sm"
            >
              <RefreshCw class="w-4 h-4 mr-2" />
              Refresh Insights
            </Button>
            <Button
              onclick={() => onAction?.('add-transaction')}
              variant="outline"
              size="sm"
            >
              <Plus class="w-4 h-4 mr-2" />
              Add Transaction
            </Button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
