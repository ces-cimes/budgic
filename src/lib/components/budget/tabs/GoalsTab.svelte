<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
  import { Progress } from '$lib/components/ui/progress/index.ts';
  import { 
    Target,
    Plus,
    TrendingUp,
    Calendar,
    DollarSign,
    AlertCircle,
    CheckCircle,
    Clock
  } from '@lucide/svelte';
  import { formatAmount } from '$lib/utils/currency-utils';
  import type { GoalsTabProps, FinancialGoal } from '../types.js';
  import { goalService } from '$lib/core/services';
  import { onMount } from 'svelte';
  import type { Goal } from '$lib/core/db';

  const { 
    userCurrency, 
    selectedAccountId, 
    onSetGoal 
  }: GoalsTabProps = $props();

  // Real goals data from database
  let goals = $state<FinancialGoal[]>([]);
  let isLoading = $state(true);

  // Load goals on mount
  onMount(async () => {
    isLoading = true;
    try {
      const dbGoals = await goalService.getGoals();
      // Transform database Goal to FinancialGoal
      // Map database categories to FinancialGoal categories
      const categoryMap: Record<string, 'emergency' | 'savings' | 'debt' | 'investment' | 'purchase' | 'other'> = {
        'emergency_fund': 'emergency',
        'vacation': 'purchase',
        'house_down_payment': 'savings',
        'car_purchase': 'purchase',
        'education': 'investment',
        'retirement': 'investment',
        'debt_payoff': 'debt',
        'wedding': 'purchase',
        'home_improvement': 'purchase',
        'investment': 'investment',
        'other': 'other'
      };

      goals = dbGoals.map(goal => ({
        id: goal.id,
        title: goal.name,
        description: goal.description,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        targetDate: goal.targetDate || '',
        priority: (goal.priority === 'critical' ? 'high' : goal.priority) as 'high' | 'medium' | 'low',
        category: (categoryMap[goal.category] || 'other') as 'emergency' | 'savings' | 'debt' | 'investment' | 'purchase' | 'other',
        status: goal.status,
        createdAt: goal.createdAt,
        updatedAt: goal.updatedAt
      } as FinancialGoal));
    } catch (error) {
      console.error('Error loading goals:', error);
      goals = [];
    } finally {
      isLoading = false;
    }
  });

  function formatCurrency(amount: number): string {
    return formatAmount(amount, userCurrency);
  }

  function getProgressPercentage(goal: FinancialGoal): number {
    return Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
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
        return AlertCircle;
      case 'medium':
        return Clock;
      case 'low':
        return CheckCircle;
      default:
        return Clock;
    }
  }

  function getCategoryIcon(category: string) {
    switch (category) {
      case 'emergency':
        return AlertCircle;
      case 'savings':
        return DollarSign;
      case 'debt':
        return TrendingUp;
      case 'investment':
        return TrendingUp;
      case 'purchase':
        return Target;
      default:
        return Target;
    }
  }

  function getDaysUntilTarget(targetDate: string): number {
    const target = new Date(targetDate);
    const today = new Date();
    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'active':
        return 'text-success';
      case 'paused':
        return 'text-warning';
      case 'completed':
        return 'text-primary';
      case 'cancelled':
        return 'text-muted-foreground';
      default:
        return 'text-muted-foreground';
    }
  }
</script>

<div class="space-y-6 p-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-primary text-lg font-semibold">Financial Goals</h2>
      <div class="text-muted-foreground text-sm">
        Track your progress towards financial milestones
      </div>
    </div>
    <Button onclick={onSetGoal} size="sm">
      <Plus class="mr-2" size={14} />
      Set Goal
    </Button>
  </div>

  <!-- Loading State -->
  {#if isLoading}
    <div class="text-center py-12">
      <div class="w-20 h-20 mx-auto mb-6 bg-muted rounded-full flex items-center justify-center">
        <svg class="w-10 h-10 text-muted-foreground animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <p class="text-muted-foreground">Loading goals...</p>
    </div>
  {/if}

  <!-- Goals List -->
  {#if !isLoading}
    <div class="space-y-4">
      {#each goals as goal (goal.id)}
      {@const PriorityIcon = getPriorityIcon(goal.priority)}
      {@const CategoryIcon = getCategoryIcon(goal.category)}
      {@const progressPercentage = getProgressPercentage(goal)}
      {@const daysUntilTarget = getDaysUntilTarget(goal.targetDate)}

      <Card class="border-border">
        <CardHeader class="pb-3">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-2">
              <CategoryIcon size={16} class="text-primary" />
              <CardTitle class="text-lg">{goal.title}</CardTitle>
            </div>
            <div class="flex items-center gap-2">
              <PriorityIcon size={14} class={getPriorityColor(goal.priority)} />
              <Badge 
                variant={goal.priority === 'high' ? 'destructive' : goal.priority === 'medium' ? 'secondary' : 'default'}
                class="text-xs"
              >
                {goal.priority}
              </Badge>
            </div>
          </div>
          {#if goal.description}
            <p class="text-muted-foreground text-sm">{goal.description}</p>
          {/if}
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- Progress Bar -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">Progress</span>
              <span class="font-medium">{progressPercentage.toFixed(1)}%</span>
            </div>
            <Progress value={progressPercentage} class="h-2" />
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">
                {formatCurrency(goal.currentAmount)} of {formatCurrency(goal.targetAmount)}
              </span>
              <span class="text-muted-foreground">
                {formatCurrency(goal.targetAmount - goal.currentAmount)} remaining
              </span>
            </div>
          </div>

          <!-- Goal Details -->
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div class="text-muted-foreground">Target Date</div>
              <div class="font-medium">
                {new Date(goal.targetDate).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric', 
                  year: 'numeric' 
                })}
              </div>
              <div class="text-xs text-muted-foreground">
                {daysUntilTarget > 0 ? `${daysUntilTarget} days left` : 'Overdue'}
              </div>
            </div>
            <div>
              <div class="text-muted-foreground">Status</div>
              <div class="font-medium {getStatusColor(goal.status)}">
                {goal.status.charAt(0).toUpperCase() + goal.status.slice(1)}
              </div>
            </div>
          </div>

          <!-- Monthly Contribution Needed -->
          {#if daysUntilTarget > 0 && goal.status === 'active'}
            {@const monthlyContribution = (goal.targetAmount - goal.currentAmount) / Math.max(1, Math.ceil(daysUntilTarget / 30))}
            <div class="bg-muted/50 rounded-lg p-3">
              <div class="text-muted-foreground text-xs">Monthly contribution needed</div>
              <div class="text-primary font-semibold">
                {formatCurrency(monthlyContribution)}
              </div>
            </div>
          {/if}
        </CardContent>
      </Card>
      {/each}
    </div>

    <!-- Empty State -->
    {#if goals.length === 0}
    <Card class="border-border">
      <CardContent class="flex flex-col items-center justify-center py-12 text-center">
        <Target class="text-muted-foreground mb-4" size={48} />
        <h3 class="text-lg font-semibold mb-2">No Goals Set</h3>
        <p class="text-muted-foreground text-sm mb-4">
          Set your first financial goal to start tracking your progress
        </p>
        <Button onclick={onSetGoal}>
          <Plus class="mr-2" size={16} />
          Set Your First Goal
        </Button>
      </CardContent>
    </Card>
    {/if}
  {/if}
</div>

