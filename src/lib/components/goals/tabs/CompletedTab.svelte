<script lang="ts">
  import { goto } from '$app/navigation';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { 
    CheckCircle, 
    Calendar,
    DollarSign,
    TrendingUp,
    Award,
    Clock,
    Filter
  } from '@lucide/svelte';
  import { formatAmount } from '$lib/utils/currency-utils';
  import type { Goal } from '../types';

  interface Props {
    completedGoals: Goal[];
    userCurrency: string;
    onGoalAction: (action: string, goalId: string) => void;
  }

  let { completedGoals, userCurrency, onGoalAction }: Props = $props();

  let sortBy = $state<'date' | 'amount' | 'category'>('date');
  let filterBy = $state<string>('all');

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

  function getCategoryName(category: string) {
    const names: Record<string, string> = {
      'emergency_fund': 'Emergency Fund',
      'vacation': 'Vacation',
      'house_down_payment': 'House Down Payment',
      'car_purchase': 'Car Purchase',
      'education': 'Education',
      'retirement': 'Retirement',
      'debt_payoff': 'Debt Payoff',
      'wedding': 'Wedding',
      'home_improvement': 'Home Improvement',
      'investment': 'Investment',
      'other': 'Other'
    };
    return names[category] || category;
  }

  function getDaysToComplete(goal: Goal) {
    if (!goal.completedAt || !goal.createdAt) return null;
    const completedDate = new Date(goal.completedAt);
    const createdDate = new Date(goal.createdAt);
    const timeDiff = completedDate.getTime() - createdDate.getTime();
    return Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
  }

  function getCompletionRate(goal: Goal) {
    if (!goal.completedAt || !goal.createdAt) return null;
    const daysToComplete = getDaysToComplete(goal);
    if (!daysToComplete) return null;
    
    // Calculate expected completion based on monthly contribution
    if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return null;
    
    const expectedDays = Math.ceil((goal.targetAmount / goal.monthlyContribution) * 30);
    return Math.round((expectedDays / daysToComplete) * 100);
  }

  function getSortedAndFilteredGoals() {
    let filtered = completedGoals;
    
    // Apply filter
    if (filterBy !== 'all') {
      filtered = filtered.filter(goal => goal.category === filterBy);
    }
    
    // Apply sort
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          const aDate = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          const bDate = b.completedAt ? new Date(b.completedAt).getTime() : 0;
          return bDate - aDate;
        case 'amount':
          return b.targetAmount - a.targetAmount;
        case 'category':
          return a.category.localeCompare(b.category);
        default:
          return 0;
      }
    });
  }

  function getTotalCompletedValue() {
    return completedGoals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  }

  function getAverageCompletionTime() {
    const completionTimes = completedGoals
      .map(goal => getDaysToComplete(goal))
      .filter(time => time !== null) as number[];
    
    if (completionTimes.length === 0) return null;
    return Math.round(completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length);
  }

  function getCategories() {
    const categories = [...new Set(completedGoals.map(goal => goal.category))];
    return categories.map(category => ({
      value: category,
      label: getCategoryName(category)
    }));
  }
</script>

