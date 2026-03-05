<script lang="ts">
  import { goto } from '$app/navigation';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { 
    Lightbulb, 
    TrendingUp, 
    AlertCircle,
    CheckCircle,
    Target,
    DollarSign,
    Calendar,
    Award,
    X,
    ArrowRight
  } from '@lucide/svelte';
  import { formatAmount, formatPercentage } from '$lib/utils/currency-utils';
  import type { GoalInsight, GoalsData } from '../types';

  interface Props {
    goalInsights: GoalInsight[];
    goalsData: GoalsData | null;
    userCurrency: string;
    onGoalAction: (action: string, goalId: string) => void;
  }

  let { goalInsights, goalsData, userCurrency, onGoalAction }: Props = $props();

  function getInsightIcon(type: string) {
    switch (type) {
      case 'achievement': return Award;
      case 'milestone': return CheckCircle;
      case 'recommendation': return Lightbulb;
      case 'warning': return AlertCircle;
      case 'celebration': return Award;
      case 'optimization': return TrendingUp;
      default: return Lightbulb;
    }
  }

  function getInsightColor(type: string) {
    switch (type) {
      case 'achievement': return 'text-green-500';
      case 'milestone': return 'text-[var(--color-info)]';
      case 'recommendation': return 'text-yellow-500';
      case 'warning': return 'text-red-500';
      case 'celebration': return 'text-purple-500';
      case 'optimization': return 'text-[var(--color-info)]';
      default: return 'text-primary';
    }
  }

  function getInsightBgColor(type: string) {
    switch (type) {
      case 'achievement': return 'bg-green-100 dark:bg-green-900/20';
      case 'milestone': return 'bg-blue-100 dark:bg-blue-900/20';
      case 'recommendation': return 'bg-yellow-100 dark:bg-yellow-900/20';
      case 'warning': return 'bg-red-100 dark:bg-red-900/20';
      case 'celebration': return 'bg-purple-100 dark:bg-purple-900/20';
      case 'optimization': return 'bg-blue-100 dark:bg-blue-900/20';
      default: return 'bg-accent';
    }
  }

  function getPriorityColor(priority: string) {
    const colors = {
      'low': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'medium': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'high': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };
    return colors[priority as keyof typeof colors] || colors.medium;
  }

  function handleDismissInsight(insightId: string) {
    onGoalAction('dismiss_insight', insightId);
  }

  function handleInsightAction(insight: GoalInsight) {
    if (insight.goalId) {
      onGoalAction('view_goal', insight.goalId);
    }
  }

  function getInsightsByType() {
    const grouped = goalInsights.reduce((acc, insight) => {
      if (!acc[insight.type]) {
        acc[insight.type] = [];
      }
      acc[insight.type].push(insight);
      return acc;
    }, {} as Record<string, GoalInsight[]>);

    return grouped;
  }

  function getHighPriorityInsights() {
    return goalInsights.filter(insight => insight.priority === 'high');
  }

  function getActionableInsights() {
    return goalInsights.filter(insight => insight.actionable);
  }
</script>

