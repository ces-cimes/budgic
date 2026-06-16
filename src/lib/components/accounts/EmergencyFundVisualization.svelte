<script lang="ts">
	import type {
		EmergencyFundAnalysis,
		EmergencyFundRecommendation
	} from '$lib/core/services/analytics/emergency-fund-service';
	import { emergencyFundService } from '$lib/core/services/analytics/emergency-fund-service';
	import { formatTransactionAmount, formatPercentage } from '$lib/utils/currency-utils';
	import {
		AlertCircle,
		CheckCircle2,
		AlertTriangle,
		TrendingUp,
		Info,
		Shield,
		Target
	} from '@lucide/svelte';
	import { Progress } from '$lib/components/ui/progress';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { ChevronDown } from '@lucide/svelte';

	interface Props {
		showDetails?: boolean;
		showRecommendations?: boolean;
	}

	const { showDetails = true, showRecommendations = true }: Props = $props();

	let analysis = $state<EmergencyFundAnalysis | null>(null);
	let recommendations = $state<EmergencyFundRecommendation[]>([]);
	let isLoading = $state(false);
	let showRecommendationsExpanded = $state(false);
	let showAccountBreakdown = $state(false);

	// Load data on mount
	$effect(() => {
		loadData();
	});

	async function loadData() {
		isLoading = true;
		try {
			analysis = await emergencyFundService.analyzeEmergencyFund();
			if (analysis) {
				recommendations = await emergencyFundService.generateRecommendations();
			}
		} catch (error) {
			console.error('Error loading emergency fund data:', error);
		} finally {
			isLoading = false;
		}
	}

	const statusConfig = $derived({
		optimal: {
			icon: CheckCircle2,
			color: 'text-success',
			bgColor: 'bg-success/10',
			borderColor: 'border-success/50',
			label: 'Optimal',
			description: 'Emergency fund is fully funded'
		},
		adequate: {
			icon: TrendingUp,
			color: 'text-info',
			bgColor: 'bg-info/10',
			borderColor: 'border-info/50',
			label: 'Adequate',
			description: 'Emergency fund is in good shape'
		},
		low: {
			icon: AlertTriangle,
			color: 'text-warning',
			bgColor: 'bg-warning/10',
			borderColor: 'border-warning/50',
			label: 'Low',
			description: 'Emergency fund needs attention'
		},
		critical: {
			icon: AlertCircle,
			color: 'text-destructive',
			bgColor: 'bg-destructive/10',
			borderColor: 'border-destructive/50',
			label: 'Critical',
			description: 'Emergency fund is critically low'
		},
		depleted: {
			icon: AlertCircle,
			color: 'text-destructive',
			bgColor: 'bg-destructive/20',
			borderColor: 'border-destructive/70',
			label: 'Depleted',
			description: 'Emergency fund has been depleted'
		}
	});

	const currentConfig = $derived(analysis ? statusConfig[analysis.status] : statusConfig.optimal);

	const CurrentIcon = $derived(currentConfig.icon);

	// Get user currency for formatting
	const userCurrency = $derived(analysis ? 'USD' : 'USD'); // TODO: Get from user preferences
</script>

