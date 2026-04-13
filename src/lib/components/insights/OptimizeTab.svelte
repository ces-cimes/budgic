<script lang="ts">
	import { onMount } from 'svelte';
	import OptimizationResultVisualization from './OptimizationResultVisualization.svelte';
	import { optimizationService, accountService } from '$lib/core/services';
	import type {
		OptimizationResult,
		OptimizedPlan,
		OptimizationHistoryEntry
	} from '$lib/core/services/analytics/optimization-service';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Sparkles, History, CheckCircle2, AlertCircle, Loader2, TrendingUp } from '@lucide/svelte';
	import { format } from 'date-fns';
	import type { Account } from '$lib/core/db';

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
			selectedAccountIds = accounts.map((a) => a.id);
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
			await loadHistory();
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
			await loadHistory();
			currentResult = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to apply optimization';
		}
	}

	function toggleAccount(accountId: string) {
		if (selectedAccountIds.includes(accountId)) {
			selectedAccountIds = selectedAccountIds.filter((id) => id !== accountId);
		} else {
			selectedAccountIds = [...selectedAccountIds, accountId];
		}
	}
</script>

<div class="space-y-6 py-2 sm:py-4">
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

	<div class="flex items-center justify-between gap-4">
		<p class="text-muted-foreground text-sm">
			Optimize transaction timing to avoid fees and maintain better balances.
		</p>
		<Button
			onclick={runOptimization}
			disabled={isOptimizing || accounts.length === 0}
		>
			{#if isOptimizing}
				<Loader2 class="h-4 w-4 animate-spin mr-2" />
			{:else}
				<Sparkles class="h-4 w-4 mr-2" />
			{/if}
			{isOptimizing ? 'Optimizing...' : 'Run optimization'}
		</Button>
	</div>

	{#if accounts.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Accounts to include</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="flex flex-wrap gap-2">
					{#each accounts as account}
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors {selectedAccountIds.includes(account.id)
								? 'border-primary bg-primary/10 text-primary'
								: 'border-border hover:bg-accent'}"
							onclick={() => toggleAccount(account.id)}
						>
							{account.name}
							<Badge variant="outline" class="text-xs">{account.type}</Badge>
						</button>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if currentResult}
		<OptimizationResultVisualization
			result={currentResult}
			onApply={handleApplyOptimization}
			onDismiss={() => (currentResult = null)}
		/>
	{/if}

	{#if history.length > 0}
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-2">
					<History class="h-5 w-5" />
					<Card.Title class="text-base">History</Card.Title>
				</div>
			</Card.Header>
			<Card.Content>
				<div class="space-y-3">
					{#each history as entry}
						<div class="flex items-center justify-between rounded-lg border p-3 text-sm">
							<div class="flex items-center gap-2">
								<span class="text-muted-foreground">{format(entry.runAt, 'MMM d, HH:mm')}</span>
								{#if entry.applied}
									<Badge variant="secondary" class="bg-green-500/20 text-green-700 dark:text-green-400">
										<CheckCircle2 class="h-3 w-3 mr-1" />
										Applied
									</Badge>
								{:else}
									<Badge variant="outline">Not applied</Badge>
								{/if}
							</div>
							{#if entry.result?.success && entry.result.improvement > 0}
								<span class="text-success flex items-center gap-1">
									<TrendingUp class="h-4 w-4" />
									+{entry.result.improvement.toFixed(2)}
								</span>
							{/if}
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if !currentResult && history.length === 0 && !isOptimizing}
		<div class="text-muted-foreground rounded-xl border border-border bg-card/50 p-8 text-center text-sm">
			<Sparkles class="text-muted-foreground/50 mx-auto mb-2 h-10 w-10" />
			<p>Run optimization to get suggestions for timing your transactions and avoiding fees.</p>
		</div>
	{/if}
</div>
