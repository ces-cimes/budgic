<script lang="ts">
	import { page } from '$app/stores';
	import ReconciliationForm from '$lib/components/ReconciliationForm.svelte';
	import ReconciliationHistory from '$lib/components/ReconciliationHistory.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Badge } from '$lib/components/ui/badge';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import {
		TrendingUp,
		History,
		Plus,
		AlertCircle,
		CheckCircle2,
		Clock,
		BarChart3
	} from '@lucide/svelte';
	import type { ReconciliationRecord } from '$lib/core/db';
	import { reconciliationService, accountService } from '$lib/core/services';
	import { onMount } from 'svelte';

	// State variables
	let activeTab = $state('reconcile');
	let selectedAccountId = $state('');
	let reconciliationStats = $state({
		totalAccounts: 0,
		needsReconciliation: 0,
		hasDiscrepancies: 0,
		lastReconciled: null as string | null
	});
	let isLoadingStats = $state(true);
	let statsError = $state<string | null>(null);

	// Handle URL params
	onMount(async () => {
		const urlParams = new URLSearchParams($page.url.search);
		const tabParam = urlParams.get('tab');
		const accountParam = urlParams.get('account');

		if (tabParam && (tabParam === 'reconcile' || tabParam === 'history')) {
			activeTab = tabParam;
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

		// Switch to history tab to show the result
		activeTab = 'history';

		// Update URL without causing navigation
		const url = new URL($page.url);
		url.searchParams.set('tab', 'history');
		if (result.accountId) {
			url.searchParams.set('account', result.accountId);
		}
		history.replaceState({}, '', url);
	}

	// Handle reconcile button click from history
	function handleReconcileClick(accountId: string) {
		selectedAccountId = accountId;
		activeTab = 'reconcile';

		// Update URL
		const url = new URL($page.url);
		url.searchParams.set('tab', 'reconcile');
		if (accountId) {
			url.searchParams.set('account', accountId);
		} else {
			url.searchParams.delete('account');
		}
		history.replaceState({}, '', url);
	}

	// Handle tab change
	function handleTabChange(newTab: string) {
		activeTab = newTab;

		// Update URL
		const url = new URL($page.url);
		url.searchParams.set('tab', newTab);
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
	<title>Balance Reconciliation | Budgic</title>
	<meta
		name="description"
		content="Reconcile account balances and track discrepancies to ensure financial data accuracy."
	/>
</svelte:head>

<div class="container mx-auto max-w-7xl space-y-6 px-4 py-6">
	<!-- Page Header -->
	<div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Balance Reconciliation</h1>
			<p class="text-muted-foreground mt-1">
				Ensure your account balances match external statements and resolve discrepancies
			</p>
		</div>
	</div>

	<!-- Stats Overview -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#if isLoadingStats}
			{#each Array(4) as _}
				<Card>
					<CardContent class="pt-6">
						<div class="animate-pulse">
							<div class="bg-muted mb-2 h-8 w-12 rounded"></div>
							<div class="bg-muted h-4 w-24 rounded"></div>
						</div>
					</CardContent>
				</Card>
			{/each}
		{:else if statsError}
			<div class="col-span-full">
				<Alert variant="destructive">
					<AlertCircle class="h-4 w-4" />
					<AlertDescription>{statsError}</AlertDescription>
				</Alert>
			</div>
		{:else}
			<!-- Total Accounts -->
			<Card>
				<CardContent class="pt-6">
					<div class="flex items-center space-x-2">
						<BarChart3 class="h-5 w-5 text-blue-600" />
						<div>
							<p class="text-2xl font-bold">{reconciliationStats.totalAccounts}</p>
							<p class="text-muted-foreground text-sm">Total Accounts</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<!-- Needs Reconciliation -->
			<Card>
				<CardContent class="pt-6">
					<div class="flex items-center space-x-2">
						<Clock class="h-5 w-5 text-yellow-600" />
						<div>
							<div class="flex items-center gap-2">
								<p class="text-2xl font-bold">{reconciliationStats.needsReconciliation}</p>
								{#if reconciliationStats.needsReconciliation > 0}
									<Badge variant="outline" size="sm">needs attention</Badge>
								{/if}
							</div>
							<p class="text-muted-foreground text-sm">Need Reconciliation</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<!-- Has Discrepancies -->
			<Card>
				<CardContent class="pt-6">
					<div class="flex items-center space-x-2">
						<AlertCircle class="h-5 w-5 text-red-600" />
						<div>
							<div class="flex items-center gap-2">
								<p class="text-2xl font-bold">{reconciliationStats.hasDiscrepancies}</p>
								{#if reconciliationStats.hasDiscrepancies > 0}
									<Badge variant="destructive" size="sm">issues</Badge>
								{/if}
							</div>
							<p class="text-muted-foreground text-sm">With Discrepancies</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<!-- Last Reconciled -->
			<Card>
				<CardContent class="pt-6">
					<div class="flex items-center space-x-2">
						<CheckCircle2 class="h-5 w-5 text-green-600" />
						<div>
							<p class="text-sm font-semibold">
								{reconciliationStats.lastReconciled
									? formatDate(reconciliationStats.lastReconciled)
									: 'Never'}
							</p>
							<p class="text-muted-foreground text-sm">Last Reconciled</p>
						</div>
					</div>
				</CardContent>
			</Card>
		{/if}
	</div>

	<!-- Main Content -->
	<Tabs value={activeTab} onValueChange={handleTabChange} class="w-full">
		<TabsList class="grid w-full max-w-md grid-cols-2">
			<TabsTrigger value="reconcile" class="flex items-center gap-2">
				<Plus class="h-4 w-4" />
				New Reconciliation
			</TabsTrigger>
			<TabsTrigger value="history" class="flex items-center gap-2">
				<History class="h-4 w-4" />
				History
				{#if reconciliationStats.hasDiscrepancies > 0}
					<Badge variant="destructive" size="sm" class="ml-1">
						{reconciliationStats.hasDiscrepancies}
					</Badge>
				{/if}
			</TabsTrigger>
		</TabsList>

		<TabsContent value="reconcile" class="mt-6">
			<ReconciliationForm
				{selectedAccountId}
				onReconciliationComplete={handleReconciliationComplete}
			/>
		</TabsContent>

		<TabsContent value="history" class="mt-6">
			<ReconciliationHistory {selectedAccountId} onReconcileClick={handleReconcileClick} />
		</TabsContent>
	</Tabs>
</div>

<!-- Action Button for Mobile -->
<div class="fixed right-6 bottom-6 sm:hidden">
	<Button
		size="lg"
		class="h-14 w-14 rounded-full shadow-lg"
		on:click={() => handleTabChange('reconcile')}
		aria-label="New reconciliation"
	>
		<TrendingUp class="h-6 w-6" />
	</Button>
</div>
