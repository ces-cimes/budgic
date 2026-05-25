<script lang="ts">
	import { onMount } from 'svelte';
	import { feeAvoidanceService } from '$lib/core/services/analytics/fee-avoidance-service';
	import type {
		FeeRisk,
		FeeAvoidanceRecommendation,
		FeeAvoidanceStrategy,
		TransactionAdjustment
	} from '$lib/core/services/analytics/fee-avoidance-service';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import AlertCircle from '@lucide/svelte/icons/alert-circle';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Calendar from '@lucide/svelte/icons/calendar';
	import DollarSign from '@lucide/svelte/icons/dollar-sign';
	import Shield from '@lucide/svelte/icons/shield';
	import Zap from '@lucide/svelte/icons/zap';
	import Info from '@lucide/svelte/icons/info';
	import { goto } from '$app/navigation';
	import { EmptyState } from '$lib/components/ui/empty-state';

	// Props
	interface Props {
		accountId?: string;
		showAllAccounts?: boolean;
		initialMaxRisks?: number;
		onRecommendationApplied?: () => void;
	}

	const {
		accountId,
		showAllAccounts = false,
		initialMaxRisks = 10,
		onRecommendationApplied
	}: Props = $props();

	// State
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let strategies = $state<FeeAvoidanceStrategy[]>([]);
	let selectedStrategy = $state<FeeAvoidanceStrategy | null>(null);
	let expandedRisks = $state(new Set<string>());
	let expandedRecommendations = $state(new Set<string>());
	let applyingAdjustments = $state(false);
	let maxRisksToShow = $state(10);

	$effect.pre(() => {
		maxRisksToShow = initialMaxRisks;
	});

	// Derived state
	let totalPotentialSavings = $derived(
		strategies.reduce((sum, s) => sum + s.totalPotentialSavings, 0)
	);

	let allRisks = $derived(
		strategies
			.flatMap((s) => s.risks)
			.sort((a, b) => {
				const urgencyOrder = { imminent: 4, high: 3, medium: 2, low: 1 };
				const urgencyDiff = urgencyOrder[b.likelihood] - urgencyOrder[a.likelihood];
				if (urgencyDiff !== 0) return urgencyDiff;
				return (a.daysUntilOccurrence || 999) - (b.daysUntilOccurrence || 999);
			})
	);

	let displayedRisks = $derived(allRisks.slice(0, maxRisksToShow));

	let hasHighPriorityRisks = $derived(
		allRisks.some((r) => r.likelihood === 'imminent' || r.likelihood === 'high')
	);

	// Load fee avoidance data
	async function loadFeeAvoidanceData() {
		try {
			isLoading = true;
			error = null;

			if (accountId) {
				const strategy = await feeAvoidanceService.generateFeeAvoidanceStrategy(accountId);
				strategies =
					strategy.risks.length > 0 || strategy.recommendations.length > 0 ? [strategy] : [];
				selectedStrategy = strategies[0] || null;
			} else if (showAllAccounts) {
				strategies = await feeAvoidanceService.generateAllFeeAvoidanceStrategies();
				selectedStrategy = strategies[0] || null;
			} else {
				// Show limited view for specific account
				const risks = await feeAvoidanceService.detectFeeRisks({
					accountIds: accountId ? [accountId] : undefined,
					daysAhead: 90
				});
				strategies =
					risks.length > 0
						? [
								{
									accountId: accountId || '',
									totalPotentialSavings: risks.reduce((sum, r) => sum + r.estimatedAmount, 0),
									recommendations: [],
									risks,
									autoAdjustableTransactions: [],
									requiresUserAction: false
								}
							]
						: [];
			}
		} catch (err) {
			console.error('Failed to load fee avoidance data:', err);
			error = err instanceof Error ? err.message : 'Failed to load fee avoidance data';
		} finally {
			isLoading = false;
		}
	}

	// Toggle risk expansion
	function toggleRisk(riskId: string) {
		const newExpanded = new Set(expandedRisks);
		if (newExpanded.has(riskId)) {
			newExpanded.delete(riskId);
		} else {
			newExpanded.add(riskId);
		}
		expandedRisks = newExpanded;
	}

	// Toggle recommendation expansion
	function toggleRecommendation(recommendationId: string) {
		const newExpanded = new Set(expandedRecommendations);
		if (newExpanded.has(recommendationId)) {
			newExpanded.delete(recommendationId);
		} else {
			newExpanded.add(recommendationId);
		}
		expandedRecommendations = newExpanded;
	}

	// Apply transaction adjustments
	async function applyAdjustments(adjustments: TransactionAdjustment[]) {
		try {
			applyingAdjustments = true;
			const result = await feeAvoidanceService.applyTransactionAdjustments(adjustments);

			if (result.failed > 0) {
				error = `Applied ${result.applied} adjustments, but ${result.failed} failed: ${result.errors.join(', ')}`;
			}

			// Reload data
			await loadFeeAvoidanceData();
			onRecommendationApplied?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to apply adjustments';
		} finally {
			applyingAdjustments = false;
		}
	}

	// Handle recommendation action
	function handleRecommendationAction(recommendation: FeeAvoidanceRecommendation) {
		if (recommendation.actionUrl) {
			goto(recommendation.actionUrl);
		}
	}

	// Get likelihood color
	function getLikelihoodColor(likelihood: FeeRisk['likelihood']): string {
		switch (likelihood) {
			case 'imminent':
				return 'bg-red-500/10 text-red-500 border-red-500/20';
			case 'high':
				return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
			case 'medium':
				return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
			case 'low':
				return 'bg-[var(--color-info)]/10 text-[var(--color-info)] border-[var(--color-info)]/20';
		}
	}

	// Get priority color
	function getPriorityColor(priority: FeeAvoidanceRecommendation['priority']): string {
		switch (priority) {
			case 'urgent':
				return 'bg-red-500/10 text-red-500 border-red-500/20';
			case 'high':
				return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
			case 'medium':
				return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
			case 'low':
				return 'bg-green-500/10 text-green-500 border-green-500/20';
		}
	}

	// Get likelihood icon
	function getLikelihoodIcon(likelihood: FeeRisk['likelihood']) {
		switch (likelihood) {
			case 'imminent':
			case 'high':
				return AlertCircle;
			case 'medium':
				return AlertTriangle;
			case 'low':
				return Info;
		}
	}

	// Format currency
	function formatCurrency(amount: number, currency: string): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}

	// Format date
	function formatDate(date: Date): string {
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}

	// Initialize
	onMount(() => {
		loadFeeAvoidanceData();
	});
