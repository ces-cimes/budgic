<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Progress } from '$lib/components/ui/progress/index.ts';
  import { 
    Target, 
    TrendingUp, 
    Calendar, 
    DollarSign, 
    Plus,
    CheckCircle,
    Clock,
    AlertCircle,
    BarChart3,
    ExternalLink,
    Sparkles
  } from '@lucide/svelte';
  import { formatAmount } from '$lib/utils/currency-utils';
  import { goalService, goalOpportunityService } from '$lib/core/services';
  import type { SavingsOpportunitiesResult } from '$lib/core/services/core/goal-opportunity-service';
  import type { GoalsData, Goal } from '../types';
  import GoalTradeoffPanel from '../GoalTradeoffPanel.svelte';

  interface Props {
    goalsData: GoalsData | null;
    activeGoals: Goal[];
    completedGoals: Goal[];
    userCurrency: string;
    onGoalAction: (action: string, goalId: string) => void;
  }

  let { goalsData, activeGoals, completedGoals, userCurrency, onGoalAction }: Props = $props();

  let opportunitiesResult = $state<SavingsOpportunitiesResult | null>(null);
  onMount(async () => {
    try {
      opportunitiesResult = await goalOpportunityService.getSavingsOpportunities();
    } catch (e) {
      console.error('Failed to load savings opportunities:', e);
    }
  });

  function getCategoryIcon(category: string) {
    const icons: Record<string, string> = {
      'emergency_fund': '🛡️',
      'vacation': '✈️',
      'house_down_payment': '🏠',
      'car_purchase': '🚗',
      'education': '🎓',
      'retirement': '💰',
      'debt_payoff': '💳',
      'wedding': '💍',
      'home_improvement': '🔨',
      'investment': '📈',
      'other': '🎯'
    };
    return icons[category] || '🎯';
  }

  function getPriorityColor(priority: string) {
    const colors = {
      'low': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'medium': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'high': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'critical': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };
    return colors[priority as keyof typeof colors] || colors.medium;
  }

  function getProgressColor(progress: number) {
    if (progress >= 100) return 'text-green-500';
    if (progress >= 75) return 'text-blue-500';
    if (progress >= 50) return 'text-yellow-500';
    return 'text-red-500';
  }

  function getProgressBgColor(progress: number) {
    if (progress >= 100) return 'bg-green-500';
    if (progress >= 75) return 'bg-blue-500';
    if (progress >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  function getDaysUntilTarget(targetDate?: string) {
    if (!targetDate) return null;
    const target = new Date(targetDate);
    const now = new Date();
    const diffTime = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'active': return Clock;
      case 'completed': return CheckCircle;
      case 'paused': return AlertCircle;
      default: return Target;
    }
  }

  function getRequiredSavingsLabel(goal: Goal): string | null {
    const req = goalService.getRequiredSavings(goal);
    if (req.isTimeBound && req.requiredMonthly != null && req.requiredMonthly > 0) {
      return `${formatAmount(req.requiredMonthly, goal.currency)}/mo to target`;
    }
    if (req.suggestedMonthly != null && req.suggestedMonthly > 0) {
      return `${formatAmount(req.suggestedMonthly, goal.currency)}/mo suggested`;
    }
    return null;
  }
</script>

<div class="p-6 space-y-6">
  {#if goalsData}
    <!-- Goals Overview Stats -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card.Root>
        <Card.Content class="p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-muted-foreground">Total Goals</p>
              <p class="text-2xl font-bold text-primary">{goalsData.totalGoals}</p>
            </div>
            <Target class="h-8 w-8 text-primary" />
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Content class="p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-muted-foreground">Active Goals</p>
              <p class="text-2xl font-bold text-blue-500">{goalsData.activeGoals}</p>
            </div>
            <TrendingUp class="h-8 w-8 text-blue-500" />
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Content class="p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-muted-foreground">Total Value</p>
              <p class="text-2xl font-bold text-primary">{formatAmount(goalsData.totalTargetValue, userCurrency)}</p>
            </div>
            <DollarSign class="h-8 w-8 text-primary" />
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Content class="p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-muted-foreground">Overall Progress</p>
              <p class="text-2xl font-bold text-green-500">{goalsData.overallProgress.toFixed(1)}%</p>
            </div>
            <CheckCircle class="h-8 w-8 text-green-500" />
          </div>
        </Card.Content>
      </Card.Root>
    </div>

    <!-- Overall Progress Bar -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Overall Progress</Card.Title>
        <Card.Description>Your progress across all active goals</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-muted-foreground">Progress</span>
            <span class="text-primary font-medium">{goalsData.overallProgress.toFixed(1)}%</span>
          </div>
          <Progress value={goalsData.overallProgress} class="h-3" />
        </div>
        
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-muted-foreground">Current Value:</span>
            <span class="font-medium text-primary ml-2">{formatAmount(goalsData.totalCurrentValue, userCurrency)}</span>
          </div>
          <div>
            <span class="text-muted-foreground">Target Value:</span>
            <span class="font-medium text-primary ml-2">{formatAmount(goalsData.totalTargetValue, userCurrency)}</span>
          </div>
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Monthly Contribution Summary -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Monthly Contributions</Card.Title>
        <Card.Description>Total monthly contributions across all active goals</Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="text-center">
          <div class="text-3xl font-bold text-primary mb-2">
            {formatAmount(goalsData.monthlyContributionTotal, userCurrency)}
          </div>
          <p class="text-sm text-muted-foreground">per month</p>
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Goal trade-off analysis (Phase 2.3) -->
    <GoalTradeoffPanel activeGoals={activeGoals} userCurrency={userCurrency} />

    <!-- Savings opportunities (Phase 2.2) -->
    {#if opportunitiesResult}
      <Card.Root>
        <Card.Header>
          <div class="flex items-center gap-2">
            <Sparkles class="h-5 w-5 text-amber-500" />
            <div>
              <Card.Title>Savings opportunities</Card.Title>
              <Card.Description>
                {#if opportunitiesResult.surplus >= opportunitiesResult.threshold}
                  You have {formatAmount(opportunitiesResult.surplus, opportunitiesResult.currency)} surplus this period. Contribute to goals?
                {:else if opportunitiesResult.surplus > 0}
                  Surplus this period: {formatAmount(opportunitiesResult.surplus, opportunitiesResult.currency)} (suggestions when above {formatAmount(opportunitiesResult.threshold, opportunitiesResult.currency)})
                {:else}
                  No surplus this period after income, essentials, buffer, allowances, and goal commitments.
                {/if}
              </Card.Description>
            </div>
          </div>
        </Card.Header>
        <Card.Content>
          {#if opportunitiesResult.opportunities.length > 0}
            <div class="space-y-3">
              {#each opportunitiesResult.opportunities as opp (opp.goalId)}
                <div class="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-primary">{opp.goalName}</p>
                    <p class="text-sm text-muted-foreground">{opp.impactMessage}</p>
                  </div>
                  <div class="flex items-center gap-2 shrink-0 ml-3">
                    <span class="font-semibold text-amber-700 dark:text-amber-300">
                      {formatAmount(opp.suggestedAmount, opp.currency)}
                    </span>
                    <Button.Root
                      size="sm"
                      variant="outline"
                      onclick={() => onGoalAction('add_progress', opp.goalId)}
                    >
                      Add
                    </Button.Root>
                  </div>
                </div>
              {/each}
            </div>
          {:else if opportunitiesResult.surplus >= opportunitiesResult.threshold && activeGoals.length > 0}
            <p class="text-sm text-muted-foreground">All goals are funded for this period or no remaining balance needed.</p>
          {:else if opportunitiesResult.surplus >= opportunitiesResult.threshold}
            <p class="text-sm text-muted-foreground">Create a goal to see contribution suggestions.</p>
          {/if}
        </Card.Content>
      </Card.Root>
    {/if}
  {/if}

  <!-- Active Goals Preview -->
  <Card.Root>
    <Card.Header>
      <div class="flex items-center justify-between">
        <div>
          <Card.Title>Active Goals</Card.Title>
          <Card.Description>Your current financial goals</Card.Description>
        </div>
        <Button.Root size="sm" onclick={() => goto('/goals/add')}>
          <Plus class="h-4 w-4 mr-2" />
          Add Goal
        </Button.Root>
      </div>
    </Card.Header>
    <Card.Content>
      {#if activeGoals.length > 0}
        <div class="space-y-4">
          {#each activeGoals.slice(0, 3) as goal (goal.id)}
            <div class="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors">
              <div class="flex items-center space-x-4">
                <div class="text-2xl">{getCategoryIcon(goal.category)}</div>
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <h3 class="font-medium text-primary">{goal.name}</h3>
                    <Badge class={getPriorityColor(goal.priority)}>
                      {goal.priority}
                    </Badge>
                  </div>
                  <div class="text-sm text-muted-foreground mb-2">
                    {formatAmount(goal.currentAmount, goal.currency)} of {formatAmount(goal.targetAmount, goal.currency)}
                    {#if getRequiredSavingsLabel(goal)}
                      <span class="text-muted-foreground"> · {getRequiredSavingsLabel(goal)}</span>
                    {/if}
                  </div>
                  <div class="w-full bg-muted rounded-full h-2">
                    <div 
                      class="h-2 rounded-full transition-all duration-300 {getProgressBgColor((goal.currentAmount / goal.targetAmount) * 100)}" 
                      style="width: {Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)}%"
                    ></div>
                  </div>
                </div>
              </div>
              
              <div class="text-right">
                <div class="text-lg font-semibold {getProgressColor((goal.currentAmount / goal.targetAmount) * 100)}">
                  {((goal.currentAmount / goal.targetAmount) * 100).toFixed(1)}%
                </div>
                {#if goal.targetDate}
                  {@const daysLeft = getDaysUntilTarget(goal.targetDate)}
                  {#if daysLeft !== null}
                    <div class="text-xs text-muted-foreground">
                      {daysLeft > 0 ? `${daysLeft} days left` : 'Overdue'}
                    </div>
                  {/if}
                {/if}
              </div>
            </div>
          {/each}
          
          {#if activeGoals.length > 3}
            <div class="text-center pt-2">
              <Button.Root variant="ghost" onclick={() => goto('/goals?tab=active')}>
                View All {activeGoals.length} Goals
              </Button.Root>
            </div>
          {/if}
        </div>
      {:else}
        <div class="text-center py-8">
          <Target class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 class="text-lg font-semibold text-primary mb-2">No Active Goals</h3>
          <p class="text-muted-foreground mb-4">Start by creating your first financial goal</p>
          <Button.Root onclick={() => goto('/goals/add')}>
            <Plus class="h-4 w-4 mr-2" />
            Create Goal
          </Button.Root>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Recent Completions -->
  {#if completedGoals.length > 0}
    <Card.Root>
      <Card.Header>
        <div class="flex items-center justify-between">
          <div>
            <Card.Title>Recent Completions</Card.Title>
            <Card.Description>Goals you've recently achieved</Card.Description>
          </div>
          <Button.Root variant="ghost" size="sm" onclick={() => goto('/goals?tab=completed')}>
            View All
          </Button.Root>
        </div>
      </Card.Header>
      <Card.Content>
        <div class="space-y-3">
          {#each completedGoals.slice(0, 2) as goal (goal.id)}
            <div class="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div class="flex items-center space-x-3">
                <div class="text-xl">{getCategoryIcon(goal.category)}</div>
                <div>
                  <div class="font-medium text-primary">{goal.name}</div>
                  <div class="text-sm text-muted-foreground">
                    Completed {goal.completedAt ? new Date(goal.completedAt).toLocaleDateString() : 'Recently'}
                  </div>
                </div>
              </div>
              <div class="text-right">
                <div class="text-lg font-semibold text-green-600">
                  {formatAmount(goal.targetAmount, goal.currency)}
                </div>
                <CheckCircle class="h-5 w-5 text-green-600" />
              </div>
            </div>
          {/each}
        </div>
      </Card.Content>
    </Card.Root>
  {/if}

  <!-- Cross-Route Integration -->
  <Card.Root>
    <Card.Header>
      <div class="flex items-center justify-between">
        <div>
          <Card.Title>Planning Integration</Card.Title>
          <Card.Description>See how your goals affect your daily budget</Card.Description>
        </div>
        <Button.Root 
          variant="outline" 
          size="sm" 
          onclick={() => goto('/budget?tab=budget')}
        >
          <BarChart3 class="h-4 w-4 mr-2" />
          View Budget Impact
        </Button.Root>
      </div>
    </Card.Header>
    <Card.Content>
      <div class="space-y-3">
        <div class="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div class="flex items-center space-x-3">
            <BarChart3 class="h-5 w-5 text-blue-600" />
            <div>
              <div class="font-medium text-primary">Budget Impact Analysis</div>
              <div class="text-sm text-muted-foreground">
                See how your goals affect your daily spending allowance
              </div>
            </div>
          </div>
          <Button.Root 
            variant="ghost" 
            size="sm"
            onclick={() => goto('/budget?tab=budget')}
          >
            <ExternalLink class="h-4 w-4" />
          </Button.Root>
        </div>
        
        <div class="text-sm text-muted-foreground">
          Your active goals contribute to your overall financial plan. 
          <Button.Root 
            variant="link" 
            size="sm" 
            class="p-0 h-auto text-blue-600"
            onclick={() => goto('/budget?tab=budget')}
          >
            View detailed budget analysis
          </Button.Root>
        </div>
      </div>
    </Card.Content>
  </Card.Root>
</div>
