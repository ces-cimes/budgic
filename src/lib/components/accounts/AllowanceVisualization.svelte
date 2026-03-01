<script lang="ts">
	import type { EnhancedAllowance, AllowanceRecommendation } from '$lib/utils/allowance-utils';
	import type { NegativeAllowanceStatus, RecoverySuggestion } from '$lib/core/services/core/negative-allowance-service';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { AlertCircle, CheckCircle2, AlertTriangle, TrendingUp, Info, Wallet, ShoppingBag, Shield, Lightbulb } from '@lucide/svelte';
	import { Progress } from '$lib/components/ui/progress';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
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

	const { allowance, showDetails = true, showRecommendations = true, negativeStatus = null, recoverySuggestions = [] }: Props = $props();

	const showNegativeWarning = $derived(
		negativeStatus?.isNegative &&
			(negativeStatus.handlingMode === 'allow_with_strong_warning' || negativeStatus.handlingMode === 'block_with_warning')
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
		return Math.min(100, (allowance.discretionary.spentSoFar / allowance.discretionary.monthly) * 100);
	});

	const totalUsage = $derived(() => {
		if (allowance.total.monthly === 0) return allowance.total.spentSoFar > 0 ? 100 : 0;
		return Math.min(100, (allowance.total.spentSoFar / allowance.total.monthly) * 100);
	});

	const hasZeroAllowance = $derived(allowance.total.monthly <= 0);

	// Get status based on usage
	const getStatus = (usage: number) => {
		if (usage >= 100) return { label: 'Exceeded', color: 'text-destructive', bgColor: 'bg-destructive/10', icon: AlertCircle };
		if (usage >= 80) return { label: 'Warning', color: 'text-warning', bgColor: 'bg-warning/10', icon: AlertTriangle };
		if (usage >= 50) return { label: 'On Track', color: 'text-info', bgColor: 'bg-info/10', icon: TrendingUp };
		return { label: 'Good', color: 'text-success', bgColor: 'bg-success/10', icon: CheckCircle2 };
	};

	const totalStatus = $derived(getStatus(totalUsage()));
	const essentialStatus = $derived(getStatus(essentialUsage()));
	const discretionaryStatus = $derived(getStatus(discretionaryUsage()));

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
								<Lightbulb class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
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
				<Wallet class="w-5 h-5" />
				Monthly Allowance
			</CardTitle>
			<CardDescription>
				{allowance.total.daysRemaining} days remaining in period
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if hasZeroAllowance}
				<div class="bg-muted/50 border-border rounded-lg border px-4 py-3 text-sm text-muted-foreground">
					No spending allowance calculated (zero balance or no spending data). Add funds or historical transactions to see an allowance.
				</div>
			{/if}
			<!-- Total Allowance Amount -->
			<div class="text-center space-y-2">
				<div class="text-3xl font-bold text-primary">
					{formatTransactionAmount(allowance.total.monthly, allowance.total.currency)}
				</div>
				<div class="text-sm text-muted-foreground">
					{formatTransactionAmount(allowance.total.dailySafe, allowance.total.currency)} per day
				</div>
			</div>

			<!-- Usage Progress -->
			<div class="space-y-2">
				<div class="flex items-center justify-between text-sm">
					<span class="text-muted-foreground">Spent this period</span>
					<span class="font-medium">
						{formatTransactionAmount(allowance.total.spentSoFar, allowance.total.currency)} / {formatTransactionAmount(allowance.total.monthly, allowance.total.currency)}
					</span>
				</div>
				<Progress value={totalUsage()} max={100} class="h-3" />
				<div class="flex items-center justify-between text-xs">
					<span class="text-muted-foreground">Remaining</span>
					<span class="font-medium {allowance.total.remaining < 0 ? 'text-destructive' : 'text-success'}">
						{formatTransactionAmount(allowance.total.remaining, allowance.total.currency)}
					</span>
				</div>
			</div>

			<!-- Status Badge -->
			<div class="flex items-center justify-center gap-2">
				<svelte:component
					this={totalStatus.icon}
					class="w-4 h-4 {totalStatus.color}"
				/>
				<Badge variant={totalUsage() >= 100 ? 'destructive' : totalUsage() >= 80 ? 'warning' : 'default'}>
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
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<!-- Essential Allowance -->
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-base flex items-center gap-2">
						<Shield class="w-4 h-4" />
						Essential
					</CardTitle>
				</CardHeader>
				<CardContent class="space-y-3">
					<div class="text-xl font-semibold">
						{formatTransactionAmount(allowance.essential.monthly, allowance.essential.currency)}
					</div>
					<div class="space-y-1">
						<Progress value={essentialUsage()} max={100} class="h-2" />
						<div class="flex justify-between text-xs text-muted-foreground">
							<span>Spent: {formatTransactionAmount(allowance.essential.spentSoFar, allowance.essential.currency)}</span>
							<span>Remaining: {formatTransactionAmount(allowance.essential.remaining, allowance.essential.currency)}</span>
						</div>
					</div>
					<div class="flex items-center gap-1">
						<svelte:component
							this={essentialStatus.icon}
							class="w-3 h-3 {essentialStatus.color}"
						/>
						<span class="text-xs {essentialStatus.color}">{essentialStatus.label}</span>
					</div>
				</CardContent>
			</Card>

			<!-- Discretionary Allowance -->
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-base flex items-center gap-2">
						<ShoppingBag class="w-4 h-4" />
						Discretionary
					</CardTitle>
				</CardHeader>
				<CardContent class="space-y-3">
					<div class="text-xl font-semibold">
						{formatTransactionAmount(allowance.discretionary.monthly, allowance.discretionary.currency)}
					</div>
					<div class="space-y-1">
						<Progress value={discretionaryUsage()} max={100} class="h-2" />
						<div class="flex justify-between text-xs text-muted-foreground">
							<span>Spent: {formatTransactionAmount(allowance.discretionary.spentSoFar, allowance.discretionary.currency)}</span>
							<span>Remaining: {formatTransactionAmount(allowance.discretionary.remaining, allowance.discretionary.currency)}</span>
						</div>
					</div>
					<div class="flex items-center gap-1">
						<svelte:component
							this={discretionaryStatus.icon}
							class="w-3 h-3 {discretionaryStatus.color}"
						/>
						<span class="text-xs {discretionaryStatus.color}">{discretionaryStatus.label}</span>
					</div>
				</CardContent>
			</Card>

			<!-- Buffer Allowance -->
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="text-base flex items-center gap-2">
						<Shield class="w-4 h-4" />
						Buffer
					</CardTitle>
				</CardHeader>
				<CardContent class="space-y-3">
					<div class="text-xl font-semibold">
						{formatTransactionAmount(allowance.buffer.monthly, allowance.buffer.currency)}
					</div>
					<div class="text-xs text-muted-foreground">
						Safety margin for unexpected expenses
					</div>
					<div class="text-sm">
						Remaining: {formatTransactionAmount(allowance.buffer.remaining, allowance.buffer.currency)}
					</div>
				</CardContent>
			</Card>
		</div>
	{/if}

	<!-- Method Details (Collapsible) -->
	{#if showDetails}
		<div class="space-y-2">
			<button
				class="flex items-center justify-between w-full p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors"
				onclick={() => showMethodDetails = !showMethodDetails}
			>
				<span class="text-sm font-medium">Calculation Method Details</span>
				<ChevronDown class="w-4 h-4 transition-transform {showMethodDetails ? 'rotate-180' : ''}" />
			</button>
			{#if showMethodDetails}
				<Card>
					<CardContent class="pt-4 space-y-3">
						<div class="text-sm space-y-2">
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
								<span class="font-medium">{Math.round(allowance.total.methodWeights.buffer * 100)}%</span>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">Velocity-Adjusted:</span>
								<span class="font-medium">{Math.round(allowance.total.methodWeights.velocity * 100)}%</span>
							</div>
						</div>
						{#if allowance.total.methodResults.historical !== undefined}
							<div class="pt-2 border-t text-xs text-muted-foreground">
								Historical average: {formatTransactionAmount(allowance.total.methodResults.historical, allowance.total.currency)}
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
				class="flex items-center justify-between w-full p-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors"
				onclick={() => showRecommendationsExpanded = !showRecommendationsExpanded}
			>
				<span class="text-sm font-medium flex items-center gap-2">
					<Info class="w-4 h-4" />
					Recommendations ({allowance.recommendations.length})
				</span>
				<ChevronDown class="w-4 h-4 transition-transform {showRecommendationsExpanded ? 'rotate-180' : ''}" />
			</button>
			{#if showRecommendationsExpanded}
				<div class="space-y-2">
					{#each allowance.recommendations as rec}
						<Card class="{rec.severity === 'high' ? 'border-destructive' : rec.severity === 'medium' ? 'border-warning' : ''}">
							<CardContent class="pt-4">
								<div class="flex items-start gap-3">
									<svelte:component
										this={rec.severity === 'high' ? AlertCircle : rec.severity === 'medium' ? AlertTriangle : Info}
										class="w-5 h-5 mt-0.5 {rec.severity === 'high' ? 'text-destructive' : rec.severity === 'medium' ? 'text-warning' : 'text-info'}"
									/>
									<div class="flex-1 space-y-1">
										<div class="flex items-center gap-2">
											<Badge variant={rec.type === 'warning' ? 'destructive' : rec.type === 'increase' ? 'default' : 'outline'}>
												{rec.type}
											</Badge>
											<span class="text-sm font-medium">{rec.message}</span>
										</div>
										{#if rec.actionable}
											<div class="text-xs text-muted-foreground">
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

