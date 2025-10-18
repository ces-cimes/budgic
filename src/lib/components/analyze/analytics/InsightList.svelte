<script lang="ts">
  import type { InsightListProps } from '../types.js';
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Bell } from '@lucide/svelte';
  import InsightAlert from './InsightAlert.svelte';

  interface Props extends InsightListProps {
    children?: any;
  }

  const { 
    insights, 
    maxItems = 3, 
    showViewAll = true, 
    onViewAll, 
    className = '',
    children 
  }: Props = $props();

  const displayInsights = $derived(insights.slice(0, maxItems));
</script>

<div class="{className}">
  {#if insights.length === 0}
    <div class="text-center py-8">
      <Bell class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
      <h4 class="text-lg font-semibold text-primary mb-2">No alerts</h4>
      <p class="text-muted-foreground">You're all caught up!</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each displayInsights as insight (insight.id)}
        <InsightAlert {insight} />
      {/each}
    </div>
    
    {#if showViewAll && insights.length > maxItems}
      <div class="mt-4">
        <Button variant="outline" size="sm" onclick={onViewAll}>
          View All ({insights.length})
        </Button>
      </div>
    {/if}
  {/if}
  
  {#if children}
    {@render children()}
  {/if}
</div>

