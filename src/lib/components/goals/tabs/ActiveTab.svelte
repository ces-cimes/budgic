<script lang="ts">
  import { goto } from '$app/navigation';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Progress } from '$lib/components/ui/progress/index.ts';
  import { 
    Target, 
    Plus,
    Edit,
    MoreHorizontal,
    Calendar,
    DollarSign,
    TrendingUp,
    Clock,
    AlertCircle,
    CheckCircle
  } from '@lucide/svelte';
  import { formatAmount } from '$lib/utils/currency-utils';
  import type { FinancialGoal } from '../types';

  interface Props {
    activeGoals: FinancialGoal[];
    userCurrency: string;
    onGoalAction: (action: string, goalId: string) => void;
  }

  let { activeGoals, userCurrency, onGoalAction }: Props = $props();

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

  function getStatusIcon(status: string) {
    switch (status) {
      case 'active': return Clock;
      case 'paused': return AlertCircle;
      default: return Target;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'active': return 'text-green-500';
      case 'paused': return 'text-yellow-500';
      default: return 'text-muted-foreground';
    }
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

  function getEstimatedCompletionDate(goal: FinancialGoal) {
    if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return null;
    
    const remainingAmount = goal.targetAmount - goal.currentAmount;
    const monthsRemaining = Math.ceil(remainingAmount / goal.monthlyContribution);
    
    const completionDate = new Date();
    completionDate.setMonth(completionDate.getMonth() + monthsRemaining);
    
    return completionDate;
  }

  function handleAddProgress(goalId: string) {
    onGoalAction('add_progress', goalId);
  }

  function handleEditGoal(goalId: string) {
    onGoalAction('edit', goalId);
  }

  function handleCompleteGoal(goalId: string) {
    onGoalAction('complete', goalId);
  }

  function handlePauseGoal(goalId: string) {
    onGoalAction('pause', goalId);
  }

  function handleResumeGoal(goalId: string) {
    onGoalAction('resume', goalId);
  }

  function handleDeleteGoal(goalId: string) {
    onGoalAction('delete', goalId);
  }
</script>

<div class="p-6 space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold text-primary">Active Goals</h2>
      <p class="text-muted-foreground">Manage your current financial goals</p>
    </div>
    <Button.Root onclick={() => goto('/goals/add')}>
      <Plus class="h-4 w-4 mr-2" />
      Add Goal
    </Button.Root>
  </div>

  {#if activeGoals.length > 0}
    <!-- Goals List -->
    <div class="space-y-4">
      {#each activeGoals as goal (goal.id)}
        <Card.Root>
          <Card.Content class="p-6">
            <div class="space-y-4">
              <!-- Goal Header -->
              <div class="flex items-start justify-between">
                <div class="flex items-center space-x-4">
                  <div class="text-3xl">{getCategoryIcon(goal.category)}</div>
                  <div>
                    <div class="flex items-center gap-2 mb-1">
                      <h3 class="text-lg font-semibold text-primary">{goal.name}</h3>
                      <Badge class={getPriorityColor(goal.priority)}>
                        {goal.priority}
                      </Badge>
                    </div>
                    {#if goal.description}
                      <p class="text-sm text-muted-foreground">{goal.description}</p>
                    {/if}
                  </div>
                </div>
                
                <div class="flex items-center gap-2">
                  {#if goal.status === 'active'}
                    <Button.Root 
                      variant="outline" 
                      size="sm"
                      onclick={() => handleAddProgress(goal.id)}
                    >
                      <Plus class="h-4 w-4 mr-1" />
                      Add Progress
                    </Button.Root>
                  {/if}
                  
                  <Button.Root variant="ghost" size="sm">
                    <MoreHorizontal class="h-4 w-4" />
                  </Button.Root>
                </div>
              </div>

              <!-- Progress Section -->
              <div class="space-y-3">
                <div class="flex justify-between text-sm">
                  <span class="text-muted-foreground">Progress</span>
                  <span class="font-medium text-primary">
                    {formatAmount(goal.currentAmount, goal.currency)} / {formatAmount(goal.targetAmount, goal.currency)}
                  </span>
                </div>
                
                <div class="space-y-2">
                  <Progress 
                    value={(goal.currentAmount / goal.targetAmount) * 100} 
                    class="h-3"
                  />
                  <div class="flex justify-between text-sm">
                    <span class="text-muted-foreground">0%</span>
                    <span class="font-semibold {getProgressColor((goal.currentAmount / goal.targetAmount) * 100)}">
                      {((goal.currentAmount / goal.targetAmount) * 100).toFixed(1)}%
                    </span>
                    <span class="text-muted-foreground">100%</span>
                  </div>
                </div>
              </div>

              <!-- Goal Details -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                <div class="flex items-center space-x-2">
                  <DollarSign class="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div class="text-sm text-muted-foreground">Monthly Contribution</div>
                    <div class="font-medium text-primary">
                      {goal.monthlyContribution ? formatAmount(goal.monthlyContribution, goal.currency) : 'Not set'}
                    </div>
                  </div>
                </div>

                <div class="flex items-center space-x-2">
                  <Calendar class="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div class="text-sm text-muted-foreground">Target Date</div>
                    <div class="font-medium text-primary">
                      {goal.targetDate ? new Date(goal.targetDate).toLocaleDateString() : 'Not set'}
                    </div>
                  </div>
                </div>

                <div class="flex items-center space-x-2">
                  <TrendingUp class="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div class="text-sm text-muted-foreground">Est. Completion</div>
                    <div class="font-medium text-primary">
                      {#if goal.monthlyContribution && goal.monthlyContribution > 0}
                        {@const estCompletion = getEstimatedCompletionDate(goal)}
                        {estCompletion ? estCompletion.toLocaleDateString() : 'Calculating...'}
                      {:else}
                        Not available
                      {/if}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Status and Actions -->
              <div class="flex items-center justify-between pt-4 border-t">
                <div class="flex items-center space-x-2">
                  {#if goal.status === 'active'}
                    {@const StatusIcon = Clock}
                    <StatusIcon class="h-4 w-4 text-green-500" />
                    <span class="text-sm text-green-600 font-medium">Active</span>
                  {:else if goal.status === 'paused'}
                    {@const StatusIcon = AlertCircle}
                    <StatusIcon class="h-4 w-4 text-yellow-500" />
                    <span class="text-sm text-yellow-600 font-medium">Paused</span>
                  {/if}
                  
                  {#if goal.targetDate}
                    {@const daysLeft = getDaysUntilTarget(goal.targetDate)}
                    {#if daysLeft !== null}
                      <span class="text-xs text-muted-foreground">
                        {daysLeft > 0 ? `${daysLeft} days left` : 'Overdue'}
                      </span>
                    {/if}
                  {/if}
                </div>

                <div class="flex items-center gap-2">
                  <Button.Root 
                    variant="outline" 
                    size="sm"
                    onclick={() => handleEditGoal(goal.id)}
                  >
                    <Edit class="h-4 w-4 mr-1" />
                    Edit
                  </Button.Root>
                  
                  {#if goal.status === 'active'}
                    <Button.Root 
                      variant="outline" 
                      size="sm"
                      onclick={() => handlePauseGoal(goal.id)}
                    >
                      Pause
                    </Button.Root>
                  {:else if goal.status === 'paused'}
                    <Button.Root 
                      variant="outline" 
                      size="sm"
                      onclick={() => handleResumeGoal(goal.id)}
                    >
                      Resume
                    </Button.Root>
                  {/if}
                  
                  <Button.Root 
                    variant="outline" 
                    size="sm"
                    onclick={() => handleCompleteGoal(goal.id)}
                  >
                    <CheckCircle class="h-4 w-4 mr-1" />
                    Complete
                  </Button.Root>
                </div>
              </div>
            </div>
          </Card.Content>
        </Card.Root>
      {/each}
    </div>
  {:else}
    <!-- Empty State -->
    <Card.Root>
      <Card.Content class="p-12 text-center">
        <Target class="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h3 class="text-xl font-semibold text-primary mb-2">No Active Goals</h3>
        <p class="text-muted-foreground mb-6 max-w-md mx-auto">
          Start your financial journey by creating your first goal. Whether it's building an emergency fund, 
          saving for a vacation, or planning for retirement, every goal matters.
        </p>
        <Button.Root onclick={() => goto('/goals/add')}>
          <Plus class="h-4 w-4 mr-2" />
          Create Your First Goal
        </Button.Root>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
