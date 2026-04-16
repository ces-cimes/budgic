<script lang="ts">
	import { Plus, CreditCard, Wallet, PiggyBank, LayoutGrid, List } from '@lucide/svelte';
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
	import CountUpHero from '$lib/components/CountUpHero.svelte';
	import CreditUtilizationVisualization from '$lib/components/accounts/CreditUtilizationVisualization.svelte';
	import InterestOptimizationVisualization from '$lib/components/accounts/InterestOptimizationVisualization.svelte';
	import EmergencyFundVisualization from '$lib/components/accounts/EmergencyFundVisualization.svelte';
	import UpdateBalanceSheet from '$lib/components/accounts/UpdateBalanceSheet.svelte';
	import { passiveAccountService } from '$lib/core/services';

	const { data } = $props<{ data: any }>();

	// Currency formatting hook
	const currencyFormat = useCurrencyFormatting();

	type AccountWithBalance = Account & { balance: number };

	let accounts = $state<AccountWithBalance[]>([]);
	let totalBalance = $state(0);
	let userCurrency = $state<string | null>(null);
	let needsReconciliationCount = $state(0);
	let updateBalanceOpen = $state(false);
	let updateBalanceAccount = $state<Account | null>(null);
	/** Dense grid layout for many accounts (persisted locally). */
	let compactAccountsView = $state(false);

	const ACCOUNT_TYPE_ORDER = [
		'checking',
		'savings',
		'credit',
		'loan',
		'cash',
		'investment',
		'crypto'
	] as const;

	const accountsGrouped = $derived.by(() => {
		const m = new Map<string, AccountWithBalance[]>();
		for (const t of ACCOUNT_TYPE_ORDER) m.set(t, []);
		for (const a of accounts) {
			const list = m.get(a.type) ?? [];
			list.push(a);
			m.set(a.type, list);
		}
		return ACCOUNT_TYPE_ORDER.map((type) => ({ type, items: m.get(type) ?? [] })).filter(
			(g) => g.items.length > 0
		);
	});

	type AccountDisplayRow =
		| { kind: 'header'; type: string }
		| { kind: 'account'; account: AccountWithBalance };

	const accountsDisplayRows = $derived.by((): AccountDisplayRow[] => {
		const list = accounts;
		if (!compactAccountsView) {
			return list.map((account) => ({ kind: 'account' as const, account }));
		}
		const rows: AccountDisplayRow[] = [];
		for (const g of accountsGrouped) {
			rows.push({ kind: 'header', type: g.type });
			for (const account of g.items) rows.push({ kind: 'account', account });
		}
		return rows;
	});

	const NEW_ACCOUNT_RECON_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

	function toggleCompactAccountsView() {
		compactAccountsView = !compactAccountsView;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('budgic_accounts_compact', compactAccountsView ? '1' : '0');
		}
	}

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
			if (typeof localStorage !== 'undefined') {
				compactAccountsView = localStorage.getItem('budgic_accounts_compact') === '1';
			}
			// Load user currency preference first
			const preferences = await userService.getUserPreferences();
			userCurrency = preferences?.currency || null;
			const accountsData = await accountService.getAccounts();
			const totalBalanceValue = await accountService.getTotalBalance();

			accounts = accountsData.map((account: Account) => ({
				...account,
				balance: account.currentBalance ?? 0
			}));
			totalBalance = totalBalanceValue;
			let needs = 0;
			const now = Date.now();
			for (const account of accountsData) {
				try {
					const created = account.createdAt ? new Date(account.createdAt).getTime() : 0;
					if (created && now - created < NEW_ACCOUNT_RECON_GRACE_MS) continue;
					const summary = await reconciliationService.getReconciliationSummary(account.id);
					if (
						summary.daysSinceLastReconciliation > 30 ||
						summary.daysSinceLastReconciliation === -1 ||
						summary.unresolvedDiscrepancies > 0
					)
						needs++;
				} catch {
					/* ignore */
				}
			}
			needsReconciliationCount = needs;
		} catch (error) {
			console.error('Error loading accounts:', error);
		}
	});

	async function refreshAccountsList() {
		const accountsData = await accountService.getAccounts();
		const totalBalanceValue = await accountService.getTotalBalance();
		accounts = accountsData.map((a: Account) => ({
			...a,
			balance: a.currentBalance
		}));
		totalBalance = totalBalanceValue;
	}

	function openUpdateBalance(acc: Account, e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		updateBalanceAccount = acc;
		updateBalanceOpen = true;
	}

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
					text: compactAccountsView ? 'Comfortable list' : 'Compact grid',
					onclick: toggleCompactAccountsView,
					size: 'sm',
					className: 'hidden sm:flex',
					icon: compactAccountsView ? List : LayoutGrid
				},
				{
					text: 'Add account',
					onclick: () => goto('/accounts/add'),
					size: 'sm',
					className: 'hidden sm:flex',
					icon: Plus
				}
			]}
		/>
	{/snippet}

	<div class="mx-auto max-w-4xl space-y-8 px-5 py-6 sm:px-6">
		<!-- Reconciliation banner (coral strip, attention-needed) -->
		{#if needsReconciliationCount > 0}
			<a
				href="/accounts/reconciliation"
				class="squircle-2xl squircle-border mb-6 block flex items-center justify-between px-5 py-3.5 transition-colors hover:opacity-90"
				style="--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);"
			>
				<div class="flex items-center gap-3">
					<Scale class="size-4 shrink-0 text-[var(--color-warm-coral)]" />
					<div>
						<p class="text-sm font-medium text-[var(--color-text-primary)]">Reconcile accounts</p>
						<p class="text-xs text-[var(--color-text-tertiary)]">
							{needsReconciliationCount} account{needsReconciliationCount === 1 ? '' : 's'} need attention
						</p>
					</div>
				</div>
				<span class="text-xs font-medium text-[var(--color-warm-coral)]">Review →</span>
			</a>
		{/if}

		<!-- Total balance hero -->
		<section class="text-center">
			<p
				class="mb-3 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
			>
				Total balance
			</p>
			<CountUpHero value={totalBalance} format={(n) => formatBalance(n, userCurrency)} />
			{#if accounts.length > 0}
				<p class="mt-2 text-xs text-[var(--color-text-tertiary)]">
					across {accounts.length} account{accounts.length === 1 ? '' : 's'}
				</p>
			{/if}
			{#if accounts.length > 3}
				<div class="mt-3 flex justify-center sm:hidden">
					<Button variant="outline" size="sm" onclick={toggleCompactAccountsView} class="gap-2">
						{#if compactAccountsView}
							<List class="size-4" />
							Comfortable list
						{:else}
							<LayoutGrid class="size-4" />
							Compact grid
						{/if}
					</Button>
				</div>
			{/if}
		</section>

		<!-- Account cards (comfortable list vs compact grid) -->
		<section
			class={compactAccountsView
				? 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'
				: 'space-y-3'}
		>
			{#each accountsDisplayRows as row}
				{#if row.kind === 'header'}
					<p
						class="col-span-full mt-4 mb-1 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase first:mt-0"
					>
						{row.type}
					</p>
				{:else}
					{@const account = row.account}
					{@const bufferStatus =
						account.type === 'checking' || account.type === 'savings'
							? getBufferStatus(account)
							: null}
					{@const bufferAmount =
						account.type === 'checking' || account.type === 'savings'
							? getBufferAmount(account)
							: 0}
					{@const StatusIcon = bufferStatus ? getBufferStatusIcon(bufferStatus) : null}
					{@const typeColor =
						account.type === 'checking'
							? 'border-l-[var(--color-amber)]'
							: account.type === 'savings'
								? 'border-l-[var(--color-sage-green)]'
								: account.type === 'credit'
									? 'border-l-[var(--color-info)]'
									: 'border-l-border'}
					{@const AccountIcon = accountIcons[account.type as keyof typeof accountIcons] || Wallet}
					<div
						role="button"
						tabindex="0"
						class="group w-full cursor-pointer border-l-4 {typeColor} border-tertiary animate-card-enter rounded-2xl border text-left shadow-sm transition-all hover:shadow-md {compactAccountsView
							? 'p-3'
							: 'p-6'}"
						onclick={() => goto(`/accounts/${account.id}`)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								goto(`/accounts/${account.id}`);
							}
						}}
					>
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0 flex-1">
								<div class="mb-1 flex items-center gap-2">
									<AccountIcon class="size-4 shrink-0 text-[var(--color-text-tertiary)]" />
									<h3 class="truncate font-semibold text-[var(--color-text-primary)]">
										{account.name}
									</h3>
									{#if StatusIcon && bufferAmount > 0 && bufferStatus}
										<StatusIcon class="size-3.5 shrink-0 {getBufferStatusColor(bufferStatus)}" />
									{/if}
								</div>
								{#if !compactAccountsView}
									<p
										class="mb-3 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
									>
										{account.type}
									</p>
								{/if}
								<div class="flex flex-wrap items-end justify-between gap-2">
									<div class="text-hero-sm">{formatBalance(account.balance, account.currency)}</div>
									{#if account.type === 'savings' || account.type === 'credit' || account.type === 'loan'}
										<button
											type="button"
											class="relative z-10 text-xs font-medium text-[var(--color-amber)] hover:underline"
											onclick={(e) => openUpdateBalance(account, e)}
										>
											Update balance
										</button>
									{/if}
								</div>
								{#if account.rateProfile && account.lastConfirmedAt}
									<p class="text-muted-foreground mt-1 text-xs">
										Projected: {formatBalance(
											passiveAccountService.projectBalance(account, new Date()),
											account.currency
										)}
									</p>
								{/if}
								{#if bufferAmount > 0 && bufferStatus && (bufferStatus === 'warning' || bufferStatus === 'critical')}
									<p
										class="mt-1.5 text-xs {bufferStatus === 'critical'
											? 'text-[var(--color-warm-coral)]'
											: 'text-[var(--color-amber)]'}"
									>
										Buffer: {formatBalance(bufferAmount, account.currency)}
									</p>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			{/each}

			{#if accounts.length === 0}
				<div class="flex flex-col items-center py-16 text-center">
					<Wallet class="mb-4 size-8 text-[var(--color-text-disabled)]" />
					<p class="text-sm text-[var(--color-text-secondary)]">No accounts added.</p>
					<Button
						variant="ghost"
						size="sm"
						class="mt-3 text-[var(--color-amber)]"
						onclick={() => goto('/accounts/add')}
					>
						Add account
					</Button>
				</div>
			{/if}
		</section>

		<!-- Details: visualizations (secondary, collapsed feel) -->
		{#if accounts.some((acc: Account) => acc.type === 'credit')}
			<section>
				<h2
					class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Credit utilization
				</h2>
				<div class="squircle-4xl squircle-border squircle-fill-tertiary p-6">
					<CreditUtilizationVisualization
						showAggregate={true}
						showDetails={true}
						showRecommendations={true}
					/>
				</div>
			</section>
		{/if}

		{#if accounts.some((acc: Account) => acc.metadata?.interestRate || acc.metadata?.apr)}
			<section>
				<h2
					class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Interest analysis
				</h2>
				<div class="squircle-4xl squircle-border squircle-fill-tertiary p-6">
					<InterestOptimizationVisualization
						showAggregate={true}
						showDetails={true}
						showRecommendations={true}
					/>
				</div>
			</section>
		{/if}

		{#if accounts.some((acc: Account) => acc.metadata?.isEmergencyFund || acc.type === 'savings')}
			<section>
				<h2
					class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Emergency fund
				</h2>
				<div class="squircle-4xl squircle-border squircle-fill-tertiary p-6">
					<EmergencyFundVisualization showDetails={true} showRecommendations={true} />
				</div>
			</section>
		{/if}
	</div>

	<UpdateBalanceSheet
		open={updateBalanceOpen}
		account={updateBalanceAccount}
		onOpenChange={(v) => (updateBalanceOpen = v)}
		onSuccess={refreshAccountsList}
	/>
</PageLayout>
