<script lang="ts">
  import type { QuickStatsCardProps } from '../types.js';
  import * as Card from '$lib/components/ui/card/index.ts';

  interface Props extends QuickStatsCardProps {
    children?: any;
  }

  const { 
    title, 
    value, 
    subtitle, 
    icon: Icon, 
    trend, 
    className = '',
    children 
  }: Props = $props();

  function getTrendColor(trend: QuickStatsCardProps['trend']) {
    if (!trend) return 'text-primary';
    return trend.isPositive ? 'text-green-500' : 'text-red-500';
  }

  function getTrendIcon(trend: QuickStatsCardProps['trend']) {
    if (!trend) return null;
    return trend.isPositive ? '↗' : '↘';
  }
</script>

<Card.Root class="p-4 {className}">
  <div class="flex items-center gap-3 mb-2">
    {#if Icon}
      <Icon class="w-5 h-5 text-primary" />
    {/if}
    <h3 class="font-semibold text-primary">{title}</h3>
  </div>
  
  <div class="flex items-center justify-between">
    <div class="text-2xl font-bold {getTrendColor(trend)}">
      {value}
    </div>
    
    {#if trend}
      <div class="text-sm {getTrendColor(trend)}">
        {getTrendIcon(trend)} {Math.abs(trend.value).toFixed(1)}%
      </div>
    {/if}
  </div>
  
  {#if subtitle}
    <div class="text-sm text-muted-foreground mt-1">
      {subtitle}
    </div>
  {/if}
  
  {#if children}
    <div class="mt-3">
      {@render children()}
    </div>
  {/if}
</Card.Root>
