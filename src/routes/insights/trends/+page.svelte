<script lang="ts">
  import { onMount } from 'svelte';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import TabNavigation from '$lib/components/TabNavigation.svelte';
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Badge from '$lib/components/ui/badge/index.ts';
  import { TrendingUp, TrendingDown, BarChart3, PieChart, Calendar, ChartBar, Bell, Award, Lightbulb } from '@lucide/svelte';

  // State
  let trends = $state<any[]>([]);
  let isLoading = $state(true);

  // Sidebar context for mobile detection
  const sidebar = Sidebar.useSidebar();

  // Tab navigation configuration
  const insightsTabs = [
    { id: 'alerts', label: 'Alerts', path: '/insights/alerts', icon: Bell },
    { id: 'badges', label: 'Badges', path: '/insights/badges', icon: Award },
    { id: 'trends', label: 'Trends', path: '/insights/trends', icon: TrendingUp },
    { id: 'tips', label: 'Tips', path: '/insights/tips', icon: Lightbulb }
  ];

  // Mock trends data
  const mockTrends = [
    {
      id: 1,
      title: 'Monthly Spending Trend',
      type: 'spending',
      trend: 'up',
      change: 12.5,
      period: 'vs last month',
      icon: TrendingUp,
      description: 'Your spending increased by 12.5% compared to last month',
      details: [
        { category: 'Food & Dining', change: 8.2, trend: 'up' },
        { category: 'Transportation', change: 15.7, trend: 'up' },
        { category: 'Entertainment', change: -5.3, trend: 'down' }
      ]
    },
    {
      id: 2,
      title: 'Savings Rate',
      type: 'savings',
      trend: 'up',
      change: 5.8,
      period: 'vs last month',
      icon: TrendingUp,
      description: 'Your savings rate improved by 5.8% this month',
      details: [
        { category: 'Emergency Fund', change: 12.1, trend: 'up' },
        { category: 'Investment', change: 3.2, trend: 'up' },
        { category: 'Vacation Fund', change: -2.1, trend: 'down' }
      ]
    },
    {
      id: 3,
      title: 'Category Distribution',
      type: 'distribution',
      trend: 'stable',
      change: 2.1,
      period: 'vs last month',
      icon: PieChart,
      description: 'Your spending distribution remained relatively stable',
      details: [
        { category: 'Housing', percentage: 35.2, trend: 'stable' },
        { category: 'Food', percentage: 18.7, trend: 'up' },
        { category: 'Transportation', percentage: 12.3, trend: 'down' },
        { category: 'Entertainment', percentage: 8.9, trend: 'stable' }
      ]
    }
  ];

  onMount(() => {
    // Simulate loading
    setTimeout(() => {
      trends = mockTrends;
      isLoading = false;
    }, 1000);
  });

  function getTrendColor(trend: string) {
    switch (trend) {
      case 'up': return 'text-green-500';
      case 'down': return 'text-red-500';
      case 'stable': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  }

  function getTrendIcon(trend: string) {
    switch (trend) {
      case 'up': return TrendingUp;
      case 'down': return TrendingDown;
      case 'stable': return BarChart3;
      default: return BarChart3;
    }
  }

  function formatChange(change: number) {
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  }
</script>

<PageLayout>
  {#snippet topBar()}
    <Header title="Trends Analysis" variant="with-tabs">
      <TabNavigation tabs={insightsTabs} />
    </Header>
  {/snippet}

  {#snippet bottomBar()}
    <!-- Mobile Navigation -->
    {#if sidebar.isMobile}
      <MobileNavigation />
    {/if}
  {/snippet}

  <div class="p-4 space-y-6">
    {#if isLoading}
      <div class="space-y-4">
        {#each Array(3) as _}
          <Card.Root class="p-6">
            <div class="animate-pulse">
              <div class="flex items-center gap-3 mb-4">
                <div class="w-8 h-8 bg-muted rounded"></div>
                <div class="h-5 bg-muted rounded w-1/3"></div>
              </div>
              <div class="h-4 bg-muted rounded w-2/3 mb-2"></div>
              <div class="h-3 bg-muted rounded w-1/4"></div>
            </div>
          </Card.Root>
        {/each}
      </div>
    {:else}
      {#each trends as trend (trend.id)}
        {@const TrendIcon = getTrendIcon(trend.trend)}
        {@const TrendMainIcon = trend.icon}
        <Card.Root class="p-6">
          <div class="flex items-start gap-4 mb-4">
            <div class="flex-shrink-0">
              <div class="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <TrendMainIcon class="w-5 h-5 text-primary" />
              </div>
            </div>
            
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-lg font-semibold text-primary">{trend.title}</h3>
                <div class="flex items-center gap-2">
                  <TrendIcon class="w-4 h-4 {getTrendColor(trend.trend)}" />
                  <span class="text-sm font-medium {getTrendColor(trend.trend)}">
                    {formatChange(trend.change)}
                  </span>
                </div>
              </div>
              
              <p class="text-sm text-muted-foreground mb-1">{trend.description}</p>
              <p class="text-xs text-muted-foreground">{trend.period}</p>
            </div>
          </div>

          <!-- Trend Details -->
          <div class="space-y-3">
            {#each trend.details as detail, index (index)}
              {@const DetailTrendIcon = getTrendIcon(detail.trend)}
              <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div class="flex items-center gap-3">
                  <div class="w-2 h-2 rounded-full bg-primary"></div>
                  <span class="text-sm font-medium text-primary">{detail.category}</span>
                </div>
                
                <div class="flex items-center gap-2">
                  {#if detail.change !== undefined}
                    <DetailTrendIcon class="w-3 h-3 {getTrendColor(detail.trend)}" />
                    <span class="text-sm {getTrendColor(detail.trend)}">
                      {formatChange(detail.change)}
                    </span>
                  {:else if detail.percentage !== undefined}
                    <span class="text-sm font-medium text-primary">
                      {detail.percentage.toFixed(1)}%
                    </span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <!-- Action Button -->
          <div class="mt-4 pt-4 border-t border-border">
            <button class="text-sm text-primary hover:text-primary/80 transition-colors">
              View detailed analysis →
            </button>
          </div>
        </Card.Root>
      {/each}
    {/if}

    <!-- Additional Insights -->
    <Card.Root class="p-6">
      <div class="flex items-center gap-3 mb-4">
        <Calendar class="w-6 h-6 text-primary" />
        <h3 class="text-lg font-semibold text-primary">Historical Comparison</h3>
      </div>
      
      <div class="grid grid-cols-2 gap-4 text-center">
        <div>
          <div class="text-2xl font-bold text-primary">Q3 2024</div>
          <div class="text-sm text-muted-foreground">vs Q2 2024</div>
          <div class="text-sm text-green-500 font-medium">+8.2%</div>
        </div>
        <div>
          <div class="text-2xl font-bold text-primary">YTD</div>
          <div class="text-sm text-muted-foreground">vs Last Year</div>
          <div class="text-sm text-red-500 font-medium">-3.1%</div>
        </div>
      </div>
    </Card.Root>
  </div>
</PageLayout>
