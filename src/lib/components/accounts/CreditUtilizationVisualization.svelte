<script lang="ts">
	import type { Account } from '$lib/core/db';
	import type {
		CreditUtilizationAnalysis,
		AggregateCreditUtilizationAnalysis
	} from '$lib/core/services/analytics/credit-utilization-service';
	import { creditUtilizationService } from '$lib/core/services/analytics/credit-utilization-service';
	import {
		getCreditUtilization,
		getCreditUtilizationStatus,
		type CreditUtilizationStatus
	} from '$lib/utils/account-metadata-utils';
	import { formatTransactionAmount, formatPercentage } from '$lib/utils/currency-utils';
	import { AlertCircle, CheckCircle2, AlertTriangle, TrendingUp, CreditCard, Info } from '@lucide/svelte';
	import { Progress } from '$lib/components/ui/progress';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { ChevronDown } from '@lucide/svelte';

	interface Props {
		account?: Account;
		showAggregate?: boolean;
		showDetails?: boolean;
		showRecommendations?: boolean;
	}

	const { account, showAggregate = false, showDetails = true, showRecommendations = true }: Props = $props();

	let aggregateAnalysis = $state<AggregateCreditUtilizationAnalysis | null>(null);
	let accountAnalysis = $state<CreditUtilizationAnalysis | null>(null);
	let recommendations = $state<any[]>([]);
	let isLoading = $state(false);
	let showRecommendationsExpanded = $state(false);
	let showAccountDetails = $state(false);

	// Load data on mount
	$effect(() => {
		loadData();
	});

	async function loadData() {
		isLoading = true;
		try {
			if (account) {
				accountAnalysis = await creditUtilizationService.analyzeAccount(account.id);
			}
			if (showAggregate) {
				aggregateAnalysis = await creditUtilizationService.analyzeAggregate();
				recommendations = await creditUtilizationService.generateRecommendations();
			}
		} catch (error) {
			console.error('Error loading credit utilization data:', error);
		} finally {
			isLoading = false;
		}
	}

	const statusConfig = $derived({
		excellent: {
			icon: CheckCircle2,
			color: 'text-success',
			bgColor: 'bg-success/10',
			borderColor: 'border-success/50',
			label: 'Excellent',
			description: 'Optimal for credit score (0-10%)'
		},
		good: {
			icon: TrendingUp,
			color: 'text-info',
			bgColor: 'bg-info/10',
			borderColor: 'border-info/50',
			label: 'Good',
			description: 'Good for credit score (10-30%)'
		},
		fair: {
			icon: AlertTriangle,
			color: 'text-warning',
			bgColor: 'bg-warning/10',
			borderColor: 'border-warning/50',
			label: 'Fair',
			description: 'Moderate impact (30-50%)'
		},
		poor: {
			icon: AlertTriangle,
			color: 'text-warning',
			bgColor: 'bg-warning/20',
			borderColor: 'border-warning/70',
			label: 'Poor',
			description: 'Negative impact (50-80%)'
		},
		critical: {
			icon: AlertCircle,
			color: 'text-destructive',
			bgColor: 'bg-destructive/10',
			borderColor: 'border-destructive/50',
			label: 'Critical',
			description: 'Significant negative impact (80-100%)'
		}
	});

	// Get progress bar color based on utilization
	function getProgressColor(utilization: number): string {
		if (utilization <= 10) return 'bg-success';
		if (utilization <= 30) return 'bg-info';
		if (utilization <= 50) return 'bg-warning';
		if (utilization <= 80) return 'bg-warning';
		return 'bg-destructive';
	}

	// Format utilization with appropriate color
	function getUtilizationColor(utilization: number): string {
		if (utilization <= 10) return 'text-success';
		if (utilization <= 30) return 'text-info';
		if (utilization <= 50) return 'text-warning';
		if (utilization <= 80) return 'text-warning';
		return 'text-destructive';
	}
</script>

