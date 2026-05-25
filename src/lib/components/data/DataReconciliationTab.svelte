<script lang="ts">
	import { page } from '$app/stores';
	import ReconciliationForm from '$lib/components/ReconciliationForm.svelte';
	import ReconciliationHistory from '$lib/components/ReconciliationHistory.svelte';
	import DialogDrawer from '$lib/components/shared/DialogDrawer.svelte';
	import { History } from '@lucide/svelte';
	import type { ReconciliationRecord } from '$lib/core/db';
	import {
		reconciliationService,
		accountService,
		userService,
		refreshReconciliationDueInsights
	} from '$lib/core/services';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';
	import {
		accountNeedsReconciliationCheckup,
		accountHasOpenReconciliationIssues
	} from '$lib/utils/reconciliation-attention';
	import { onMount } from 'svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';

	let historyOpen = $state(false);
	let selectedAccountId = $state('');
	let reconciliationStats = $state({
		totalAccounts: 0,
		needsCheckup: 0,
		openIssues: 0,
		lastReconciled: null as string | null
	});
	let checkupIntervalDays = $state(30);
	let isLoadingStats = $state(true);
	let statsError = $state<string | null>(null);

	const needsCheckupCardStyle = $derived(
		reconciliationStats.needsCheckup >= 1
			? '--squircle-border-color: color-mix(in oklch, var(--color-amber) 30%, transparent); --squircle-fill: var(--color-amber-subtle);'
			: '--squircle-fill: var(--color-bg-tertiary);'
	);
	const openIssuesCardStyle = $derived(
		reconciliationStats.openIssues >= 1
			? '--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);'
			: '--squircle-fill: var(--color-bg-tertiary);'
	);

	const statementBalanceFromUrl = $derived.by(() => {
		const raw = $page.url.searchParams.get('statementBalance');
		if (raw == null || raw === '') return null;
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	});

	onMount(async () => {
		const urlParams = new URLSearchParams($page.url.search);
		if (urlParams.get('tab') === 'history') {
			historyOpen = true;
		}
		const accountParam = urlParams.get('account');
		if (accountParam) {
			selectedAccountId = accountParam;
		}
		await loadReconciliationStats();
	});

	async function loadReconciliationStats() {
		isLoadingStats = true;
		statsError = null;
		try {
			const [accounts, prefs] = await Promise.all([
				accountService.getAccounts(),
				userService.getUserPreferences()
			]);
			const intervalDays = prefs.reconciliationCheckupIntervalDays ?? 30;
			checkupIntervalDays = intervalDays;
			let needsCheckup = 0;
			let openIssues = 0;
			let lastReconciledDate: string | null = null;

			const rows = await Promise.all(
				accounts.map(async (account) => {
					try {
						const summary = await reconciliationService.getReconciliationSummary(account.id);
						return { account, summary };
					} catch (err) {
						console.warn(`Failed to load summary for account ${account.name}:`, err);
						return null;
					}
				})
			);

			for (const row of rows) {
				if (!row) continue;
				const { account, summary } = row;
				if (accountNeedsReconciliationCheckup(account, summary, intervalDays)) {
					needsCheckup++;
				}
				if (
					accountHasOpenReconciliationIssues(summary, summary.ledgerBalance, summary.currentBalance)
				) {
					openIssues++;
				}
				if (summary.lastReconciledDate) {
					if (
						!lastReconciledDate ||
						new Date(summary.lastReconciledDate) > new Date(lastReconciledDate)
					) {
						lastReconciledDate = summary.lastReconciledDate;
					}
				}
			}

			reconciliationStats = {
				totalAccounts: accounts.length,
				needsCheckup,
				openIssues,
				lastReconciled: lastReconciledDate
			};
		} catch (err) {
			statsError = err instanceof Error ? err.message : 'Failed to load reconciliation statistics';
		} finally {
			isLoadingStats = false;
		}
	}

	async function refreshReconciliationAlerts() {
		await refreshReconciliationDueInsights();
		void navigationStore.updateBadges();
	}

	function handleReconciliationComplete(result: ReconciliationRecord) {
		void refreshReconciliationAlerts();
		loadReconciliationStats();
		historyOpen = true;
		const url = new URL($page.url);
		url.pathname = '/data';
		url.search = '';
		url.searchParams.set('tab', 'reconcile');
		if (result.accountId) {
			url.searchParams.set('account', result.accountId);
		}
		history.replaceState({}, '', url);
	}

	function handleReconciliationSkipped(result: ReconciliationRecord) {
		void refreshReconciliationAlerts();
		loadReconciliationStats();
		if (result.accountId) {
			selectedAccountId = result.accountId;
		}
	}

	function handleReconcileClick(accountId: string) {
		selectedAccountId = accountId;
		historyOpen = false;
		const url = new URL($page.url);
		url.pathname = '/data';
		url.search = '';
		url.searchParams.set('tab', 'reconcile');
		if (accountId) {
			url.searchParams.set('account', accountId);
		}
		history.replaceState({}, '', url);
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="mx-auto max-w-2xl space-y-6 px-4 py-2">
	<p class="text-xs text-[var(--color-text-tertiary)]">
		Compare stored balances to your bank statement.
		<strong class="font-medium text-[var(--color-text-secondary)]">Needs check-up</strong> — no
		reconciliation within {checkupIntervalDays} days (bell alert, not the Data badge).
		<strong class="font-medium text-[var(--color-text-secondary)]">Open issues</strong> — unresolved discrepancy
		records or a material ledger gap needing action.
	</p>
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#if isLoadingStats}
			{#each [1, 2, 3, 4] as _}
				<Skeleton class="h-16 w-full rounded-xl bg-[var(--color-bg-tertiary)]" />
			{/each}
		{:else if statsError}
			<div
				class="squircle-2xl squircle-border col-span-full px-4 py-3"
				style="--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);"
			>
				<p class="text-sm text-[var(--color-warm-coral)]">{statsError}</p>
			</div>
		{:else}
			{@const allGood =
				reconciliationStats.needsCheckup === 0 && reconciliationStats.openIssues === 0}
			<div class="squircle-2xl squircle-border squircle-fill-tertiary px-4 py-3">
				<p
					class="mb-1 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Accounts
				</p>
				<p class="text-xl font-semibold text-[var(--color-text-primary)]">
					{reconciliationStats.totalAccounts}
				</p>
			</div>
			<div class="squircle-2xl squircle-border px-4 py-3" style={needsCheckupCardStyle}>
				<p
					class="mb-1 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Needs check-up
				</p>
				<p
					class="text-xl font-semibold {reconciliationStats.needsCheckup > 0
						? 'text-[var(--color-amber)]'
						: 'text-[var(--color-text-primary)]'}"
				>
					{reconciliationStats.needsCheckup}
				</p>
			</div>
			<div class="squircle-2xl squircle-border px-4 py-3" style={openIssuesCardStyle}>
				<p
					class="mb-1 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Open issues
				</p>
				<p
					class="text-xl font-semibold {reconciliationStats.openIssues > 0
						? 'text-[var(--color-warm-coral)]'
						: 'text-[var(--color-text-primary)]'}"
				>
					{reconciliationStats.openIssues}
				</p>
			</div>
			<div
				class="squircle-2xl squircle-border squircle-fill-tertiary px-4 py-3"
				style={allGood
					? '--squircle-border-color: color-mix(in oklch, var(--color-sage-green) 30%, transparent);'
					: ''}
			>
				<p
					class="mb-1 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Last reconciled
				</p>
				<p
					class="text-sm font-medium {allGood
						? 'text-[var(--color-sage-green)]'
						: 'text-[var(--color-text-primary)]'}"
				>
					{reconciliationStats.lastReconciled
						? formatDate(reconciliationStats.lastReconciled)
						: 'Never'}
				</p>
			</div>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			onclick={() => (historyOpen = true)}
			class="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-4 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)]"
		>
			<History class="size-3.5" />
			Reconciliation history
			{#if reconciliationStats.openIssues > 0}
				<span
					class="ml-0.5 rounded-full bg-[var(--color-warm-coral)] px-1.5 py-0.5 text-[10px] font-bold text-white"
					>{reconciliationStats.openIssues}</span
				>
			{/if}
		</button>
	</div>

	<ReconciliationForm
		{selectedAccountId}
		initialStatementBalance={statementBalanceFromUrl}
		onReconciliationComplete={handleReconciliationComplete}
		onReconciliationSkipped={handleReconciliationSkipped}
	/>

	<DialogDrawer
		open={historyOpen}
		onOpenChange={(v) => (historyOpen = v)}
		title="Reconciliation history"
		description="Past sessions and discrepancies for your accounts."
	>
		{#snippet children()}
			<ReconciliationHistory {selectedAccountId} embedded onReconcileClick={handleReconcileClick} />
		{/snippet}
	</DialogDrawer>
</div>
