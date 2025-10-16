<script lang="ts">
  import { onMount } from 'svelte';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import TabNavigation from '$lib/components/TabNavigation.svelte';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Badge from '$lib/components/ui/badge/index.ts';
  import { Calendar, TrendingUp, TrendingDown, BarChart3, AlertCircle, CalendarDays, CalendarRange, CalendarCheck, Clock, Target } from '@lucide/svelte';

  // State
  let weeklyData = $state<any>(null);
  let isLoading = $state(true);

  // Tab navigation configuration
  const forecastTabs = [
    { id: 'overview', label: 'Overview', path: '/forecast', icon: BarChart3 },
    { id: 'daily', label: 'Daily', path: '/forecast/daily', icon: CalendarDays },
    { id: 'weekly', label: 'Weekly', path: '/forecast/weekly', icon: CalendarRange },
    { id: 'monthly', label: 'Monthly', path: '/forecast/monthly', icon: CalendarCheck }
  ];

  // Mock weekly projection data
  const mockWeeklyData = {
    currentWeek: {
      budget: 300.00,
      spent: 245.50,
      remaining: 54.50,
      daysRemaining: 2,
      projectedTotal: 280.75
    },
    lastWeek: {
      spent: 312.25,
      trend: 'down',
      change: -6.7
    },
    dailyBreakdown: [
      { day: 'Mon', spent: 42.50, budget: 50.00, percentage: 85 },
      { day: 'Tue', spent: 38.75, budget: 50.00, percentage: 78 },
      { day: 'Wed', spent: 51.25, budget: 50.00, percentage: 103 },
      { day: 'Thu', spent: 45.00, budget: 50.00, percentage: 90 },
      { day: 'Fri', spent: 67.00, budget: 50.00, percentage: 134 },
      { day: 'Sat', spent: 0, budget: 50.00, percentage: 0 },
      { day: 'Sun', spent: 0, budget: 50.00, percentage: 0 }
    ],
    insights: [
      'Friday spending is 34% above average',
      'Weekend spending typically increases by 25%',
      'You\'re on track to stay within budget this week'
    ]
  };

  onMount(() => {
    // Simulate loading
    setTimeout(() => {
      weeklyData = mockWeeklyData;
      isLoading = false;
    }, 1000);
  });

  function getDayColor(percentage: number) {
    if (percentage >= 100) return 'text-red-500';
    if (percentage >= 80) return 'text-yellow-500';
    return 'text-green-500';
  }

  function getDayBgColor(percentage: number) {
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  function getTrendIcon(trend: string) {
    return trend === 'up' ? TrendingUp : TrendingDown;
  }

  function getTrendColor(trend: string) {
    return trend === 'up' ? 'text-red-500' : 'text-green-500';
  }
</script>

<PageLayout>
  {#snippet topBar()}
    <Header title="Weekly Projections" />
  {/snippet}

  <!-- Tab Navigation -->
  <TabNavigation tabs={forecastTabs} />

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
      <!-- Weekly Summary -->
      <Card.Root class="p-6">
        <div class="flex items-center gap-4 mb-6">
          <Calendar class="w-8 h-8 text-blue-500" />
          <div>
            <h2 class="text-2xl font-semibold text-primary">This Week's Budget</h2>
            <p class="text-sm text-muted-foreground">Week of {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
          </div>
        </div>
        
        <div class="grid grid-cols-3 gap-4 mb-6">
          <div class="text-center">
            <div class="text-2xl font-bold text-primary">${weeklyData.currentWeek.budget.toFixed(2)}</div>
            <div class="text-sm text-muted-foreground">Weekly Budget</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-orange-500">${weeklyData.currentWeek.spent.toFixed(2)}</div>
            <div class="text-sm text-muted-foreground">Spent</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-500">${weeklyData.currentWeek.remaining.toFixed(2)}</div>
            <div class="text-sm text-muted-foreground">Remaining</div>
          </div>
        </div>
        
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-muted-foreground">Progress</span>
            <span class="text-muted-foreground">{(weeklyData.currentWeek.spent / weeklyData.currentWeek.budget * 100).toFixed(1)}%</span>
          </div>
          <div class="w-full bg-muted rounded-full h-3">
            <div 
              class="h-3 rounded-full transition-all duration-300 bg-primary" 
              style="width: {(weeklyData.currentWeek.spent / weeklyData.currentWeek.budget * 100)}%"
            ></div>
          </div>
        </div>
      </Card.Root>

      <!-- Daily Breakdown -->
      <Card.Root class="p-6">
        <h3 class="text-lg font-semibold text-primary mb-4">Daily Breakdown</h3>
        <div class="space-y-3">
          {#each weeklyData.dailyBreakdown as day (day.day)}
            <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div class="flex items-center gap-3">
                <div class="w-8 text-sm font-medium text-primary">{day.day}</div>
                <div class="flex-1">
                  <div class="flex justify-between text-sm mb-1">
                    <span class="text-muted-foreground">${day.spent.toFixed(2)} / ${day.budget.toFixed(2)}</span>
                    <span class="{getDayColor(day.percentage)}">{day.percentage}%</span>
                  </div>
                  <div class="w-full bg-muted rounded-full h-2">
                    <div 
                      class="h-2 rounded-full transition-all duration-300 {getDayBgColor(day.percentage)}" 
                      style="width: {Math.min(day.percentage, 100)}%"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </Card.Root>

      <!-- Comparison & Projections -->
      <Card.Root class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <BarChart3 class="w-6 h-6 text-purple-500" />
          <h3 class="text-lg font-semibold text-primary">Comparison & Projections</h3>
        </div>
        
        <div class="space-y-4">
          <div class="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
            <div>
              <div class="font-medium text-primary">vs Last Week</div>
              <div class="text-sm text-muted-foreground">Spending comparison</div>
            </div>
            <div class="flex items-center gap-2">
              <svelte:component 
                this={getTrendIcon(weeklyData.lastWeek.trend)} 
                class="w-4 h-4 {getTrendColor(weeklyData.lastWeek.trend)}"
              />
              <span class="text-sm font-medium {getTrendColor(weeklyData.lastWeek.trend)}">
                {weeklyData.lastWeek.change > 0 ? '+' : ''}{weeklyData.lastWeek.change.toFixed(1)}%
              </span>
            </div>
          </div>
          
          <div class="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
            <div>
              <div class="font-medium text-primary">Projected Total</div>
              <div class="text-sm text-muted-foreground">End of week estimate</div>
            </div>
            <div class="text-right">
              <div class="text-lg font-semibold text-primary">${weeklyData.currentWeek.projectedTotal.toFixed(2)}</div>
              <div class="text-sm text-muted-foreground">{weeklyData.currentWeek.daysRemaining} days left</div>
            </div>
          </div>
        </div>
      </Card.Root>

      <!-- Insights -->
      <Card.Root class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <AlertCircle class="w-6 h-6 text-yellow-500" />
          <h3 class="text-lg font-semibold text-primary">Weekly Insights</h3>
        </div>
        
        <div class="space-y-3">
          {#each weeklyData.insights as insight (insight)}
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
