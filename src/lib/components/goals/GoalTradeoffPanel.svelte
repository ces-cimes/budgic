<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Scale, TrendingDown, Info } from '@lucide/svelte';
	import { formatAmount } from '$lib/utils/currency-utils';
	import { goalOpportunityService, goalTradeoffService } from '$lib/core/services';
	import type { Goal } from '$lib/core/db';
	import type {
		AllocationPreviewResult,
		TradeOffImpactResult
	} from '$lib/core/services/core/goal-tradeoff-service';

	interface Props {
		activeGoals: Goal[];
		userCurrency: string;
	}

	let { activeGoals, userCurrency }: Props = $props();

	let allocationPreview = $state<AllocationPreviewResult | null>(null);
	let tradeOffResult = $state<TradeOffImpactResult | null>(null);
	let selectedGoalId = $state<string>('');
	let amountIncrease = $state<number>(50);
	let loading = $state(false);
	let loadingTradeOff = $state(false);
	let error = $state<string | null>(null);

	onMount(() => {
		if (activeGoals.length > 0 && !selectedGoalId) {
			selectedGoalId = activeGoals[0].id;
		}
		loadAllocationPreview();
	});

	async function loadAllocationPreview() {
		if (activeGoals.length === 0) {
			allocationPreview = null;
			return;
		}
		loading = true;
		error = null;
		try {
			const breakdown = await goalOpportunityService.getProjectedSurplus();
			const totalForGoals = breakdown.surplus + breakdown.savingsCommitment;
			allocationPreview = await goalTradeoffService.getAllocationPreview(
				activeGoals,
				Math.max(totalForGoals, 0),
				userCurrency
			);
		} catch (e) {
			console.error('Failed to load allocation preview:', e);
			error = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	}

	async function calculateTradeOff() {
		if (!selectedGoalId || amountIncrease <= 0) {
			tradeOffResult = null;
			return;
		}
		loadingTradeOff = true;
		tradeOffResult = null;
		try {
			const result = await goalTradeoffService.getTradeOffImpacts(
				activeGoals,
				selectedGoalId,
				amountIncrease,
				userCurrency
			);
			tradeOffResult = result ?? null;
		} catch (e) {
			console.error('Failed to calculate trade-off:', e);
		} finally {
			loadingTradeOff = false;
		}
	}

	function getPriorityColor(priority: string) {
		const colors: Record<string, string> = {
			low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
			medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
			high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
			critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
		};
		return colors[priority] ?? colors.medium;
	}
</script>

{#if activeGoals.length === 0}
	<!-- No panel when no goals -->
{:else}
	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-2">
				<Scale class="h-5 w-5 text-muted-foreground" />
				<div>
					<Card.Title>Goal trade-off analysis</Card.Title>
					<Card.Description>
						See how shifting money between goals affects target dates. Allocations are by priority (critical first).
					</Card.Description>
				</div>
			</div>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{:else if loading}
				<p class="text-sm text-muted-foreground">Loading allocation…</p>
			{:else if allocationPreview}
				<!-- Allocation by priority -->
				<div>
					<p class="text-sm font-medium text-primary mb-2">Current allocation (by priority)</p>
					<p class="text-xs text-muted-foreground mb-2">
						Total for goals: {formatAmount(allocationPreview.totalAvailableInUserCurrency, userCurrency)}/mo
						{#if allocationPreview.totalShortfall > 0}
							· Shortfall: {formatAmount(allocationPreview.totalShortfall, userCurrency)}
						{/if}
					</p>
					<div class="space-y-1.5 max-h-48 overflow-y-auto">
						{#each allocationPreview.allocations as alloc (alloc.goalId)}
							<div
								class="flex items-center justify-between text-sm py-1.5 px-2 rounded-md bg-muted/50"
							>
								<div class="flex items-center gap-2 min-w-0">
									<Badge class={getPriorityColor(alloc.priority)} variant="secondary">
										{alloc.priority}
									</Badge>
									<span class="truncate font-medium text-primary">{alloc.goalName}</span>
								</div>
								<div class="flex items-center gap-2 shrink-0">
									<span class="text-muted-foreground">
										{formatAmount(alloc.allocatedInUserCurrency, userCurrency)}/mo
									</span>
									{#if alloc.shortfallInUserCurrency > 0}
										<span class="text-destructive text-xs">
											(need {formatAmount(alloc.requiredMonthlyInUserCurrency, userCurrency)})
										</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Opportunity cost: "If I add $X to Goal A..." -->
				<div class="pt-2 border-t">
					<p class="text-sm font-medium text-primary mb-2 flex items-center gap-1">
						<Info class="h-4 w-4" />
						What if I contribute more to one goal?
					</p>
					<div class="flex flex-wrap items-end gap-2">
						<select
							bind:value={selectedGoalId}
							class="rounded-md border border-input bg-background px-3 py-2 text-sm min-w-[140px]"
						>
							{#each activeGoals as g (g.id)}
								<option value={g.id}>{g.name}</option>
							{/each}
						</select>
						<div class="flex items-center gap-1">
							<input
								type="number"
								min="1"
								step="10"
								bind:value={amountIncrease}
								class="rounded-md border border-input bg-background px-3 py-2 text-sm w-24"
							/>
							<span class="text-sm text-muted-foreground">{userCurrency}/mo</span>
						</div>
						<Button.Root
							size="sm"
							onclick={calculateTradeOff}
							disabled={loadingTradeOff || !selectedGoalId}
						>
							{loadingTradeOff ? 'Calculating…' : 'Show impact'}
						</Button.Root>
					</div>

					{#if tradeOffResult}
						<div class="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
							<p class="text-sm font-medium text-primary mb-1">
								Adding {formatAmount(tradeOffResult.amountIncreaseInUserCurrency, tradeOffResult.userCurrency)}/mo to {tradeOffResult.increasedGoalName}:
							</p>
							{#if tradeOffResult.impacts.length > 0}
								<ul class="space-y-1 text-sm text-muted-foreground">
									{#each tradeOffResult.impacts as impact (impact.goalId)}
										<li class="flex items-center gap-2">
											<TrendingDown class="h-4 w-4 shrink-0 text-amber-600" />
											<span><strong class="text-primary">{impact.goalName}</strong> — {impact.message}</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-sm text-muted-foreground">No impact on other goals (only one goal or no allocation shift).</p>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
