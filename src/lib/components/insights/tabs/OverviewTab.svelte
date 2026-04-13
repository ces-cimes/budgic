<script lang="ts">
  import InsightList from '../shared/InsightList.svelte';
  import RecommendationsList from '../RecommendationsList.svelte';
  import CreditUtilizationVisualization from '$lib/components/accounts/CreditUtilizationVisualization.svelte';
  import EmergencyFundVisualization from '$lib/components/accounts/EmergencyFundVisualization.svelte';
  import { Loader2, Lightbulb, RefreshCw, Plus, AlertCircle, AlertTriangle, Info, CheckCircle2 } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button/index.ts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import type { OverviewTabProps, UnifiedInsight } from '../types';
  import { accountService } from '$lib/core/services';
  import { onMount } from 'svelte';

  let hasCreditAccounts = $state(false);

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

  onMount(async () => {
    try {
      const accounts = await accountService.getAccounts();
      hasCreditAccounts = accounts.some(acc => acc.type === 'credit' && acc.metadata?.creditLimit);
    } catch (error) {
      console.error('Error checking for credit accounts:', error);
    }
  });
</script>

<div class="overview-tab h-full overflow-y-auto {className}">
  <div class="py-5 space-y-6">
    <!-- Loading State — skeleton, no spinner -->
    {#if isLoading}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {#each [1, 2, 3, 4] as _}
          <div class="h-16 animate-pulse rounded-xl bg-[var(--color-bg-tertiary)]"></div>
        {/each}
      </div>
      <div class="space-y-2">
        {#each [1, 2, 3] as _}
          <div class="h-20 animate-pulse rounded-xl bg-[var(--color-bg-tertiary)]"></div>
        {/each}
      </div>
    {:else}
      <!-- Summary stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-warm-coral)]/20 px-4 py-3">
          <div class="flex items-center gap-1.5 mb-1">
            <AlertCircle class="size-3 text-[var(--color-warm-coral)]" />
            <span class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Alerts</span>
          </div>
          <p class="text-xl font-semibold text-[var(--color-text-primary)]">{insightsCount().alerts}</p>
        </div>
        <div class="rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-amber)]/20 px-4 py-3">
          <div class="flex items-center gap-1.5 mb-1">
            <AlertTriangle class="size-3 text-[var(--color-amber)]" />
            <span class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Warnings</span>
          </div>
          <p class="text-xl font-semibold text-[var(--color-text-primary)]">{insightsCount().warnings}</p>
        </div>
        <div class="rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-info)]/20 px-4 py-3">
          <div class="flex items-center gap-1.5 mb-1">
            <Info class="size-3 text-[var(--color-info)]" />
            <span class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Info</span>
          </div>
          <p class="text-xl font-semibold text-[var(--color-text-primary)]">{insightsCount().info}</p>
        </div>
        <div class="rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-sage-green)]/20 px-4 py-3">
          <div class="flex items-center gap-1.5 mb-1">
            <CheckCircle2 class="size-3 text-[var(--color-sage-green)]" />
            <span class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Good</span>
          </div>
          <p class="text-xl font-semibold text-[var(--color-text-primary)]">{insightsCount().celebrations}</p>
        </div>
      </div>

      <!-- Priority insights (alerts & warnings) -->
      {#if insightsByCategory().alerts.length > 0 || insightsByCategory().warnings.length > 0}
        <div>
          <h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4">Priority</h2>
          <InsightList 
            insights={[...insightsByCategory().alerts, ...insightsByCategory().warnings]}
            onDismiss={onDismiss}
            onAction={onAction}
          />
        </div>
      {/if}

      <!-- Informational insights -->
      {#if insightsByCategory().info.length > 0}
        <div>
          <h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4">Informational</h2>
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
          <h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4">Celebrations</h2>
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

    <!-- Credit Utilization Optimization -->
    {#if hasCreditAccounts}
      <div>
        <div class="flex items-center justify-between mb-3 sm:mb-4">
          <h2 class="text-base sm:text-lg font-semibold text-foreground">Credit Utilization</h2>
        </div>
        <CreditUtilizationVisualization showAggregate={true} showDetails={true} showRecommendations={true} />
      </div>
    {/if}

    <!-- Emergency Fund Status -->
    <div>
      <div class="flex items-center justify-between mb-3 sm:mb-4">
        <h2 class="text-base sm:text-lg font-semibold text-foreground">Emergency Fund Status</h2>
      </div>
      <EmergencyFundVisualization showDetails={true} showRecommendations={true} />
    </div>

    <!-- Recommendations -->
    <div>
      <div class="flex items-center justify-between mb-3 sm:mb-4">
        <h2 class="text-base sm:text-lg font-semibold text-foreground">Personalized Recommendations</h2>
      </div>
      <RecommendationsList maxItems={5} />
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
