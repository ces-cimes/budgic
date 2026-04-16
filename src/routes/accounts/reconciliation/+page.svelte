<script lang="ts">
	import { page } from '$app/stores';
	import ReconciliationForm from '$lib/components/ReconciliationForm.svelte';
	import ReconciliationHistory from '$lib/components/ReconciliationHistory.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import DialogDrawer from '$lib/components/shared/DialogDrawer.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { History } from '@lucide/svelte';
	import type { ReconciliationRecord } from '$lib/core/db';
	import { reconciliationService, accountService } from '$lib/core/services';
	import { onMount } from 'svelte';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';

	// State variables
	let historyOpen = $state(false);
	let selectedAccountId = $state('');
	let reconciliationStats = $state({
		totalAccounts: 0,
		needsReconciliation: 0,
		hasDiscrepancies: 0,
		lastReconciled: null as string | null
	});
	let isLoadingStats = $state(true);
	let statsError = $state<string | null>(null);

	const needReviewCardStyle = $derived(
		reconciliationStats.needsReconciliation >= 1
			? '--squircle-border-color: color-mix(in oklch, var(--color-amber) 30%, transparent); --squircle-fill: var(--color-amber-subtle);'
			: '--squircle-fill: var(--color-bg-tertiary);'
	);
	const discrepanciesCardStyle = $derived(
		reconciliationStats.hasDiscrepancies >= 1
			? '--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);'
			: '--squircle-fill: var(--color-bg-tertiary);'
	);

	const statementBalanceFromUrl = $derived.by(() => {
		const raw = $page.url.searchParams.get('statementBalance');
		if (raw == null || raw === '') return null;
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	});

	// Handle URL params
	onMount(async () => {
		const urlParams = new URLSearchParams($page.url.search);
		const tabParam = urlParams.get('tab');
		const accountParam = urlParams.get('account');

		if (tabParam === 'history') {
			historyOpen = true;
		}

		if (accountParam) {
			selectedAccountId = accountParam;
		}

		await loadReconciliationStats();
	});

	// Load overview statistics
	async function loadReconciliationStats() {
		isLoadingStats = true;
		statsError = null;

		try {
			const accounts = await accountService.getAccounts();
			let needsReconciliation = 0;
			let hasDiscrepancies = 0;
			let lastReconciledDate: string | null = null;

			const summaryPromises = accounts.map(async (account) => {
				try {
					const summary = await reconciliationService.getReconciliationSummary(account.id);

					// Count accounts that need reconciliation (>30 days or never)
					if (
						summary.daysSinceLastReconciliation > 30 ||
						summary.daysSinceLastReconciliation === -1
					) {
						needsReconciliation++;
					}

					// Count accounts with unresolved discrepancies
					if (summary.unresolvedDiscrepancies > 0) {
						hasDiscrepancies++;
					}

					// Track most recent reconciliation date
					if (summary.lastReconciledDate) {
						if (
							!lastReconciledDate ||
							new Date(summary.lastReconciledDate) > new Date(lastReconciledDate)
						) {
							lastReconciledDate = summary.lastReconciledDate;
						}
					}

					return summary;
				} catch (err) {
					console.warn(`Failed to load summary for account ${account.name}:`, err);
					return null;
				}
			});

			await Promise.all(summaryPromises);

			reconciliationStats = {
				totalAccounts: accounts.length,
				needsReconciliation,
				hasDiscrepancies,
				lastReconciled: lastReconciledDate
			};
		} catch (err) {
			statsError = err instanceof Error ? err.message : 'Failed to load reconciliation statistics';
		} finally {
			isLoadingStats = false;
		}
	}

	// Handle successful reconciliation
	function handleReconciliationComplete(result: ReconciliationRecord) {
		// Refresh stats
		loadReconciliationStats();

		historyOpen = true;

		// Update URL without causing navigation
		const url = new URL($page.url);
		url.searchParams.delete('tab');
		if (result.accountId) {
			url.searchParams.set('account', result.accountId);
		}
		history.replaceState({}, '', url);
	}

	// Handle reconcile button click from history
	function handleReconcileClick(accountId: string) {
		selectedAccountId = accountId;
		historyOpen = false;

		// Update URL
		const url = new URL($page.url);
		url.searchParams.delete('tab');
		if (accountId) {
			url.searchParams.set('account', accountId);
		} else {
			url.searchParams.delete('account');
		}
		history.replaceState({}, '', url);
	}

	// Format date for display
	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Reconcile | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header
			title="Reconcile"
			showBackButton={true}
			backButtonLink="/accounts"
			backButtonLabel="Back to accounts"
		/>
	{/snippet}

	{#snippet children()}
		<div class="mx-auto max-w-2xl space-y-6 px-4 py-6">
			<!-- Stats overview — compact pill row -->
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{#if isLoadingStats}
					{#each [1, 2, 3, 4] as _}
						<div class="h-16 animate-pulse rounded-xl bg-[var(--color-bg-tertiary)]"></div>
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
						reconciliationStats.needsReconciliation === 0 &&
						reconciliationStats.hasDiscrepancies === 0}
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
					<div class="squircle-2xl squircle-border px-4 py-3" style={needReviewCardStyle}>
						<p
							class="mb-1 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Need review
						</p>
						<p
							class="text-xl font-semibold {reconciliationStats.needsReconciliation > 0
								? 'text-[var(--color-amber)]'
								: 'text-[var(--color-text-primary)]'}"
						>
							{reconciliationStats.needsReconciliation}
						</p>
					</div>
					<div class="squircle-2xl squircle-border px-4 py-3" style={discrepanciesCardStyle}>
						<p
							class="mb-1 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Discrepancies
						</p>
						<p
							class="text-xl font-semibold {reconciliationStats.hasDiscrepancies > 0
								? 'text-[var(--color-warm-coral)]'
								: 'text-[var(--color-text-primary)]'}"
						>
							{reconciliationStats.hasDiscrepancies}
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

			<!-- Primary form + history as secondary panel -->
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={() => (historyOpen = true)}
					class="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-4 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)]"
				>
					<History class="size-3.5" />
					Reconciliation history
					{#if reconciliationStats.hasDiscrepancies > 0}
						<span
							class="ml-0.5 rounded-full bg-[var(--color-warm-coral)] px-1.5 py-0.5 text-[10px] font-bold text-white"
							>{reconciliationStats.hasDiscrepancies}</span
						>
					{/if}
				</button>
			</div>

			<ReconciliationForm
				{selectedAccountId}
				initialStatementBalance={statementBalanceFromUrl}
				onReconciliationComplete={handleReconciliationComplete}
			/>

			<DialogDrawer
				open={historyOpen}
				onOpenChange={(v) => (historyOpen = v)}
				title="Reconciliation history"
				description="Past sessions and discrepancies for your accounts."
			>
				{#snippet children()}
					<ReconciliationHistory {selectedAccountId} onReconcileClick={handleReconcileClick} />
				{/snippet}
			</DialogDrawer>
		</div>
	{/snippet}
</PageLayout>
