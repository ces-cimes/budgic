<script lang="ts">
  import { onMount } from 'svelte';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import TabNavigation from '$lib/components/TabNavigation.svelte';
  import * as Card from '$lib/components/ui/card/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Calendar, TrendingUp, Target, AlertTriangle, CheckCircle, CalendarDays, CalendarRange, CalendarCheck, Clock, BarChart3 } from '@lucide/svelte';

  // State
  let monthlyData = $state<any>(null);
  let isLoading = $state(true);

  // Tab navigation configuration
  const forecastTabs = [
    { id: 'overview', label: 'Overview', path: '/forecast', icon: BarChart3 },
    { id: 'daily', label: 'Daily', path: '/forecast/daily', icon: CalendarDays },
    { id: 'weekly', label: 'Weekly', path: '/forecast/weekly', icon: CalendarRange },
    { id: 'monthly', label: 'Monthly', path: '/forecast/monthly', icon: CalendarCheck }
  ];

  // Mock monthly planning data
  const mockMonthlyData = {
    currentMonth: {
      budget: 1200.00,
      spent: 856.75,
      remaining: 343.25,
      daysRemaining: 12,
      projectedTotal: 1050.50
    },
    categories: [
      { name: 'Housing', budget: 600.00, spent: 600.00, percentage: 100 },
      { name: 'Food', budget: 300.00, spent: 245.50, percentage: 82 },
      { name: 'Transportation', budget: 150.00, spent: 89.25, percentage: 60 },
      { name: 'Entertainment', budget: 100.00, spent: 67.00, percentage: 67 },
      { name: 'Utilities', budget: 50.00, spent: 45.00, percentage: 90 }
    ],
    goals: [
      { name: 'Emergency Fund', target: 500.00, current: 450.00, percentage: 90, status: 'on-track' },
      { name: 'Vacation Fund', target: 200.00, current: 150.00, percentage: 75, status: 'on-track' },
      { name: 'Investment', target: 300.00, current: 200.00, percentage: 67, status: 'behind' }
    ],
    insights: [
      'You\'re 12% under budget this month',
      'Housing costs are exactly on target',
      'Consider increasing investment allocation'
    ],
    upcomingExpenses: [
      { name: 'Car Insurance', amount: 120.00, due: '2024-01-15', category: 'Transportation' },
      { name: 'Internet Bill', amount: 65.00, due: '2024-01-20', category: 'Utilities' },
      { name: 'Gym Membership', amount: 45.00, due: '2024-01-25', category: 'Entertainment' }
    ]
  };

  onMount(() => {
    // Simulate loading
    setTimeout(() => {
      monthlyData = mockMonthlyData;
      isLoading = false;
    }, 1000);
  });

  function getCategoryColor(percentage: number) {
    if (percentage >= 100) return 'text-red-500';
    if (percentage >= 80) return 'text-yellow-500';
    return 'text-green-500';
  }

  function getCategoryBgColor(percentage: number) {
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  function getGoalStatusColor(status: string) {
    switch (status) {
      case 'on-track': return 'text-green-500';
      case 'behind': return 'text-red-500';
      case 'ahead': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  }

  function getGoalStatusIcon(status: string) {
    switch (status) {
      case 'on-track': return CheckCircle;
      case 'behind': return AlertTriangle;
      case 'ahead': return TrendingUp;
      default: return Target;
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

<PageLayout>
  {#snippet topBar()}
    <Header title="Monthly Planning" variant="with-tabs">
      <TabNavigation tabs={forecastTabs} />
    </Header>
  {/snippet}

  {#snippet bottomBar()}
    <!-- Mobile Navigation -->
    <MobileNavigation />
  {/snippet}

  <div class="p-4 space-y-6">
    {#if isLoading}
      <div class="space-y-4">
        <Card.Root class="p-6">
          <div class="animate-pulse">
            <div class="h-8 bg-muted rounded w-1/3 mb-4"></div>
            <div class="h-4 bg-muted rounded w-2/3 mb-2"></div>
            <div class="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </Card.Root>
      </div>
    {:else}
      <!-- Monthly Summary -->
      <Card.Root class="p-6">
        <div class="flex items-center gap-4 mb-6">
          <Calendar class="w-8 h-8 text-purple-500" />
          <div>
            <h2 class="text-2xl font-semibold text-primary">Monthly Budget</h2>
            <p class="text-sm text-muted-foreground">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        
        <div class="grid grid-cols-3 gap-4 mb-6">
          <div class="text-center">
            <div class="text-2xl font-bold text-primary">${monthlyData.currentMonth.budget.toFixed(2)}</div>
            <div class="text-sm text-muted-foreground">Monthly Budget</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-orange-500">${monthlyData.currentMonth.spent.toFixed(2)}</div>
            <div class="text-sm text-muted-foreground">Spent</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-500">${monthlyData.currentMonth.remaining.toFixed(2)}</div>
            <div class="text-sm text-muted-foreground">Remaining</div>
          </div>
        </div>
        
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-muted-foreground">Progress</span>
            <span class="text-muted-foreground">{(monthlyData.currentMonth.spent / monthlyData.currentMonth.budget * 100).toFixed(1)}%</span>
          </div>
          <div class="w-full bg-muted rounded-full h-3">
            <div 
              class="h-3 rounded-full transition-all duration-300 bg-primary" 
              style="width: {(monthlyData.currentMonth.spent / monthlyData.currentMonth.budget * 100)}%"
            ></div>
          </div>
        </div>
      </Card.Root>

      <!-- Category Breakdown -->
      <Card.Root class="p-6">
        <h3 class="text-lg font-semibold text-primary mb-4">Category Breakdown</h3>
        <div class="space-y-4">
          {#each monthlyData.categories as category (category.name)}
            <div class="space-y-2">
              <div class="flex justify-between items-center">
                <span class="font-medium text-primary">{category.name}</span>
                <div class="flex items-center gap-2">
                  <span class="text-sm text-muted-foreground">${category.spent.toFixed(2)} / ${category.budget.toFixed(2)}</span>
                  <Badge variant="outline" class="text-xs {getCategoryColor(category.percentage)}">
                    {category.percentage}%
                  </Badge>
                </div>
              </div>
              <div class="w-full bg-muted rounded-full h-2">
                <div 
                  class="h-2 rounded-full transition-all duration-300 {getCategoryBgColor(category.percentage)}" 
                  style="width: {Math.min(category.percentage, 100)}%"
                ></div>
              </div>
            </div>
          {/each}
        </div>
      </Card.Root>

      <!-- Financial Goals -->
      <Card.Root class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <Target class="w-6 h-6 text-blue-500" />
          <h3 class="text-lg font-semibold text-primary">Financial Goals</h3>
        </div>
        
        <div class="space-y-4">
          {#each monthlyData.goals as goal (goal.name)}
            <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div class="flex items-center gap-3">
                <svelte:component 
                  this={getGoalStatusIcon(goal.status)} 
                  class="w-5 h-5 {getGoalStatusColor(goal.status)}"
                />
                <div>
                  <div class="font-medium text-primary">{goal.name}</div>
                  <div class="text-sm text-muted-foreground">${goal.current.toFixed(2)} / ${goal.target.toFixed(2)}</div>
                </div>
              </div>
              <div class="text-right">
                <div class="text-sm font-medium {getGoalStatusColor(goal.status)}">{goal.percentage}%</div>
                <Badge variant="outline" class="text-xs {getGoalStatusColor(goal.status)}">
                  {goal.status}
                </Badge>
              </div>
            </div>
          {/each}
        </div>
      </Card.Root>

      <!-- Upcoming Expenses -->
      <Card.Root class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <AlertTriangle class="w-6 h-6 text-orange-500" />
          <h3 class="text-lg font-semibold text-primary">Upcoming Expenses</h3>
        </div>
        
        <div class="space-y-3">
          {#each monthlyData.upcomingExpenses as expense (expense.name)}
            <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <div class="font-medium text-primary">{expense.name}</div>
                <div class="text-sm text-muted-foreground">Due {formatDate(expense.due)} • {expense.category}</div>
              </div>
              <div class="text-right">
                <div class="font-semibold text-primary">${expense.amount.toFixed(2)}</div>
              </div>
            </div>
          {/each}
        </div>
      </Card.Root>

      <!-- Monthly Insights -->
      <Card.Root class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <TrendingUp class="w-6 h-6 text-green-500" />
          <h3 class="text-lg font-semibold text-primary">Monthly Insights</h3>
        </div>
        
        <div class="space-y-3">
          {#each monthlyData.insights as insight (insight)}
            <div class="flex items-start gap-3 p-3 bg-accent/50 rounded-lg">
              <div class="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
              <p class="text-sm text-muted-foreground">{insight}</p>
            </div>
          {/each}
        </div>
      </Card.Root>
    {/if}
  </div>
</PageLayout>
