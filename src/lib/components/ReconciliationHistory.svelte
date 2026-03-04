<script lang="ts">
	import { reconciliationService, accountService } from '$lib/core/services';
	import type { Account, ReconciliationRecord, ReconciliationDiscrepancy } from '$lib/core/db';
	import type { ReconciliationSummary } from '$lib/core/services/core/reconciliation-service';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select/index.ts';
	import { Separator } from '$lib/components/ui/separator';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import {
		AlertCircle,
		CheckCircle2,
		Clock,
		TrendingUp,
		Search,
		Filter,
		Calendar,
		AlertTriangle,
		ChevronDown,
		ChevronRight,
		Eye
	} from '@lucide/svelte';
	import { CurrencyUtils } from '$lib/core/db';
	import { onMount } from 'svelte';

	// Props interface
	interface Props {
		selectedAccountId?: string;
		onReconcileClick?: (accountId: string) => void;
		className?: string;
	}

	const { selectedAccountId = '', onReconcileClick = () => {}, className = '' }: Props = $props();

	// State variables
	let accounts = $state<Account[]>([]);
	let reconciliationSummaries = $state<Map<string, ReconciliationSummary>>(new Map());
	let reconciliationHistory = $state<Map<string, ReconciliationRecord[]>>(new Map());
	let discrepancies = $state<Map<string, ReconciliationDiscrepancy[]>>(new Map());
	let expandedRecords = $state<Set<string>>(new Set());
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Filter state
	let searchTerm = $state('');
	let selectedAccountFilter = $state('all');
	let selectedHealthFilter = $state('all');
	let showOnlyWithDiscrepancies = $state(false);

	// Filtered data
	let filteredSummaries = $derived(() => {
		let summaries = Array.from(reconciliationSummaries.values());

		// Filter by account
		if (selectedAccountFilter !== 'all') {
			summaries = summaries.filter((s) => s.accountId === selectedAccountFilter);
		}

		// Filter by health
		if (selectedHealthFilter !== 'all') {
			summaries = summaries.filter((s) => s.reconciliationHealth === selectedHealthFilter);
		}

		// Filter by search term
		if (searchTerm.trim()) {
			const term = searchTerm.toLowerCase().trim();
			summaries = summaries.filter((s) => s.accountName.toLowerCase().includes(term));
		}

		// Filter by discrepancies
		if (showOnlyWithDiscrepancies) {
			summaries = summaries.filter((s) => s.unresolvedDiscrepancies > 0);
		}

		return summaries;
	});

	let filteredHistory = $derived(() => {
		const allHistory: Array<ReconciliationRecord & { accountName: string }> = [];

		for (const [accountId, records] of reconciliationHistory) {
			const account = accounts.find((a) => a.id === accountId);
			if (!account) continue;

			const accountRecords = records.map((record) => ({
				...record,
				accountName: account.name
			}));

			allHistory.push(...accountRecords);
		}

		// Apply filters
		let filtered = allHistory;

		if (selectedAccountFilter !== 'all') {
			filtered = filtered.filter((r) => r.accountId === selectedAccountFilter);
		}

		if (searchTerm.trim()) {
			const term = searchTerm.toLowerCase().trim();
			filtered = filtered.filter(
				(r) =>
					r.accountName.toLowerCase().includes(term) ||
					(r.notes && r.notes.toLowerCase().includes(term))
			);
		}

		if (showOnlyWithDiscrepancies) {
			filtered = filtered.filter((r) => Math.abs(r.discrepancy) > 0.01);
		}

		// Sort by date (most recent first)
		return filtered.sort(
			(a, b) => new Date(b.reconciledDate).getTime() - new Date(a.reconciledDate).getTime()
		);
	});

	// Load data on mount
	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		isLoading = true;
		error = null;

		try {
			// Load accounts
			accounts = await accountService.getAccounts();

			// Load reconciliation summaries for each account
			const summaryPromises = accounts.map(async (account) => {
				try {
					const summary = await reconciliationService.getReconciliationSummary(account.id);
					reconciliationSummaries.set(account.id, summary);
					return summary;
				} catch (err) {
					console.warn(`Failed to load reconciliation summary for account ${account.name}:`, err);
					return null;
				}
			});

			await Promise.all(summaryPromises);

			// Load reconciliation history for each account
			const historyPromises = accounts.map(async (account) => {
				try {
					const history = await reconciliationService.getReconciliationHistory(account.id, 20);
					reconciliationHistory.set(account.id, history);
					return history;
				} catch (err) {
					console.warn(`Failed to load reconciliation history for account ${account.name}:`, err);
					return [];
				}
			});

			await Promise.all(historyPromises);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load reconciliation data';
		} finally {
			isLoading = false;
		}
	}

	async function loadDiscrepancies(recordId: string, accountId: string) {
		try {
			const accountDiscrepancies = await reconciliationService.getAccountDiscrepancies(accountId);
			discrepancies.set(recordId, accountDiscrepancies);
		} catch (err) {
			console.warn(`Failed to load discrepancies for record ${recordId}:`, err);
		}
	}

	function toggleRecordExpansion(recordId: string, accountId: string) {
		if (expandedRecords.has(recordId)) {
			expandedRecords.delete(recordId);
			expandedRecords = new Set(expandedRecords);
		} else {
			expandedRecords.add(recordId);
			expandedRecords = new Set(expandedRecords);
			loadDiscrepancies(recordId, accountId);
		}
	}

	function getHealthIcon(health: ReconciliationSummary['reconciliationHealth']) {
		switch (health) {
			case 'good':
				return CheckCircle2;
			case 'warning':
				return Clock;
			case 'critical':
				return AlertTriangle;
			default:
				return AlertCircle;
		}
	}

	function getHealthColor(health: ReconciliationSummary['reconciliationHealth']) {
		switch (health) {
			case 'good':
				return 'text-green-600';
			case 'warning':
				return 'text-yellow-600';
			case 'critical':
				return 'text-red-600';
			default:
				return 'text-gray-600';
		}
	}

	function getSeverityVariant(severity: ReconciliationDiscrepancy['severity']) {
		switch (severity) {
			case 'low':
				return 'secondary';
			case 'medium':
				return 'outline';
			case 'high':
				return 'destructive';
			default:
				return 'outline';
		}
	}

	function formatDaysAgo(days: number): string {
		if (days < 0) return 'Never';
		if (days === 0) return 'Today';
		if (days === 1) return '1 day ago';
		if (days < 30) return `${days} days ago`;
		if (days < 365) return `${Math.floor(days / 30)} months ago`;
		return `${Math.floor(days / 365)} years ago`;
	}

	function formatCurrency(amount: number, currency: string): string {
		return CurrencyUtils.formatAmount(amount, currency);
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="space-y-6 {className}">
	<!-- Header and Filters -->
	<div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
		<div>
			<h1 class="text-2xl font-bold">Reconciliation History</h1>
			<p class="text-muted-foreground">Track balance reconciliations and resolve discrepancies</p>
		</div>
		<Button onclick={() => onReconcileClick('')}>
			<TrendingUp class="mr-2 h-4 w-4" />
			New Reconciliation
		</Button>
	</div>

	<!-- Filters -->
	<Card>
		<CardContent class="pt-6">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
				<!-- Search -->
				<div class="relative">
					<Search
						class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform"
					/>
					<Input bind:value={searchTerm} placeholder="Search accounts..." class="pl-10" />
				</div>

				<!-- Account Filter -->
				<Select.Root type="single" bind:value={selectedAccountFilter}>
					<Select.Trigger>
						<span
							>{selectedAccountFilter === 'all'
								? 'All Accounts'
								: accounts.find((a) => a.id === selectedAccountFilter)?.name ||
									'All Accounts'}</span
						>
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="all">All Accounts</Select.Item>
						{#each accounts as account (account.id)}
							<Select.Item value={account.id}>{account.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>

				<!-- Health Filter -->
				<Select.Root type="single" bind:value={selectedHealthFilter}>
					<Select.Trigger>
						<span>{selectedHealthFilter === 'all' ? 'All Status' : selectedHealthFilter}</span>
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="all">All Status</Select.Item>
						<Select.Item value="good">Good</Select.Item>
						<Select.Item value="warning">Warning</Select.Item>
						<Select.Item value="critical">Critical</Select.Item>
					</Select.Content>
				</Select.Root>

				<!-- Discrepancy Filter -->
				<div class="flex items-center space-x-2">
					<input
						type="checkbox"
						id="discrepancies-filter"
						bind:checked={showOnlyWithDiscrepancies}
						class="rounded border-gray-300"
					/>
					<label for="discrepancies-filter" class="text-sm font-medium">
						Only with discrepancies
					</label>
				</div>
			</div>
		</CardContent>
	</Card>

	{#if isLoading}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _}
				<Card>
					<CardContent class="pt-6">
						<div class="animate-pulse">
							<div class="mb-2 h-4 w-3/4 rounded bg-gray-200"></div>
							<div class="mb-4 h-6 w-1/2 rounded bg-gray-200"></div>
							<div class="space-y-2">
								<div class="h-3 w-full rounded bg-gray-200"></div>
								<div class="h-3 w-2/3 rounded bg-gray-200"></div>
							</div>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{:else if error}
		<Alert variant="destructive">
			<AlertCircle class="h-4 w-4" />
			<AlertDescription>{error}</AlertDescription>
		</Alert>
	{:else}
		<!-- Account Summaries -->
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each filteredSummaries() as summary (summary.accountId)}
				{@const HealthIcon = getHealthIcon(summary.reconciliationHealth)}
				<Card class="transition-shadow hover:shadow-md">
					<CardHeader class="pb-3">
						<CardTitle class="flex items-center justify-between text-base">
							<span>{summary.accountName}</span>
							<HealthIcon class="h-5 w-5 {getHealthColor(summary.reconciliationHealth)}" />
						</CardTitle>
					</CardHeader>
					<CardContent class="space-y-4">
						<!-- Balance Info -->
						<div class="grid grid-cols-2 gap-4 text-sm">
							<div>
								<p class="text-muted-foreground">Current Balance</p>
								<p class="font-semibold">
									{CurrencyUtils.formatAmount(summary.currentBalance, 'USD')}
								</p>
							</div>
							<div>
								<p class="text-muted-foreground">Last Reconciled</p>
								<p class="font-semibold">
									{summary.lastReconciledBalance
										? formatCurrency(summary.lastReconciledBalance, 'USD')
										: 'N/A'}
								</p>
							</div>
						</div>

						<!-- Reconciliation Status -->
						<div class="space-y-2">
							<div class="flex justify-between text-sm">
								<span class="text-muted-foreground">Last Reconciled</span>
								<span>{formatDaysAgo(summary.daysSinceLastReconciliation)}</span>
							</div>
							{#if summary.unresolvedDiscrepancies > 0}
								<div class="flex justify-between text-sm">
									<span class="text-muted-foreground">Unresolved Issues</span>
									<Badge variant="destructive">
										{summary.unresolvedDiscrepancies}
									</Badge>
								</div>
							{/if}
						</div>

						<!-- Actions -->
						<div class="flex gap-2 pt-2">
							<Button
								variant="outline"
								class="flex-1"
								onclick={() => onReconcileClick(summary.accountId)}
							>
								Reconcile
							</Button>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>

		{#if filteredSummaries.length === 0}
			<Card>
				<CardContent class="py-8 pt-6 text-center">
					<TrendingUp class="text-muted-foreground mx-auto mb-4 h-12 w-12" />
					<p class="text-sm text-muted-foreground">Nothing here yet.</p>
					<p class="text-muted-foreground">
						{#if searchTerm || selectedAccountFilter !== 'all' || selectedHealthFilter !== 'all' || showOnlyWithDiscrepancies}
							Try adjusting your filters to see more results.
						{:else}
							Create some accounts to start reconciling balances.
						{/if}
					</p>
				</CardContent>
			</Card>
		{/if}

		<!-- Reconciliation History -->
		{#if filteredHistory.length > 0}
			<Card>
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Calendar class="h-5 w-5" />
						Recent Reconciliations
					</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					{#each filteredHistory() as record (record.id)}
						{@const isExpanded = expandedRecords.has(record.id)}
						{@const recordDiscrepancies = discrepancies.get(record.id) || []}

						<div class="rounded-lg border p-4">
							<!-- Record Header -->
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-3">
									<button
										onclick={() => toggleRecordExpansion(record.id, record.accountId)}
										class="flex items-center gap-2 text-left"
										aria-expanded={isExpanded}
									>
										{#if isExpanded}
											<ChevronDown class="text-muted-foreground h-4 w-4" />
										{:else}
											<ChevronRight class="text-muted-foreground h-4 w-4" />
										{/if}
									</button>

									<div>
										<h4 class="font-medium">{record.accountName}</h4>
										<p class="text-muted-foreground text-sm">
											{formatDate(record.reconciledDate)} •
											{record.reconciliationType}
											{#if record.resolvedAt}
												• Resolved
											{/if}
										</p>
									</div>
								</div>

								<div class="text-right">
									<p
										class="font-semibold {Math.abs(record.discrepancy) > 0.01
											? 'text-destructive'
											: 'text-green-600'}"
									>
										{formatCurrency(record.discrepancy, 'USD')}
									</p>
									<p class="text-muted-foreground text-xs">discrepancy</p>
								</div>
							</div>

							<!-- Record Details (Expanded) -->
							{#if isExpanded}
								<div class="mt-4 space-y-4">
									<Separator />

									<!-- Balance Details -->
									<div class="grid grid-cols-2 gap-4">
										<div>
											<p class="text-muted-foreground text-sm">Statement Balance</p>
											<p class="font-semibold">{formatCurrency(record.statementBalance, 'USD')}</p>
										</div>
										<div>
											<p class="text-muted-foreground text-sm">Calculated Balance</p>
											<p class="font-semibold">{formatCurrency(record.calculatedBalance, 'USD')}</p>
										</div>
									</div>

									<!-- Transaction Summary -->
									<div class="grid grid-cols-2 gap-4">
										<div>
											<p class="text-muted-foreground text-sm">Total Transactions</p>
											<p class="font-semibold">{record.transactionCount}</p>
										</div>
										<div>
											<p class="text-muted-foreground text-sm">Unreconciled</p>
											<p class="font-semibold">{record.unreconciledTransactionIds.length}</p>
										</div>
									</div>

									<!-- Notes -->
									{#if record.notes}
										<div>
											<p class="text-muted-foreground text-sm">Notes</p>
											<p class="bg-muted rounded p-2 text-sm">{record.notes}</p>
										</div>
									{/if}

									<!-- Discrepancies -->
									{#if recordDiscrepancies.length > 0}
										<div>
											<p class="mb-2 text-sm font-medium">Detected Issues</p>
											<div class="space-y-2">
												{#each recordDiscrepancies as discrepancy (discrepancy.id)}
													<div class="bg-muted flex items-center justify-between rounded p-2">
														<div class="flex-1">
															<p class="text-sm">{discrepancy.description}</p>
															<p class="text-muted-foreground text-xs"></p>
															<p class="text-muted-foreground text-xs">
																{discrepancy.suggestedAction.replace('_', ' ')}
																{#if discrepancy.amount !== 0}
																	• {CurrencyUtils.formatAmount(discrepancy.amount, 'USD')}
																{/if}
															</p>
														</div>
														<Badge variant={getSeverityVariant(discrepancy.severity)}>
															{discrepancy.severity}
														</Badge>
													</div>
												{/each}
											</div>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</CardContent>
			</Card>
		{/if}
	{/if}
</div>
