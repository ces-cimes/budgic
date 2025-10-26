<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
  import { 
    Lightbulb,
    AlertTriangle,
    CheckCircle,
    Clock,
    TrendingUp,
    TrendingDown,
    DollarSign,
    Calendar,
    RefreshCw
  } from '@lucide/svelte';
  import { formatAmount } from '$lib/utils/currency-utils';
  import type { InsightsTabProps, PlanningInsight } from '../types.js';

  const { 
    insights, 
    userCurrency, 
    onRefresh 
  }: InsightsTabProps = $props();

  function formatCurrency(amount: number): string {
    return formatAmount(amount, userCurrency);
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'high':
        return 'text-destructive';
      case 'medium':
        return 'text-warning';
      case 'low':
        return 'text-success';
      default:
        return 'text-muted-foreground';
    }
  }

  function getPriorityIcon(priority: string) {
    switch (priority) {
      case 'high':
        return AlertTriangle;
      case 'medium':
        return Clock;
      case 'low':
        return CheckCircle;
      default:
        return Clock;
    }
  }

  function getTypeIcon(type: string) {
    switch (type) {
      case 'balance_warning':
        return AlertTriangle;
      case 'income_timing':
        return Calendar;
      case 'expense_optimization':
        return TrendingDown;
      case 'buffer_recommendation':
        return DollarSign;
      default:
        return Lightbulb;
    }
  }

  function getTypeColor(type: string) {
    switch (type) {
      case 'balance_warning':
        return 'text-destructive';
      case 'income_timing':
        return 'text-warning';
      case 'expense_optimization':
        return 'text-primary';
      case 'buffer_recommendation':
        return 'text-success';
      default:
        return 'text-muted-foreground';
    }
  }

  function getTypeLabel(type: string) {
    switch (type) {
      case 'balance_warning':
        return 'Balance Warning';
      case 'income_timing':
        return 'Income Timing';
      case 'expense_optimization':
        return 'Expense Optimization';
      case 'buffer_recommendation':
        return 'Buffer Recommendation';
      default:
        return 'Insight';
    }
  }
</script>

<div class="space-y-6 p-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-primary text-lg font-semibold">Planning Insights</h2>
      <div class="text-muted-foreground text-sm">
        AI-powered recommendations to optimize your financial planning
      </div>
    </div>
    <Button onclick={onRefresh} size="sm" variant="outline">
      <RefreshCw class="mr-2" size={14} />
      Refresh
    </Button>
  </div>

  <!-- Insights List -->
  <div class="space-y-4">
    {#each insights as insight, index (insight.type + index)}
      {@const PriorityIcon = getPriorityIcon(insight.priority)}
      {@const TypeIcon = getTypeIcon(insight.type)}

      <Card class="border-border">
        <CardHeader class="pb-3">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-2">
              <TypeIcon size={16} class={getTypeColor(insight.type)} />
              <CardTitle class="text-lg">{insight.title}</CardTitle>
            </div>
            <div class="flex items-center gap-2">
              <PriorityIcon size={14} class={getPriorityColor(insight.priority)} />
              <Badge 
                variant={insight.priority === 'high' ? 'destructive' : insight.priority === 'medium' ? 'secondary' : 'default'}
                class="text-xs"
              >
                {insight.priority}
              </Badge>
            </div>
          </div>
          <Badge variant="outline" class="text-xs w-fit">
            {getTypeLabel(insight.type)}
          </Badge>
        </CardHeader>
        <CardContent class="space-y-3">
          <p class="text-muted-foreground text-sm">{insight.description}</p>
          
          {#if insight.action}
            <div class="bg-muted/50 rounded-lg p-3">
              <div class="text-muted-foreground text-xs mb-1">Recommended Action</div>
              <div class="text-sm font-medium">{insight.action}</div>
            </div>
          {/if}

          {#if insight.impact}
            <div class="flex items-center gap-2 text-sm">
              <span class="text-muted-foreground">Potential Impact:</span>
              <span class="font-medium {insight.impact >= 0 ? 'text-success' : 'text-destructive'}">
                {insight.impact >= 0 ? '+' : ''}{formatCurrency(insight.impact)}
              </span>
            </div>
          {/if}
        </CardContent>
      </Card>
    {/each}
  </div>

  <!-- Empty State -->
  {#if insights.length === 0}
    <Card class="border-border">
      <CardContent class="flex flex-col items-center justify-center py-12 text-center">
        <Lightbulb class="text-muted-foreground mb-4" size={48} />
        <h3 class="text-lg font-semibold mb-2">No Insights Available</h3>
        <p class="text-muted-foreground text-sm mb-4">
          Add some planned transactions to get personalized insights and recommendations
        </p>
        <Button onclick={onRefresh} variant="outline">
          <RefreshCw class="mr-2" size={16} />
          Refresh Insights
        </Button>
      </CardContent>
    </Card>
  {/if}

  <!-- Summary Stats -->
  {#if insights.length > 0}
    <Card class="border-border">
      <CardHeader>
        <CardTitle class="text-lg">Insight Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <div class="text-destructive text-2xl font-bold">
              {insights.filter(i => i.priority === 'high').length}
            </div>
            <div class="text-muted-foreground text-sm">High Priority</div>
          </div>
          <div>
            <div class="text-warning text-2xl font-bold">
              {insights.filter(i => i.priority === 'medium').length}
            </div>
            <div class="text-muted-foreground text-sm">Medium Priority</div>
          </div>
          <div>
            <div class="text-success text-2xl font-bold">
              {insights.filter(i => i.priority === 'low').length}
            </div>
            <div class="text-muted-foreground text-sm">Low Priority</div>
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}
</div>

