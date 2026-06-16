<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Scale, TrendingDown, Info } from '@lucide/svelte';
	import { formatAmount } from '$lib/utils/currency-utils';
	import { CalcExpressionInput } from '$lib/components/ui/calculator/index.ts';
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
				<Scale class="text-muted-foreground h-5 w-5" />
				<div>
					<Card.Title>Goal trade-off analysis</Card.Title>
					<Card.Description>
						See how shifting money between goals affects target dates. Allocations are
						by priority (critical first).
					</Card.Description>
				</div>
			</div>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if error}
				<p class="text-destructive text-sm">{error}</p>
			{:else if loading}
				<p class="text-muted-foreground text-sm">Loading allocation…</p>
			{:else if allocationPreview}
				<!-- Allocation by priority -->
				<div>
					<p class="text-primary mb-2 text-sm font-medium">
						Current allocation (by priority)
					</p>
					<p class="text-muted-foreground mb-2 text-xs">
						Total for goals: {formatAmount(
							allocationPreview.totalAvailableInUserCurrency,
							userCurrency
						)}/mo
						{#if allocationPreview.totalShortfall > 0}
							· Shortfall: {formatAmount(
								allocationPreview.totalShortfall,
								userCurrency
							)}
						{/if}
					</p>
					<div class="max-h-48 space-y-1.5 overflow-y-auto">
						{#each allocationPreview.allocations as alloc (alloc.goalId)}
							<div
								class="bg-muted/50 flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
							>
								<div class="flex min-w-0 items-center gap-2">
									<Badge
										class={getPriorityColor(alloc.priority)}
										variant="secondary"
									>
										{alloc.priority}
									</Badge>
									<span class="text-primary truncate font-medium"
										>{alloc.goalName}</span
									>
								</div>
								<div class="flex shrink-0 items-center gap-2">
									<span class="text-muted-foreground">
										{formatAmount(
											alloc.allocatedInUserCurrency,
											userCurrency
										)}/mo
									</span>
									{#if alloc.shortfallInUserCurrency > 0}
										<span class="text-destructive text-xs">
											(need {formatAmount(
												alloc.requiredMonthlyInUserCurrency,
												userCurrency
											)})
										</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Opportunity cost: "If I add $X to Goal A..." -->
				<div class="border-t pt-2">
					<p class="text-primary mb-2 flex items-center gap-1 text-sm font-medium">
						<Info class="h-4 w-4" />
						What if I contribute more to one goal?
					</p>
					<div class="flex flex-wrap items-end gap-2">
						<select
							bind:value={selectedGoalId}
							class="border-input bg-background min-w-[140px] rounded-md border px-3 py-2 text-sm"
						>
							{#each activeGoals as g (g.id)}
								<option value={g.id}>{g.name}</option>
							{/each}
						</select>
						<div class="flex items-center gap-1">
							<CalcExpressionInput
								value={amountIncrease}
								onValueChange={(n) => (amountIncrease = n)}
								decimalPlaces={0}
								min={1}
								class="w-24"
								inputClass="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
							/>
							<span class="text-muted-foreground text-sm">{userCurrency}/mo</span>
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
						<div
							class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20"
						>
							<p class="text-primary mb-1 text-sm font-medium">
								Adding {formatAmount(
									tradeOffResult.amountIncreaseInUserCurrency,
									tradeOffResult.userCurrency
								)}/mo to {tradeOffResult.increasedGoalName}:
							</p>
							{#if tradeOffResult.impacts.length > 0}
								<ul class="text-muted-foreground space-y-1 text-sm">
									{#each tradeOffResult.impacts as impact (impact.goalId)}
										<li class="flex items-center gap-2">
											<TrendingDown class="h-4 w-4 shrink-0 text-amber-600" />
											<span
												><strong class="text-primary"
													>{impact.goalName}</strong
												>
												— {impact.message}</span
											>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-muted-foreground text-sm">
									No impact on other goals (only one goal or no allocation shift).
								</p>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
