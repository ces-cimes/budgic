<script lang="ts">
  import { Plus, CreditCard, Wallet, PiggyBank } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { accountService, settingsService } from '$lib/core/services';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Separator } from '$lib/components/ui/separator/index.ts';
  import { formatAmount, formatTransactionAmount } from '$lib/utils/currency-utils';
  import { useCurrencyFormatting } from '$lib/hooks/use-currency-formatting';
  import Header from '$lib/components/Header.svelte';
  import { PageLayout } from '$lib/components/layouts';
  
  const { data } = $props<{ data: any }>();

  // Currency formatting hook
  const currencyFormat = useCurrencyFormatting();

  let accounts = $state<any[]>([]);
  let totalBalance = $state(0);
  let userCurrency = $state<string>('USD');

  const accountIcons = {
    checking: Wallet,
    savings: PiggyBank,
    credit: CreditCard
  };

  const accountColors = {
    checking: 'from-info to-info/80',
    savings: 'from-success to-success/80',
    credit: 'from-accent to-accent/80'
  };

  onMount(async () => {
    try {
      // Load user currency preference first
      userCurrency = await settingsService.getCurrency();
      
      const accountsWithBalances = await accountService.getAccountsWithBalances();
      
      accounts = accountsWithBalances.map(({ account, balance }) => ({
        ...account,
        balance
      }));
      totalBalance = accountsWithBalances.reduce((sum, { balance }) => sum + balance, 0);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  });

  function formatBalance(balance: number, currency: string, showPlus: boolean = false) {
    return formatTransactionAmount(balance, currency, showPlus);
  }
</script>

<svelte:head>
  <title>Accounts | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <!-- Header -->
    <Header 
      title="Accounts"
      buttonProps={[
        {
          text: "Add Account",
          onclick: () => goto('/accounts/add'),
          size: "sm",
          className: "hidden sm:flex",
          target: "_blank",
          rel: "noopener noreferrer",
          icon: Plus
        }
      ]}
    />
  {/snippet}

  <div class="container mx-auto px-4 py-6 max-w-6xl">

  <!-- Total Balance -->
  <section class="mb-8">
    <div class="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-6 text-primary-foreground">
      <h2 class="text-lg font-medium mb-2">Total Balance</h2>
      <div class="text-4xl font-bold">{currencyFormat.formatBalance(totalBalance, userCurrency)}</div>
    </div>
  </section>

  <!-- Account Cards -->
  <section class="mb-8">
    <h2 class="text-xl font-semibold text-primary mb-4">Your Accounts</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each accounts as account}
        <button 
          type="button"
          class="bg-card rounded-2xl p-6 shadow-sm border border-border hover:shadow-md transition-shadow cursor-pointer text-left w-full"
          onclick={() => goto(`/accounts/${account.id}`)}
        >
          <div class="flex items-start justify-between">
            <div>
              <h3 class="font-semibold text-primary mb-2">{account.name}</h3>
              <div class="text-2xl font-bold {account.balance >= 0 ? 'text-success' : 'text-alert'}">
                {formatBalance(account.balance, account.currency)}
              </div>
            </div>
            <div class="text-right">
              <div class="text-sm text-muted-foreground capitalize">{account.type}</div>
            </div>
          </div>
        </button>
      {/each}
    </div>
  </section>
  </div>
</PageLayout> 