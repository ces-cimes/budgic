<script lang="ts">
  import { onMount } from 'svelte';
  import { DollarSign, Calendar, TrendingUp, AlertTriangle, CheckCircle, Clock, RefreshCw, ChevronLeft, ChevronRight } from '@lucide/svelte';
  import { planningService, type PlanningData, type DailyAllowance, type WeeklyProjection, type WeekKey, type WeekLoadingState } from '$lib/core/services/planning-service';
  import { accountService } from '$lib/core/services/account-service';
  import { settingsService } from '$lib/core/services/settings-service';
  import { Progress } from '$lib/components/ui/progress/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Button } from '$lib/components/ui/button/index.ts';
  import TabNavigation from '$lib/components/TabNavigation.svelte';
  import Header from '$lib/components/Header.svelte';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
  import AddPlannedTransaction from '$lib/components/AddPlannedTransaction.svelte';
  import { formatAmount, formatTransactionAmount } from '$lib/utils/currency-utils';

  const { data } = $props<{ data: any }>();

  let dailyAllowance = $state<DailyAllowance | null>(null);
  let selectedAccountId = $state<string>('');
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let userCurrency = $state<string>('USD');
  let firstDayOfWeek = $state<number>(1); // Default to Monday
  
  // Week navigation state
  let currentStartWeek = $state<Date>(new Date());
  let visibleWeeks = $state<WeeklyProjection[]>([]);
  let loadingWeeks = $state<Set<WeekKey>>(new Set());
  let weekErrors = $state<Map<WeekKey, string>>(new Map());
  
  // Interactive features state
  let selectedWeekId = $state<string | null>(null);
  let expandedTransactions = $state<Set<string>>(new Set());

  // Sidebar context for mobile detection
  const sidebar = Sidebar.useSidebar();

  // Tab navigation configuration
  const forecastTabs = [
    { id: 'overview', label: 'Overview', path: '/forecast', icon: Calendar },
    { id: 'daily', label: 'Daily', path: '/forecast/daily', icon: Clock },
    { id: 'weekly', label: 'Weekly', path: '/forecast/weekly', icon: Calendar },
    { id: 'monthly', label: 'Monthly', path: '/forecast/monthly', icon: Calendar }
  ];

  onMount(async () => {
    try {
      // Get user's preferred currency and first day of week
      userCurrency = await settingsService.getCurrency();
      const userPreferences = await settingsService.getUserPreferences();
      firstDayOfWeek = userPreferences?.firstDayOfWeek ?? 1;
      
      // Get the first active account for now
      const accounts = await accountService.getAccounts();
      const activeAccount = accounts.find(a => a.isActive);
      
      if (!activeAccount) {
        error = 'No active account found';
        return;
      }

      selectedAccountId = activeAccount.id;
      
      // Set current start week to the current week
      currentStartWeek = planningService.getWeekStart(new Date(), firstDayOfWeek);
      
      await loadDailyAllowance();
      await loadVisibleWeeks();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load planning data';
    } finally {
      isLoading = false;
    }
  });

  async function loadDailyAllowance() {
    if (!selectedAccountId) return;
    
    try {
      dailyAllowance = await planningService.calculateDailyAllowance(selectedAccountId);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load daily allowance';
    }
  }

  async function loadVisibleWeeks() {
    if (!selectedAccountId) return;
    
    const weekKeys = getWeekKeysForRange(currentStartWeek, 5);
    const newVisibleWeeks: WeeklyProjection[] = [];
    
    // Load each week individually
    for (const weekKey of weekKeys) {
      if (planningService.isWeekCached(weekKey)) {
        // Week is cached, get it immediately
        const cached = planningService.getCachedWeek(weekKey);
        if (cached) {
          newVisibleWeeks.push(cached.projection);
        }
      } else {
        // Week needs to be loaded
        loadingWeeks.add(weekKey);
        weekErrors.delete(weekKey);
        
        try {
          const projection = await planningService.getWeekProjection(selectedAccountId, weekKey);
          newVisibleWeeks.push(projection);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to load week';
          weekErrors.set(weekKey, errorMessage);
        } finally {
          loadingWeeks.delete(weekKey);
        }
      }
    }
    
    visibleWeeks = newVisibleWeeks;
  }

  function getWeekKeysForRange(startWeek: Date, count: number): WeekKey[] {
    const keys: WeekKey[] = [];
    for (let i = 0; i < count; i++) {
      const weekDate = planningService.addWeeks(startWeek, i);
      keys.push(planningService.getWeekKey(weekDate, firstDayOfWeek));
    }
    return keys;
  }

  function getRiskColor(riskLevel: string) {
    switch (riskLevel) {
      case 'safe': return 'text-success';
      case 'caution': return 'text-warning';
      case 'danger': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  }

  function getRiskIcon(riskLevel: string) {
    switch (riskLevel) {
      case 'safe': return CheckCircle;
      case 'caution': return AlertTriangle;
      case 'danger': return AlertTriangle;
      default: return Clock;
    }
  }

  function formatCurrency(amount: number): string {
    return formatAmount(amount, userCurrency);
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  }

  function getWeekRange(weekStart: string, weekEnd: string): string {
    const start = new Date(weekStart);
    const end = new Date(weekEnd);
    const currentYear = new Date().getFullYear();
    
    // If both dates are in the same month
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      const monthName = start.toLocaleDateString('en-US', { month: 'short' });
      const yearSuffix = start.getFullYear() !== currentYear ? ` ${start.getFullYear()}` : '';
      return `${start.getDate()}-${end.getDate()} ${monthName}${yearSuffix}`;
    } else {
      // If dates span across months but same year
      if (start.getFullYear() === end.getFullYear()) {
        const yearSuffix = start.getFullYear() !== currentYear ? ` ${start.getFullYear()}` : '';
        return `${start.getDate()} ${start.toLocaleDateString('en-US', { month: 'short' })} - ${end.getDate()} ${end.toLocaleDateString('en-US', { month: 'short' })}${yearSuffix}`;
      } else {
        // If dates span across years
        const startYearSuffix = start.getFullYear() !== currentYear ? ` ${start.getFullYear()}` : '';
        const endYearSuffix = end.getFullYear() !== currentYear ? ` ${end.getFullYear()}` : '';
        return `${start.getDate()} ${start.toLocaleDateString('en-US', { month: 'short' })}${startYearSuffix} - ${end.getDate()} ${end.toLocaleDateString('en-US', { month: 'short' })}${endYearSuffix}`;
      }
    }
  }

  // Week navigation functions
  async function goToPreviousWeek() {
    // Go to earlier weeks (subtract one week from start)
    currentStartWeek = planningService.subtractWeeks(currentStartWeek, 1);
    await loadVisibleWeeks();
  }

  async function goToNextWeek() {
    // Go to later weeks (add one week to start)
    currentStartWeek = planningService.addWeeks(currentStartWeek, 1);
    await loadVisibleWeeks();
  }

  async function goToCurrentWeek() {
    // Go to current week
    currentStartWeek = planningService.getWeekStart(new Date(), firstDayOfWeek);
    await loadVisibleWeeks();
  }

  function getVisibleWeekRange(): string {
    if (visibleWeeks.length === 0) return '';
    
    const firstWeek = visibleWeeks[0];
    const lastWeek = visibleWeeks[visibleWeeks.length - 1];
    
    const startDate = new Date(firstWeek.weekStart);
    const endDate = new Date(lastWeek.weekEnd);
    
    // Format the range
    if (startDate.getMonth() === endDate.getMonth()) {
      return `${startDate.getDate()}-${endDate.getDate()} ${startDate.toLocaleDateString('en-US', { month: 'short' })}`;
    } else {
      return `${startDate.getDate()} ${startDate.toLocaleDateString('en-US', { month: 'short' })} - ${endDate.getDate()} ${endDate.toLocaleDateString('en-US', { month: 'short' })}`;
    }
  }

  // Interactive functions
  function selectWeek(weekId: string) {
    selectedWeekId = selectedWeekId === weekId ? null : weekId;
  }

  function toggleTransactionExpansion(weekId: string) {
    const newSet = new Set(expandedTransactions);
    if (newSet.has(weekId)) {
      newSet.delete(weekId);
    } else {
      newSet.add(weekId);
    }
    expandedTransactions = newSet;
  }

  function getWeekId(week: WeeklyProjection): string {
    return `week-${week.weekNumber}-${week.weekStart}`;
  }

  function isCurrentWeek(week: WeeklyProjection): boolean {
    const today = new Date();
    const weekStart = new Date(week.weekStart);
    const weekEnd = new Date(week.weekEnd);
    
    return today >= weekStart && today <= weekEnd;
  }