{#if isLoading}
	<div class="flex items-center justify-center p-8">
		<div class="text-muted-foreground">Loading emergency fund analysis...</div>
	</div>
{:else if !analysis}
	<div class="p-8 text-center">
		<Shield class="text-muted-foreground mx-auto mb-4 h-12 w-12" />
		<h3 class="text-primary mb-2 text-lg font-semibold">No Emergency Fund Designated</h3>
		<p class="text-muted-foreground mb-4 text-sm">
			Designate savings accounts as emergency fund accounts to track your emergency reserves.
		</p>
	</div>
{:else}
	<div class="space-y-4">
		<!-- Emergency Fund Status Header -->
		<Card class="border-2 {currentConfig.borderColor}">
			<CardHeader>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<CurrentIcon class="h-6 w-6 {currentConfig.color}" />
						<div>
							<CardTitle class="text-lg">{currentConfig.label}</CardTitle>
							<CardDescription>{currentConfig.description}</CardDescription>
						</div>
					</div>
					<Badge
						variant={analysis.status === 'optimal' || analysis.status === 'adequate'
							? 'default'
							: 'destructive'}
					>
						{analysis.monthsCovered.toFixed(1)} months
					</Badge>
				</div>
			</CardHeader>
			<CardContent class="space-y-4">
				<!-- Progress Bar -->
				<div class="space-y-2">
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">Progress to Target</span>
						<span class="font-medium"
							>{formatPercentage(analysis.percentageAchieved)}</span
						>
					</div>
					<Progress value={analysis.percentageAchieved} max={100} class="h-3" />
					<div class="text-muted-foreground flex justify-between text-xs">
						<span>
							Current: {formatTransactionAmount(
								analysis.currentBalance,
								userCurrency
							)}
						</span>
						<span>
							Target: {formatTransactionAmount(analysis.targetAmount, userCurrency)}
						</span>
					</div>
				</div>

				<!-- Key Metrics -->
				{#if showDetails}
					<div class="grid grid-cols-2 gap-4 pt-2">
						<div class="space-y-1">
							<div class="text-muted-foreground text-xs">Months Covered</div>
							<div class="text-lg font-semibold">
								{analysis.monthsCovered.toFixed(1)}
							</div>
							<div class="text-muted-foreground text-xs">
								Target: {analysis.factors.targetMonths} months
							</div>
						</div>
						<div class="space-y-1">
							<div class="text-muted-foreground text-xs">Monthly Contribution</div>
							<div class="text-lg font-semibold">
								{formatTransactionAmount(
									analysis.recommendedMonthlyContribution,
									userCurrency
								)}
							</div>
							<div class="text-muted-foreground text-xs">
								{analysis.monthsToTarget > 0
									? `${analysis.monthsToTarget} months to target`
									: 'Target reached'}
							</div>
						</div>
					</div>
				{/if}

				<!-- Account Breakdown -->
				{#if analysis.emergencyFundAccounts.length > 0}
					<div class="border-t pt-2">
						<button
							class="text-muted-foreground hover:text-foreground flex w-full items-center justify-between text-sm font-medium transition-colors"
							onclick={() => (showAccountBreakdown = !showAccountBreakdown)}
						>
							<span
								>Emergency Fund Accounts ({analysis.emergencyFundAccounts
									.length})</span
							>
							<ChevronDown
								class="h-4 w-4 transition-transform {showAccountBreakdown
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if showAccountBreakdown}
							<div class="mt-2 space-y-2">
								{#each analysis.emergencyFundAccounts as account}
									<div
										class="bg-muted/50 flex items-center justify-between rounded p-2"
									>
										<span class="text-sm">{account.accountName}</span>
										<div class="text-right">
											<div class="text-sm font-medium">
												{formatTransactionAmount(
													account.balance,
													userCurrency
												)}
											</div>
											<div class="text-muted-foreground text-xs">
												{account.percentage.toFixed(1)}%
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Partial Usage Warning -->
				{#if analysis.partialUsage && analysis.partialUsage.percentageUsed > 0}
					<div class="bg-warning/10 border-warning/50 rounded-lg border p-3">
						<div class="flex items-start gap-2">
							<AlertTriangle class="text-warning mt-0.5 h-5 w-5" />
							<div class="flex-1">
								<div class="text-warning text-sm font-medium">
									Emergency Fund Used ({formatPercentage(
										analysis.partialUsage.percentageUsed,
										{
											maxDecimals: 0
										}
									)})
								</div>
								<div class="text-muted-foreground mt-1 text-xs">
									{formatTransactionAmount(
										analysis.partialUsage.amountUsed,
										userCurrency
									)} used. Rebuild over {analysis.partialUsage.recoveryTimeline} months.
								</div>
							</div>
						</div>
					</div>
				{/if}
			</CardContent>
		</Card>

		<!-- Recommendations -->
		{#if showRecommendations && recommendations.length > 0}
			<Card>
				<CardHeader>
					<button
						class="flex w-full items-center justify-between"
						onclick={() => (showRecommendationsExpanded = !showRecommendationsExpanded)}
					>
						<div class="flex items-center gap-2">
							<Info class="text-info h-5 w-5" />
							<CardTitle class="text-base">
								Recommendations ({recommendations.length})
							</CardTitle>
						</div>
						<ChevronDown
							class="h-4 w-4 transition-transform {showRecommendationsExpanded
								? 'rotate-180'
								: ''}"
						/>
					</button>
				</CardHeader>
				{#if showRecommendationsExpanded}
					<CardContent class="space-y-3">
						{#each recommendations as rec}
							<div
								class="rounded-lg border p-3 {rec.priority === 'urgent' ||
								rec.priority === 'high'
									? 'border-destructive/50 bg-destructive/5'
									: rec.priority === 'medium'
										? 'border-warning/50 bg-warning/5'
										: 'border-muted bg-muted/50'}"
							>
								<div class="flex items-start gap-3">
									{#if rec.priority === 'urgent' || rec.priority === 'high'}
										<AlertCircle class="text-destructive mt-0.5 h-5 w-5" />
									{:else if rec.priority === 'medium'}
										<AlertTriangle class="text-warning mt-0.5 h-5 w-5" />
									{:else}
										<Info class="text-info mt-0.5 h-5 w-5" />
									{/if}
									<div class="flex-1 space-y-2">
										<div class="flex items-center gap-2">
											<Badge
												variant={rec.priority === 'urgent' ||
												rec.priority === 'high'
													? 'destructive'
													: rec.priority === 'medium'
														? 'default'
														: 'outline'}
											>
												{rec.priority}
											</Badge>
											<span class="text-sm font-medium">{rec.title}</span>
										</div>
										<p class="text-muted-foreground text-sm">
											{rec.description}
										</p>
										<div class="text-foreground text-sm font-medium">
											{rec.recommendedAction}
										</div>
										{#if rec.estimatedImpact.monthsToTarget}
											<div class="text-muted-foreground text-xs">
												Estimated timeline: {rec.estimatedImpact
													.monthsToTarget} months
											</div>
										{/if}
									</div>
								</div>
							</div>
						{/each}
					</CardContent>
				{/if}
			</Card>
		{/if}

		<!-- Calculation Details -->
		{#if showDetails}
			<Card>
				<CardHeader>
					<CardTitle class="flex items-center gap-2 text-base">
						<Target class="h-4 w-4" />
						Calculation Details
					</CardTitle>
				</CardHeader>
				<CardContent class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-muted-foreground">Monthly Essential Expenses:</span>
						<span class="font-medium">
							{formatTransactionAmount(
								analysis.factors.monthlyEssentialExpenses,
								userCurrency
							)}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground">Target Months:</span>
						<span class="font-medium">{analysis.factors.targetMonths}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground">Income Stability:</span>
						<span class="font-medium">
							{analysis.factors.incomeStabilityMultiplier === 1.2
								? 'Irregular (×1.2)'
								: 'Stable (×1.0)'}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground">Job Type:</span>
						<span class="font-medium">
							{analysis.factors.jobTypeMultiplier === 1.25
								? 'Contractor/Seasonal (×1.25)'
								: 'Regular (×1.0)'}
						</span>
					</div>
					{#if analysis.factors.dependentsAdjustment > 0}
						<div class="flex justify-between">
							<span class="text-muted-foreground">Dependents Adjustment:</span>
							<span class="font-medium"
								>+{analysis.factors.dependentsAdjustment}%</span
							>
						</div>
					{/if}
					{#if analysis.factors.healthAdjustment > 0}
						<div class="flex justify-between">
							<span class="text-muted-foreground">Health Needs Adjustment:</span>
							<span class="font-medium">+{analysis.factors.healthAdjustment}%</span>
						</div>
					{/if}
					{#if analysis.factors.insuranceGapsAdjustment > 0}
						<div class="flex justify-between">
							<span class="text-muted-foreground">Insurance Gaps:</span>
							<span class="font-medium">
								+{formatTransactionAmount(
									analysis.factors.insuranceGapsAdjustment,
									userCurrency
								)}
							</span>
						</div>
					{/if}
				</CardContent>
			</Card>
		{/if}
	</div>
{/if}
