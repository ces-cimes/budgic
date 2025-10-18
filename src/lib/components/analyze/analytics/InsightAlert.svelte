<script lang="ts">
  import type { InsightAlertProps } from '../types.js';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Bell } from '@lucide/svelte';

  interface Props extends InsightAlertProps {
    children?: any;
  }

  const { 
    insight, 
    showTimestamp = false, 
    className = '',
    children 
  }: Props = $props();

  function getSeverityColor(severity: InsightAlertProps['insight']['severity']) {
    switch (severity) {
      case 'alert': return 'border-destructive/50 bg-destructive/10';
      case 'warning': return 'border-warning/50 bg-warning/10';
      case 'success': return 'border-success/50 bg-success/10';
      case 'info': return 'border-info/50 bg-info/10';
      default: return 'border-border bg-muted/50';
    }
  }

  function getSeverityTextColor(severity: InsightAlertProps['insight']['severity']) {
    switch (severity) {
      case 'alert': return 'text-destructive';
      case 'warning': return 'text-warning';
      case 'success': return 'text-success';
      case 'info': return 'text-info';
      default: return 'text-foreground';
    }
  }

  function formatTimestamp(timestamp: string) {
    const now = new Date();
    const alertTime = new Date(timestamp);
    const diff = now.getTime() - alertTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  }
</script>

<div class="flex items-center gap-3 p-3 {getSeverityColor(insight.severity)} rounded-lg {className}">
  <div class="flex-shrink-0">
    <Bell class="w-4 h-4 {getSeverityTextColor(insight.severity)}" />
  </div>
  <div class="flex-1 min-w-0">
    <h4 class="font-medium {getSeverityTextColor(insight.severity)}">{insight.title}</h4>
    <p class="text-sm text-muted-foreground">{insight.message}</p>
    {#if showTimestamp}
      <p class="text-xs text-muted-foreground mt-1">
        {formatTimestamp(insight.timestamp)}
      </p>
    {/if}
  </div>
  <Badge variant={insight.severity === 'alert' ? 'destructive' : 'secondary'} class="text-xs">
    {insight.severity}
  </Badge>
  
  {#if children}
    {@render children()}
  {/if}
</div>