</script>

<div class="fee-avoidance-panel space-y-4">
	{#if isLoading}
		<!-- Loading skeleton -->
		<Card>
			<CardHeader>
				<Skeleton class="h-6 w-48" />
			</CardHeader>
			<CardContent class="space-y-3">
				<Skeleton class="h-20 w-full" />
				<Skeleton class="h-20 w-full" />
				<Skeleton class="h-20 w-full" />
			</CardContent>
		</Card>
	{:else if error}
		<!-- Error state -->
		<Alert variant="destructive">
			<AlertCircle class="h-4 w-4" />
			<AlertTitle>Error</AlertTitle>
			<AlertDescription>{error}</AlertDescription>
		</Alert>
		<Button onclick={loadFeeAvoidanceData} variant="outline" size="sm">
			<span>Retry</span>
		</Button>
	{:else if strategies.length === 0}
		<!-- No risks found -->
		<Card>
			<CardContent class="py-8">
				<EmptyState
					icon={Shield}
					iconVariant="circle"
					heading="No Fee Risks Detected"
					body="Your accounts are looking good! We're not detecting any potential fees in the next 90 days."
					iconClass="text-green-500"
					bodyClass="text-text-secondary max-w-md"
					class="py-0"
				>
					{#snippet children()}
						<Button onclick={loadFeeAvoidanceData} variant="outline" size="sm">
							<span>Refresh</span>
						</Button>
					{/snippet}
				</EmptyState>
			</CardContent>
		</Card>
	{:else}
		<!-- Fee avoidance content -->

		<!-- Summary card -->
		{#if totalPotentialSavings > 0}
			<Card class="border-orange-500/20 bg-orange-500/5">
				<CardContent class="py-4">
					<div class="flex items-start justify-between">
						<div class="space-y-1">
							<div class="flex items-center gap-2">
								<DollarSign class="h-5 w-5 text-orange-500" />
								<h3 class="text-text-primary text-lg font-semibold">
									Potential Savings: {formatCurrency(totalPotentialSavings, 'USD')}
								</h3>
							</div>
							<p class="text-text-secondary text-sm">
								{allRisks.length} fee risk{allRisks.length !== 1 ? 's' : ''} detected across your accounts
							</p>
						</div>
						{#if hasHighPriorityRisks}
							<Badge variant="destructive" class="flex items-center gap-1">
								<Zap class="h-3 w-3" />
								<span>Action Required</span>
							</Badge>
						{/if}
					</div>
				</CardContent>
			</Card>
		{/if}

		<!-- Fee risks -->
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<AlertTriangle class="h-5 w-5 text-orange-500" />
					<span>Fee Risks ({displayedRisks.length})</span>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="space-y-3">
					{#each displayedRisks as risk (risk.id)}
						{@const Icon = getLikelihoodIcon(risk.likelihood)}
						<div
							class="border-border hover:bg-secondary/50 cursor-pointer rounded-lg border p-4 transition-colors"
							role="button"
							tabindex="0"
							onclick={() => toggleRisk(risk.id)}
							onkeydown={(e) => e.key === 'Enter' && toggleRisk(risk.id)}
						>
							<div class="flex items-start justify-between gap-4">
								<div class="flex min-w-0 flex-1 items-start gap-3">
									<div class="mt-1">
										<Icon
											class="h-5 w-5 {risk.likelihood === 'imminent' || risk.likelihood === 'high'
												? 'text-red-500'
												: risk.likelihood === 'medium'
													? 'text-yellow-500'
													: 'text-[var(--color-info)]'}"
										/>
									</div>
									<div class="min-w-0 flex-1 space-y-2">
										<div class="flex items-start justify-between gap-2">
											<div class="min-w-0 flex-1">
												<h4 class="text-text-primary text-base font-semibold">
													{risk.triggerCondition}
												</h4>
												<p class="text-text-secondary text-sm">
													{risk.accountName}
												</p>
											</div>
											<Badge class={getLikelihoodColor(risk.likelihood)} variant="outline">
												{risk.likelihood}
											</Badge>
										</div>

										<div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
											<div>
												<div class="text-text-tertiary text-xs">Estimated Fee</div>
												<div class="text-text-primary font-semibold">
													{formatCurrency(risk.estimatedAmount, risk.currency)}
												</div>
											</div>
											{#if risk.daysUntilOccurrence !== null}
												<div>
													<div class="text-text-tertiary text-xs">Days Until</div>
													<div class="text-text-primary font-semibold">
														{risk.daysUntilOccurrence}
													</div>
												</div>
											{/if}
											{#if risk.occurrenceDate}
												<div>
													<div class="text-text-tertiary text-xs">Date</div>
													<div class="text-text-primary font-semibold">
														{formatDate(risk.occurrenceDate)}
													</div>
												</div>
											{/if}
											<div>
												<div class="text-text-tertiary text-xs">Confidence</div>
												<div class="text-text-primary font-semibold">{risk.confidence}%</div>
											</div>
										</div>

										{#if expandedRisks.has(risk.id)}
											<div class="border-border mt-3 space-y-2 border-t pt-3">
												<div class="grid grid-cols-2 gap-3 text-sm">
													<div>
														<div class="text-text-tertiary text-xs">Current Value</div>
														<div class="text-text-primary">
															{formatCurrency(risk.currentValue, risk.currency)}
														</div>
													</div>
													<div>
														<div class="text-text-tertiary text-xs">Threshold</div>
														<div class="text-text-primary">
															{formatCurrency(risk.thresholdValue, risk.currency)}
														</div>
													</div>
												</div>
											</div>
										{/if}
									</div>
								</div>
								<Button
									variant="ghost"
									size="sm"
									onclick={(e) => {
										e.stopPropagation();
										toggleRisk(risk.id);
									}}
								>
									<ArrowRight
										class="h-4 w-4 transition-transform {expandedRisks.has(risk.id)
											? 'rotate-90'
											: ''}"
									/>
								</Button>
							</div>
						</div>
					{/each}

					{#if allRisks.length > maxRisksToShow}
						<Button variant="outline" class="w-full" onclick={() => (maxRisksToShow += 10)}>
							<span>Show {Math.min(10, allRisks.length - maxRisksToShow)} More</span>
						</Button>
					{/if}
				</div>
			</CardContent>
		</Card>

		<!-- Recommendations -->
		{#if strategies.some((s) => s.recommendations.length > 0)}
			<Card>
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<TrendingUp class="h-5 w-5 text-green-500" />
						<span>Recommendations</span>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="space-y-3">
						{#each strategies.flatMap((s) => s.recommendations) as recommendation (recommendation.id)}
							<div class="border-border space-y-3 rounded-lg border p-4">
								<div class="flex items-start justify-between gap-4">
									<div class="flex-1 space-y-2">
										<div class="flex items-start justify-between gap-2">
											<h4 class="text-text-primary text-base font-semibold">
												{recommendation.title}
											</h4>
											<Badge class={getPriorityColor(recommendation.priority)} variant="outline">
												{recommendation.priority}
											</Badge>
										</div>
										<p class="text-text-secondary text-sm">{recommendation.description}</p>

										<div class="grid grid-cols-3 gap-3 text-sm">
											<div>
												<div class="text-text-tertiary text-xs">Savings</div>
												<div class="font-semibold text-green-500">
													{formatCurrency(recommendation.estimatedSavings, 'USD')}
												</div>
											</div>
											<div>
												<div class="text-text-tertiary text-xs">Effort</div>
												<div class="text-text-primary font-semibold capitalize">
													{recommendation.effort}
												</div>
											</div>
											<div>
												<div class="text-text-tertiary text-xs">Confidence</div>
												<div class="text-text-primary font-semibold">
													{recommendation.confidence}%
												</div>
											</div>
										</div>

										{#if recommendation.suggestedTransactionChanges && recommendation.suggestedTransactionChanges.length > 0}
											<div class="border-border mt-3 border-t pt-3">
												<div class="text-text-primary mb-2 text-sm font-medium">
													Suggested Changes ({recommendation.suggestedTransactionChanges.length})
												</div>
												<Button
													variant="secondary"
													size="sm"
													onclick={() =>
														applyAdjustments(recommendation.suggestedTransactionChanges!)}
													disabled={applyingAdjustments}
												>
													<Calendar class="mr-2 h-4 w-4" />
													<span>
														{applyingAdjustments ? 'Applying...' : 'Apply Adjustments'}
													</span>
												</Button>
											</div>
										{/if}
									</div>
								</div>

								{#if recommendation.actionable && recommendation.actionUrl}
									<Button
										variant="default"
										size="sm"
										class="w-full"
										onclick={() => handleRecommendationAction(recommendation)}
									>
										<span>{recommendation.actionText || 'Take Action'}</span>
										<ArrowRight class="ml-2 h-4 w-4" />
									</Button>
								{/if}
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		{/if}

		<!-- Refresh button -->
		<div class="flex justify-center">
			<Button variant="outline" onclick={loadFeeAvoidanceData} disabled={isLoading}>
				<span>Refresh Analysis</span>
			</Button>
		</div>
	{/if}
</div>

<style>
	.fee-avoidance-panel {
		container-type: inline-size;
	}
</style>
