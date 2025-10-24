<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { accountService, budgetService, transactionService, insightsService, settingsService } from '$lib/core/services';
  import * as Button from '$lib/components/ui/button/index.ts';
  import InsightsDisplay from '$lib/components/InsightsDisplay.svelte';
  import { formatMainCurrencyAmount, formatTransactionAmount } from '$lib/utils/currency-utils';
  import { useCurrencyFormatting } from '$lib/hooks/use-currency-formatting';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
  import Fab from '$lib/components/Fab.svelte';
  import { Plus } from '@lucide/svelte';

  const { data } = $props<{ data: any }>();

  let accounts = $state<any[]>([]);
  let totalBalance = $state(0);
  let recentTransactions = $state<any[]>([]);
  let budgetCategories = $state<Record<string, any>>({});
  let monthlyIncome = $state(0);
  let monthlyExpenses = $state(0);
  let userCurrency = $state<string>('USD');

  // Sidebar context for mobile detection
  const sidebar = Sidebar.useSidebar();

  onMount(async () => {
    try {
      // Load user currency preference first
      userCurrency = await settingsService.getCurrency();
      
      const [accountsData, balanceData, transactionsData, categoriesData] = await Promise.all([
        accountService.getAccounts(),
        accountService.getTotalBalance(),
        transactionService.getTransactions(), // Get grouped transactions
        budgetService.getTransactionBudgetCategories()
      ]);
      
      accounts = accountsData.slice(0, 3); // Show top 3 accounts
      totalBalance = balanceData;
      recentTransactions = transactionsData.slice(0, 5); // Show last 5 transactions
      budgetCategories = categoriesData.reduce((acc, category) => {
        acc[category.id] = category;
        return acc;
      }, {} as Record<string, any>);
      
      // Calculate monthly totals using the new system (handles negative amounts correctly)
      const incomeTransactions = transactionsData.filter((t: any) => t.representative?.type === 'income');
      const expenseTransactions = transactionsData.filter((t: any) => t.representative?.type === 'expense');
      
      monthlyIncome = incomeTransactions.reduce((sum: number, t: any) => sum + (t.totalAmount || 0), 0);
      monthlyExpenses = expenseTransactions.reduce((sum: number, t: any) => sum + (t.totalAmount || 0), 0);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  });

  // Currency formatting hook
  const currencyFormat = useCurrencyFormatting();

  function formatAmount(amount: number) {
    return currencyFormat.formatBalance(amount, userCurrency);
  }

  function getCategoryName(transactionOrGroup: any) {
    const transaction = transactionOrGroup.representative || transactionOrGroup;
    
    // First try to resolve budget category name
    if (transaction.budgetCategoryId && budgetCategories[transaction.budgetCategoryId]) {
      return budgetCategories[transaction.budgetCategoryId].name;
    }
    
    // Fallback to whatTag if available
    if (transaction.whatTag) {
      return transaction.whatTag.charAt(0).toUpperCase() + transaction.whatTag.slice(1).replace(/_/g, ' ');
    }
    
    // Last resort: format the budget category ID if it exists
    if (transaction.budgetCategoryId) {
      return transaction.budgetCategoryId.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    }
    
    return 'Uncategorized';
  }

  function getAccountName(accountId: string) {
    const account = accounts.find(a => a.id === accountId);
    return account?.name || 'Unknown Account';
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  }

  function getCategoryIcon(category: string) {
    const icons: Record<string, string> = {
      'Food & Dining': '🍕',
      'Income': '💰',
      'Transportation': '⛽',
      'Shopping': '🛍️',
      'Entertainment': '🎬',
      'Healthcare': '🏥'
    };
    return icons[category] || '📊';
  }
</script>

<svelte:head>
  <title>Dashboard | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet bottomBar()}
    <!-- Mobile Navigation -->
    {#if sidebar.isMobile}
      <MobileNavigation />
    {/if}
  {/snippet}

  <div class="container mx-auto px-4 py-6 max-w-6xl">
  <!-- Welcome Header -->
  <header class="mb-8">
    <h1 class="text-3xl font-bold text-primary mb-2">Welcome back!</h1>
    <p class="text-muted-foreground">Here's your financial overview for today</p>
  </header>

  <!-- Quick Stats -->
  <section class="mb-8">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div class="bg-card rounded-xl p-6 shadow-sm border border-border">
        <div class="text-sm text-muted-foreground mb-1">Total Balance</div>
        <div class="text-2xl font-bold text-primary">{formatAmount(totalBalance)}</div>
        <div class="text-sm text-success">+2.5% from last month</div>
      </div>
      
      <div class="bg-card rounded-xl p-6 shadow-sm border border-border">
        <div class="text-sm text-muted-foreground mb-1">Monthly Income</div>
        <div class="text-2xl font-bold text-success">{formatAmount(monthlyIncome)}</div>
        <div class="text-sm text-muted-foreground">This month</div>
      </div>
      
      <div class="bg-card rounded-xl p-6 shadow-sm border border-border">
        <div class="text-sm text-muted-foreground mb-1">Monthly Expenses</div>
        <div class="text-2xl font-bold text-alert">{formatAmount(monthlyExpenses)}</div>
        <div class="text-sm text-muted-foreground">This month</div>
      </div>
      
      <div class="bg-card rounded-xl p-6 shadow-sm border border-border">
        <div class="text-sm text-muted-foreground mb-1">Net Savings</div>
        <div class="text-2xl font-bold text-info">{formatAmount(monthlyIncome - monthlyExpenses)}</div>
        <div class="text-sm text-muted-foreground">This month</div>
      </div>
    </div>
  </section>

  <!-- Quick Actions -->
  <section class="mb-8">
    <h2 class="text-xl font-semibold text-primary mb-4">Quick Actions</h2>
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Button.Root onclick={() => goto('/transactions/add')} class="p-4 h-auto flex-col items-start">
        <div class="font-medium text-primary mb-1">Add Transaction</div>
        <div class="text-sm text-muted-foreground">Record income or expense</div>
      </Button.Root>
      
      <Button.Root onclick={() => goto('/accounts/add')} variant="outline" class="p-4 h-auto flex-col items-start">
        <div class="font-medium text-primary mb-1">Add Account</div>
        <div class="text-sm text-muted-foreground">Connect new account</div>
      </Button.Root>
      
      <Button.Root onclick={() => goto('/plan')} variant="outline" class="p-4 h-auto flex-col items-start">
        <div class="font-medium text-primary mb-1">View Budget</div>
        <div class="text-sm text-muted-foreground">Check your plan</div>
      </Button.Root>
      
      <Button.Root onclick={() => goto('/insights/alerts')} variant="outline" class="p-4 h-auto flex-col items-start">
        <div class="font-medium text-primary mb-1">Get Insights</div>
        <div class="text-sm text-muted-foreground">Financial analysis</div>
      </Button.Root>
    </div>
  </section>

  <!-- Recent Activity -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold text-primary">Recent Transactions</h2>
      <Button.Root variant="ghost" onclick={() => goto('/transactions')}>
        View All
      </Button.Root>
    </div>
    
    <div class="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
      <div class="divide-y divide-border">
        {#each recentTransactions as transactionOrGroup}
          <div class="p-6 hover:bg-accent transition-colors cursor-pointer">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-4">
                <div class="w-12 h-12 bg-muted rounded-full flex items-center justify-center text-xl">
                  {getCategoryIcon(getCategoryName(transactionOrGroup))}
                </div>
                <div>
                  <div class="font-medium text-primary">{(transactionOrGroup.representative || transactionOrGroup).description || 'No description'}</div>
                  <div class="text-sm text-muted-foreground">{getCategoryName(transactionOrGroup)}</div>
                  <div class="text-xs text-muted-foreground/70">{getAccountName((transactionOrGroup.commonFields || transactionOrGroup).accountId)} • {formatDate((transactionOrGroup.representative || transactionOrGroup).clearedDate || (transactionOrGroup.representative || transactionOrGroup).plannedDate || (transactionOrGroup.representative || transactionOrGroup).createdAt)}</div>
                  {#if transactionOrGroup.type === 'split'}
                    <div class="text-xs text-muted-foreground/70 mt-1">
                      Split transaction ({transactionOrGroup.transactions?.length || 0} parts)
                    </div>
                  {/if}
                </div>
              </div>
              
              <div class="text-right">
                <div class="font-semibold {((transactionOrGroup.totalAmount || transactionOrGroup.amount) ?? 0) >= 0 ? 'text-success' : 'text-alert'}">
                  {formatTransactionAmount(transactionOrGroup.totalAmount || transactionOrGroup.amount, (transactionOrGroup.representative || transactionOrGroup).currency || userCurrency, true)}
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Quick Insights -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold text-primary">Quick Insights</h2>
      <Button.Root variant="ghost" onclick={() => goto('/insights/alerts')}>
        View All
      </Button.Root>
    </div>
    
    <InsightsDisplay 
      maxInsights={3} 
      showDismiss={true}
      className="bg-card rounded-2xl shadow-sm border border-border p-4"
    />
  </section>

  <!-- Budget Overview -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold text-primary">Budget Overview</h2>
      <Button.Root variant="ghost" onclick={() => goto('/plan')}>
        View Details
      </Button.Root>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {#each Object.values(budgetCategories) as category (category.id)}
        <div class="bg-card rounded-xl p-4 shadow-sm border border-border">
          <div class="flex items-center justify-between mb-2">
            <div class="w-8 h-8 rounded-full" style="background-color: {category.color}"></div>
            <span class="text-sm text-muted-foreground">
              {Math.round((category.allocatedAmount / category.allocatedAmount) * 100)}%
            </span>
          </div>
          <div class="font-medium text-primary mb-1">{category.name}</div>
          <div class="text-sm text-muted-foreground">
            {formatAmount(category.allocatedAmount)} / {formatAmount(category.allocatedAmount)}
          </div>
          <div class="w-full bg-muted rounded-full h-2 mt-2">
            <div 
              class="h-2 rounded-full transition-all duration-300"
              style="width: {Math.min((category.allocatedAmount / category.allocatedAmount) * 100, 100)}%; background-color: {category.color}"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Account Summary -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold text-primary">Your Accounts</h2>
      <Button.Root variant="ghost" onclick={() => goto('/accounts')}>
        View All
      </Button.Root>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      {#each accounts as account}
        <div class="bg-card rounded-xl p-6 shadow-sm border border-border hover:shadow-md transition-shadow cursor-pointer">
          <div class="flex items-center justify-between mb-4">
            <div class="w-10 h-10 bg-gradient-to-r from-primary to-primary/80 rounded-lg flex items-center justify-center">
              <span class="text-white font-bold">{account.name.charAt(0)}</span>
            </div>
            <div class="text-right">
              <div class="text-sm text-muted-foreground capitalize">{account.type}</div>
            </div>
          </div>
          
          <h3 class="font-semibold text-primary mb-2">{account.name}</h3>
          <div class="text-2xl font-bold text-primary">{formatAmount(account.balance)}</div>
          
          <div class="mt-4 pt-4 border-t border-border">
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Last updated</span>
              <span class="text-primary">Today</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </section>
  </div>

  <!-- Floating Action Button -->
  <Fab 
    position="bottom-right" 
    size="md" 
    variant="default"
    onclick={() => goto('/transactions/add')}
  >
    {#snippet children()}
      <Plus />
    {/snippet}
  </Fab>
</PageLayout> 