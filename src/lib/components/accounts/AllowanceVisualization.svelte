<script lang="ts">
	import type { EnhancedAllowance, AllowanceRecommendation } from '$lib/utils/allowance-utils';
	import type {
		NegativeAllowanceStatus,
		RecoverySuggestion
	} from '$lib/core/services/core/negative-allowance-service';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import {
		AlertCircle,
		CheckCircle2,
		AlertTriangle,
		TrendingUp,
		Info,
		Wallet,
		ShoppingBag,
		Shield,
		Lightbulb
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
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { ChevronDown } from '@lucide/svelte';

	interface Props {
		allowance: EnhancedAllowance;
		showDetails?: boolean;
		showRecommendations?: boolean;
		/** When spending exceeds allowance (for strong-warning / block UX) */
		negativeStatus?: NegativeAllowanceStatus | null;
		/** Recovery suggestions when allowance is negative */
		recoverySuggestions?: RecoverySuggestion[];
	}

	const {
		allowance,
		showDetails = true,
		showRecommendations = true,
		negativeStatus = null,
		recoverySuggestions = []
	}: Props = $props();

	const showNegativeWarning = $derived(
		negativeStatus?.isNegative &&
			(negativeStatus.handlingMode === 'allow_with_strong_warning' ||
				negativeStatus.handlingMode === 'block_with_warning')
	);

	let showMethodDetails = $state(false);
	let showRecommendationsExpanded = $state(false);

	// Calculate usage percentage for each category
	const essentialUsage = $derived(() => {
		if (allowance.essential.monthly === 0) return 0;
		return Math.min(100, (allowance.essential.spentSoFar / allowance.essential.monthly) * 100);
	});

	const discretionaryUsage = $derived(() => {
		if (allowance.discretionary.monthly === 0) return 0;
		return Math.min(
			100,
			(allowance.discretionary.spentSoFar / allowance.discretionary.monthly) * 100
		);
	});

	const totalUsage = $derived(() => {
		if (allowance.total.monthly === 0) return allowance.total.spentSoFar > 0 ? 100 : 0;
		return Math.min(100, (allowance.total.spentSoFar / allowance.total.monthly) * 100);
	});

	const hasZeroAllowance = $derived(allowance.total.monthly <= 0);

	// Get status based on usage
	const getStatus = (usage: number) => {
		if (usage >= 100)
			return {
				label: 'Exceeded',
				color: 'text-destructive',
				bgColor: 'bg-destructive/10',
				icon: AlertCircle
			};
		if (usage >= 80)
			return {
				label: 'Warning',
				color: 'text-warning',
				bgColor: 'bg-warning/10',
				icon: AlertTriangle
			};
		if (usage >= 50)
			return { label: 'On Track', color: 'text-info', bgColor: 'bg-info/10', icon: TrendingUp };
		return { label: 'Good', color: 'text-success', bgColor: 'bg-success/10', icon: CheckCircle2 };
	};

	const totalStatus = $derived(getStatus(totalUsage()));
	const essentialStatus = $derived(getStatus(essentialUsage()));
	const discretionaryStatus = $derived(getStatus(discretionaryUsage()));

	const TotalStatusIcon = $derived(totalStatus.icon);
	const EssentialStatusIcon = $derived(essentialStatus.icon);
	const DiscretionaryStatusIcon = $derived(discretionaryStatus.icon);

	// Format confidence as percentage
	const confidencePercent = $derived(Math.round(allowance.total.confidence * 100));
</script>

<div class="space-y-4">
	<!-- Negative Allowance Warning -->
	{#if showNegativeWarning && negativeStatus?.warningMessage}
		<Alert variant="destructive" class="border-destructive/50">
			<AlertTriangle class="size-4" />
			<AlertTitle>Over allowance</AlertTitle>
			<AlertDescription>
				<p class="font-medium">{negativeStatus.warningMessage}</p>
				{#if recoverySuggestions.length > 0}
					<ul class="mt-2 list-none space-y-1 text-sm">
						{#each recoverySuggestions as suggestion}
							<li class="flex items-start gap-2">
								<Lightbulb class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
								<span>{suggestion.title}: {suggestion.description}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</AlertDescription>
		</Alert>
	{/if}

	<!-- Total Allowance Overview -->
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<Wallet class="h-5 w-5" />
				Monthly Allowance
			</CardTitle>
			<CardDescription>
				{allowance.total.daysRemaining} days remaining in period
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if hasZeroAllowance}
				<div
					class="bg-muted/50 border-border text-muted-foreground rounded-lg border px-4 py-3 text-sm"
				>
					No spending allowance calculated (zero balance or no spending data). Add funds or
					historical transactions to see an allowance.
				</div>
			{/if}
			<!-- Total Allowance Amount -->
			<div class="space-y-2 text-center">
				<div class="text-primary text-3xl font-bold">
					{formatTransactionAmount(allowance.total.monthly, allowance.total.currency)}
				</div>
				<div class="text-muted-foreground text-sm">
					{formatTransactionAmount(allowance.total.dailySafe, allowance.total.currency)} per day
				</div>
			</div>

			<!-- Usage Progress -->
			<div class="space-y-2">
				<div class="flex items-center justify-between text-sm">
					<span class="text-muted-foreground">Spent this period</span>
					<span class="font-medium">
						{formatTransactionAmount(allowance.total.spentSoFar, allowance.total.currency)} / {formatTransactionAmount(
							allowance.total.monthly,
							allowance.total.currency
						)}
					</span>
				</div>
				<Progress value={totalUsage()} max={100} class="h-3" />
				<div class="flex items-center justify-between text-xs">
					<span class="text-muted-foreground">Remaining</span>
					<span
						class="font-medium {allowance.total.remaining < 0
							? 'text-destructive'
							: 'text-success'}"
					>
						{formatTransactionAmount(allowance.total.remaining, allowance.total.currency)}
					</span>
				</div>
			</div>

			<!-- Status Badge -->
			<div class="flex items-center justify-center gap-2">
				<TotalStatusIcon class="h-4 w-4 {totalStatus.color}" />
				<Badge
					variant={totalUsage() >= 100
						? 'destructive'
						: totalUsage() >= 80
							? 'secondary'
							: 'default'}
				>
					{totalStatus.label}
				</Badge>
				{#if showDetails}
					<Badge variant="outline" class="ml-auto">
						{confidencePercent}% confidence
					</Badge>
				{/if}
			</div>
		</CardContent>
	</Card>

	<!-- Category Breakdown -->
	{#if showDetails}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<!-- Essential Allowance -->
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="flex items-center gap-2 text-base">
						<Shield class="h-4 w-4" />
						Essential
					</CardTitle>
				</CardHeader>
				<CardContent class="space-y-3">
					<div class="text-xl font-semibold">
						{formatTransactionAmount(allowance.essential.monthly, allowance.essential.currency)}
					</div>
					<div class="space-y-1">
						<Progress value={essentialUsage()} max={100} class="h-2" />
						<div class="text-muted-foreground flex justify-between text-xs">
							<span
								>Spent: {formatTransactionAmount(
									allowance.essential.spentSoFar,
									allowance.essential.currency
								)}</span
							>
							<span
								>Remaining: {formatTransactionAmount(
									allowance.essential.remaining,
									allowance.essential.currency
								)}</span
							>
						</div>
					</div>
					<div class="flex items-center gap-1">
						<EssentialStatusIcon class="h-3 w-3 {essentialStatus.color}" />
						<span class="text-xs {essentialStatus.color}">{essentialStatus.label}</span>
					</div>
				</CardContent>
			</Card>

			<!-- Discretionary Allowance -->
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="flex items-center gap-2 text-base">
						<ShoppingBag class="h-4 w-4" />
						Discretionary
					</CardTitle>
				</CardHeader>
				<CardContent class="space-y-3">
					<div class="text-xl font-semibold">
						{formatTransactionAmount(
							allowance.discretionary.monthly,
							allowance.discretionary.currency
						)}
					</div>
					<div class="space-y-1">
						<Progress value={discretionaryUsage()} max={100} class="h-2" />
						<div class="text-muted-foreground flex justify-between text-xs">
							<span
								>Spent: {formatTransactionAmount(
									allowance.discretionary.spentSoFar,
									allowance.discretionary.currency
								)}</span
							>
							<span
								>Remaining: {formatTransactionAmount(
									allowance.discretionary.remaining,
									allowance.discretionary.currency
								)}</span
							>
						</div>
					</div>
					<div class="flex items-center gap-1">
						<DiscretionaryStatusIcon class="h-3 w-3 {discretionaryStatus.color}" />
						<span class="text-xs {discretionaryStatus.color}">{discretionaryStatus.label}</span>
					</div>
				</CardContent>
			</Card>

			<!-- Buffer Allowance -->
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="flex items-center gap-2 text-base">
						<Shield class="h-4 w-4" />
						Buffer
					</CardTitle>
				</CardHeader>
				<CardContent class="space-y-3">
					<div class="text-xl font-semibold">
						{formatTransactionAmount(allowance.buffer.monthly, allowance.buffer.currency)}
					</div>
					<div class="text-muted-foreground text-xs">Safety margin for unexpected expenses</div>
					<div class="text-sm">
						Remaining: {formatTransactionAmount(
							allowance.buffer.remaining,
							allowance.buffer.currency
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	{/if}

	<!-- Method Details (Collapsible) -->
	{#if showDetails}
		<div class="space-y-2">
			<button
				class="bg-muted/50 hover:bg-muted flex w-full items-center justify-between rounded-lg border p-3 transition-colors"
				onclick={() => (showMethodDetails = !showMethodDetails)}
			>
				<span class="text-sm font-medium">Calculation Method Details</span>
				<ChevronDown class="h-4 w-4 transition-transform {showMethodDetails ? 'rotate-180' : ''}" />
			</button>
			{#if showMethodDetails}
				<Card>
					<CardContent class="space-y-3 pt-4">
						<div class="space-y-2 text-sm">
							<div class="flex justify-between">
								<span class="text-muted-foreground">Historical Pattern:</span>
								<span class="font-medium">
									{allowance.total.methodWeights.historical > 0
										? `${Math.round(allowance.total.methodWeights.historical * 100)}%`
										: 'Not available'}
								</span>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">Buffer-Based:</span>
								<span class="font-medium"
									>{Math.round(allowance.total.methodWeights.buffer * 100)}%</span
								>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">Velocity-Adjusted:</span>
								<span class="font-medium"
									>{Math.round(allowance.total.methodWeights.velocity * 100)}%</span
								>
							</div>
						</div>
						{#if allowance.total.methodResults.historical !== undefined}
							<div class="text-muted-foreground border-t pt-2 text-xs">
								Historical average: {formatTransactionAmount(
									allowance.total.methodResults.historical,
									allowance.total.currency
								)}
							</div>
						{/if}
					</CardContent>
				</Card>
			{/if}
		</div>
	{/if}

	<!-- Recommendations -->
	{#if showRecommendations && allowance.recommendations.length > 0}
		<div class="space-y-2">
			<button
				class="bg-muted/50 hover:bg-muted flex w-full items-center justify-between rounded-lg border p-3 transition-colors"
				onclick={() => (showRecommendationsExpanded = !showRecommendationsExpanded)}
			>
				<span class="flex items-center gap-2 text-sm font-medium">
					<Info class="h-4 w-4" />
					Recommendations ({allowance.recommendations.length})
				</span>
				<ChevronDown
					class="h-4 w-4 transition-transform {showRecommendationsExpanded ? 'rotate-180' : ''}"
				/>
			</button>
			{#if showRecommendationsExpanded}
				<div class="space-y-2">
					{#each allowance.recommendations as rec}
						{@const RecSeverityIcon =
							rec.severity === 'high'
								? AlertCircle
								: rec.severity === 'medium'
									? AlertTriangle
									: Info}
						<Card
							class={rec.severity === 'high'
								? 'border-destructive'
								: rec.severity === 'medium'
									? 'border-warning'
									: ''}
						>
							<CardContent class="pt-4">
								<div class="flex items-start gap-3">
									<RecSeverityIcon
										class="mt-0.5 h-5 w-5 {rec.severity === 'high'
											? 'text-destructive'
											: rec.severity === 'medium'
												? 'text-warning'
												: 'text-info'}"
									/>
									<div class="flex-1 space-y-1">
										<div class="flex items-center gap-2">
											<Badge
												variant={rec.type === 'warning'
													? 'destructive'
													: rec.type === 'increase'
														? 'default'
														: 'outline'}
											>
												{rec.type}
											</Badge>
											<span class="text-sm font-medium">{rec.message}</span>
										</div>
										{#if rec.actionable}
											<div class="text-muted-foreground text-xs">
												This recommendation requires your attention
											</div>
										{/if}
									</div>
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
