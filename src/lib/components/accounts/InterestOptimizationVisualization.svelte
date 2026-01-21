<script lang="ts">
	import type { Account } from '$lib/core/db';
	import type {
		InterestOptimizationAnalysis,
		AggregateInterestAnalysis,
		InterestCalculation
	} from '$lib/core/services/analytics/interest-optimization-service';
	import { interestOptimizationService } from '$lib/core/services/analytics/interest-optimization-service';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
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
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		account?: Account;
		showAggregate?: boolean;
		showDetails?: boolean;
		showRecommendations?: boolean;
	}

	const { account, showAggregate = false, showDetails = true, showRecommendations = true }: Props = $props();

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
					<PiggyBank class="w-5 h-5 text-success" />
				{:else}
					<CreditCard class="w-5 h-5 text-destructive" />
				{/if}
				Interest Analysis: {account.name}
			</CardTitle>
			<CardDescription>
				{accountAnalysis.currentInterest.isEarning ? 'Earning' : 'Costing'} interest at{' '}
				{accountAnalysis.currentInterest.interestRate.toFixed(2)}% APY
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Interest Rate Display -->
			<div class="text-center space-y-2">
				<div
					class="text-4xl font-bold {accountAnalysis.currentInterest.isEarning
						? 'text-success'
						: 'text-destructive'}"
				>
					{accountAnalysis.currentInterest.interestRate.toFixed(2)}%
				</div>
				<div class="flex items-center justify-center gap-2">
					{#if accountAnalysis.currentInterest.isEarning}
						<TrendingUp class="w-4 h-4 text-success" />
						<Badge variant="default" class="bg-success/10 text-success border-success/50">
							Earning Interest
						</Badge>
					{:else}
						<TrendingDown class="w-4 h-4 text-destructive" />
						<Badge variant="destructive">Paying Interest</Badge>
					{/if}
				</div>
			</div>

			<!-- Interest Breakdown -->
			{#if showDetails}
				<div class="grid grid-cols-2 gap-4 pt-4 border-t">
					<div>
						<div class="text-xs text-muted-foreground">Daily Interest</div>
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
						<div class="text-xs text-muted-foreground">Monthly Interest</div>
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
						<div class="text-xs text-muted-foreground">Annual Interest</div>
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
						<div class="text-xs text-muted-foreground">Current Balance</div>
						<div class="text-lg font-semibold">
							{formatTransactionAmount(
								accountAnalysis.currentInterest.currentBalance,
								accountAnalysis.currentInterest.currency
							)}
						</div>
					</div>
				</div>

				<!-- Projected Interest -->
				<div class="pt-4 border-t">
					<div class="text-sm font-medium mb-2">Projected Interest</div>
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
				<div class="pt-4 border-t">
					<button
						class="flex items-center justify-between w-full p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors"
						onclick={() => (showOpportunities = !showOpportunities)}
					>
						<span class="text-sm font-medium flex items-center gap-2">
							<Info class="w-4 h-4" />
							Opportunities ({accountAnalysis.optimizationOpportunities.length})
						</span>
						<ChevronDown
							class="w-4 h-4 transition-transform {showOpportunities ? 'rotate-180' : ''}"
						/>
					</button>
					{#if showOpportunities}
						<div class="mt-2 space-y-2">
							{#each accountAnalysis.optimizationOpportunities as opp}
								<div class="p-3 rounded-lg border {getPriorityBgColor(opp.priority)}">
									<div class="flex items-start gap-2">
										<AlertCircle
											class="w-4 h-4 mt-0.5 {getPriorityColor(opp.priority)}"
										/>
										<div class="flex-1">
											<div class="text-sm font-medium">{opp.title}</div>
											<div class="text-xs text-muted-foreground mt-1">{opp.description}</div>
											<div class="text-xs text-info mt-1">
												Potential value: {formatTransactionAmount(opp.estimatedValue, accountAnalysis.currentInterest.currency)}/year
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
				<div class="pt-4 border-t">
					<button
						class="flex items-center justify-between w-full p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors"
						onclick={() => (showRecommendationsExpanded = !showRecommendationsExpanded)}
					>
						<span class="text-sm font-medium flex items-center gap-2">
							<Info class="w-4 h-4" />
							Recommendations ({accountAnalysis.recommendedActions.length})
						</span>
						<ChevronDown
							class="w-4 h-4 transition-transform {showRecommendationsExpanded ? 'rotate-180' : ''}"
						/>
					</button>
					{#if showRecommendationsExpanded}
						<div class="mt-2 space-y-2">
							{#each accountAnalysis.recommendedActions as rec}
								{@const Icon = rec.priority === 'urgent' || rec.priority === 'high'
									? AlertCircle
									: rec.priority === 'medium'
										? Info
										: Info}
								<div class="p-3 rounded-lg border {getPriorityBgColor(rec.priority)}">
									<div class="flex items-start gap-2">
										<Icon
											class="w-4 h-4 mt-0.5 {getPriorityColor(rec.priority)}"
										/>
										<div class="flex-1">
											<div class="text-sm font-medium">{rec.title}</div>
											<div class="text-xs text-muted-foreground mt-1">{rec.description}</div>
											<div class="text-xs font-medium mt-1">{rec.recommendedAction}</div>
											<div class="text-xs text-info mt-1">
												Estimated value: {formatTransactionAmount(rec.estimatedAnnualValue, accountAnalysis.currentInterest.currency)}/year
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
				<div class="pt-4 border-t">
					<div class="text-sm font-medium mb-2">Optimization Potential</div>
					{#if accountAnalysis.projectedSavings !== undefined}
						<div class="text-lg font-semibold text-success">
							Potential Savings: {formatTransactionAmount(accountAnalysis.projectedSavings, accountAnalysis.currentInterest.currency)}/year
						</div>
					{/if}
					{#if accountAnalysis.projectedEarnings !== undefined}
						<div class="text-lg font-semibold text-success">
							Potential Earnings: {formatTransactionAmount(accountAnalysis.projectedEarnings, accountAnalysis.currentInterest.currency)}/year
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
				<Info class="w-5 h-5" />
				Overall Interest Analysis
			</CardTitle>
			<CardDescription>
				Across {aggregateAnalysis.savingsAccounts.length + aggregateAnalysis.debtAccounts.length} account{aggregateAnalysis.savingsAccounts.length + aggregateAnalysis.debtAccounts.length !== 1
					? 's'
					: ''}
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Net Interest -->
			<div class="text-center space-y-2">
				<div
					class="text-4xl font-bold {aggregateAnalysis.netAnnualInterest >= 0
						? 'text-success'
						: 'text-destructive'}"
				>
					{aggregateAnalysis.netAnnualInterest >= 0 ? '+' : ''}
					{formatTransactionAmount(aggregateAnalysis.netAnnualInterest, 'USD')}
				</div>
				<div class="text-sm text-muted-foreground">Net Annual Interest</div>
			</div>

			<!-- Breakdown -->
			<div class="grid grid-cols-2 gap-4 pt-4 border-t">
				<div>
					<div class="text-xs text-muted-foreground">Annual Earnings</div>
					<div class="text-lg font-semibold text-success">
						+{formatTransactionAmount(aggregateAnalysis.totalAnnualEarnings, 'USD')}
					</div>
					<div class="text-xs text-muted-foreground mt-1">
						{aggregateAnalysis.savingsAccounts.length} savings account{aggregateAnalysis.savingsAccounts.length !== 1
							? 's'
							: ''}
					</div>
				</div>
				<div>
					<div class="text-xs text-muted-foreground">Annual Costs</div>
					<div class="text-lg font-semibold text-destructive">
						-{formatTransactionAmount(aggregateAnalysis.totalAnnualCosts, 'USD')}
					</div>
					<div class="text-xs text-muted-foreground mt-1">
						{aggregateAnalysis.debtAccounts.length} debt account{aggregateAnalysis.debtAccounts.length !== 1
							? 's'
							: ''}
					</div>
				</div>
			</div>

			<!-- Optimization Potential -->
			{#if aggregateAnalysis.optimizationPotential > 0}
				<div class="pt-4 border-t">
					<div class="text-sm font-medium mb-2">Optimization Potential</div>
					<div class="text-lg font-semibold text-info">
						{formatTransactionAmount(aggregateAnalysis.optimizationPotential, 'USD')}/year
					</div>
					<div class="text-xs text-muted-foreground mt-1">
						Potential savings or earnings from optimization
					</div>
				</div>
			{/if}

			<!-- Account Breakdown -->
			{#if showDetails}
				<div class="pt-4 border-t">
					<button
						class="flex items-center justify-between w-full p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors"
						onclick={() => (showAccountDetails = !showAccountDetails)}
					>
						<span class="text-sm font-medium">Account Details</span>
						<ChevronDown
							class="w-4 h-4 transition-transform {showAccountDetails ? 'rotate-180' : ''}"
						/>
					</button>
					{#if showAccountDetails}
						<div class="mt-2 space-y-2">
							<!-- Savings Accounts -->
							{#if aggregateAnalysis.savingsAccounts.length > 0}
								<div class="text-xs font-medium text-muted-foreground mb-1">Savings Accounts</div>
								{#each aggregateAnalysis.savingsAccounts as savings}
									<div class="p-3 rounded-lg border border-success/50 bg-success/10">
										<div class="flex items-center justify-between mb-2">
											<div class="font-medium">{savings.accountName}</div>
											<Badge variant="default" class="bg-success/10 text-success border-success/50">
												{savings.interestRate.toFixed(2)}%
											</Badge>
										</div>
										<div class="text-xs text-muted-foreground">
											Earning {formatTransactionAmount(savings.annualInterest, savings.currency)}/year
										</div>
									</div>
								{/each}
							{/if}

							<!-- Debt Accounts -->
							{#if aggregateAnalysis.debtAccounts.length > 0}
								<div class="text-xs font-medium text-muted-foreground mb-1 mt-2">Debt Accounts</div>
								{#each aggregateAnalysis.debtAccounts as debt}
									<div class="p-3 rounded-lg border border-destructive/50 bg-destructive/10">
										<div class="flex items-center justify-between mb-2">
											<div class="font-medium">{debt.accountName}</div>
											<Badge variant="destructive">
												{debt.interestRate.toFixed(2)}%
											</Badge>
										</div>
										<div class="text-xs text-muted-foreground">
											Costing {formatTransactionAmount(debt.annualInterest, debt.currency)}/year
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
				<div class="pt-4 border-t">
					<button
						class="flex items-center justify-between w-full p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors"
						onclick={() => (showRecommendationsExpanded = !showRecommendationsExpanded)}
					>
						<span class="text-sm font-medium flex items-center gap-2">
							<Info class="w-4 h-4" />
							Recommendations ({aggregateAnalysis.recommendations.length})
						</span>
						<ChevronDown
							class="w-4 h-4 transition-transform {showRecommendationsExpanded ? 'rotate-180' : ''}"
						/>
					</button>
					{#if showRecommendationsExpanded}
						<div class="mt-2 space-y-2">
							{#each aggregateAnalysis.recommendations as rec}
								{@const Icon = rec.priority === 'urgent' || rec.priority === 'high'
									? AlertCircle
									: rec.priority === 'medium'
										? Info
										: Info}
								<div class="p-3 rounded-lg border {getPriorityBgColor(rec.priority)}">
									<div class="flex items-start gap-2">
										<Icon
											class="w-4 h-4 mt-0.5 {getPriorityColor(rec.priority)}"
										/>
										<div class="flex-1">
											<div class="text-sm font-medium">{rec.title}</div>
											<div class="text-xs text-muted-foreground mt-1">{rec.description}</div>
											<div class="text-xs font-medium mt-1">{rec.recommendedAction}</div>
											<div class="text-xs text-info mt-1">
												Estimated value: {formatTransactionAmount(rec.estimatedAnnualValue, 'USD')}/year
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
	<div class="text-center p-8 text-muted-foreground">
		<Info class="w-12 h-12 mx-auto mb-4 opacity-50" />
		<p>No interest-bearing accounts found.</p>
		<p class="text-sm mt-2">
			Add interest rate information to your accounts to see interest analysis.
		</p>
	</div>
{/if}