{#if isLoading}
	<div class="flex items-center justify-center p-8">
		<div class="text-muted-foreground">Loading credit utilization data...</div>
	</div>
{:else if account && accountAnalysis}
	<!-- Single Account View -->
	<Card class="border-2 {accountAnalysis.status ? statusConfig[accountAnalysis.status].borderColor : ''}">
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<CreditCard class="w-5 h-5" />
				Credit Utilization: {account.name}
			</CardTitle>
			<CardDescription>
				{#if accountAnalysis.daysUntilStatementClose !== undefined}
					Statement closes in {accountAnalysis.daysUntilStatementClose} day(s)
				{:else if accountAnalysis.daysUntilPaymentDue !== undefined}
					Payment due in {accountAnalysis.daysUntilPaymentDue} day(s)
				{:else}
					Credit utilization analysis
				{/if}
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Utilization Percentage -->
			<div class="text-center space-y-2">
				<div class="text-4xl font-bold {getUtilizationColor(accountAnalysis.utilization)}">
					{formatPercentage(accountAnalysis.utilization)}
				</div>
				{#if accountAnalysis.status}
					{@const config = statusConfig[accountAnalysis.status]}
					{@const Icon = config.icon}
					<div class="flex items-center justify-center gap-2">
						<Icon class="w-4 h-4 {config.color}" />
						<Badge
							variant={accountAnalysis.status === 'critical' || accountAnalysis.status === 'poor'
								? 'destructive'
								: accountAnalysis.status === 'fair'
									? 'outline'
									: 'default'}
						>
							{config.label}
						</Badge>
					</div>
				{/if}
			</div>

			<!-- Progress Bar -->
			<div class="space-y-2">
				<div class="flex items-center justify-between text-sm">
					<span class="text-muted-foreground">Current Utilization</span>
					<span class="font-medium">
						{formatTransactionAmount(accountAnalysis.currentDebt, account.currency)} /{' '}
						{formatTransactionAmount(accountAnalysis.creditLimit, account.currency)}
					</span>
				</div>
				<Progress
					value={Math.min(100, accountAnalysis.utilization)}
					max={100}
					class="h-3"
					style="--progress-background: {getProgressColor(accountAnalysis.utilization)}"
				/>
				<div class="flex items-center justify-between text-xs">
					<span class="text-muted-foreground">Available Credit</span>
					<span class="font-medium text-success">
						{formatTransactionAmount(accountAnalysis.availableCredit, account.currency)}
					</span>
				</div>
			</div>

			<!-- Key Metrics -->
			{#if showDetails}
				<div class="grid grid-cols-2 gap-4 pt-4 border-t">
					<div>
						<div class="text-xs text-muted-foreground">Current Debt</div>
						<div class="text-lg font-semibold">
							{formatTransactionAmount(accountAnalysis.currentDebt, account.currency)}
						</div>
					</div>
					<div>
						<div class="text-xs text-muted-foreground">Credit Limit</div>
						<div class="text-lg font-semibold">
							{formatTransactionAmount(accountAnalysis.creditLimit, account.currency)}
						</div>
					</div>
					{#if accountAnalysis.recommendedPaymentForTarget}
						<div class="col-span-2">
							<div class="text-xs text-muted-foreground">Recommended Payment (for 30% utilization)</div>
							<div class="text-lg font-semibold text-info">
								{formatTransactionAmount(accountAnalysis.recommendedPaymentForTarget, account.currency)}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Recommendations -->
			{#if showRecommendations && accountAnalysis.utilization > 30}
				<div class="pt-4 border-t">
					<button
						class="flex items-center justify-between w-full p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors"
						onclick={() => (showRecommendationsExpanded = !showRecommendationsExpanded)}
					>
						<span class="text-sm font-medium flex items-center gap-2">
							<Info class="w-4 h-4" />
							Recommendations
						</span>
						<ChevronDown
							class="w-4 h-4 transition-transform {showRecommendationsExpanded ? 'rotate-180' : ''}"
						/>
					</button>
					{#if showRecommendationsExpanded}
						<div class="mt-2 space-y-2">
							{#if accountAnalysis.recommendedPaymentForTarget}
								<div
									class="p-3 rounded-lg border {accountAnalysis.utilization > 50
										? 'border-destructive/50 bg-destructive/10'
										: 'border-warning/50 bg-warning/10'}"
								>
									<div class="flex items-start gap-2">
										<AlertTriangle
											class="w-4 h-4 mt-0.5 {accountAnalysis.utilization > 50
												? 'text-destructive'
												: 'text-warning'}"
										/>
										<div class="flex-1">
											<div class="text-sm font-medium">
												Pay {formatTransactionAmount(accountAnalysis.recommendedPaymentForTarget, account.currency)} to reach optimal utilization
											</div>
											<div class="text-xs text-muted-foreground mt-1">
												This will reduce your utilization from {formatPercentage(accountAnalysis.utilization)} to 30%, which is optimal for your credit score.
											</div>
										</div>
									</div>
								</div>
							{/if}
							{#if accountAnalysis.daysUntilStatementClose !== undefined &&
								accountAnalysis.daysUntilStatementClose <= 7 &&
								accountAnalysis.utilization > 30}
								<div class="p-3 rounded-lg border border-info/50 bg-info/10">
									<div class="flex items-start gap-2">
										<Info class="w-4 h-4 mt-0.5 text-info" />
										<div class="flex-1">
											<div class="text-sm font-medium">
												Pay before statement closes
											</div>
											<div class="text-xs text-muted-foreground mt-1">
												Your statement closes in {accountAnalysis.daysUntilStatementClose} day(s). Paying down your balance now will improve the utilization reported to credit bureaus.
											</div>
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</CardContent>
	</Card>
{:else if showAggregate && aggregateAnalysis}
	<!-- Aggregate View -->
	<Card class="border-2 {aggregateAnalysis.status ? statusConfig[aggregateAnalysis.status].borderColor : ''}">
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<CreditCard class="w-5 h-5" />
				Overall Credit Utilization
			</CardTitle>
			<CardDescription>
				Across {aggregateAnalysis.accountCount} credit account{aggregateAnalysis.accountCount !== 1
					? 's'
					: ''}
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Aggregate Utilization -->
			<div class="text-center space-y-2">
				<div class="text-4xl font-bold {getUtilizationColor(aggregateAnalysis.totalUtilization)}">
					{formatPercentage(aggregateAnalysis.totalUtilization)}
				</div>
				{#if aggregateAnalysis.status}
					{@const config = statusConfig[aggregateAnalysis.status]}
					{@const Icon = config.icon}
					<div class="flex items-center justify-center gap-2">
						<Icon class="w-4 h-4 {config.color}" />
						<Badge
							variant={aggregateAnalysis.status === 'critical' || aggregateAnalysis.status === 'poor'
								? 'destructive'
								: aggregateAnalysis.status === 'fair'
									? 'outline'
									: 'default'}
						>
							{config.label}
						</Badge>
					</div>
				{/if}
			</div>

			<!-- Progress Bar -->
			<div class="space-y-2">
				<div class="flex items-center justify-between text-sm">
					<span class="text-muted-foreground">Total Debt</span>
					<span class="font-medium">
						{formatTransactionAmount(aggregateAnalysis.totalDebt, 'USD')} /{' '}
						{formatTransactionAmount(aggregateAnalysis.totalCreditLimit, 'USD')}
					</span>
				</div>
				<Progress
					value={Math.min(100, aggregateAnalysis.totalUtilization)}
					max={100}
					class="h-3"
					style="--progress-background: {getProgressColor(aggregateAnalysis.totalUtilization)}"
				/>
				<div class="flex items-center justify-between text-xs">
					<span class="text-muted-foreground">Total Available Credit</span>
					<span class="font-medium text-success">
						{formatTransactionAmount(
							aggregateAnalysis.totalCreditLimit - aggregateAnalysis.totalDebt,
							'USD'
						)}
					</span>
				</div>
			</div>

			<!-- Account Breakdown -->
			{#if showDetails && aggregateAnalysis.accounts.length > 0}
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
							{#each aggregateAnalysis.accounts as accountAnalysis}
								<div
									class="p-3 rounded-lg border {accountAnalysis.status === 'critical' || accountAnalysis.status === 'poor'
										? 'border-destructive/50 bg-destructive/10'
										: accountAnalysis.status === 'fair'
											? 'border-warning/50 bg-warning/10'
											: 'border-border bg-muted/50'}"
								>
									<div class="flex items-center justify-between mb-2">
										<div class="font-medium">{accountAnalysis.accountName}</div>
										<Badge
											variant={accountAnalysis.status === 'critical' || accountAnalysis.status === 'poor'
												? 'destructive'
												: accountAnalysis.status === 'fair'
													? 'outline'
													: 'default'}
										>
											{formatPercentage(accountAnalysis.utilization)}
										</Badge>
									</div>
									<div class="text-xs text-muted-foreground">
										{formatTransactionAmount(accountAnalysis.currentDebt, 'USD')} /{' '}
										{formatTransactionAmount(accountAnalysis.creditLimit, 'USD')}
									</div>
									{#if accountAnalysis.recommendedPaymentForTarget}
										<div class="text-xs text-info mt-1">
											Recommended: {formatTransactionAmount(accountAnalysis.recommendedPaymentForTarget, 'USD')}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Recommendations -->
			{#if showRecommendations && recommendations.length > 0}
				<div class="pt-4 border-t">
					<button
						class="flex items-center justify-between w-full p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors"
						onclick={() => (showRecommendationsExpanded = !showRecommendationsExpanded)}
					>
						<span class="text-sm font-medium flex items-center gap-2">
							<Info class="w-4 h-4" />
							Recommendations ({recommendations.length})
						</span>
						<ChevronDown
							class="w-4 h-4 transition-transform {showRecommendationsExpanded ? 'rotate-180' : ''}"
						/>
					</button>
					{#if showRecommendationsExpanded}
						<div class="mt-2 space-y-2">
							{#each recommendations.slice(0, 5) as rec}
								{@const Icon = rec.priority === 'urgent' || rec.priority === 'high'
									? AlertCircle
									: rec.priority === 'medium'
										? AlertTriangle
										: Info}
								<div
									class="p-3 rounded-lg border {rec.priority === 'urgent' || rec.priority === 'high'
										? 'border-destructive/50 bg-destructive/10'
										: rec.priority === 'medium'
											? 'border-warning/50 bg-warning/10'
											: 'border-border bg-muted/50'}"
								>
									<div class="flex items-start gap-2">
										<Icon
											class="w-4 h-4 mt-0.5 {rec.priority === 'urgent' || rec.priority === 'high'
												? 'text-destructive'
												: rec.priority === 'medium'
													? 'text-warning'
													: 'text-info'}"
										/>
										<div class="flex-1">
											<div class="text-sm font-medium">{rec.title}</div>
											<div class="text-xs text-muted-foreground mt-1">{rec.description}</div>
											<div class="text-xs text-info mt-1">{rec.recommendedAction}</div>
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
		<CreditCard class="w-12 h-12 mx-auto mb-4 opacity-50" />
		<p>No credit accounts found or no credit limit data available.</p>
		<p class="text-sm mt-2">Add credit limit information to your credit accounts to see utilization analysis.</p>
	</div>
{/if}
