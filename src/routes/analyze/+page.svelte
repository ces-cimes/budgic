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
    PieChart, 
    GitCompare, 
    FileText 
  } from '@lucide/svelte';
  
  // Analyze components
  import { 
    TabHeader,
    TabContent,
    TabContentWrapper,
    OverviewTab,
    TrendsTab,
    CategoriesTab,
    CompareTab,
    ReportsTab,
    type TabConfig,
    type Insight,
    type AnalyticsData,
    type CategoryData,
    type PeriodData,
    type Report,
    type ReportSettings,
    type ReportType
  } from '$lib/components/analyze';
  import { analyzeService } from '$lib/components/analyze/analyze-service';
  
  // Services
  import { settingsService, userActionsService } from '$lib/core/services';

  // Tab configuration
  const analyzeTabs: TabConfig[] = [
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
  let analytics = $state<AnalyticsData | null>(null);
  let categoryData = $state<CategoryData[]>([]);
  let currentPeriodData = $state<PeriodData>({
    totalSpending: 0,
    transactionCount: 0,
    averageTransaction: 0,
    savingsRate: 0
  });
  let previousPeriodData = $state<PeriodData>({
    totalSpending: 0,
    transactionCount: 0,
    averageTransaction: 0,
    savingsRate: 0
  });
  let recentReports = $state<Report[]>([]);
  let reportSettings = $state<ReportSettings>({
    autoGenerate: false,
    emailReports: false,
    defaultFormat: 'PDF'
  });

  // Sidebar context for mobile detection
  const sidebar = Sidebar.useSidebar();

  // Derived values
  const alertCount = $derived(insights.filter(i => i.severity === 'alert' || i.severity === 'warning').length);
  const criticalAlerts = $derived(insights.filter(i => i.severity === 'alert').length);
  
  // Calculate spending data
  const totalSpending = $derived(() => {
    return analyzeService.calculateSpendingData(transactions, timeRange).totalSpending;
  });
  
  const savingsRate = $derived(() => {
    return analyzeService.calculateSpendingData(transactions, timeRange).savingsRate;
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

  async function loadInsights() {
    try {
      // Load insights
      insights = await analyzeService.loadInsights();
      
      // Load transactions
      transactions = await analyzeService.loadTransactions();
      
      // Load analytics data
      analytics = await analyzeService.loadAnalytics(timeRange);
      
      // Generate category data
      categoryData = analyzeService.generateCategoryData(transactions, timeRange);
      
      // Calculate period data for comparison
      const currentData = analyzeService.calculateSpendingData(transactions, timeRange);
      currentPeriodData = {
        ...currentData,
        transactionCount: transactions.length,
        averageTransaction: currentData.totalSpending / transactions.length || 0
      };
      
      // Mock previous period data (in real implementation, this would come from historical data)
      previousPeriodData = {
        totalSpending: currentData.totalSpending * 0.89,
        transactionCount: Math.floor(transactions.length * 0.93),
        averageTransaction: currentData.totalSpending * 0.89 / Math.floor(transactions.length * 0.93),
        savingsRate: currentData.savingsRate + 2.6
      };
      
      // Mock recent reports
      recentReports = [
        {
          id: 'report-1',
          title: 'Monthly Summary - November 2024',
          type: 'monthly',
          generatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'report-2',
          title: 'Spending Analysis - Q3 2024',
          type: 'spending',
          generatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'report-3',
          title: 'Category Breakdown - October 2024',
          type: 'category',
          generatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
        }
      ];
    } catch (error) {
      console.error('Error loading insights data:', error);
    }
  }

  function handleTabChange(tabId: string) {
    activeTab = tabId;
    // Update URL without causing navigation
    const url = new URL($page.url);
    url.searchParams.set('tab', tabId);
    goto(url.toString(), { replaceState: true, noScroll: true });
  }

  async function handleExportReport() {
    console.log('Exporting report...');
  }

  async function handleSetReminder() {
    console.log('Setting reminder...');
  }

  async function handleGenerateReport(type: ReportType) {
    try {
      const report = await analyzeService.generateReport(type);
      recentReports = [report, ...recentReports];
    } catch (error) {
      console.error('Error generating report:', error);
    }
  }

  async function handleDownloadReport(reportId: string) {
    try {
      await analyzeService.downloadReport(reportId);
    } catch (error) {
      console.error('Error downloading report:', error);
    }
  }

  function handleUpdateSettings(settings: Partial<ReportSettings>) {
    reportSettings = { ...reportSettings, ...settings };
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
      <TabHeader
        tabs={analyzeTabs}
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
      tabs={analyzeTabs}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      class="flex-1"
    >
      {#snippet children()}
        <TabContent tabId="overview" isActive={activeTab === 'overview'}>
          <OverviewTab
            totalSpending={totalSpending()}
            savingsRate={savingsRate()}
            timeRange={timeRange}
            insights={insights}
            userCurrency={userCurrency}
            onExportReport={handleExportReport}
            onSetReminder={handleSetReminder}
          />
        </TabContent>
        
        <TabContent tabId="trends" isActive={activeTab === 'trends'}>
          <TrendsTab
            timeRange={timeRange}
            onTimeRangeChange={(range) => timeRange = range as typeof timeRange}
            analytics={analytics}
            userCurrency={userCurrency}
          />
        </TabContent>
        
        <TabContent tabId="categories" isActive={activeTab === 'categories'}>
          <CategoriesTab
            categoryData={categoryData}
            userCurrency={userCurrency}
            timeRange={timeRange}
          />
        </TabContent>
        
        <TabContent tabId="compare" isActive={activeTab === 'compare'}>
          <CompareTab
            timeRange={timeRange === 'week' ? 'month' : (timeRange as 'month' | 'quarter' | 'year')}
            onTimeRangeChange={(range) => timeRange = range as 'month' | 'quarter' | 'year'}
            currentPeriodData={currentPeriodData}
            previousPeriodData={previousPeriodData}
            userCurrency={userCurrency}
          />
        </TabContent>
        
        <TabContent tabId="reports" isActive={activeTab === 'reports'}>
          <ReportsTab
            recentReports={recentReports}
            onGenerateReport={handleGenerateReport}
            onDownloadReport={handleDownloadReport}
            settings={reportSettings}
            onUpdateSettings={handleUpdateSettings}
          />
        </TabContent>
      {/snippet}
    </TabContentWrapper>
  {/snippet}
</PageLayout>