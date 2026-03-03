<script lang="ts">
  import { Plus, CreditCard, Wallet, PiggyBank } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { accountService, userService } from '$lib/core/services';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Separator } from '$lib/components/ui/separator/index.ts';
  import { formatAmount, formatCurrencyAmount } from '$lib/utils/currency-utils';
  import { useCurrencyFormatting } from '$lib/hooks/use-currency-formatting';
  import Header from '$lib/components/Header.svelte';
  import { PageLayout } from '$lib/components/layouts';
  import { getBufferStatus, getBufferAmount } from '$lib/utils/account-metadata-utils';
  import { AlertCircle, CheckCircle2, AlertTriangle, TrendingUp, Scale } from '@lucide/svelte';
  import type { Account } from '$lib/core/db';
  import { reconciliationService } from '$lib/core/services';
  import CreditUtilizationVisualization from '$lib/components/accounts/CreditUtilizationVisualization.svelte';
  import InterestOptimizationVisualization from '$lib/components/accounts/InterestOptimizationVisualization.svelte';
  import EmergencyFundVisualization from '$lib/components/accounts/EmergencyFundVisualization.svelte';
  
  const { data } = $props<{ data: any }>();

  // Currency formatting hook
  const currencyFormat = useCurrencyFormatting();

  let accounts = $state<any[]>([]);
  let totalBalance = $state(0);
  let userCurrency = $state<string | null>(null);
  let needsReconciliationCount = $state(0);

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
      const preferences = await userService.getUserPreferences();
      userCurrency = preferences?.currency || null;
      
      const accountsData = await accountService.getAccounts();
      const totalBalanceValue = await accountService.getTotalBalance();
      
      accounts = accountsData.map((account: Account) => ({
        ...account,
        balance: account.currentBalance
      }));
      totalBalance = totalBalanceValue;
      let needs = 0;
      for (const account of accountsData) {
        try {
          const summary = await reconciliationService.getReconciliationSummary(account.id);
          if (summary.daysSinceLastReconciliation > 30 || summary.daysSinceLastReconciliation === -1 || summary.unresolvedDiscrepancies > 0) needs++;
        } catch { /* ignore */ }
      }
      needsReconciliationCount = needs;
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  });

  function formatBalance(balance: number, currency: string | null) {
    // Show minus sign for negative balances, but no plus sign for positive balances
    return formatCurrencyAmount(balance, currency, { showSign: true, showPlus: false });
  }

  function getBufferStatusIcon(status: ReturnType<typeof getBufferStatus>) {
    switch (status) {
      case 'optimal':
        return CheckCircle2;
      case 'comfort':
        return TrendingUp;
      case 'warning':
        return AlertTriangle;
      case 'critical':
        return AlertCircle;
      default:
        return null;
    }
  }

  function getBufferStatusColor(status: ReturnType<typeof getBufferStatus>) {
    switch (status) {
      case 'optimal':
        return 'text-success';
      case 'comfort':
        return 'text-info';
      case 'warning':
        return 'text-warning';
      case 'critical':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  }
</script>

<svelte:head>
  <title>Accounts | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <Header 
      title="Accounts"
      buttonProps={[
        {
          text: "Add account",
          onclick: () => goto('/accounts/add'),
          size: "sm",
          className: "hidden sm:flex",
          icon: Plus
        }
      ]}
    />
  {/snippet}

  <div class="mx-auto max-w-4xl px-4 py-6">

    <!-- Reconciliation banner (coral strip, attention-needed) -->
    {#if needsReconciliationCount > 0}
      <a
        href="/accounts/reconciliation"
        class="mb-6 flex items-center justify-between squircle-2xl squircle-border px-5 py-3.5 transition-colors hover:opacity-90 block"
		style="--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);"
      >
        <div class="flex items-center gap-3">
          <Scale class="size-4 shrink-0 text-[var(--color-warm-coral)]" />
          <div>
            <p class="text-sm font-medium text-[var(--color-text-primary)]">Reconcile accounts</p>
            <p class="text-xs text-[var(--color-text-tertiary)]">{needsReconciliationCount} account{needsReconciliationCount === 1 ? '' : 's'} need attention</p>
          </div>
        </div>
        <span class="text-xs font-medium text-[var(--color-warm-coral)]">Review →</span>
      </a>
    {/if}

    <!-- Total balance hero -->
    <section class="mb-10 pt-4 text-center">
      <p class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-3">Total balance</p>
      <div class="text-hero animate-count-up">{formatBalance(totalBalance, userCurrency)}</div>
      {#if accounts.length > 0}
        <p class="mt-2 text-xs text-[var(--color-text-tertiary)]">across {accounts.length} account{accounts.length === 1 ? '' : 's'}</p>
      {/if}
    </section>

    <!-- Account cards -->
    <section class="mb-10 space-y-3">
      {#each accounts as account}
        {@const bufferStatus = (account.type === 'checking' || account.type === 'savings') ? getBufferStatus(account) : null}
        {@const bufferAmount = (account.type === 'checking' || account.type === 'savings') ? getBufferAmount(account) : 0}
        {@const StatusIcon = bufferStatus ? getBufferStatusIcon(bufferStatus) : null}
        {@const typeColor = account.type === 'checking' ? 'border-l-[var(--color-amber)]' : account.type === 'savings' ? 'border-l-[var(--color-sage-green)]' : account.type === 'credit' ? 'border-l-[var(--color-info)]' : 'border-l-border'}
        <button
          type="button"
          class="group w-full border-l-4 {typeColor} squircle-4xl squircle-border squircle-fill-tertiary p-6 text-left transition-all hover:shadow-md animate-card-enter"
          onclick={() => goto(`/accounts/${account.id}`)}
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <svelte:component this={accountIcons[account.type as keyof typeof accountIcons] || Wallet} class="size-4 shrink-0 text-[var(--color-text-tertiary)]" />
                <h3 class="font-semibold text-[var(--color-text-primary)] truncate">{account.name}</h3>
                {#if StatusIcon && bufferAmount > 0 && bufferStatus}
                  <StatusIcon class="size-3.5 shrink-0 {getBufferStatusColor(bufferStatus)}" />
                {/if}
              </div>
              <p class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-3">{account.type}</p>
              <div class="text-hero-sm">{formatBalance(account.balance, account.currency)}</div>
              {#if bufferAmount > 0 && bufferStatus && (bufferStatus === 'warning' || bufferStatus === 'critical')}
                <p class="text-xs mt-1.5 {bufferStatus === 'critical' ? 'text-[var(--color-warm-coral)]' : 'text-[var(--color-amber)]'}">
                  Buffer: {formatBalance(bufferAmount, account.currency)}
                </p>
              {/if}
            </div>
          </div>
        </button>
      {/each}

      {#if accounts.length === 0}
        <div class="flex flex-col items-center py-16 text-center">
          <Wallet class="mb-4 size-8 text-[var(--color-text-disabled)]" />
          <p class="text-sm text-[var(--color-text-secondary)]">No accounts added.</p>
          <Button variant="ghost" size="sm" class="mt-3 text-[var(--color-amber)]" onclick={() => goto('/accounts/add')}>
            Add account
          </Button>
        </div>
      {/if}
    </section>

    <!-- Details: visualizations (secondary, collapsed feel) -->
    {#if accounts.some((acc: Account) => acc.type === 'credit')}
      <section class="mb-6">
        <h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4">Credit utilization</h2>
        <div class="squircle-4xl squircle-border squircle-fill-tertiary p-6">
          <CreditUtilizationVisualization showAggregate={true} showDetails={true} showRecommendations={true} />
        </div>
      </section>
    {/if}

    {#if accounts.some((acc: Account) => acc.metadata?.interestRate || acc.metadata?.apr)}
      <section class="mb-6">
        <h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4">Interest analysis</h2>
        <div class="squircle-4xl squircle-border squircle-fill-tertiary p-6">
          <InterestOptimizationVisualization showAggregate={true} showDetails={true} showRecommendations={true} />
        </div>
      </section>
    {/if}

    {#if accounts.some((acc: Account) => acc.metadata?.isEmergencyFund || acc.type === 'savings')}
      <section class="mb-6">
        <h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4">Emergency fund</h2>
        <div class="squircle-4xl squircle-border squircle-fill-tertiary p-6">
          <EmergencyFundVisualization showDetails={true} showRecommendations={true} />
        </div>
      </section>
    {/if}

  </div>
</PageLayout>