</script>

<svelte:head>
  <title>Financial Planning | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <!-- Header -->
    <Header 
      title="Financial Planning"
      variant="with-tabs"
      buttonProps={[
        {
          text: "Refresh",
          onclick: async () => {
            await loadDailyAllowance();
            await loadVisibleWeeks();
          },
          disabled: isLoading,
          className: `p-2 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50 ${isLoading ? 'animate-spin' : ''}`,
          icon: RefreshCw
        }
      ]}
    >
      <TabNavigation tabs={forecastTabs} />
    </Header>
  {/snippet}

  {#snippet bottomBar()}
    <!-- Mobile Navigation -->
    {#if sidebar.isMobile}
      <MobileNavigation />
    {/if}
  {/snippet}


  {#if isLoading}
    <div class="flex items-center justify-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  {:else if error}
    <div class="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
      <div class="flex items-center gap-2 text-destructive">
        <AlertTriangle size={16} />
        <span class="font-medium">Error</span>
      </div>
      <p class="text-sm text-destructive mt-1">{error}</p>
    </div>
  {:else if dailyAllowance}
      <!-- Daily Allowance Card -->
      <section class="mb-6">
        <div class="bg-card rounded-xl p-4 shadow-sm border border-border">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <DollarSign class="text-primary" size={16} />
              </div>
              <h2 class="font-semibold text-primary">Daily Allowance</h2>
            </div>
            <Badge 
              variant={dailyAllowance.confidenceLevel === 'high' ? 'default' : dailyAllowance.confidenceLevel === 'medium' ? 'secondary' : 'destructive'} 
              class="text-xs"
            >
              {dailyAllowance.confidenceLevel}
            </Badge>
          </div>

          <div class="space-y-3">
            <!-- Main Allowance -->
            <div class="text-center">
              <div class="text-3xl font-bold text-primary mb-1">
                {formatTransactionAmount(dailyAllowance.dailyAllowance, userCurrency)}
              </div>
              <div class="text-sm text-muted-foreground">per day</div>
            </div>

            <!-- Breakdown -->
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="bg-muted/50 rounded-lg p-3">
                <div class="text-muted-foreground">Available</div>
                <div class="font-semibold text-primary">
                  {formatTransactionAmount(dailyAllowance.availableAmount, userCurrency)}
                </div>
              </div>
              <div class="bg-muted/50 rounded-lg p-3">
                <div class="text-muted-foreground">This Week</div>
                <div class="font-semibold text-primary">
                  {formatTransactionAmount(dailyAllowance.weeklyAllowance, userCurrency)}
                </div>
              </div>
            </div>

            <!-- Days until next income -->
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">Days until next income:</span>
              <span class="font-medium text-primary">
                {dailyAllowance.daysUntilNextIncome}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Weekly Projections -->
      <section class="mb-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold text-primary">Weekly Forecast</h2>
          <div class="text-sm text-muted-foreground">
            {getVisibleWeekRange()}
          </div>
        </div>

        <!-- Week Navigation -->
        <div class="flex items-center gap-2 mb-4">
          <Button 
            variant="outline" 
            size="square" 
            onclick={goToPreviousWeek}
            class="h-10 w-10 touch-manipulation"
            title="Earlier weeks"
          >
            <ChevronLeft size={16} />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onclick={goToCurrentWeek}
            class="h-10 px-4 touch-manipulation flex-1"
            title="Go to current week"
          >
            <span class="hidden sm:inline">Current Week</span>
            <span class="sm:hidden">Current</span>
          </Button>
          <Button 
            variant="outline" 
            size="square" 
            onclick={goToNextWeek}
            class="h-10 w-10 touch-manipulation"
            title="Later weeks"
          >
            <ChevronRight size={16} />
          </Button>
        </div>

        <div class="space-y-3">
          {#each visibleWeeks as week, index}
            {@const RiskIcon = getRiskIcon(week.riskLevel)}
            {@const isCurrentWeekFlag = isCurrentWeek(week)}
            {@const netChange = week.plannedIncome - week.plannedExpenses}
            {@const weekId = getWeekId(week)}
            {@const isSelected = selectedWeekId === weekId}
            {@const isExpanded = expandedTransactions.has(weekId)}
            
            <div 
              class="bg-card rounded-lg p-3 border border-border hover:border-primary/30 transition-colors cursor-pointer touch-manipulation {isSelected ? 'border-primary/50 bg-primary/5' : ''}"
              onclick={() => selectWeek(weekId)}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && selectWeek(weekId)}
              title="Click to select week"
            >
              <!-- Week Header -->
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <RiskIcon size={14} class={getRiskColor(week.riskLevel)} />
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-primary">
                        {getWeekRange(week.weekStart, week.weekEnd)}
                      </span>
                      {#if isCurrentWeekFlag}
                        <Badge variant="secondary" class="text-xs px-2 py-0.5">Current</Badge>
                      {/if}
                    </div>
                  </div>
                </div>
                
                <!-- Risk Level Badge -->
                <Badge 
                  variant={week.riskLevel === 'safe' ? 'default' : week.riskLevel === 'caution' ? 'secondary' : 'destructive'}
                  class="text-xs"
                >
                  {week.riskLevel.charAt(0).toUpperCase() + week.riskLevel.slice(1)}
                </Badge>
              </div>

              <!-- Financial Summary -->
              <div class="grid grid-cols-3 gap-2 text-sm mb-2">
                <div class="text-left">
                  <div class="text-muted-foreground">Start</div>
                  <div class="font-medium">
                    {formatTransactionAmount(week.startingBalance, userCurrency)}
                  </div>
                </div>
                <div class="text-center">
                  <div class="text-muted-foreground">Change</div>
                  <div class="font-medium {netChange >= 0 ? 'text-success' : 'text-destructive'}">
                    {netChange >= 0 ? '+' : ''}{formatTransactionAmount(netChange, userCurrency)}
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-muted-foreground">End</div>
                  <div class="font-medium {getRiskColor(week.riskLevel)}">
                    {formatTransactionAmount(week.endingBalance, userCurrency)}
                  </div>
                </div>
              </div>

              <!-- Transactions Preview -->
              {#if week.transactions.length > 0}
                <div 
                  class="mt-2 border-t border-border {week.transactions.length > 3 ? 'cursor-pointer hover:bg-muted/50' : ''} rounded-md p-1 -m-1 transition-colors"
                  onclick={week.transactions.length > 3 ? (e) => { e.stopPropagation(); toggleTransactionExpansion(weekId); } : undefined}
                  role={week.transactions.length > 3 ? "button" : undefined}
                  {...(week.transactions.length > 3 ? { tabindex: 0, onkeydown: (e) => e.key === 'Enter' && toggleTransactionExpansion(weekId) } : {})}
                >
                  <div class="flex items-center justify-between mb-1">
                    <div class="text-xs text-muted-foreground">Transactions:</div>
                    <div class="flex items-center gap-1">
                      <div class="text-xs text-muted-foreground">
                        {week.transactions.length}
                      </div>
                      {#if week.transactions.length > 3}
                        <div class="text-xs text-muted-foreground transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}">
                          ▼
                        </div>
                      {/if}
                    </div>
                  </div>
                  
                  <div class="space-y-1">
                    {#each week.transactions.slice(0, isExpanded ? week.transactions.length : (week.transactions.length <= 3 ? week.transactions.length : 2)) as transaction}
                      <div class="flex items-center justify-between text-xs">
                        <span class="truncate">{transaction.description || 'Transaction'}</span>
                        <span class="font-medium {transaction.type === 'income' ? 'text-success' : 'text-destructive'}">
                          {formatTransactionAmount(transaction.amount, userCurrency)}
                        </span>
                      </div>
                    {/each}
                    {#if week.transactions.length > 3 && !isExpanded}
                      <div class="text-xs text-muted-foreground text-center py-0.5">
                        +{week.transactions.length - 2} more
                      </div>
                    {/if}
                  </div>
                </div>
              {:else}
                <div class="mt-2 pt-2 border-t border-border text-center">
                  <div class="text-xs text-muted-foreground">No planned transactions</div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>

      <!-- Insights & Recommendations -->
      <!-- TODO: Add insights back when implementing week-based insights -->
    {/if}
</PageLayout>