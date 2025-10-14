<script lang="ts">
  import { onMount } from 'svelte';
  import { DollarSign, Calendar, TrendingUp, AlertTriangle, CheckCircle, Clock, RefreshCw } from '@lucide/svelte';
  import { planningService, type PlanningData, type DailyAllowance, type WeeklyProjection } from '$lib/core/services/planning-service';
  import { accountService } from '$lib/core/services/account-service';
  import { settingsService } from '$lib/core/services/settings-service';
  import { Progress } from '$lib/components/ui/progress/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
  import AddPlannedTransaction from '$lib/components/AddPlannedTransaction.svelte';
  import { formatAmount, formatTransactionAmount } from '$lib/utils/currency-utils';

  const { data } = $props<{ data: any }>();

  let planningData = $state<PlanningData | null>(null);
  let selectedAccountId = $state<string>('');
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let userCurrency = $state<string>('USD');

  // Sidebar context for mobile detection
  const sidebar = Sidebar.useSidebar();

  onMount(async () => {
    try {
      // Get user's preferred currency
      userCurrency = await settingsService.getCurrency();
      
      // Get the first active account for now
      const accounts = await accountService.getAccounts();
      const activeAccount = accounts.find(a => a.isActive);
      
      if (!activeAccount) {
        error = 'No active account found';
        return;
      }

      selectedAccountId = activeAccount.id;
      await loadPlanningData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load planning data';
    } finally {
      isLoading = false;
    }
  });

  async function loadPlanningData() {
    if (!selectedAccountId) return;
    
    try {
      isLoading = true;
      // Clear cache to ensure fresh data
      planningService.clearAccountCache(selectedAccountId);
      planningData = await planningService.getPlanningData(selectedAccountId);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load planning data';
    } finally {
      isLoading = false;
    }
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
    return `${start.getDate()}-${end.getDate()} ${start.toLocaleDateString('en-US', { month: 'short' })}`;
  }
</script>

