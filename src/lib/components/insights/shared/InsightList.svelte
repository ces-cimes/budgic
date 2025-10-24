<script lang="ts">
  import InsightCard from './InsightCard.svelte';
  import type { InsightListProps, UnifiedInsight } from '../types';

  interface Props {
    insights: UnifiedInsight[];
    maxItems?: number;
    showViewAll?: boolean;
    onViewAll?: () => void;
    onDismiss?: (insightId: string) => void;
    onAction?: (insightId: string) => void;
    className?: string;
  }

  const { 
    insights, 
    maxItems, 
    showViewAll = false, 
    onViewAll, 
    onDismiss, 
    onAction, 
    className = '' 
  }: Props = $props();

  // Sort insights by priority (severity) and then by date
  const sortedInsights = $derived(() => {
    const severityOrder: Record<string, number> = { alert: 0, warning: 1, info: 2, success: 3, celebration: 4 };
    
    return [...insights].sort((a, b) => {
      // First sort by severity
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      
      // Then sort by date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  });

  const displayedInsights = $derived(() => {
    if (maxItems && maxItems > 0) {
      return sortedInsights().slice(0, maxItems);
    }
    return sortedInsights();
  });

  const hasMoreInsights = $derived(() => {
    return maxItems && maxItems > 0 && insights.length > maxItems;
  });
</script>

<div class="insight-list {className}">
  {#if displayedInsights().length === 0}
    <div class="text-center py-8">
      <div class="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
        <svg class="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </div>
      <h3 class="text-lg font-medium text-foreground mb-2">No insights yet</h3>
      <p class="text-sm text-muted-foreground">
        Insights will appear here as we analyze your financial patterns.
      </p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each displayedInsights() as insight (insight.id)}
        <InsightCard 
          {insight}
          onDismiss={onDismiss}
          onAction={onAction}
        />
      {/each}
    </div>

    <!-- View All button -->
    {#if showViewAll && hasMoreInsights() && onViewAll}
      <div class="mt-4 text-center">
        <button
          onclick={onViewAll}
          class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          View all {insights.length} insights
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    {/if}
  {/if}
</div>