<div class="p-6 space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold text-primary">Completed Goals</h2>
      <p class="text-muted-foreground">Celebrate your achievements</p>
    </div>
    
    {#if completedGoals.length > 0}
      <div class="flex items-center gap-2">
        <Button.Root variant="outline" size="sm">
          <Filter class="h-4 w-4 mr-2" />
          Filter
        </Button.Root>
      </div>
    {/if}
  </div>

  {#if completedGoals.length > 0}
    <!-- Stats Summary -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card.Root>
        <Card.Content class="p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-muted-foreground">Total Completed</p>
              <p class="text-2xl font-bold text-green-500">{completedGoals.length}</p>
            </div>
            <CheckCircle class="h-8 w-8 text-green-500" />
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Content class="p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-muted-foreground">Total Value</p>
              <p class="text-2xl font-bold text-primary">{formatAmount(getTotalCompletedValue(), userCurrency)}</p>
            </div>
            <DollarSign class="h-8 w-8 text-primary" />
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Content class="p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-muted-foreground">Avg. Time</p>
              <p class="text-2xl font-bold text-blue-500">
                {getAverageCompletionTime() ? `${getAverageCompletionTime()} days` : 'N/A'}
              </p>
            </div>
            <Clock class="h-8 w-8 text-blue-500" />
          </div>
        </Card.Content>
      </Card.Root>
    </div>

    <!-- Filters and Sort -->
    <Card.Root>
      <Card.Content class="p-4">
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-primary">Sort by:</span>
            <select 
              bind:value={sortBy}
              class="px-3 py-1 border border-input rounded-md bg-background text-sm"
            >
              <option value="date">Completion Date</option>
              <option value="amount">Amount</option>
              <option value="category">Category</option>
            </select>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-primary">Filter by:</span>
            <select 
              bind:value={filterBy}
              class="px-3 py-1 border border-input rounded-md bg-background text-sm"
            >
              <option value="all">All Categories</option>
              {#each getCategories() as category}
                <option value={category.value}>{category.label}</option>
              {/each}
            </select>
          </div>
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Completed Goals List -->
    <div class="space-y-4">
      {#each getSortedAndFilteredGoals() as goal (goal.id)}
        <Card.Root class="border-green-200 dark:border-green-800">
          <Card.Content class="p-6">
            <div class="space-y-4">
              <!-- Goal Header -->
              <div class="flex items-start justify-between">
                <div class="flex items-center space-x-4">
                  <div class="text-3xl">{getCategoryIcon(goal.category)}</div>
                  <div>
                    <div class="flex items-center gap-2 mb-1">
                      <h3 class="text-lg font-semibold text-primary">{goal.name}</h3>
                      <Badge class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        Completed
                      </Badge>
                    </div>
                    {#if goal.description}
                      <p class="text-sm text-muted-foreground">{goal.description}</p>
                    {/if}
                    <div class="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{getCategoryName(goal.category)}</span>
                      {#if goal.completedAt}
                        <span>Completed {new Date(goal.completedAt).toLocaleDateString()}</span>
                      {/if}
                    </div>
                  </div>
                </div>
                
                <div class="text-right">
                  <div class="text-2xl font-bold text-green-600">
                    {formatAmount(goal.targetAmount, goal.currency)}
                  </div>
                  <div class="flex items-center justify-end gap-1 text-green-600">
                    <Award class="h-4 w-4" />
                    <span class="text-sm font-medium">Achieved!</span>
                  </div>
                </div>
              </div>

              <!-- Completion Details -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-green-200 dark:border-green-800">
                <div class="flex items-center space-x-2">
                  <Calendar class="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div class="text-sm text-muted-foreground">Time to Complete</div>
                    <div class="font-medium text-primary">
                      {#if getDaysToComplete(goal)}
                        {getDaysToComplete(goal)} days
                      {:else}
                        Unknown
                      {/if}
                    </div>
                  </div>
                </div>

                <div class="flex items-center space-x-2">
                  <TrendingUp class="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div class="text-sm text-muted-foreground">Completion Rate</div>
                    <div class="font-medium text-primary">
                      {#if getCompletionRate(goal)}
                        {getCompletionRate(goal)}% of expected
                      {:else}
                        N/A
                      {/if}
                    </div>
                  </div>
                </div>

                <div class="flex items-center space-x-2">
                  <DollarSign class="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div class="text-sm text-muted-foreground">Monthly Contribution</div>
                    <div class="font-medium text-primary">
                      {goal.monthlyContribution ? formatAmount(goal.monthlyContribution, goal.currency) : 'Not tracked'}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Achievement Badge -->
              <div class="flex justify-center pt-4">
                <div class="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/20 rounded-full">
                  <Award class="h-5 w-5 text-green-600" />
                  <span class="text-sm font-medium text-green-700 dark:text-green-300">
                    Goal Achieved Successfully!
                  </span>
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
        <CheckCircle class="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h3 class="text-xl font-semibold text-primary mb-2">No Completed Goals Yet</h3>
        <p class="text-muted-foreground mb-6 max-w-md mx-auto">
          Complete your first goal to see it celebrated here. Every achievement is worth recognizing!
        </p>
        <Button.Root onclick={() => goto('/goals?tab=active')}>
          View Active Goals
        </Button.Root>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
