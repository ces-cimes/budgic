<script lang="ts">
	import { onMount } from 'svelte';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { OptimizationResultVisualization } from '$lib/components/optimization';
	import { optimizationService, accountService } from '$lib/core/services';
	import type { OptimizationResult, OptimizedPlan, OptimizationHistoryEntry } from '$lib/core/services/analytics/optimization-service';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { 
		Sparkles, 
		RefreshCw, 
		History, 
		Settings, 
		CheckCircle2,
		AlertCircle,
		Loader2,
		TrendingUp
	} from '@lucide/svelte';
	import { format } from 'date-fns';
	import type { Account } from '$lib/core/db';

	let isLoading = $state(false);
	let isOptimizing = $state(false);
	let currentResult = $state<OptimizationResult | null>(null);
	let history = $state<OptimizationHistoryEntry[]>([]);
	let accounts = $state<Account[]>([]);
	let selectedAccountIds = $state<string[]>([]);
	let error = $state<string | null>(null);

	onMount(async () => {
		await loadAccounts();
		await loadHistory();
	});

	async function loadAccounts() {
		try {
			accounts = await accountService.getAccounts();
			// Select all accounts by default (getAccounts already returns only active accounts)
			selectedAccountIds = accounts.map(a => a.id);
		} catch (err) {
			console.error('Error loading accounts:', err);
		}
	}

	async function loadHistory() {
		try {
			history = optimizationService.getHistory();
		} catch (err) {
			console.error('Error loading history:', err);
		}
	}

	async function runOptimization() {
		try {
			isOptimizing = true;
			error = null;
			currentResult = null;

			const result = await optimizationService.optimize({
				accountIds: selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
				daysAhead: 90,
				maxIterations: 1000,
				enableSimulatedAnnealing: true
			});

			currentResult = result;
			await loadHistory(); // Refresh history
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to run optimization';
			console.error('Optimization error:', err);
		} finally {
			isOptimizing = false;
		}
	}

	async function handleApplyOptimization(plan: OptimizedPlan) {
		try {
			await optimizationService.applyOptimization(plan);
			await loadHistory(); // Refresh history
			// Optionally show success message
			currentResult = null; // Clear current result
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to apply optimization';
			console.error('Error applying optimization:', err);
		}
	}

	function handleDismiss() {
		currentResult = null;
	}

	function toggleAccount(accountId: string) {
		if (selectedAccountIds.includes(accountId)) {
			selectedAccountIds = selectedAccountIds.filter(id => id !== accountId);
		} else {
			selectedAccountIds = [...selectedAccountIds, accountId];
		}
	}
</script>

<svelte:head>
	<title>Transaction Optimization - Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header
			title="Transaction Optimization"
			description="Optimize your transaction timing to avoid fees and maintain better balances"
			buttonProps={[
				{
					onclick: runOptimization,
					size: 'sm',
					icon: isOptimizing ? Loader2 : Sparkles,
					disabled: isOptimizing || accounts.length === 0,
					className: isOptimizing ? 'animate-spin' : '',
					text: isOptimizing ? 'Optimizing...' : 'Run Optimization'
				}
			]}
		/>
	{/snippet}

	{#snippet children()}
		<div class="container mx-auto p-4 space-y-6">
			{#if error}
				<Card.Root class="border-destructive">
					<Card.Content class="p-4">
						<div class="flex items-center gap-2 text-destructive">
							<AlertCircle class="h-5 w-5" />
							<span>{error}</span>
						</div>
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Account Selection -->
			<Card.Root>
				<Card.Header>
					<Card.Title>Select Accounts</Card.Title>
					<Card.Description>
						Choose which accounts to include in the optimization
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<div class="space-y-2">
						{#each accounts as account}
							<label class="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer">
								<input
									type="checkbox"
									checked={selectedAccountIds.includes(account.id)}
									onchange={() => toggleAccount(account.id)}
									class="rounded"
								/>
								<span class="flex-1">{account.name}</span>
								<Badge variant="outline">{account.type}</Badge>
							</label>
						{/each}
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Current Optimization Result -->
			{#if currentResult}
				<OptimizationResultVisualization
					result={currentResult}
					onApply={handleApplyOptimization}
					onDismiss={handleDismiss}
				/>
			{/if}

			<!-- Optimization History -->
			{#if history.length > 0}
				<Card.Root>
					<Card.Header>
						<div class="flex items-center gap-2">
							<History class="h-5 w-5" />
							<Card.Title>Optimization History</Card.Title>
						</div>
						<Card.Description>
							Previous optimization runs and their results
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<div class="space-y-4">
							{#each history as entry}
								<div class="p-4 rounded-lg border space-y-2">
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-2">
											<span class="text-sm font-medium">
												{format(entry.runAt, 'MMM d, yyyy HH:mm')}
											</span>
											{#if entry.applied}
												<Badge variant="default" class="bg-green-500">
													<CheckCircle2 class="h-3 w-3 mr-1" />
													Applied
												</Badge>
											{:else}
												<Badge variant="outline">Not Applied</Badge>
											{/if}
										</div>
										{#if entry.result.success && entry.result.improvement > 0}
											<div class="flex items-center gap-1 text-green-600 dark:text-green-400">
												<TrendingUp class="h-4 w-4" />
												<span class="text-sm font-medium">
													+{entry.result.improvement.toFixed(2)}
												</span>
											</div>
										{/if}
									</div>
									{#if entry.result.success && entry.result.optimizedPlan}
										<div class="text-sm text-muted-foreground">
											{entry.result.optimizedPlan.movements.length} transaction{entry.result.optimizedPlan.movements.length !== 1 ? 's' : ''} adjusted
										</div>
									{/if}
									{#if entry.userFeedback}
										<div class="text-xs text-muted-foreground">
											Feedback: {entry.userFeedback}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Info Card -->
			{#if !currentResult && history.length === 0}
				<Card.Root>
					<Card.Content class="p-6">
						<div class="text-center space-y-4">
							<Sparkles class="h-12 w-12 mx-auto text-primary" />
							<div>
								<h3 class="text-lg font-semibold mb-2">Transaction Optimization</h3>
								<p class="text-muted-foreground text-sm max-w-md mx-auto">
									The optimization algorithm analyzes your planned transactions and suggests
									optimal timing to avoid fees, maintain better account balances, and improve
									your financial position. Click "Run Optimization" to get started.
								</p>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	{/snippet}
</PageLayout>