<div class="p-6 space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold text-primary">Goal Insights</h2>
      <p class="text-muted-foreground">AI-powered recommendations and achievements</p>
    </div>
    
    {#if goalInsights.length > 0}
      <div class="flex items-center gap-2">
        <Badge variant="outline">
          {goalInsights.length} insights
        </Badge>
      </div>
    {/if}
  </div>

  {#if goalInsights.length > 0}
    <!-- High Priority Alerts -->
    {#if getHighPriorityInsights().length > 0}
      <Card.Root class="border-red-200 dark:border-red-800">
        <Card.Header>
          <Card.Title class="flex items-center gap-2 text-red-600">
            <AlertCircle class="h-5 w-5" />
            High Priority Insights
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-3">
          {#each getHighPriorityInsights() as insight (insight.id)}
            <div class="flex items-start justify-between p-4 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
              <div class="flex items-start space-x-3">
                {#if insight.type === 'achievement'}
                  {@const Icon = Award}
                  <Icon class="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                {:else if insight.type === 'milestone'}
                  {@const Icon = CheckCircle}
                  <Icon class="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                {:else if insight.type === 'recommendation'}
                  {@const Icon = Lightbulb}
                  <Icon class="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                {:else if insight.type === 'warning'}
                  {@const Icon = AlertCircle}
                  <Icon class="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                {:else if insight.type === 'celebration'}
                  {@const Icon = Award}
                  <Icon class="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                {:else if insight.type === 'optimization'}
                  {@const Icon = TrendingUp}
                  <Icon class="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                {/if}
                <div>
                  <h4 class="font-medium text-primary mb-1">{insight.title}</h4>
                  <p class="text-sm text-muted-foreground">{insight.description}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                {#if insight.actionable}
                  <Button.Root 
                    variant="outline" 
                    size="sm"
                    onclick={() => handleInsightAction(insight)}
                  >
                    <ArrowRight class="h-4 w-4 mr-1" />
                    Take Action
                  </Button.Root>
                {/if}
                <Button.Root 
                  variant="ghost" 
                  size="sm"
                  onclick={() => handleDismissInsight(insight.id)}
                >
                  <X class="h-4 w-4" />
                </Button.Root>
              </div>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Actionable Recommendations -->
    {#if getActionableInsights().length > 0}
      <Card.Root>
        <Card.Header>
          <Card.Title class="flex items-center gap-2">
            <Target class="h-5 w-5" />
            Actionable Recommendations
          </Card.Title>
          <Card.Description>Insights you can act on to improve your goal progress</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-3">
          {#each getActionableInsights() as insight (insight.id)}
            <div class="flex items-start justify-between p-4 bg-accent/50 rounded-lg">
              <div class="flex items-start space-x-3">
                {#if insight.type === 'achievement'}
                  {@const Icon = Award}
                  <Icon class="h-5 w-5 {getInsightColor(insight.type)} mt-0.5 flex-shrink-0" />
                {:else if insight.type === 'milestone'}
                  {@const Icon = CheckCircle}
                  <Icon class="h-5 w-5 {getInsightColor(insight.type)} mt-0.5 flex-shrink-0" />
                {:else if insight.type === 'recommendation'}
                  {@const Icon = Lightbulb}
                  <Icon class="h-5 w-5 {getInsightColor(insight.type)} mt-0.5 flex-shrink-0" />
                {:else if insight.type === 'warning'}
                  {@const Icon = AlertCircle}
                  <Icon class="h-5 w-5 {getInsightColor(insight.type)} mt-0.5 flex-shrink-0" />
                {:else if insight.type === 'celebration'}
                  {@const Icon = Award}
                  <Icon class="h-5 w-5 {getInsightColor(insight.type)} mt-0.5 flex-shrink-0" />
                {:else if insight.type === 'optimization'}
                  {@const Icon = TrendingUp}
                  <Icon class="h-5 w-5 {getInsightColor(insight.type)} mt-0.5 flex-shrink-0" />
                {/if}
                <div>
                  <h4 class="font-medium text-primary mb-1">{insight.title}</h4>
                  <p class="text-sm text-muted-foreground">{insight.description}</p>
                  <div class="flex items-center gap-2 mt-2">
                    <Badge class={getPriorityColor(insight.priority)}>
                      {insight.priority}
                    </Badge>
                    <Badge variant="outline">
                      {insight.type}
                    </Badge>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Button.Root 
                  variant="outline" 
                  size="sm"
                  onclick={() => handleInsightAction(insight)}
                >
                  <ArrowRight class="h-4 w-4 mr-1" />
                  Action
                </Button.Root>
                <Button.Root 
                  variant="ghost" 
                  size="sm"
                  onclick={() => handleDismissInsight(insight.id)}
                >
                  <X class="h-4 w-4" />
                </Button.Root>
              </div>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- All Insights by Type -->
    <div class="space-y-6">
      {#each Object.entries(getInsightsByType()) as [type, insights]}
        <Card.Root>
          <Card.Header>
            <Card.Title class="flex items-center gap-2 capitalize">
              {#if type === 'achievement'}
                {@const Icon = Award}
                <Icon class="h-5 w-5 {getInsightColor(type)}" />
              {:else if type === 'milestone'}
                {@const Icon = CheckCircle}
                <Icon class="h-5 w-5 {getInsightColor(type)}" />
              {:else if type === 'recommendation'}
                {@const Icon = Lightbulb}
                <Icon class="h-5 w-5 {getInsightColor(type)}" />
              {:else if type === 'warning'}
                {@const Icon = AlertCircle}
                <Icon class="h-5 w-5 {getInsightColor(type)}" />
              {:else if type === 'celebration'}
                {@const Icon = Award}
                <Icon class="h-5 w-5 {getInsightColor(type)}" />
              {:else if type === 'optimization'}
                {@const Icon = TrendingUp}
                <Icon class="h-5 w-5 {getInsightColor(type)}" />
              {/if}
              {type.replace('_', ' ')} Insights
            </Card.Title>
            <Card.Description>{insights.length} {type} insights</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-3">
            {#each insights as insight (insight.id)}
              <div class="flex items-start justify-between p-4 {getInsightBgColor(insight.type)} rounded-lg">
                <div class="flex items-start space-x-3">
                  {#if insight.type === 'achievement'}
                    {@const Icon = Award}
                    <Icon class="h-5 w-5 {getInsightColor(insight.type)} mt-0.5 flex-shrink-0" />
                  {:else if insight.type === 'milestone'}
                    {@const Icon = CheckCircle}
                    <Icon class="h-5 w-5 {getInsightColor(insight.type)} mt-0.5 flex-shrink-0" />
                  {:else if insight.type === 'recommendation'}
                    {@const Icon = Lightbulb}
                    <Icon class="h-5 w-5 {getInsightColor(insight.type)} mt-0.5 flex-shrink-0" />
                  {:else if insight.type === 'warning'}
                    {@const Icon = AlertCircle}
                    <Icon class="h-5 w-5 {getInsightColor(insight.type)} mt-0.5 flex-shrink-0" />
                  {:else if insight.type === 'celebration'}
                    {@const Icon = Award}
                    <Icon class="h-5 w-5 {getInsightColor(insight.type)} mt-0.5 flex-shrink-0" />
                  {:else if insight.type === 'optimization'}
                    {@const Icon = TrendingUp}
                    <Icon class="h-5 w-5 {getInsightColor(insight.type)} mt-0.5 flex-shrink-0" />
                  {/if}
                  <div>
                    <h4 class="font-medium text-primary mb-1">{insight.title}</h4>
                    <p class="text-sm text-muted-foreground">{insight.description}</p>
                    <div class="flex items-center gap-2 mt-2">
                      <Badge class={getPriorityColor(insight.priority)}>
                        {insight.priority}
                      </Badge>
                      {#if insight.goalId}
                        <Badge variant="outline">
                          Goal Related
                        </Badge>
                      {/if}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  {#if insight.actionable}
                    <Button.Root 
                      variant="outline" 
                      size="sm"
                      onclick={() => handleInsightAction(insight)}
                    >
                      <ArrowRight class="h-4 w-4 mr-1" />
                      Action
                    </Button.Root>
                  {/if}
                  <Button.Root 
                    variant="ghost" 
                    size="sm"
                    onclick={() => handleDismissInsight(insight.id)}
                  >
                    <X class="h-4 w-4" />
                  </Button.Root>
                </div>
              </div>
            {/each}
          </Card.Content>
        </Card.Root>
      {/each}
    </div>
  {:else}
    <!-- Empty State -->
    <Card.Root>
      <Card.Content class="p-12 text-center">
        <Lightbulb class="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h3 class="text-xl font-semibold text-primary mb-2">No Insights Yet</h3>
        <p class="text-muted-foreground mb-6 max-w-md mx-auto">
          As you work on your goals, we'll generate personalized insights and recommendations to help you succeed.
        </p>
        <Button.Root onclick={() => goto('/plan?tab=goals')}>
          View Active Goals
        </Button.Root>
      </Card.Content>
    </Card.Root>
  {/if}

  <!-- Goals Data Summary -->
  {#if goalsData}
    <Card.Root>
      <Card.Header>
        <Card.Title class="flex items-center gap-2">
          <TrendingUp class="h-5 w-5" />
          Goals Summary
        </Card.Title>
        <Card.Description>Your overall goal progress and statistics</Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-primary">{goalsData.totalGoals}</div>
            <div class="text-sm text-muted-foreground">Total Goals</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-500">{goalsData.completedGoals}</div>
            <div class="text-sm text-muted-foreground">Completed</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-[var(--color-info)]">{goalsData.activeGoals}</div>
            <div class="text-sm text-muted-foreground">Active</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-primary">{formatPercentage(goalsData.overallProgress)}</div>
            <div class="text-sm text-muted-foreground">Overall Progress</div>
          </div>
        </div>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
