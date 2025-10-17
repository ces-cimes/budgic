<script lang="ts">
  import { onMount } from 'svelte';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import TabNavigation from '$lib/components/TabNavigation.svelte';
  import * as Card from '$lib/components/ui/card/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Bell, AlertTriangle, CheckCircle, Info, ChartBar, Award, TrendingUp, Lightbulb, CircleAlert, X, Filter } from '@lucide/svelte';
  import { insightsService, settingsService, userActionsService } from '$lib/core/services';
  import type { Insight } from '$lib/core/services/insights-service';
  import { formatMainCurrencyAmount } from '$lib/utils/currency-utils';

  // State
  let alerts = $state<Insight[]>([]);
  let isLoading = $state(true);
  let userCurrency = $state<string>('USD');
  let filterSeverity = $state<'all' | 'alert' | 'warning' | 'success' | 'info'>('all');
  let showDismissed = $state(false);

  // Tab navigation configuration
  const insightsTabs = [
    { id: 'alerts', label: 'Alerts', path: '/insights/alerts', icon: Bell },
    { id: 'badges', label: 'Badges', path: '/insights/badges', icon: Award },
    { id: 'trends', label: 'Trends', path: '/insights/trends', icon: TrendingUp },
    { id: 'tips', label: 'Tips', path: '/insights/tips', icon: Lightbulb }
  ];

  onMount(async () => {
    try {
      // Load user currency preference
      userCurrency = await settingsService.getCurrency();
      
      // Load alerts
      await loadAlerts();
      
      // Track user viewing alerts
      await userActionsService.track('progress_viewed', {
        triggeredBy: 'user_initiated',
        categoriesViewed: ['alerts'],
        actionTaken: 'none'
      });
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      isLoading = false;
    }
  });

  async function loadAlerts() {
    const allInsights = insightsService.getInsights();
    
    // Filter for alert-level insights and warnings
    alerts = allInsights.filter(insight => 
      (insight.severity === 'alert' || insight.severity === 'warning') &&
      !insight.dismissedAt
    );
  }

  function getAlertIcon(severity: Insight['severity']) {
    switch (severity) {
      case 'alert': return AlertTriangle;
      case 'warning': return AlertTriangle;
      case 'success': return CheckCircle;
      case 'info': return Info;
      default: return Bell;
    }
  }

  function getSeverityColor(severity: Insight['severity']) {
    switch (severity) {
      case 'alert': return 'border-destructive/50 bg-destructive/10';
      case 'warning': return 'border-warning/50 bg-warning/10';
      case 'success': return 'border-success/50 bg-success/10';
      case 'info': return 'border-info/50 bg-info/10';
      default: return 'border-border bg-muted/50';
    }
  }

  function getSeverityTextColor(severity: Insight['severity']) {
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

  function formatAmount(amount?: number) {
    if (amount === undefined) return '';
    return formatMainCurrencyAmount(amount, userCurrency);
  }

  function formatPercentage(percentage?: number) {
    if (percentage === undefined) return '';
    return `${Math.round(percentage * 100)}%`;
  }

  async function dismissAlert(alertId: string) {
    await insightsService.dismissInsight(alertId);
    await loadAlerts(); // Reload to reflect changes
  }

  function getFilteredAlerts() {
    let filtered = alerts;
    
    if (filterSeverity !== 'all') {
      filtered = filtered.filter(alert => alert.severity === filterSeverity);
    }
    
    return filtered;
  }

  function getAlertCount() {
    return insightsService.getInsightsBySeverity('alert').length + 
           insightsService.getInsightsBySeverity('warning').length;
  }
</script>

<PageLayout>
  {#snippet topBar()}
    <Header 
      title="Alerts" 
      variant="with-tabs"
      buttonProps={[{
        text: `${getAlertCount()} alerts`,
        variant: "secondary",
        size: "sm",
        icon: CircleAlert,
        disabled: true
      }]}
    >
      <TabNavigation tabs={insightsTabs} />
    </Header>
  {/snippet}

  {#snippet bottomBar()}
    <!-- Mobile Navigation -->
    <MobileNavigation />
  {/snippet}

  <div class="p-4 space-y-4">
    <!-- Filter Controls -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Filter size={16} class="text-muted-foreground" />
        <span class="text-sm text-muted-foreground">Filter by severity:</span>
        <div class="flex gap-1">
          <Button 
            variant={filterSeverity === 'all' ? 'default' : 'outline'}
            size="sm"
            onclick={() => filterSeverity = 'all'}
          >
            All
          </Button>
          <Button 
            variant={filterSeverity === 'alert' ? 'default' : 'outline'}
            size="sm"
            onclick={() => filterSeverity = 'alert'}
          >
            Critical
          </Button>
          <Button 
            variant={filterSeverity === 'warning' ? 'default' : 'outline'}
            size="sm"
            onclick={() => filterSeverity = 'warning'}
          >
            Warning
          </Button>
        </div>
      </div>
    </div>

    {#if isLoading}
      <div class="space-y-3">
        {#each Array(3) as _}
          <Card.Root class="p-4">
            <div class="animate-pulse">
              <div class="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div class="h-3 bg-muted rounded w-1/2"></div>
            </div>
          </Card.Root>
        {/each}
      </div>
    {:else if getFilteredAlerts().length === 0}
      <Card.Root class="p-8 text-center">
        <Bell class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 class="text-lg font-semibold text-primary mb-2">No alerts</h3>
        <p class="text-muted-foreground">
          {filterSeverity === 'all' 
            ? "You're all caught up! Check back later for updates."
            : `No ${filterSeverity} alerts found. Try changing the filter.`
          }
        </p>
      </Card.Root>
    {:else}
      <div class="space-y-3">
        {#each getFilteredAlerts() as alert (alert.id)}
          {@const Icon = getAlertIcon(alert.severity)}
          <Card.Root class="p-4 {getSeverityColor(alert.severity)}">
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 mt-1">
                <Icon class="w-5 h-5 {getSeverityTextColor(alert.severity)}" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-1">
                  <h3 class="font-semibold {getSeverityTextColor(alert.severity)}">{alert.title}</h3>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-muted-foreground">{formatTimestamp(alert.createdAt)}</span>
                    <Badge 
                      variant={alert.severity === 'alert' ? 'destructive' : 'secondary'} 
                      class="text-xs"
                    >
                      {alert.severity === 'alert' ? 'Critical' : 'Warning'}
                    </Badge>
                  </div>
                </div>
                <p class="text-sm text-muted-foreground mb-2">
                  {alert.message}
                  {#if alert.amount}
                    <span class="font-medium ml-1 text-primary">
                      {formatAmount(alert.amount)}
                    </span>
                  {/if}
                  {#if alert.percentage}
                    <span class="font-medium ml-1 text-primary">
                      ({formatPercentage(alert.percentage)})
                    </span>
                  {/if}
                </p>
                <div class="flex items-center justify-between">
                  <div class="flex gap-2">
                    {#if alert.actionable}
                      <Badge variant="outline" class="text-xs">Actionable</Badge>
                    {/if}
                    {#if alert.category}
                      <Badge variant="secondary" class="text-xs capitalize">
                        {alert.category}
                      </Badge>
                    {/if}
                  </div>
                  <div class="flex gap-2">
                    {#if alert.actionable && alert.actionText}
                      <Button 
                        variant="outline" 
                        size="sm"
                        class="text-xs"
                        onclick={() => {
                          if (alert.actionUrl) {
                            window.location.href = alert.actionUrl;
                          }
                        }}
                      >
                        {alert.actionText}
                      </Button>
                    {/if}
                    <Button
                      variant="ghost"
                      size="sm"
                      class="text-xs"
                      onclick={() => dismissAlert(alert.id)}
                    >
                      <X size={14} />
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card.Root>
        {/each}
      </div>
    {/if}
  </div>
</PageLayout>
