<script lang="ts">
	import type { Account } from '$lib/core/db';
	import type {
		InterestOptimizationAnalysis,
		AggregateInterestAnalysis,
		InterestCalculation
	} from '$lib/core/services/analytics/interest-optimization-service';
	import { interestOptimizationService } from '$lib/core/services/analytics/interest-optimization-service';
	import { formatTransactionAmount, formatPercentage } from '$lib/utils/currency-utils';
	import {
		TrendingUp,
		TrendingDown,
		AlertCircle,
		Info,
		ArrowRight,
		PiggyBank,
		CreditCard,
		ChevronDown
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

	interface Props {
		account?: Account;
		showAggregate?: boolean;
		showDetails?: boolean;
		showRecommendations?: boolean;
	}

	const {
		account,
		showAggregate = false,
		showDetails = true,
		showRecommendations = true
	}: Props = $props();

	let aggregateAnalysis = $state<AggregateInterestAnalysis | null>(null);
	let accountAnalysis = $state<InterestOptimizationAnalysis | null>(null);
	let isLoading = $state(false);
	let showRecommendationsExpanded = $state(false);
	let showAccountDetails = $state(false);
	let showOpportunities = $state(false);

	// Load data on mount
	$effect(() => {
		loadData();
	});

	async function loadData() {
		isLoading = true;
		try {
			if (account) {
				accountAnalysis = await interestOptimizationService.analyzeAccount(account.id);
			}
			if (showAggregate) {
				aggregateAnalysis = await interestOptimizationService.analyzeAggregate();
			}
		} catch (error) {
			console.error('Error loading interest optimization data:', error);
		} finally {
			isLoading = false;
		}
	}

	function getPriorityColor(priority: 'low' | 'medium' | 'high' | 'urgent'): string {
		switch (priority) {
			case 'urgent':
				return 'text-destructive';
			case 'high':
				return 'text-warning';
			case 'medium':
				return 'text-info';
			default:
				return 'text-muted-foreground';
		}
	}

	function getPriorityBgColor(priority: 'low' | 'medium' | 'high' | 'urgent'): string {
		switch (priority) {
			case 'urgent':
				return 'bg-destructive/10 border-destructive/50';
			case 'high':
				return 'bg-warning/10 border-warning/50';
			case 'medium':
				return 'bg-info/10 border-info/50';
			default:
				return 'bg-muted/50 border-border';
		}
	}
</script>

{#if isLoading}
	<div class="flex items-center justify-center p-8">
		<div class="text-muted-foreground">Loading interest optimization data...</div>
	</div>
{:else if account && accountAnalysis}
	<!-- Single Account View -->
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				{#if accountAnalysis.currentInterest.isEarning}
					<PiggyBank class="text-success h-5 w-5" />
				{:else}
					<CreditCard class="text-destructive h-5 w-5" />
				{/if}
				Interest Analysis: {account.name}
			</CardTitle>
			<CardDescription>
				{accountAnalysis.currentInterest.isEarning ? 'Earning' : 'Costing'} interest at{' '}
				{formatPercentage(accountAnalysis.currentInterest.interestRate, { maxDecimals: 2 })} APY
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Interest Rate Display -->
			<div class="space-y-2 text-center">
				<div
					class="text-4xl font-bold {accountAnalysis.currentInterest.isEarning
						? 'text-success'
						: 'text-destructive'}"
				>
					{formatPercentage(accountAnalysis.currentInterest.interestRate, {
						maxDecimals: 2
					})}
				</div>
				<div class="flex items-center justify-center gap-2">
					{#if accountAnalysis.currentInterest.isEarning}
						<TrendingUp class="text-success h-4 w-4" />
						<Badge
							variant="default"
							class="bg-success/10 text-success border-success/50"
						>
							Earning Interest
						</Badge>
					{:else}
						<TrendingDown class="text-destructive h-4 w-4" />
						<Badge variant="destructive">Paying Interest</Badge>
					{/if}
				</div>
			</div>

			<!-- Interest Breakdown -->
			{#if showDetails}
				<div class="grid grid-cols-2 gap-4 border-t pt-4">
					<div>
						<div class="text-muted-foreground text-xs">Daily Interest</div>
						<div
							class="text-lg font-semibold {accountAnalysis.currentInterest.isEarning
								? 'text-success'
								: 'text-destructive'}"
						>
							{accountAnalysis.currentInterest.isEarning ? '+' : '-'}
							{formatTransactionAmount(
								Math.abs(accountAnalysis.currentInterest.dailyInterest),
								accountAnalysis.currentInterest.currency
							)}
						</div>
					</div>
					<div>
						<div class="text-muted-foreground text-xs">Monthly Interest</div>
						<div
							class="text-lg font-semibold {accountAnalysis.currentInterest.isEarning
								? 'text-success'
								: 'text-destructive'}"
						>
							{accountAnalysis.currentInterest.isEarning ? '+' : '-'}
							{formatTransactionAmount(
								Math.abs(accountAnalysis.currentInterest.monthlyInterest),
								accountAnalysis.currentInterest.currency
							)}
						</div>
					</div>
					<div>
						<div class="text-muted-foreground text-xs">Annual Interest</div>
						<div
							class="text-lg font-semibold {accountAnalysis.currentInterest.isEarning
								? 'text-success'
								: 'text-destructive'}"
						>
							{accountAnalysis.currentInterest.isEarning ? '+' : '-'}
							{formatTransactionAmount(
								Math.abs(accountAnalysis.currentInterest.annualInterest),
								accountAnalysis.currentInterest.currency
							)}
						</div>
					</div>
					<div>
						<div class="text-muted-foreground text-xs">Current Balance</div>
						<div class="text-lg font-semibold">
							{formatTransactionAmount(
								accountAnalysis.currentInterest.currentBalance,
								accountAnalysis.currentInterest.currency
							)}
						</div>
					</div>
				</div>

				<!-- Projected Interest -->
				<div class="border-t pt-4">
					<div class="mb-2 text-sm font-medium">Projected Interest</div>
					<div class="space-y-2">
						<div class="flex items-center justify-between text-sm">
							<span class="text-muted-foreground">30 Days</span>
							<span
								class="font-medium {accountAnalysis.currentInterest.isEarning
									? 'text-success'
									: 'text-destructive'}"
							>
								{accountAnalysis.currentInterest.isEarning ? '+' : '-'}
								{formatTransactionAmount(
									Math.abs(accountAnalysis.currentInterest.projected30Days),
									accountAnalysis.currentInterest.currency
								)}
							</span>
						</div>
						<div class="flex items-center justify-between text-sm">
							<span class="text-muted-foreground">90 Days</span>
							<span
								class="font-medium {accountAnalysis.currentInterest.isEarning
									? 'text-success'
									: 'text-destructive'}"
							>
								{accountAnalysis.currentInterest.isEarning ? '+' : '-'}
								{formatTransactionAmount(
									Math.abs(accountAnalysis.currentInterest.projected90Days),
									accountAnalysis.currentInterest.currency
								)}
							</span>
						</div>
						<div class="flex items-center justify-between text-sm">
							<span class="text-muted-foreground">1 Year</span>
							<span
								class="font-medium {accountAnalysis.currentInterest.isEarning
									? 'text-success'
									: 'text-destructive'}"
							>
								{accountAnalysis.currentInterest.isEarning ? '+' : '-'}
								{formatTransactionAmount(
									Math.abs(accountAnalysis.currentInterest.projected1Year),
									accountAnalysis.currentInterest.currency
								)}
							</span>
						</div>
					</div>
				</div>
			{/if}

			<!-- Optimization Opportunities -->
			{#if accountAnalysis.optimizationOpportunities.length > 0}
				<div class="border-t pt-4">
					<button
						class="bg-muted/50 hover:bg-muted flex w-full items-center justify-between rounded-lg border p-3 transition-colors"
						onclick={() => (showOpportunities = !showOpportunities)}
					>
						<span class="flex items-center gap-2 text-sm font-medium">
							<Info class="h-4 w-4" />
							Opportunities ({accountAnalysis.optimizationOpportunities.length})
						</span>
						<ChevronDown
							class="h-4 w-4 transition-transform {showOpportunities
								? 'rotate-180'
								: ''}"
						/>
					</button>
					{#if showOpportunities}
						<div class="mt-2 space-y-2">
							{#each accountAnalysis.optimizationOpportunities as opp}
								<div
									class="rounded-lg border p-3 {getPriorityBgColor(opp.priority)}"
								>
									<div class="flex items-start gap-2">
										<AlertCircle
											class="mt-0.5 h-4 w-4 {getPriorityColor(opp.priority)}"
										/>
										<div class="flex-1">
											<div class="text-sm font-medium">{opp.title}</div>
											<div class="text-muted-foreground mt-1 text-xs">
												{opp.description}
											</div>
											<div class="text-info mt-1 text-xs">
												Potential value: {formatTransactionAmount(
													opp.estimatedValue,
													accountAnalysis.currentInterest.currency
												)}/year
											</div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Recommendations -->
			{#if showRecommendations && accountAnalysis.recommendedActions.length > 0}
				<div class="border-t pt-4">
					<button
						class="bg-muted/50 hover:bg-muted flex w-full items-center justify-between rounded-lg border p-3 transition-colors"
						onclick={() => (showRecommendationsExpanded = !showRecommendationsExpanded)}
					>
						<span class="flex items-center gap-2 text-sm font-medium">
							<Info class="h-4 w-4" />
							Recommendations ({accountAnalysis.recommendedActions.length})
						</span>
						<ChevronDown
							class="h-4 w-4 transition-transform {showRecommendationsExpanded
								? 'rotate-180'
								: ''}"
						/>
					</button>
					{#if showRecommendationsExpanded}
						<div class="mt-2 space-y-2">
							{#each accountAnalysis.recommendedActions as rec}
								{@const Icon =
									rec.priority === 'urgent' || rec.priority === 'high'
										? AlertCircle
										: rec.priority === 'medium'
											? Info
											: Info}
								<div
									class="rounded-lg border p-3 {getPriorityBgColor(rec.priority)}"
								>
									<div class="flex items-start gap-2">
										<Icon
											class="mt-0.5 h-4 w-4 {getPriorityColor(rec.priority)}"
										/>
										<div class="flex-1">
											<div class="text-sm font-medium">{rec.title}</div>
											<div class="text-muted-foreground mt-1 text-xs">
												{rec.description}
											</div>
											<div class="mt-1 text-xs font-medium">
												{rec.recommendedAction}
											</div>
											<div class="text-info mt-1 text-xs">
												Estimated value: {formatTransactionAmount(
													rec.estimatedAnnualValue,
													accountAnalysis.currentInterest.currency
												)}/year
											</div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Projected Savings/Earnings -->
			{#if accountAnalysis.projectedSavings !== undefined || accountAnalysis.projectedEarnings !== undefined}
				<div class="border-t pt-4">
					<div class="mb-2 text-sm font-medium">Optimization Potential</div>
					{#if accountAnalysis.projectedSavings !== undefined}
						<div class="text-success text-lg font-semibold">
							Potential Savings: {formatTransactionAmount(
								accountAnalysis.projectedSavings,
								accountAnalysis.currentInterest.currency
							)}/year
						</div>
					{/if}
					{#if accountAnalysis.projectedEarnings !== undefined}
						<div class="text-success text-lg font-semibold">
							Potential Earnings: {formatTransactionAmount(
								accountAnalysis.projectedEarnings,
								accountAnalysis.currentInterest.currency
							)}/year
						</div>
					{/if}
				</div>
			{/if}
		</CardContent>
	</Card>
{:else if showAggregate && aggregateAnalysis}
	<!-- Aggregate View -->
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<Info class="h-5 w-5" />
				Overall Interest Analysis
			</CardTitle>
			<CardDescription>
				Across {aggregateAnalysis.savingsAccounts.length +
					aggregateAnalysis.debtAccounts.length} account{aggregateAnalysis.savingsAccounts
					.length +
					aggregateAnalysis.debtAccounts.length !==
				1
					? 's'
					: ''}
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Net Interest -->
			<div class="space-y-2 text-center">
				<div
					class="text-4xl font-bold {aggregateAnalysis.netAnnualInterest >= 0
						? 'text-success'
						: 'text-destructive'}"
				>
					{aggregateAnalysis.netAnnualInterest >= 0 ? '+' : ''}
					{formatTransactionAmount(aggregateAnalysis.netAnnualInterest, 'USD')}
				</div>
				<div class="text-muted-foreground text-sm">Net Annual Interest</div>
			</div>

			<!-- Breakdown -->
			<div class="grid grid-cols-2 gap-4 border-t pt-4">
				<div>
					<div class="text-muted-foreground text-xs">Annual Earnings</div>
					<div class="text-success text-lg font-semibold">
						+{formatTransactionAmount(aggregateAnalysis.totalAnnualEarnings, 'USD')}
					</div>
					<div class="text-muted-foreground mt-1 text-xs">
						{aggregateAnalysis.savingsAccounts.length} savings account{aggregateAnalysis
							.savingsAccounts.length !== 1
							? 's'
							: ''}
					</div>
				</div>
				<div>
					<div class="text-muted-foreground text-xs">Annual Costs</div>
					<div class="text-destructive text-lg font-semibold">
						-{formatTransactionAmount(aggregateAnalysis.totalAnnualCosts, 'USD')}
					</div>
					<div class="text-muted-foreground mt-1 text-xs">
						{aggregateAnalysis.debtAccounts.length} debt account{aggregateAnalysis
							.debtAccounts.length !== 1
							? 's'
							: ''}
					</div>
				</div>
			</div>

			<!-- Optimization Potential -->
			{#if aggregateAnalysis.optimizationPotential > 0}
				<div class="border-t pt-4">
					<div class="mb-2 text-sm font-medium">Optimization Potential</div>
					<div class="text-info text-lg font-semibold">
						{formatTransactionAmount(
							aggregateAnalysis.optimizationPotential,
							'USD'
						)}/year
					</div>
					<div class="text-muted-foreground mt-1 text-xs">
						Potential savings or earnings from optimization
					</div>
				</div>
			{/if}

			<!-- Account Breakdown -->
			{#if showDetails}
				<div class="border-t pt-4">
					<button
						class="bg-muted/50 hover:bg-muted flex w-full items-center justify-between rounded-lg border p-3 transition-colors"
						onclick={() => (showAccountDetails = !showAccountDetails)}
					>
						<span class="text-sm font-medium">Account Details</span>
						<ChevronDown
							class="h-4 w-4 transition-transform {showAccountDetails
								? 'rotate-180'
								: ''}"
						/>
					</button>
					{#if showAccountDetails}
						<div class="mt-2 space-y-2">
							<!-- Savings Accounts -->
							{#if aggregateAnalysis.savingsAccounts.length > 0}
								<div class="text-muted-foreground mb-1 text-xs font-medium">
									Savings Accounts
								</div>
								{#each aggregateAnalysis.savingsAccounts as savings}
									<div
										class="border-success/50 bg-success/10 rounded-lg border p-3"
									>
										<div class="mb-2 flex items-center justify-between">
											<div class="font-medium">{savings.accountName}</div>
											<Badge
												variant="default"
												class="bg-success/10 text-success border-success/50"
											>
												{formatPercentage(savings.interestRate, {
													maxDecimals: 2
												})}
											</Badge>
										</div>
										<div class="text-muted-foreground text-xs">
											Earning {formatTransactionAmount(
												savings.annualInterest,
												savings.currency
											)}/year
										</div>
									</div>
								{/each}
							{/if}

							<!-- Debt Accounts -->
							{#if aggregateAnalysis.debtAccounts.length > 0}
								<div class="text-muted-foreground mt-2 mb-1 text-xs font-medium">
									Debt Accounts
								</div>
								{#each aggregateAnalysis.debtAccounts as debt}
									<div
										class="border-destructive/50 bg-destructive/10 rounded-lg border p-3"
									>
										<div class="mb-2 flex items-center justify-between">
											<div class="font-medium">{debt.accountName}</div>
											<Badge variant="destructive">
												{formatPercentage(debt.interestRate, {
													maxDecimals: 2
												})}
											</Badge>
										</div>
										<div class="text-muted-foreground text-xs">
											Costing {formatTransactionAmount(
												debt.annualInterest,
												debt.currency
											)}/year
										</div>
									</div>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Recommendations -->
			{#if showRecommendations && aggregateAnalysis.recommendations.length > 0}
				<div class="border-t pt-4">
					<button
						class="bg-muted/50 hover:bg-muted flex w-full items-center justify-between rounded-lg border p-3 transition-colors"
						onclick={() => (showRecommendationsExpanded = !showRecommendationsExpanded)}
					>
						<span class="flex items-center gap-2 text-sm font-medium">
							<Info class="h-4 w-4" />
							Recommendations ({aggregateAnalysis.recommendations.length})
						</span>
						<ChevronDown
							class="h-4 w-4 transition-transform {showRecommendationsExpanded
								? 'rotate-180'
								: ''}"
						/>
					</button>
					{#if showRecommendationsExpanded}
						<div class="mt-2 space-y-2">
							{#each aggregateAnalysis.recommendations as rec}
								{@const Icon =
									rec.priority === 'urgent' || rec.priority === 'high'
										? AlertCircle
										: rec.priority === 'medium'
											? Info
											: Info}
								<div
									class="rounded-lg border p-3 {getPriorityBgColor(rec.priority)}"
								>
									<div class="flex items-start gap-2">
										<Icon
											class="mt-0.5 h-4 w-4 {getPriorityColor(rec.priority)}"
										/>
										<div class="flex-1">
											<div class="text-sm font-medium">{rec.title}</div>
											<div class="text-muted-foreground mt-1 text-xs">
												{rec.description}
											</div>
											<div class="mt-1 text-xs font-medium">
												{rec.recommendedAction}
											</div>
											<div class="text-info mt-1 text-xs">
												Estimated value: {formatTransactionAmount(
													rec.estimatedAnnualValue,
													'USD'
												)}/year
											</div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</CardContent>
	</Card>
{:else}
	<div class="text-muted-foreground p-8 text-center">
		<Info class="mx-auto mb-4 h-12 w-12 opacity-50" />
		<p>No interest-bearing accounts found.</p>
		<p class="mt-2 text-sm">
			Add interest rate information to your accounts to see interest analysis.
		</p>
	</div>
{/if}
