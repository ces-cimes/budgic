<script lang="ts">
	import type { OptimizationResult, OptimizedPlan, TransactionMovement, PlanImprovement } from '$lib/core/services/analytics/optimization-service';
	import { formatCurrencyAmount } from '$lib/utils/currency-utils';
	import { formatMainCurrencyAmount } from '$lib/utils/currency-utils';
	import { format, differenceInDays, parseISO } from 'date-fns';
	import { userService, learningAdaptationService } from '$lib/core/services';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import { 
		TrendingUp, 
		TrendingDown, 
		Calendar, 
		DollarSign, 
		CheckCircle2, 
		AlertCircle,
		ArrowRight,
		Sparkles,
		Clock,
		Target,
		X
	} from '@lucide/svelte';
	import { db } from '$lib/core/db';
	import type { Transaction } from '$lib/core/db';

	interface Props {
		result: OptimizationResult;
		onApply?: (plan: OptimizedPlan) => void;
		onDismiss?: () => void;
		className?: string;
	}

	const { result, onApply, onDismiss, className = '' }: Props = $props();

	let transactions = $state<Map<string, Transaction>>(new Map());
	let isLoadingTransactions = $state(true);
	let userCurrency = $state<string>('USD');

	// Load transaction details
	async function loadTransactions() {
		try {
			isLoadingTransactions = true;
			// Load user currency
			const preferences = await userService.getUserPreferences();
			userCurrency = preferences?.currency || 'USD';
			
			const txIds = Array.from(result.originalPlan.keys());
			const loaded = await Promise.all(
				txIds.map(id => db.transactions.get(id))
			);
			const txMap = new Map<string, Transaction>();
			loaded.forEach(tx => {
				if (tx) txMap.set(tx.id, tx);
			});
			transactions = txMap;
		} catch (error) {
			console.error('Error loading transactions:', error);
		} finally {
			isLoadingTransactions = false;
		}
	}

	// Load on mount
	$effect(() => {
		loadTransactions();
	});

	// Handle feedback on recommendations
	async function handleFeedback(recommendationId: string, action: 'accepted' | 'rejected') {
		try {
			await learningAdaptationService.recordFeedback({
				feedbackType: 'optimization_suggestion',
				suggestionId: recommendationId,
				action,
				details: {
					recommendationId,
					improvement: result.improvement,
					estimatedSavings: result.recommendations.find(r => r.id === recommendationId)?.estimatedSavings
				}
			});
		} catch (error) {
			console.error('Error recording feedback:', error);
		}
	}

	// Format score for display (normalize large numbers)
	function formatScore(score: number): string {
		const absScore = Math.abs(score);
		
		// For very large numbers, use scientific notation or scale down
		if (absScore >= 1_000_000) {
			// Show in millions
			return `${(score / 1_000_000).toFixed(2)}M`;
		} else if (absScore >= 1_000) {
			// Show in thousands
			return `${(score / 1_000).toFixed(2)}K`;
		} else {
			// Show as-is for smaller numbers
			return score.toFixed(2);
		}
	}

	// Calculate improvement percentage
	const improvementPercentage = $derived(() => {
		if (result.baselineScore === 0) return 0;
		return (result.improvement / Math.abs(result.baselineScore)) * 100;
	});

	// Group movements by impact
	const movementsByImpact = $derived(() => {
		if (!result.optimizedPlan) return { high: [], medium: [], low: [] };
		
		const high: TransactionMovement[] = [];
		const medium: TransactionMovement[] = [];
		const low: TransactionMovement[] = [];

		result.optimizedPlan.movements.forEach(movement => {
			const absDays = Math.abs(movement.daysMoved);
			if (absDays > 7) {
				high.push(movement);
			} else if (absDays > 3) {
				medium.push(movement);
			} else {
				low.push(movement);
			}
		});

		return { high, medium, low };
	});

	// Get transaction name
	function getTransactionName(txId: string): string {
		const tx = transactions.get(txId);
		return tx?.description || `Transaction ${txId.slice(0, 8)}`;
	}

	// Format movement direction
	function formatMovement(movement: TransactionMovement): string {
		const days = movement.daysMoved;
		if (days === 0) return 'No change';
		if (days > 0) return `Moved forward ${days} day${days !== 1 ? 's' : ''}`;
		return `Moved back ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}`;
	}

	// Get improvement type icon
	function getImprovementIcon(type: PlanImprovement['type']) {
		switch (type) {
			case 'fee_avoidance':
				return DollarSign;
			case 'buffer_improvement':
				return TrendingUp;
			case 'utilization_improvement':
				return Target;
			case 'delay_reduction':
				return Clock;
			default:
				return CheckCircle2;
		}
	}

	function handleApply() {
		if (result.optimizedPlan && onApply) {
			onApply(result.optimizedPlan);
		}
	}
</script>