<svelte:head>
  <title>Financial Planning | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet bottomBar()}
    <!-- Mobile Navigation -->
    {#if sidebar.isMobile}
      <MobileNavigation />
    {/if}
  {/snippet}

  <div class="container mx-auto px-4 py-4 max-w-3xl">
    <!-- Header -->
    <header class="mb-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-primary mb-1">Financial Planning</h1>
          <p class="text-sm text-muted-foreground">Track your daily allowance and weekly projections</p>
        </div>
        <button 
          onclick={loadPlanningData}
          disabled={isLoading}
          class="p-2 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
          title="Refresh data"
        >
          <RefreshCw size={16} class={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>
    </header>

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
    {:else if planningData}
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
            <Badge variant="secondary" class="text-xs">
              {planningData.dailyAllowance.confidenceLevel}
            </Badge>
          </div>

          <div class="space-y-3">
            <!-- Main Allowance -->
            <div class="text-center">
              <div class="text-3xl font-bold text-primary mb-1">
                {formatTransactionAmount(planningData.dailyAllowance.dailyAllowance, userCurrency)}
              </div>
              <div class="text-sm text-muted-foreground">per day</div>
            </div>

            <!-- Breakdown -->
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="bg-muted/50 rounded-lg p-3">
                <div class="text-muted-foreground">Available</div>
                <div class="font-semibold text-primary">
                  {formatTransactionAmount(planningData.dailyAllowance.availableAmount, userCurrency)}
                </div>
              </div>
              <div class="bg-muted/50 rounded-lg p-3">
                <div class="text-muted-foreground">This Week</div>
                <div class="font-semibold text-primary">
                  {formatTransactionAmount(planningData.dailyAllowance.weeklyAllowance, userCurrency)}
                </div>
              </div>
            </div>

            <!-- Days until next income -->
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">Days until next income:</span>
              <span class="font-medium text-primary">
                {planningData.dailyAllowance.daysUntilNextIncome}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Weekly Projections -->
      <section class="mb-6">
        <h2 class="text-lg font-semibold text-primary mb-3">Weekly Forecast</h2>
        <div class="space-y-3">
          {#each planningData.weeklyProjections.slice(0, 6) as week}
            {@const RiskIcon = getRiskIcon(week.riskLevel)}
            <div class="bg-card rounded-lg p-3 border border-border">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <RiskIcon size={14} class={getRiskColor(week.riskLevel)} />
                  <span class="font-medium text-primary">
                    Week {week.weekNumber}
                  </span>
                </div>
                <div class="text-sm text-muted-foreground">
                  {getWeekRange(week.weekStart, week.weekEnd)}
                </div>
              </div>

              <div class="grid grid-cols-3 gap-2 text-sm">
                <div class="text-left">
                  <div class="text-muted-foreground">Start</div>
                  <div class="font-medium">
                    {formatTransactionAmount(week.startingBalance, userCurrency)}
                  </div>
                </div>
                  <div class="text-center">
                    <div class="text-muted-foreground">Change</div>
                    <div class="font-medium {week.plannedIncome - week.plannedExpenses >= 0 ? 'text-success' : 'text-destructive'}">
                      {formatTransactionAmount(week.plannedIncome - week.plannedExpenses, userCurrency)}
                    </div>
                  </div>
                <div class="text-right">
                  <div class="text-muted-foreground">End</div>
                  <div class="font-medium {getRiskColor(week.riskLevel)}">
                    {formatTransactionAmount(week.endingBalance, userCurrency)}
                  </div>
                </div>
              </div>

              {#if week.transactions.length > 0}
                <div class="mt-2 pt-2 border-t border-border">
                  <div class="text-xs text-muted-foreground mb-1">Transactions:</div>
                  <div class="space-y-1">
                    {#each week.transactions.slice(0, 2) as transaction}
                      <div class="flex items-center justify-between text-xs">
                        <span class="truncate">{transaction.description || 'Transaction'}</span>
                        <span class="font-medium {transaction.type === 'income' ? 'text-success' : 'text-destructive'}">
                          {formatTransactionAmount(transaction.amount, userCurrency)}
                        </span>
                      </div>
                    {/each}
                    {#if week.transactions.length > 2}
                      <div class="text-xs text-muted-foreground">
                        +{week.transactions.length - 2} more
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>

      <!-- Insights & Recommendations -->
      {#if planningData.insights.length > 0}
        <section class="mb-6">
          <h2 class="text-lg font-semibold text-primary mb-3">Insights</h2>
          <div class="space-y-3">
            {#each planningData.insights as insight}
              <div class="bg-card rounded-lg p-3 border border-border">
                <div class="flex items-start gap-3">
                  <div class="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                    {#if insight.type === 'balance_warning'}
                      <AlertTriangle size={12} class="text-destructive" />
                    {:else if insight.type === 'income_timing'}
                      <Clock size={12} class="text-warning" />
                    {:else if insight.type === 'expense_optimization'}
                      <TrendingUp size={12} class="text-info" />
                    {:else}
                      <CheckCircle size={12} class="text-success" />
                    {/if}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-primary text-sm mb-1">
                      {insight.title}
                    </div>
                    <div class="text-xs text-muted-foreground mb-2">
                      {insight.description}
                    </div>
                    {#if insight.action}
                      <div class="text-xs text-primary font-medium">
                        💡 {insight.action}
                      </div>
                    {/if}
                    {#if insight.impact}
                      <div class="text-xs text-muted-foreground mt-1">
                        Impact: {formatCurrency(insight.impact)}
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Quick Actions -->
      <section class="mb-6">
        <h2 class="text-lg font-semibold text-primary mb-3">Quick Actions</h2>
        <div class="space-y-3">
          <AddPlannedTransaction 
            accountId={selectedAccountId} 
            onTransactionAdded={loadPlanningData} 
          />
          
          <button class="w-full p-3 bg-card rounded-lg border border-border hover:bg-accent transition-colors text-left">
            <div class="font-medium text-primary text-sm mb-1">Adjust Dates</div>
            <div class="text-xs text-muted-foreground">Optimize timing</div>
          </button>
        </div>
      </section>
    {/if}
  </div>
</PageLayout>