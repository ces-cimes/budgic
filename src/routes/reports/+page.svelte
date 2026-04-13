<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { periodStore } from '$lib/stores/period-store';
  import { PageLayout } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import { 
    BarChart3, 
    TrendingUp, 
    PieChart, 
    GitCompare, 
    FileText 
  } from '@lucide/svelte';
  
  import { 
    TabHeader,
    TabContent,
    TabContentWrapper,
    type TabConfig
  } from '$lib/components/shared';
  
  import { 
    OverviewTab,
    TrendsTab,
    CategoriesTab,
    CompareTab,
    ReportsTab,
    type Insight,
    type AnalyticsData,
    type CategoryData,
    type PeriodData,
    type Report,
    type ReportSettings,
    type ReportType
  } from '$lib/components/reports';
  import { analyzeService, userService } from '$lib/core/services';

  const reportTabs: TabConfig[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'trends', label: 'Trends', icon: TrendingUp },
    { id: 'categories', label: 'Categories', icon: PieChart },
    { id: 'compare', label: 'Compare', icon: GitCompare },
    { id: 'saved', label: 'Saved', icon: FileText }
  ];

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

  const totalSpending = $derived(() => {
    return analyzeService.calculateSpendingData(transactions, timeRange).totalSpending;
  });
  
  const savingsRate = $derived(() => {
    return analyzeService.calculateSpendingData(transactions, timeRange).savingsRate;
  });

  onMount(async () => {
    periodStore.initFromUrl($page.url.search);
    try {
      const preferences = await userService.getUserPreferences();
      userCurrency = preferences?.currency || 'USD';
      await loadData();
    } catch (error) {
      console.error('Error loading reports data:', error);
    } finally {
      isLoading = false;
    }
  });

  $effect(() => {
    if (analytics !== null && !isLoading) {
      loadData();
    }
  });

  $effect(() => {
    const urlParams = new URLSearchParams($page.url.search);
    let tabParam = urlParams.get('tab');
    if (tabParam === 'reports') tabParam = 'saved';
    if (tabParam && reportTabs.some(tab => tab.id === tabParam)) {
      activeTab = tabParam;
    }
  });

  async function loadData() {
    try {
      insights = await analyzeService.loadInsights();
      transactions = await analyzeService.loadTransactions();
      analytics = await analyzeService.loadAnalytics(timeRange);
      categoryData = analyzeService.generateCategoryData(transactions, timeRange);
      const currentData = analyzeService.calculateSpendingData(transactions, timeRange);
      currentPeriodData = {
        ...currentData,
        transactionCount: transactions.length,
        averageTransaction: currentData.totalSpending / transactions.length || 0
      };
      const previousPeriodTransactions = transactions.filter(tx => {
        const txDate = new Date(tx.clearedDate || tx.plannedDate || tx.createdAt);
        const currentDate = new Date();
        const periodStart = new Date(currentDate.getTime() - (timeRange === 'month' ? 60 : timeRange === 'quarter' ? 180 : 365) * 24 * 60 * 60 * 1000);
        const periodEnd = new Date(currentDate.getTime() - (timeRange === 'month' ? 30 : timeRange === 'quarter' ? 90 : 180) * 24 * 60 * 60 * 1000);
        return txDate >= periodStart && txDate <= periodEnd;
      });
      const previousData = analyzeService.calculateSpendingData(previousPeriodTransactions, timeRange);
      previousPeriodData = {
        ...previousData,
        transactionCount: previousPeriodTransactions.length,
        averageTransaction: previousData.totalSpending / previousPeriodTransactions.length || 0
      };
      recentReports = [
        {
          id: 'report-1',
          title: `Monthly Summary - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
          type: 'monthly',
          generatedAt: new Date().toISOString()
        },
        {
          id: 'report-2',
          title: `Spending Analysis - ${timeRange === 'quarter' ? 'Q3' : 'Recent'} ${new Date().getFullYear()}`,
          type: 'spending',
          generatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'report-3',
          title: `Category Breakdown - ${new Date().toLocaleDateString('en-US', { month: 'long' })}`,
          type: 'category',
          generatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
        }
      ];
    } catch (error) {
      console.error('Error loading reports data:', error);
    }
  }

  function handleTabChange(tabId: string) {
    activeTab = tabId;
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
      console.log('Download report:', reportId);
    } catch (error) {
      console.error('Error downloading report:', error);
    }
  }

  function handleUpdateSettings(settings: Partial<ReportSettings>) {
    reportSettings = { ...reportSettings, ...settings };
  }
</script>

<svelte:head>
  <title>Reports | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <Header title="Reports" description="What happened" variant="with-tabs" tabRowMobileOnly>
      <TabHeader
        tabs={reportTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
    </Header>
  {/snippet}

  {#snippet children()}
    <TabContentWrapper
      tabs={reportTabs}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      class="flex-1"
    >
      {#snippet children()}
        <TabContent tabId="overview" isActive={activeTab === 'overview'} tabs={reportTabs}>
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
        
        <TabContent tabId="trends" isActive={activeTab === 'trends'} tabs={reportTabs}>
          <TrendsTab
            timeRange={timeRange}
            onTimeRangeChange={(range) => timeRange = range as typeof timeRange}
            analytics={analytics}
            userCurrency={userCurrency}
          />
        </TabContent>
        
        <TabContent tabId="categories" isActive={activeTab === 'categories'} tabs={reportTabs}>
          <CategoriesTab
            categoryData={categoryData}
            userCurrency={userCurrency}
            timeRange={timeRange}
          />
        </TabContent>
        
        <TabContent tabId="compare" isActive={activeTab === 'compare'} tabs={reportTabs}>
          <CompareTab
            timeRange={timeRange === 'week' ? 'month' : (timeRange as 'month' | 'quarter' | 'year')}
            onTimeRangeChange={(range) => timeRange = range as 'month' | 'quarter' | 'year'}
            currentPeriodData={currentPeriodData}
            previousPeriodData={previousPeriodData}
            userCurrency={userCurrency}
          />
        </TabContent>
        
        <TabContent tabId="saved" isActive={activeTab === 'saved'} tabs={reportTabs}>
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