<div class={className}>
	{#if !result.success}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-destructive">
					<AlertCircle class="h-5 w-5" />
					Optimization Failed
				</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if result.errors && result.errors.length > 0}
					<div class="space-y-2">
						{#each result.errors as error}
							<div class="text-sm text-destructive">{error}</div>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else if result.optimizedPlan}
		<div class="space-y-6">
			<!-- Summary Card -->
			<Card.Root>
				<Card.Header>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<Sparkles class="h-5 w-5 text-primary" />
							<Card.Title>Optimization Results</Card.Title>
						</div>
						{#if result.improvement > 0}
							<Badge variant="default" class="bg-green-500">
								<TrendingUp class="h-3 w-3 mr-1" />
								Improved
							</Badge>
						{/if}
					</div>
				</Card.Header>
				<Card.Content class="space-y-4">
					<!-- Score Explanation -->
					<div class="p-3 rounded-lg bg-muted/50 border border-border">
						<div class="flex items-start gap-2">
							<AlertCircle class="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
							<div class="text-xs text-muted-foreground space-y-1">
								<p class="font-medium text-foreground">About the Score:</p>
								<p>
									The optimization score evaluates your financial plan's health. Lower (more negative) scores indicate more issues like buffer violations or fees. 
									The <strong>improvement</strong> value shows how much better the optimized plan is compared to your current plan. 
									A positive improvement means the optimization found a better arrangement.
								</p>
							</div>
						</div>
					</div>

					<!-- Score Comparison -->
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div class="space-y-2">
							<div class="text-sm text-muted-foreground">Baseline Score</div>
							<div class="text-2xl font-semibold">{formatScore(result.baselineScore)}</div>
							<div class="text-xs text-muted-foreground">Current plan</div>
							<div class="text-xs text-muted-foreground/70">Raw: {result.baselineScore.toFixed(0)}</div>
						</div>
						<div class="space-y-2">
							<div class="text-sm text-muted-foreground">Optimized Score</div>
							<div class="text-2xl font-semibold text-primary">
								{formatScore(result.optimizedScore)}
							</div>
							<div class="text-xs text-muted-foreground">Suggested plan</div>
							<div class="text-xs text-muted-foreground/70">Raw: {result.optimizedScore.toFixed(0)}</div>
						</div>
						<div class="space-y-2">
							<div class="text-sm text-muted-foreground">Improvement</div>
							<div class="text-2xl font-semibold text-green-600 dark:text-green-400">
								{result.improvement >= 0 ? '+' : ''}{formatScore(result.improvement)}
							</div>
							<div class="text-xs text-muted-foreground">
								({improvementPercentage().toFixed(1)}% better)
							</div>
							{#if Math.abs(result.improvement) >= 1_000}
								<div class="text-xs text-muted-foreground/70">Raw: {result.improvement >= 0 ? '+' : ''}{result.improvement.toFixed(0)}</div>
							{/if}
						</div>
					</div>

					<!-- Progress Bar -->
					{#if result.baselineScore !== 0}
						<div class="space-y-2">
							<div class="flex justify-between text-sm">
								<span>Score Improvement</span>
								<span>{improvementPercentage().toFixed(1)}%</span>
							</div>
							<Progress value={Math.min(100, Math.max(0, improvementPercentage()))} />
						</div>
					{/if}

					<!-- Metadata -->
					<div class="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
						<div class="space-y-1">
							<div class="text-xs text-muted-foreground">Iterations</div>
							<div class="text-sm font-medium">{result.metadata.iterations}</div>
						</div>
						<div class="space-y-1">
							<div class="text-xs text-muted-foreground">Transactions Moved</div>
							<div class="text-sm font-medium">{result.metadata.transactionsMoved}</div>
						</div>
						<div class="space-y-1">
							<div class="text-xs text-muted-foreground">Execution Time</div>
							<div class="text-sm font-medium">{(result.metadata.executionTime / 1000).toFixed(2)}s</div>
						</div>
						<div class="space-y-1">
							<div class="text-xs text-muted-foreground">Status</div>
							<div class="text-sm font-medium">
								{result.metadata.converged ? 'Converged' : 'Max Iterations'}
							</div>
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Improvements -->
			{#if result.optimizedPlan.improvements.length > 0}
				<Card.Root>
					<Card.Header>
						<Card.Title>Improvements</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="space-y-3">
							{#each result.optimizedPlan.improvements as improvement}
								{@const Icon = getImprovementIcon(improvement.type)}
								<div class="flex items-start gap-3 p-3 rounded-lg bg-accent/50">
									<Icon class="h-5 w-5 text-primary mt-0.5" />
									<div class="flex-1">
										<div class="font-medium">{improvement.description}</div>
										{#if improvement.value > 0}
											<div class="text-sm text-muted-foreground">
												Value: {formatMainCurrencyAmount(improvement.value, userCurrency)}
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Transaction Movements -->
			{#if result.optimizedPlan.movements.length > 0}
				<Card.Root>
					<Card.Header>
						<Card.Title>Transaction Adjustments</Card.Title>
						<Card.Description>
							{result.optimizedPlan.movements.length} transaction{result.optimizedPlan.movements.length !== 1 ? 's' : ''} 
							will be adjusted
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<div class="space-y-4">
							<!-- High Impact -->
							{#if movementsByImpact().high.length > 0}
								<div class="space-y-2">
									<div class="text-sm font-medium text-amber-600 dark:text-amber-400">
										High Impact ({movementsByImpact().high.length})
									</div>
									<div class="space-y-2">
										{#each movementsByImpact().high as movement}
											<div class="flex items-center justify-between p-3 rounded-lg border border-amber-200 dark:border-amber-800">
												<div class="flex-1">
													<div class="font-medium">{getTransactionName(movement.transactionId)}</div>
													<div class="text-sm text-muted-foreground flex items-center gap-2">
														<Calendar class="h-3 w-3" />
														{format(movement.originalDate, 'MMM d, yyyy')}
														<ArrowRight class="h-3 w-3" />
														{format(movement.newDate, 'MMM d, yyyy')}
													</div>
												</div>
												<Badge variant="outline" class="ml-4">
													{formatMovement(movement)}
												</Badge>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Medium Impact -->
							{#if movementsByImpact().medium.length > 0}
								<div class="space-y-2">
									<div class="text-sm font-medium">Medium Impact ({movementsByImpact().medium.length})</div>
									<div class="space-y-2">
										{#each movementsByImpact().medium as movement}
											<div class="flex items-center justify-between p-3 rounded-lg border">
												<div class="flex-1">
													<div class="font-medium">{getTransactionName(movement.transactionId)}</div>
													<div class="text-sm text-muted-foreground flex items-center gap-2">
														<Calendar class="h-3 w-3" />
														{format(movement.originalDate, 'MMM d, yyyy')}
														<ArrowRight class="h-3 w-3" />
														{format(movement.newDate, 'MMM d, yyyy')}
													</div>
												</div>
												<Badge variant="outline" class="ml-4">
													{formatMovement(movement)}
												</Badge>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Low Impact -->
							{#if movementsByImpact().low.length > 0}
								<div class="space-y-2">
									<div class="text-sm font-medium text-muted-foreground">
										Low Impact ({movementsByImpact().low.length})
									</div>
									<div class="space-y-1">
										{#each movementsByImpact().low as movement}
											<div class="flex items-center justify-between p-2 rounded text-sm">
												<div class="flex-1 text-muted-foreground">
													{getTransactionName(movement.transactionId)}
												</div>
												<Badge variant="outline" class="ml-4 text-xs">
													{formatMovement(movement)}
												</Badge>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Recommendations -->
			{#if result.recommendations.length > 0}
				<Card.Root>
					<Card.Header>
						<Card.Title>Recommendations</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="space-y-4">
							{#each result.recommendations as recommendation}
								<div class="p-4 rounded-lg border">
									<div class="flex items-start justify-between mb-2">
										<div class="flex-1">
											<div class="flex items-center gap-2 mb-1">
												<Card.Title class="text-base">{recommendation.title}</Card.Title>
												<Badge variant={
													recommendation.priority === 'urgent' ? 'destructive' :
													recommendation.priority === 'high' ? 'default' :
													recommendation.priority === 'medium' ? 'secondary' : 'outline'
												}>
													{recommendation.priority}
												</Badge>
											</div>
											<div class="text-sm text-muted-foreground mb-2">
												{recommendation.description}
											</div>
										</div>
									</div>
									{#if recommendation.estimatedSavings !== undefined && recommendation.estimatedSavings > 0}
										<div class="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
											Estimated Savings: {formatMainCurrencyAmount(recommendation.estimatedSavings, userCurrency)}
										</div>
									{/if}
									<div class="flex gap-2 mt-2">
										{#if recommendation.actionable && onApply}
											<Button 
												size="sm" 
												onclick={handleApply}
											>
												Apply Optimization
											</Button>
										{/if}
										<Button
											size="sm"
											variant="outline"
											onclick={() => handleFeedback(recommendation.id, 'accepted')}
										>
											<CheckCircle2 class="w-4 h-4 mr-1" />
											Helpful
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onclick={() => handleFeedback(recommendation.id, 'rejected')}
										>
											<X class="w-4 h-4 mr-1" />
											Not Helpful
										</Button>
									</div>
								</div>
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Actions -->
			<div class="flex gap-2 justify-end">
				{#if onDismiss}
					<Button variant="outline" onclick={onDismiss}>
						Dismiss
					</Button>
				{/if}
				{#if onApply && result.optimizedPlan}
					<Button onclick={handleApply}>
						<CheckCircle2 class="h-4 w-4 mr-2" />
						Apply Optimization
					</Button>
				{/if}
			</div>
		</div>
	{:else}
		<Card.Root>
			<Card.Content class="p-6">
				<div class="text-center text-muted-foreground">
					No optimization plan generated
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
