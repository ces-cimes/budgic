<script lang="ts">
  import { onMount } from 'svelte';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import TabNavigation from '$lib/components/TabNavigation.svelte';
  import * as Card from '$lib/components/ui/card/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { DollarSign, Calendar, TrendingUp, AlertTriangle, CalendarDays, CalendarRange, CalendarCheck, Clock, Target, BarChart3 } from '@lucide/svelte';

  // State
  let dailyData = $state<any>(null);
  let isLoading = $state(true);

  // Tab navigation configuration
  const forecastTabs = [
    { id: 'overview', label: 'Overview', path: '/forecast', icon: BarChart3 },
    { id: 'daily', label: 'Daily', path: '/forecast/daily', icon: CalendarDays },
    { id: 'weekly', label: 'Weekly', path: '/forecast/weekly', icon: CalendarRange },
    { id: 'monthly', label: 'Monthly', path: '/forecast/monthly', icon: CalendarCheck }
  ];

  // Mock daily allowance data
  const mockDailyData = {
    allowance: 45.50,
    spent: 32.75,
    remaining: 12.75,
    projected: 38.20,
    trend: 'down',
    recommendations: [
      'Your spending is 8% below average today',
      'Consider treating yourself to a small reward',
      'Weekend spending typically increases by 25%'
    ],
    categories: [
      { name: 'Food', spent: 18.50, budget: 25.00, percentage: 74 },
      { name: 'Transport', spent: 8.25, budget: 12.00, percentage: 69 },
      { name: 'Entertainment', spent: 6.00, budget: 8.50, percentage: 71 }
    ]
  };

  onMount(() => {
    // Simulate loading
    setTimeout(() => {
      dailyData = mockDailyData;
      isLoading = false;
    }, 1000);
  });

  function getSpendingColor(percentage: number) {
    if (percentage >= 90) return 'text-red-500';
    if (percentage >= 75) return 'text-yellow-500';
    return 'text-green-500';
  }

  function getSpendingBgColor(percentage: number) {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  }
</script>

<PageLayout>
  {#snippet topBar()}
    <Header title="Daily Allowance" />
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
      <!-- Daily Summary -->
      <Card.Root class="p-6">
        <div class="flex items-center gap-4 mb-6">
          <DollarSign class="w-8 h-8 text-green-500" />
          <div>
            <h2 class="text-2xl font-semibold text-primary">Today's Allowance</h2>
            <p class="text-sm text-muted-foreground">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-6">
          <div class="text-center">
            <div class="text-3xl font-bold text-primary">${dailyData.allowance.toFixed(2)}</div>
            <div class="text-sm text-muted-foreground">Daily Budget</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-green-500">${dailyData.remaining.toFixed(2)}</div>
            <div class="text-sm text-muted-foreground">Remaining</div>
          </div>
        </div>
        
        <div class="mt-6">
          <div class="flex justify-between text-sm mb-2">
            <span class="text-muted-foreground">Spent: ${dailyData.spent.toFixed(2)}</span>
            <span class="text-muted-foreground">{(dailyData.spent / dailyData.allowance * 100).toFixed(1)}%</span>
          </div>
          <div class="w-full bg-muted rounded-full h-3">
            <div 
              class="h-3 rounded-full transition-all duration-300 {getSpendingBgColor(dailyData.spent / dailyData.allowance * 100)}" 
              style="width: {(dailyData.spent / dailyData.allowance * 100)}%"
            ></div>
          </div>
        </div>
      </Card.Root>

      <!-- Category Breakdown -->
      <Card.Root class="p-6">
        <h3 class="text-lg font-semibold text-primary mb-4">Category Breakdown</h3>
        <div class="space-y-4">
          {#each dailyData.categories as category (category.name)}
            <div class="space-y-2">
              <div class="flex justify-between items-center">
                <span class="font-medium text-primary">{category.name}</span>
                <div class="flex items-center gap-2">
                  <span class="text-sm text-muted-foreground">${category.spent.toFixed(2)} / ${category.budget.toFixed(2)}</span>
                  <Badge variant="outline" class="text-xs {getSpendingColor(category.percentage)}">
                    {category.percentage}%
                  </Badge>
                </div>
              </div>
              <div class="w-full bg-muted rounded-full h-2">
                <div 
                  class="h-2 rounded-full transition-all duration-300 {getSpendingBgColor(category.percentage)}" 
                  style="width: {category.percentage}%"
                ></div>
              </div>
            </div>
          {/each}
        </div>
      </Card.Root>

      <!-- Projections -->
      <Card.Root class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <TrendingUp class="w-6 h-6 text-blue-500" />
          <h3 class="text-lg font-semibold text-primary">Projections</h3>
        </div>
        
        <div class="space-y-4">
          <div class="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
            <div>
              <div class="font-medium text-primary">Projected Daily Spend</div>
              <div class="text-sm text-muted-foreground">Based on current patterns</div>
            </div>
            <div class="text-right">
              <div class="text-lg font-semibold text-primary">${dailyData.projected.toFixed(2)}</div>
              <div class="text-sm {dailyData.trend === 'down' ? 'text-green-500' : 'text-red-500'}">
                {dailyData.trend === 'down' ? '↓' : '↑'} vs average
              </div>
            </div>
          </div>
        </div>
      </Card.Root>

      <!-- Recommendations -->
      <Card.Root class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <AlertTriangle class="w-6 h-6 text-yellow-500" />
          <h3 class="text-lg font-semibold text-primary">Insights</h3>
        </div>
        
        <div class="space-y-3">
          {#each dailyData.recommendations as recommendation (recommendation)}
            <div class="flex items-start gap-3 p-3 bg-accent/50 rounded-lg">
              <div class="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
              <p class="text-sm text-muted-foreground">{recommendation}</p>
            </div>
          {/each}
        </div>
      </Card.Root>
    {/if}
  </div>
</PageLayout>
