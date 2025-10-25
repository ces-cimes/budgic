<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { accountService, budgetService, transactionService, userService } from '$lib/core/services';
  import { db } from '$lib/core/db';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { formatMainCurrencyAmount, formatTransactionAmount } from '$lib/utils/currency-utils';
  import { useCurrencyFormatting } from '$lib/hooks/use-currency-formatting';
  import { PageLayout } from '$lib/components/layouts';
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
  let insights = $state<any[]>([]);

  onMount(async () => {
    try {
      // Load user currency preference first
      const preferences = await userService.getUserPreferences();
      userCurrency = preferences?.currency || 'USD';
      
      const [accountsData, balanceData, transactionsData, categoriesData] = await Promise.all([
        accountService.getAccounts(),
        accountService.getTotalBalance(),
        transactionService.getAllTransactions(), // Get all transactions
        db.getActiveCategories()
      ]);
      
      accounts = accountsData.slice(0, 3); // Show top 3 accounts
      totalBalance = balanceData;
      recentTransactions = transactionsData.slice(0, 5); // Show last 5 transactions
      budgetCategories = categoriesData.reduce((acc: Record<string, any>, category: any) => {
        acc[category.id] = category;
        return acc;
      }, {} as Record<string, any>);
      
      // Load insights
      insights = []; // Simplified - insights will be loaded from insights page
      
      // Calculate monthly totals using the simplified transaction system
      const incomeTransactions = transactionsData.filter((t: any) => t.type === 'income');
      const expenseTransactions = transactionsData.filter((t: any) => t.type === 'expense');
      
      monthlyIncome = incomeTransactions.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
      monthlyExpenses = expenseTransactions.reduce((sum: number, t: any) => sum + Math.abs(t.amount || 0), 0);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  });

  // Currency formatting hook
  const currencyFormat = useCurrencyFormatting();

  function formatAmount(amount: number) {
    return currencyFormat.formatBalance(amount, userCurrency);
  }

  function getCategoryName(transaction: any) {
    // Try to resolve category name from budgetCategories
    if (transaction.categoryId && budgetCategories[transaction.categoryId]) {
      return budgetCategories[transaction.categoryId].name;
    }
    
    // Last resort: format the category ID if it exists
    if (transaction.categoryId) {
      return transaction.categoryId.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
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
      
      <Button.Root onclick={() => goto('/insights')} variant="outline" class="p-4 h-auto flex-col items-start">
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
        {#each recentTransactions as transaction (transaction.id)}
          <div class="p-6 hover:bg-accent transition-colors cursor-pointer">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-4">
                <div class="w-12 h-12 bg-muted rounded-full flex items-center justify-center text-xl">
                  {getCategoryIcon(getCategoryName(transaction))}
                </div>
                <div>
                  <div class="font-medium text-primary">{transaction.description || 'No description'}</div>
                  <div class="text-sm text-muted-foreground">{getCategoryName(transaction)}</div>
                  <div class="text-xs text-muted-foreground/70">{getAccountName(transaction.accountId)} • {formatDate(transaction.clearedDate || transaction.plannedDate || transaction.createdAt)}</div>
                  {#if transaction.groupId}
                    <div class="text-xs text-muted-foreground/70 mt-1">
                      Grouped transaction
                    </div>
                  {/if}
                </div>
              </div>
              
              <div class="text-right">
                <div class="font-semibold {(transaction.amount ?? 0) >= 0 ? 'text-success' : 'text-alert'}">
                  {formatTransactionAmount(transaction.amount, transaction.currency || userCurrency, true)}
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
      <Button.Root variant="ghost" onclick={() => goto('/insights')}>
        View All
      </Button.Root>
    </div>
    
    <div class="bg-card rounded-2xl shadow-sm border border-border p-4">
      {#if insights.length === 0}
        <div class="text-center py-4 text-muted-foreground">
          <p class="text-sm">No insights to display</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each insights.slice(0, 3) as insight (insight.id)}
            <div class="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
              <div class="flex-shrink-0 mt-0.5">
                {#if insight.severity === 'alert'}
                  <div class="w-2 h-2 bg-red-500 rounded-full"></div>
                {:else if insight.severity === 'warning'}
                  <div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
                {:else if insight.severity === 'success'}
                  <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                {:else}
                  <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-medium text-sm text-foreground leading-tight">
                  {insight.title}
                </h3>
                <p class="text-xs text-muted-foreground mt-1">
                  {insight.message}
                </p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
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