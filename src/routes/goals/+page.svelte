<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
  import { 
    Bell, 
    BarChart3, 
    Target, 
    CheckCircle,
    Plus
  } from '@lucide/svelte';
  
  // Shared components
  import { 
    TabHeader,
    TabContent,
    TabContentWrapper,
    type TabConfig
  } from '$lib/components/shared';
  
  // Goals-specific components
  import { 
    OverviewTab,
    ActiveTab,
    CompletedTab,
    type GoalsData,
    type FinancialGoal,
    type GoalProgress
  } from '$lib/components/goals';
  import { goalsService } from '$lib/components/goals/goals-service';
  
  // Services
  import { settingsService, userActionsService } from '$lib/core/services';

  // Tab configuration
  const goalsTabs: TabConfig[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'active', label: 'Active', icon: Target },
    { id: 'completed', label: 'Completed', icon: CheckCircle }
  ];

  // State
  let activeTab = $state('overview');
  let isLoading = $state(true);
  let userCurrency = $state<string>('USD');
  let goalsData = $state<GoalsData | null>(null);
  let activeGoals = $state<FinancialGoal[]>([]);
  let completedGoals = $state<FinancialGoal[]>([]);
  let error = $state<string | null>(null);

  // Sidebar context for mobile detection
  const sidebar = Sidebar.useSidebar();

  // Derived values
  const totalGoalsValue = $derived(activeGoals.reduce((sum, goal) => sum + goal.targetAmount, 0));
  const totalProgressValue = $derived(activeGoals.reduce((sum, goal) => sum + goal.currentAmount, 0));

  // Handle URL parameters for tab selection
  $effect(() => {
    const urlParams = new URLSearchParams($page.url.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && goalsTabs.some(tab => tab.id === tabParam)) {
      activeTab = tabParam;
    }
  });

  onMount(async () => {
    try {
      isLoading = true;
      error = null;

      // Load user currency preference
      userCurrency = await settingsService.getCurrency();

      // Load goals data
      await loadGoalsData();

      // Track user action
      await userActionsService.track('progress_viewed', {
        page: 'goals',
        activeTab,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load goals data';
      console.error('Error loading goals:', err);
    } finally {
      isLoading = false;
    }
  });

  async function loadGoalsData() {
    try {
      const [goalsDataResult, activeGoalsResult, completedGoalsResult] = await Promise.all([
        goalsService.getGoalsData(),
        goalsService.getActiveGoals(),
        goalsService.getCompletedGoals()
      ]);

      goalsData = goalsDataResult;
      activeGoals = activeGoalsResult;
      completedGoals = completedGoalsResult;

    } catch (err) {
      console.error('Error loading goals data:', err);
      throw err;
    }
  }

  function handleTabChange(tabId: string) {
    activeTab = tabId;
    // Update URL without causing navigation
    const url = new URL($page.url);
    url.searchParams.set('tab', tabId);
    goto(url.toString(), { replaceState: true, noScroll: true });
  }

  async function handleGoalAction(action: string, goalId: string) {
    try {
      // Track user action
      await userActionsService.track('budget_modified', {
        action,
        goalId,
        timestamp: new Date().toISOString()
      });

      // Reload data after action
      await loadGoalsData();
    } catch (err) {
      console.error('Error handling goal action:', err);
    }
  }

  function getTabIcon(tabId: string) {
    const tab = goalsTabs.find(t => t.id === tabId);
    return tab?.icon || BarChart3;
  }
</script>

<svelte:head>
  <title>Goals | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <Header 
      title="Goals" 
      variant="with-tabs"
      buttonProps={[
        {
          onclick: () => goto('/goals/add'),
          size: "sm",
          icon: Plus
        }
      ]}
    >
      <TabHeader
        tabs={goalsTabs}
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
      tabs={goalsTabs}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      class="flex-1"
    >
      {#snippet children()}
        <!-- Overview Tab -->
        <TabContent tabId="overview" isActive={activeTab === 'overview'} tabs={goalsTabs}>
          <OverviewTab 
            {goalsData}
            {activeGoals}
            {completedGoals}
            {userCurrency}
            onGoalAction={handleGoalAction}
          />
        </TabContent>

        <!-- Active Goals Tab -->
        <TabContent tabId="active" isActive={activeTab === 'active'} tabs={goalsTabs}>
          <ActiveTab 
            {activeGoals}
            {userCurrency}
            onGoalAction={handleGoalAction}
          />
        </TabContent>

        <!-- Completed Goals Tab -->
        <TabContent tabId="completed" isActive={activeTab === 'completed'} tabs={goalsTabs}>
          <CompletedTab 
            {completedGoals}
            {userCurrency}
            onGoalAction={handleGoalAction}
          />
        </TabContent>
      {/snippet}
    </TabContentWrapper>
  {/snippet}
</PageLayout>
