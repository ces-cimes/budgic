<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
  import * as Tabs from '$lib/components/ui/tabs/index.ts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  
  // Services
  import { insightsService, settingsService, userActionsService, transactionService, analyticsCoreService } from '$lib/core/services';
  import type { Insight } from '$lib/core/services/insights-service';
  import { formatMainCurrencyAmount } from '$lib/utils/currency-utils';
  
  // Icons
  import { 
    BarChart3, 
    TrendingUp, 
    PieChart, 
    GitCompare, 
    FileText, 
    Bell, 
    Filter,
    Calendar,
    Download
  } from '@lucide/svelte';

  // Tab configuration
  const analyzeTabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'trends', label: 'Trends', icon: TrendingUp },
    { id: 'categories', label: 'Categories', icon: PieChart },
    { id: 'compare', label: 'Compare', icon: GitCompare },
    { id: 'reports', label: 'Reports', icon: FileText }
  ];

  // State
  let activeTab = $state('overview');
  let isLoading = $state(true);
  let userCurrency = $state<string>('USD');
  let timeRange = $state<'week' | 'month' | 'quarter' | 'year'>('month');
  let insights = $state<Insight[]>([]);
  let transactions = $state<any[]>([]);
  let analytics = $state<any>(null);

  // Enhanced swipe-aware state
  let swipeProgress = $state(0); // -1 to 1 (left/right progress)
  let isDragging = $state(false);
  let dragStartX = $state(0);
  let currentDragX = $state(0);
  let activeTabIndex = $derived(analyzeTabs.findIndex(tab => tab.id === activeTab));

  // Touch tracking for compatibility
  let touchStartX = $state(0);
  let touchStartY = $state(0);
  let touchEndX = $state(0);
  let touchEndY = $state(0);

  // Calculate transform based on swipe progress
  let contentTransform = $state('translateX(0%)');
  
  // Update transform when activeTab or swipeProgress changes
  $effect(() => {
    // Calculate base offset as percentage of viewport (divide by number of tabs)
    const baseOffset = (-activeTabIndex * 100) / analyzeTabs.length;
    
    // Calculate swipe offset as percentage of viewport (divide by number of tabs)
    const swipeOffset = (swipeProgress * 100) / analyzeTabs.length;
    
    contentTransform = `translateX(${baseOffset + swipeOffset}%)`;
  });

  // Reference for tab container scrolling
  let tabContainer: HTMLDivElement;
  let contentContainer: HTMLDivElement;

  // Dynamic height tracking
  let tabHeights = $state<Record<string, number>>({});
  let currentContentHeight = $state('auto');

  // Sidebar context for mobile detection
  const sidebar = Sidebar.useSidebar();

  // Derived values
  const alertCount = $derived(insights.filter(i => i.severity === 'alert' || i.severity === 'warning').length);
  const criticalAlerts = $derived(insights.filter(i => i.severity === 'alert').length);
  
  // Calculate spending data
  const totalSpending = $derived(() => {
    const now = new Date();
    let startDate: Date;
    
    switch (timeRange) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStart, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    return transactions
      .filter(t => new Date(t.date) >= startDate && t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  });
  
  const savingsRate = $derived(() => {
    const income = transactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = Math.abs(totalSpending());
    return income > 0 ? ((income - expenses) / income) * 100 : 0;
  });

  onMount(async () => {
    try {
      // Load user currency preference
      userCurrency = await settingsService.getCurrency();
      
      // Load insights data
      await loadInsights();
      
      // Track user viewing analyze page
      await userActionsService.track('progress_viewed', {
        triggeredBy: 'user_initiated',
        categoriesViewed: ['analyze'],
        actionTaken: 'none'
      });
      
      // Measure tab heights after content is loaded
      setTimeout(() => {
        measureTabHeights();
      }, 100);
    } catch (error) {
      console.error('Error loading analyze data:', error);
    } finally {
      isLoading = false;
    }
  });

  // Reload data when time range changes
  $effect(() => {
    if (analytics !== null && !isLoading) {
      loadInsights();
    }
  });

  // Handle URL parameters for tab selection
  $effect(() => {
    const urlParams = new URLSearchParams($page.url.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && analyzeTabs.some(tab => tab.id === tabParam)) {
      activeTab = tabParam;
    }
  });

  // Auto-scroll active tab into view when activeTab changes
  $effect(() => {
    // Make this reactive to activeTab changes
    activeTab; // This makes the effect reactive to activeTab
    setTimeout(() => {
      scrollActiveTabIntoView();
    }, 50);
  });

  // Update content height when active tab changes
  $effect(() => {
    const height = tabHeights[activeTab];
    if (height) {
      currentContentHeight = `${height}px`;
    } else {
      currentContentHeight = 'auto';
    }
  });

  async function loadInsights() {
    try {
      const allInsights = insightsService.getInsights();
      insights = allInsights;
      
      // Load transactions for the current time range
      const allTransactions = await transactionService.getTransactions();
      transactions = allTransactions;
      
      // Load analytics data
      const now = new Date();
      let startDate: Date;
      let endDate = new Date();
      
      switch (timeRange) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'quarter':
          const quarterStart = Math.floor(now.getMonth() / 3) * 3;
          startDate = new Date(now.getFullYear(), quarterStart, 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      
      analytics = await analyticsCoreService.analyzeTransactions(
        startDate.toISOString(),
        endDate.toISOString()
      );
    } catch (error) {
      console.error('Error loading insights data:', error);
    }
  }

  function formatAmount(amount?: number) {
    if (amount === undefined) return '';
    return formatMainCurrencyAmount(amount, userCurrency);
  }

  function formatPercentage(percentage?: number) {
    if (percentage === undefined) return '';
    return `${Math.round(percentage * 100)}%`;
  }

  function formatTimestamp(timestamp: string) {
    const now = new Date();
    const alertTime = new Date(timestamp);
    const diff = now.getTime() - alertTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  }

  function getSeverityColor(severity: Insight['severity']) {
    switch (severity) {
      case 'alert': return 'border-destructive/50 bg-destructive/10';
      case 'warning': return 'border-warning/50 bg-warning/10';
      case 'success': return 'border-success/50 bg-success/10';
      case 'info': return 'border-info/50 bg-info/10';
      default: return 'border-border bg-muted/50';
    }
  }

  function getSeverityTextColor(severity: Insight['severity']) {
    switch (severity) {
      case 'alert': return 'text-destructive';
      case 'warning': return 'text-warning';
      case 'success': return 'text-success';
      case 'info': return 'text-info';
      default: return 'text-foreground';
    }
  }

  // Enhanced swipe gesture functions
  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    dragStartX = touch.clientX;
    currentDragX = touch.clientX;
    isDragging = true;
    swipeProgress = 0;
    
    // Keep original touch tracking for compatibility
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }

  function handleTouchMove(event: TouchEvent) {
    if (!isDragging) return;
    
    const touch = event.touches[0];
    currentDragX = touch.clientX;
    
    // Calculate movement deltas
    const deltaX = currentDragX - dragStartX;
    const deltaY = touch.clientY - touchStartY;
    
    // Minimum gesture threshold to prevent accidental horizontal movement
    const minGestureThreshold = 20; // pixels
    
    // Only start horizontal movement if horizontal movement is significantly more than vertical
    if (Math.abs(deltaX) > minGestureThreshold && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      // Calculate swipe progress relative to tab panel width
      const viewportWidth = window.innerWidth;
      swipeProgress = Math.max(-1, Math.min(1, deltaX / viewportWidth));
    } else {
      // Reset swipe progress if gesture is too small or more vertical than horizontal
      swipeProgress = 0;
    }
    
    // Keep original touch tracking for compatibility
    touchEndX = touch.clientX;
    touchEndY = touch.clientY;
  }

  function handleTouchEnd(event: TouchEvent) {
    if (!isDragging) return;
    
    isDragging = false;
    
    // Determine if we should switch tabs based on swipe threshold
    const threshold = 0.3;
    
    if (Math.abs(swipeProgress) > threshold) {
      // Switch to next/previous tab
      if (swipeProgress > 0) {
        // Swipe right - previous tab
        if (activeTabIndex > 0) {
          handleTabChange(analyzeTabs[activeTabIndex - 1].id);
        }
      } else {
        // Swipe left - next tab
        if (activeTabIndex < analyzeTabs.length - 1) {
          handleTabChange(analyzeTabs[activeTabIndex + 1].id);
        }
      }
    }
    
    // Reset swipe progress with smooth animation
    swipeProgress = 0;
  }

  function scrollActiveTabIntoView() {
    if (tabContainer) {
      // Try multiple selectors to find the active tab
      let activeTabElement = tabContainer.querySelector(`[data-state="active"]`) as HTMLElement;
      
      // Fallback: find by value attribute
      if (!activeTabElement) {
        activeTabElement = tabContainer.querySelector(`[value="${activeTab}"]`) as HTMLElement;
      }
      
      // Fallback: find by tab ID in the trigger
      if (!activeTabElement) {
        activeTabElement = tabContainer.querySelector(`[data-value="${activeTab}"]`) as HTMLElement;
      }
      
      if (activeTabElement) {
        // Use requestAnimationFrame to ensure DOM is updated
        requestAnimationFrame(() => {
          activeTabElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        });
      }
    }
  }

  function measureTabHeights() {
    if (contentContainer) {
      const tabPanels = contentContainer.querySelectorAll('.tab-panel');
      tabPanels.forEach((panel, index) => {
        const tabId = analyzeTabs[index]?.id;
        if (tabId && !tabHeights[tabId]) { // Only measure if not already measured
          // Use requestAnimationFrame to avoid layout thrashing
          requestAnimationFrame(() => {
            const contentHeight = panel.scrollHeight;
            tabHeights[tabId] = contentHeight;
          });
        }
      });
    }
  }

  function handleTabChange(tabId: string) {
    activeTab = tabId;
    // Update URL without causing navigation
    const url = new URL($page.url);
    url.searchParams.set('tab', tabId);
    goto(url.toString(), { replaceState: true, noScroll: true });
  }
</script>

<PageLayout>
  {#snippet topBar()}
    <Header 
      title="Analyze" 
      variant="with-tabs"
      buttonProps={[
        {
          text: `${alertCount} alerts`,
          variant: criticalAlerts > 0 ? "destructive" : "secondary",
          size: "sm",
          icon: Bell,
          disabled: true
        }
      ]}
    >
      <Tabs.Root value={activeTab} onValueChange={handleTabChange} class="w-full">
        <div 
          bind:this={tabContainer}
          class="overflow-x-auto scrollbar-hide border-t border-border"
          style="scrollbar-width: none; -ms-overflow-style: none;"
        >
          <Tabs.List class="w-full justify-start bg-transparent p-0 h-auto rounded-none">
            {#each analyzeTabs as tab (tab.id)}
              <Tabs.Trigger 
                value={tab.id}
                class="flex items-center gap-2 px-4 py-2 border-x-0 border-t-0 border-b-2 border-transparent rounded-none bg-transparent hover:bg-secondary/20 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none whitespace-nowrap transition-all"
              >
                {#if tab.icon}
                  <tab.icon class="w-4 h-4" />
                {/if}
                {tab.label}
              </Tabs.Trigger>
            {/each}
          </Tabs.List>
        </div>
      </Tabs.Root>
    </Header>
  {/snippet}

  {#snippet bottomBar()}
    <!-- Mobile Navigation -->
    {#if sidebar.isMobile}
      <MobileNavigation />
    {/if}
  {/snippet}

  <div 
    class="flex-1 overflow-hidden"
    bind:this={contentContainer}
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    style="height: {currentContentHeight}"
  >
    <!-- Swipe-aware content slider -->
    <div 
      class="tab-slider flex transition-transform duration-200 ease-out h-full"
      class:transition-none={isDragging}
      style="transform: {contentTransform}; width: {analyzeTabs.length * 100}%"
    >
      <!-- Overview Tab -->
      <div 
        class="tab-panel flex-shrink-0 h-full overflow-y-auto"
        style="width: {100 / analyzeTabs.length}%"
      >
        <div class="p-4 space-y-6">
          <!-- Quick Stats -->
          <div class="grid grid-cols-2 gap-4">
            <Card.Root class="p-4">
              <div class="flex items-center gap-3 mb-2">
                <BarChart3 class="w-5 h-5 text-primary" />
                <h3 class="font-semibold text-primary">Total Spending</h3>
              </div>
              <div class="text-2xl font-bold text-primary">{formatAmount(totalSpending())}</div>
              <div class="text-sm text-muted-foreground">This {timeRange}</div>
            </Card.Root>
            
            <Card.Root class="p-4">
              <div class="flex items-center gap-3 mb-2">
                <TrendingUp class="w-5 h-5 text-green-500" />
                <h3 class="font-semibold text-primary">Savings Rate</h3>
              </div>
              <div class="text-2xl font-bold text-green-500">{savingsRate().toFixed(1)}%</div>
              <div class="text-sm text-muted-foreground">{savingsRate() > 20 ? 'Above target' : 'Below target'}</div>
            </Card.Root>
          </div>

          <!-- Recent Alerts -->
          <Card.Root class="p-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-primary">Recent Alerts</h3>
              <Button variant="outline" size="sm">
                View All
              </Button>
            </div>
            
            {#if insights.length === 0}
              <div class="text-center py-8">
                <Bell class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h4 class="text-lg font-semibold text-primary mb-2">No alerts</h4>
                <p class="text-muted-foreground">You're all caught up!</p>
              </div>
            {:else}
              <div class="space-y-3">
                {#each insights.slice(0, 3) as insight (insight.id)}
                  <div class="flex items-center gap-3 p-3 {getSeverityColor(insight.severity)} rounded-lg">
                    <div class="flex-shrink-0">
                      <Bell class="w-4 h-4 {getSeverityTextColor(insight.severity)}" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <h4 class="font-medium {getSeverityTextColor(insight.severity)}">{insight.title}</h4>
                      <p class="text-sm text-muted-foreground">{insight.message}</p>
                    </div>
                    <Badge variant={insight.severity === 'alert' ? 'destructive' : 'secondary'} class="text-xs">
                      {insight.severity}
                    </Badge>
                  </div>
                {/each}
              </div>
            {/if}
          </Card.Root>

          <!-- Quick Actions -->
          <Card.Root class="p-4">
            <h3 class="font-semibold text-primary mb-4">Quick Actions</h3>
            <div class="grid grid-cols-2 gap-3">
              <Button variant="outline" class="h-auto p-4 flex flex-col items-center gap-2">
                <Download class="w-5 h-5" />
                <span class="text-sm">Export Report</span>
              </Button>
              <Button variant="outline" class="h-auto p-4 flex flex-col items-center gap-2">
                <Calendar class="w-5 h-5" />
                <span class="text-sm">Set Reminder</span>
              </Button>
            </div>
          </Card.Root>
        </div>
      </div>

      <!-- Trends Tab -->
      <div 
        class="tab-panel flex-shrink-0 h-full overflow-y-auto"
        style="width: {100 / analyzeTabs.length}%"
      >
        <div class="p-4 space-y-6">
          <!-- Time Range Selector -->
          <div class="flex items-center gap-2">
            <Filter size={16} class="text-muted-foreground" />
            <span class="text-sm text-muted-foreground">Time range:</span>
            <div class="flex gap-1">
              {#each ['week', 'month', 'quarter', 'year'] as range}
                <Button 
                  variant={timeRange === range ? 'default' : 'outline'}
                  size="sm"
                  onclick={() => timeRange = range as typeof timeRange}
                >
                  {range.charAt(0).toUpperCase() + range.slice(1)}
                </Button>
              {/each}
            </div>
          </div>

          <!-- Trend Cards -->
          <div class="space-y-4">
            <Card.Root class="p-6">
              <div class="flex items-center gap-4 mb-4">
                <div class="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                  <TrendingUp class="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-primary">Spending Trend</h3>
                  <p class="text-sm text-muted-foreground">vs last {timeRange}</p>
                </div>
              </div>
              
              <div class="flex items-center justify-between">
                <div class="text-3xl font-bold text-red-500">+12.5%</div>
                <div class="text-sm text-muted-foreground">$2,847 → $3,203</div>
              </div>
            </Card.Root>

            <Card.Root class="p-6">
              <div class="flex items-center gap-4 mb-4">
                <div class="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                  <BarChart3 class="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-primary">Category Changes</h3>
                  <p class="text-sm text-muted-foreground">Top spending categories</p>
                </div>
              </div>
              
              <div class="space-y-3">
                <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span class="text-sm font-medium text-primary">Food & Dining</span>
                  <span class="text-sm text-red-500">+8.2%</span>
                </div>
                <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span class="text-sm font-medium text-primary">Transportation</span>
                  <span class="text-sm text-red-500">+15.7%</span>
                </div>
                <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span class="text-sm font-medium text-primary">Entertainment</span>
                  <span class="text-sm text-green-500">-5.3%</span>
                </div>
              </div>
            </Card.Root>
          </div>
        </div>
      </div>

      <!-- Categories Tab -->
      <div 
        class="tab-panel flex-shrink-0 h-full overflow-y-auto"
        style="width: {100 / analyzeTabs.length}%"
      >
        <div class="p-4 space-y-6">
          <!-- Category Overview -->
          <Card.Root class="p-6">
            <div class="flex items-center gap-4 mb-4">
              <div class="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <PieChart class="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 class="text-lg font-semibold text-primary">Spending by Category</h3>
                <p class="text-sm text-muted-foreground">Current month breakdown</p>
              </div>
            </div>
            
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-4 h-4 bg-blue-500 rounded"></div>
                  <span class="text-sm font-medium text-primary">Housing</span>
                </div>
                <div class="text-right">
                  <div class="text-sm font-semibold text-primary">$1,200</div>
                  <div class="text-xs text-muted-foreground">42.1%</div>
                </div>
              </div>
              
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-4 h-4 bg-green-500 rounded"></div>
                  <span class="text-sm font-medium text-primary">Food & Dining</span>
                </div>
                <div class="text-right">
                  <div class="text-sm font-semibold text-primary">$680</div>
                  <div class="text-xs text-muted-foreground">23.9%</div>
                </div>
              </div>
              
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-4 h-4 bg-yellow-500 rounded"></div>
                  <span class="text-sm font-medium text-primary">Transportation</span>
                </div>
                <div class="text-right">
                  <div class="text-sm font-semibold text-primary">$450</div>
                  <div class="text-xs text-muted-foreground">15.8%</div>
                </div>
              </div>
              
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-4 h-4 bg-purple-500 rounded"></div>
                  <span class="text-sm font-medium text-primary">Entertainment</span>
                </div>
                <div class="text-right">
                  <div class="text-sm font-semibold text-primary">$320</div>
                  <div class="text-xs text-muted-foreground">11.2%</div>
                </div>
              </div>
              
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-4 h-4 bg-red-500 rounded"></div>
                  <span class="text-sm font-medium text-primary">Other</span>
                </div>
                <div class="text-right">
                  <div class="text-sm font-semibold text-primary">$197</div>
                  <div class="text-xs text-muted-foreground">6.9%</div>
                </div>
              </div>
            </div>
          </Card.Root>

          <!-- Category Trends -->
          <Card.Root class="p-6">
            <h3 class="text-lg font-semibold text-primary mb-4">Category Trends</h3>
            <div class="space-y-4">
              <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div class="flex items-center gap-3">
                  <TrendingUp class="w-4 h-4 text-green-500" />
                  <span class="text-sm font-medium text-primary">Food & Dining</span>
                </div>
                <div class="text-sm text-green-500">+8.2%</div>
              </div>
              
              <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div class="flex items-center gap-3">
                  <TrendingUp class="w-4 h-4 text-red-500" />
                  <span class="text-sm font-medium text-primary">Transportation</span>
                </div>
                <div class="text-sm text-red-500">+15.7%</div>
              </div>
              
              <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div class="flex items-center gap-3">
                  <TrendingUp class="w-4 h-4 text-green-500" />
                  <span class="text-sm font-medium text-primary">Entertainment</span>
                </div>
                <div class="text-sm text-green-500">-5.3%</div>
              </div>
            </div>
          </Card.Root>
        </div>
      </div>

      <!-- Compare Tab -->
      <div 
        class="tab-panel flex-shrink-0 h-full overflow-y-auto"
        style="width: {100 / analyzeTabs.length}%"
      >
        <div class="p-4 space-y-6">
          <!-- Comparison Periods -->
          <div class="flex items-center gap-2 mb-4">
            <Filter size={16} class="text-muted-foreground" />
            <span class="text-sm text-muted-foreground">Compare:</span>
            <div class="flex gap-1">
              {#each ['month', 'quarter', 'year'] as period}
                <Button 
                  variant={timeRange === period ? 'default' : 'outline'}
                  size="sm"
                  onclick={() => timeRange = period as 'month' | 'quarter' | 'year'}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </Button>
              {/each}
            </div>
          </div>

          <!-- Comparison Cards -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card.Root class="p-6">
              <h3 class="text-lg font-semibold text-primary mb-4">Current {timeRange}</h3>
              <div class="space-y-3">
                <div class="flex justify-between">
                  <span class="text-sm text-muted-foreground">Total Spending</span>
                  <span class="text-sm font-semibold text-primary">$2,847</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-muted-foreground">Transactions</span>
                  <span class="text-sm font-semibold text-primary">127</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-muted-foreground">Avg. Transaction</span>
                  <span class="text-sm font-semibold text-primary">$22.42</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-muted-foreground">Savings Rate</span>
                  <span class="text-sm font-semibold text-green-500">23.5%</span>
                </div>
              </div>
            </Card.Root>

            <Card.Root class="p-6">
              <h3 class="text-lg font-semibold text-primary mb-4">Previous {timeRange}</h3>
              <div class="space-y-3">
                <div class="flex justify-between">
                  <span class="text-sm text-muted-foreground">Total Spending</span>
                  <span class="text-sm font-semibold text-primary">$2,531</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-muted-foreground">Transactions</span>
                  <span class="text-sm font-semibold text-primary">118</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-muted-foreground">Avg. Transaction</span>
                  <span class="text-sm font-semibold text-primary">$21.45</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-muted-foreground">Savings Rate</span>
                  <span class="text-sm font-semibold text-green-500">26.1%</span>
                </div>
              </div>
            </Card.Root>
          </div>

          <!-- Comparison Analysis -->
          <Card.Root class="p-6">
            <h3 class="text-lg font-semibold text-primary mb-4">Analysis</h3>
            <div class="space-y-4">
              <div class="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <div class="flex items-center gap-3">
                  <TrendingUp class="w-4 h-4 text-red-500" />
                  <span class="text-sm font-medium text-primary">Spending increased</span>
                </div>
                <span class="text-sm font-semibold text-red-500">+12.5%</span>
              </div>
              
              <div class="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div class="flex items-center gap-3">
                  <TrendingUp class="w-4 h-4 text-green-500" />
                  <span class="text-sm font-medium text-primary">Transaction count</span>
                </div>
                <span class="text-sm font-semibold text-green-500">+7.6%</span>
              </div>
              
              <div class="flex items-center justify-between p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <div class="flex items-center gap-3">
                  <TrendingUp class="w-4 h-4 text-yellow-500" />
                  <span class="text-sm font-medium text-primary">Savings rate</span>
                </div>
                <span class="text-sm font-semibold text-yellow-500">-2.6%</span>
              </div>
            </div>
          </Card.Root>
        </div>
      </div>

      <!-- Reports Tab -->
      <div 
        class="tab-panel flex-shrink-0 h-full overflow-y-auto"
        style="width: {100 / analyzeTabs.length}%"
      >
        <div class="p-4 space-y-6">
          <!-- Report Generation -->
          <Card.Root class="p-6">
            <div class="flex items-center gap-4 mb-4">
              <div class="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <FileText class="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 class="text-lg font-semibold text-primary">Generate Report</h3>
                <p class="text-sm text-muted-foreground">Create detailed financial reports</p>
              </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button variant="outline" class="h-auto p-4 flex flex-col items-center gap-2">
                <Download class="w-5 h-5" />
                <span class="text-sm font-medium">Monthly Summary</span>
                <span class="text-xs text-muted-foreground">PDF Export</span>
              </Button>
              
              <Button variant="outline" class="h-auto p-4 flex flex-col items-center gap-2">
                <BarChart3 class="w-5 h-5" />
                <span class="text-sm font-medium">Spending Analysis</span>
                <span class="text-xs text-muted-foreground">Detailed Charts</span>
              </Button>
              
              <Button variant="outline" class="h-auto p-4 flex flex-col items-center gap-2">
                <PieChart class="w-5 h-5" />
                <span class="text-sm font-medium">Category Report</span>
                <span class="text-xs text-muted-foreground">Breakdown by Category</span>
              </Button>
              
              <Button variant="outline" class="h-auto p-4 flex flex-col items-center gap-2">
                <TrendingUp class="w-5 h-5" />
                <span class="text-sm font-medium">Trend Report</span>
                <span class="text-xs text-muted-foreground">Historical Analysis</span>
              </Button>
            </div>
          </Card.Root>

          <!-- Recent Reports -->
          <Card.Root class="p-6">
            <h3 class="text-lg font-semibold text-primary mb-4">Recent Reports</h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div class="flex items-center gap-3">
                  <FileText class="w-4 h-4 text-primary" />
                  <div>
                    <div class="text-sm font-medium text-primary">Monthly Summary - November 2024</div>
                    <div class="text-xs text-muted-foreground">Generated 2 days ago</div>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <Download class="w-4 h-4" />
                </Button>
              </div>
              
              <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div class="flex items-center gap-3">
                  <BarChart3 class="w-4 h-4 text-primary" />
                  <div>
                    <div class="text-sm font-medium text-primary">Spending Analysis - Q3 2024</div>
                    <div class="text-xs text-muted-foreground">Generated 1 week ago</div>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <Download class="w-4 h-4" />
                </Button>
              </div>
              
              <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div class="flex items-center gap-3">
                  <PieChart class="w-4 h-4 text-primary" />
                  <div>
                    <div class="text-sm font-medium text-primary">Category Breakdown - October 2024</div>
                    <div class="text-xs text-muted-foreground">Generated 2 weeks ago</div>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <Download class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card.Root>

          <!-- Report Settings -->
          <Card.Root class="p-6">
            <h3 class="text-lg font-semibold text-primary mb-4">Report Settings</h3>
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm font-medium text-primary">Auto-generate monthly reports</div>
                  <div class="text-xs text-muted-foreground">Generate reports automatically at month end</div>
                </div>
                <Button variant="outline" size="sm">Enable</Button>
              </div>
              
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm font-medium text-primary">Email reports</div>
                  <div class="text-xs text-muted-foreground">Send reports to your email</div>
                </div>
                <Button variant="outline" size="sm">Configure</Button>
              </div>
              
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm font-medium text-primary">Report format</div>
                  <div class="text-xs text-muted-foreground">Choose default export format</div>
                </div>
                <Button variant="outline" size="sm">PDF</Button>
              </div>
            </div>
          </Card.Root>
        </div>
      </div>
    </div>
  </div>
</PageLayout>

<style>
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  
  .tab-slider {
    will-change: transform;
    transform: translateZ(0); /* Force GPU acceleration */
    contain: layout style paint; /* Optimize rendering */
  }
  
  .tab-panel {
    contain: layout style paint; /* Optimize rendering */
  }
</style>