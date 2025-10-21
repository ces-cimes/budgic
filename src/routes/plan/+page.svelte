<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
  import { Button } from '$lib/components/ui/button/index.ts';
  import { 
    Bell, 
    BarChart3, 
    TrendingUp, 
    Target,
    Lightbulb,
    Calendar
  } from '@lucide/svelte';
  
  // Plan components
  import { 
    TabHeader,
    TabContent,
    TabContentWrapper,
    OverviewTab,
    ProjectionsTab,
    GoalsTab,
    InsightsTab,
    type TabConfig,
    type PlanningInsight,
    type PlanningData,
    type DailyAllowance,
    type WeeklyProjection
  } from '$lib/components/plan';
  import { planService } from '$lib/components/plan/plan-service';
  
  // Services
  import { settingsService, userActionsService } from '$lib/core/services';

  // Tab configuration
  const planTabs: TabConfig[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'projections', label: 'Projections', icon: TrendingUp },
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'insights', label: 'Insights', icon: Lightbulb }
  ];

  // State
  let activeTab = $state('overview');
  let isLoading = $state(true);
  let userCurrency = $state<string>('USD');
  let selectedAccountId = $state<string>('');
  let dailyAllowance = $state<DailyAllowance | null>(null);
  let weeklyProjections = $state<WeeklyProjection[]>([]);
  let planningInsights = $state<PlanningInsight[]>([]);
  let planningData = $state<PlanningData | null>(null);
  let error = $state<string | null>(null);

  // Sidebar context for mobile detection
  const sidebar = Sidebar.useSidebar();

  // Derived values
  const alertCount = $derived(planningInsights.filter(i => i.priority === 'high').length);
  const criticalAlerts = $derived(planningInsights.filter(i => i.type === 'balance_warning').length);
  
  // Calculate planning metrics
  const totalPlannedIncome = $derived(() => {
    return planningData?.totalPlannedIncome || 0;
  });
  
  const totalPlannedExpenses = $derived(() => {
    return planningData?.totalPlannedExpenses || 0;
  });

  const netProjectedChange = $derived(() => {
    return planningData?.netProjectedChange || 0;
  });

  onMount(async () => {
    try {
      // Load user currency preference
      userCurrency = await settingsService.getCurrency();
      
      // Get the first active account for now
      const accounts = await planService.getAccounts();
      const activeAccount = accounts.find((a) => a.isActive);

      if (!activeAccount) {
        error = 'No active account found';
        return;
      }

      selectedAccountId = activeAccount.id;
      
      // Load planning data
      await loadPlanningData();
      
      // Track user viewing plan page
      await userActionsService.track('progress_viewed', {
        triggeredBy: 'user_initiated',
        categoriesViewed: ['plan'],
        actionTaken: 'none'
      });
    } catch (error) {
      console.error('Error loading plan data:', error);
      error = error instanceof Error ? error.message : 'Failed to load planning data';
    } finally {
      isLoading = false;
    }
  });

  // Reload data when account changes
  $effect(() => {
    if (selectedAccountId && !isLoading) {
      loadPlanningData();
    }
  });

  // Handle URL parameters for tab selection
  $effect(() => {
    const urlParams = new URLSearchParams($page.url.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && planTabs.some(tab => tab.id === tabParam)) {
      activeTab = tabParam;
    }
  });

  async function loadPlanningData() {
    if (!selectedAccountId) return;
    
    try {
      // Load comprehensive planning data
      planningData = await planService.getPlanningData(selectedAccountId);
      
      if (planningData) {
        dailyAllowance = planningData.dailyAllowance;
        weeklyProjections = planningData.weeklyProjections;
        planningInsights = planningData.insights;
      }
    } catch (error) {
      console.error('Error loading planning data:', error);
      error = error instanceof Error ? error.message : 'Failed to load planning data';
    }
  }

  function handleTabChange(tabId: string) {
    activeTab = tabId;
    // Update URL without causing navigation
    const url = new URL($page.url);
    url.searchParams.set('tab', tabId);
    goto(url.toString(), { replaceState: true, noScroll: true });
  }

  async function handleRefresh() {
    isLoading = true;
    try {
      await loadPlanningData();
    } finally {
      isLoading = false;
    }
  }

  async function handleAddPlannedTransaction() {
    console.log('Adding planned transaction...');
    // TODO: Implement planned transaction modal/page
  }

  async function handleSetGoal() {
    console.log('Setting financial goal...');
    // TODO: Implement goal setting modal/page
  }
</script>

<PageLayout>
  {#snippet topBar()}
    <Header 
      title="Plan" 
      variant="with-tabs"
      buttonProps={[
        {
          text: `${alertCount} alerts`,
          variant: criticalAlerts > 0 ? "destructive" : "secondary",
          size: "sm",
          icon: Bell,
          disabled: true
        },
        {
          onclick: handleRefresh,
          size: "sm",
          icon: Calendar,
          disabled: isLoading,
          className: isLoading ? 'animate-spin' : ''
        }
      ]}
    >
      <TabHeader
        tabs={planTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
    </Header>
  {/snippet}

  {#snippet bottomBar()}
    <!-- Mobile Navigation -->
    {#if sidebar.isMobile}
      <MobileNavigation />
    {/if}
  {/snippet}

  {#snippet children()}
    <TabContentWrapper
      tabs={planTabs}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      class="flex-1"
    >
      {#snippet children()}
        <TabContent tabId="overview" isActive={activeTab === 'overview'}>
          <OverviewTab
            dailyAllowance={dailyAllowance}
            totalPlannedIncome={totalPlannedIncome()}
            totalPlannedExpenses={totalPlannedExpenses()}
            netProjectedChange={netProjectedChange()}
            userCurrency={userCurrency}
            onAddPlannedTransaction={handleAddPlannedTransaction}
            onSetGoal={handleSetGoal}
          />
        </TabContent>
        
        <TabContent tabId="projections" isActive={activeTab === 'projections'}>
          <ProjectionsTab
            weeklyProjections={weeklyProjections}
            userCurrency={userCurrency}
            selectedAccountId={selectedAccountId}
            onRefresh={handleRefresh}
          />
        </TabContent>
        
        <TabContent tabId="goals" isActive={activeTab === 'goals'}>
          <GoalsTab
            userCurrency={userCurrency}
            selectedAccountId={selectedAccountId}
            onSetGoal={handleSetGoal}
          />
        </TabContent>
        
        <TabContent tabId="insights" isActive={activeTab === 'insights'}>
          <InsightsTab
            insights={planningInsights}
            userCurrency={userCurrency}
            onRefresh={handleRefresh}
          />
        </TabContent>
      {/snippet}
    </TabContentWrapper>
  {/snippet}
</PageLayout>

