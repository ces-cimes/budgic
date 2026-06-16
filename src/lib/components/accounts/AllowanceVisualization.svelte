<script lang="ts">
	import type { DailyAllowanceView } from '$lib/core/services/core/budget-service';
	import type { AllowanceProjection } from '$lib/core/services/core/budget-service';
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
		Lightbulb,
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
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';

	interface Props {
		allowance: DailyAllowanceView;
		showDetails?: boolean;
		showRecommendations?: boolean;
		confidence?: {
			ratio: number;
			tier: 'low' | 'medium' | 'high';
			unclassifiedSpend: number;
			totalSpend: number;
		} | null;
		negativeStatus?: NegativeAllowanceStatus | null;
		recoverySuggestions?: RecoverySuggestion[];
		projection?: AllowanceProjection | null;
	}

	const {
		allowance,
		showDetails = true,
		showRecommendations = true,
		confidence = null,
		negativeStatus = null,
		recoverySuggestions = [],
		projection = null
	}: Props = $props();

	const showNegativeWarning = $derived(
		negativeStatus?.isNegative &&
			(negativeStatus.handlingMode === 'allow_with_strong_warning' ||
				negativeStatus.handlingMode === 'block_with_warning')
	);

	let showCategoryDetails = $state(false);
	let showRecommendationsExpanded = $state(false);

	const lifestyleUsage = $derived(() => {
		if (allowance.lifestyleBudget === 0) return allowance.lifestyleSpent > 0 ? 100 : 0;
		return Math.min(100, (allowance.lifestyleSpent / allowance.lifestyleBudget) * 100);
	});

	const paceBadge = $derived.by(() => {
		switch (allowance.signal) {
			case 'over_pace':
				return { label: 'Over pace', variant: 'destructive' as const, icon: AlertCircle };
			case 'under_pace':
				return { label: 'Under pace', variant: 'default' as const, icon: CheckCircle2 };
			default:
				return { label: 'On track', variant: 'secondary' as const, icon: TrendingUp };
		}
	});

	const PaceIcon = $derived(paceBadge.icon);

	const confidencePercent = $derived(
		confidence
			? Math.round(confidence.ratio * 100)
			: Math.round(allowance.total.confidence * 100)
	);

	const showAllowanceRangeBand = $derived(Boolean(confidence) && confidence?.tier !== 'high');

	const allowanceRangeValues = $derived.by(() => {
		if (!confidence) return null;
		const remaining = allowance.lifestyleRemaining;
		const monthly = allowance.lifestyleBudget;
		const current = remaining;
		const conservative = Math.max(remaining - confidence.unclassifiedSpend, 0);
		const barMax = Math.max(monthly, 1);
		const currentPct = Math.min(Math.max((current / barMax) * 100, 0), 100);
		const conservativePct = Math.min(Math.max((conservative / barMax) * 100, 0), 100);
		let rangeStartPercent = conservativePct;
		let rangeWidthPercent = Math.max(currentPct - conservativePct, 2);
		rangeWidthPercent = Math.min(rangeWidthPercent, 100 - rangeStartPercent);
		return { current, conservative, rangeStartPercent, rangeWidthPercent };
	});
</script>

<div class="space-y-4">
	{#if projection}
		<Alert class="border-border bg-muted/40">
			<Info class="size-4" />
			<AlertTitle>Forward projection (cash-flow view)</AlertTitle>
			<AlertDescription>
				<p class="text-muted-foreground text-xs">
					Committed {formatTransactionAmount(
						projection.committed,
						projection.currency,
						false
					)} · Planned{' '}
					{formatTransactionAmount(projection.planned, projection.currency, false)} · Uncertainty
					±{' '}
					{formatTransactionAmount(
						projection.uncertaintyBand,
						projection.currency,
						false
					)}
				</p>
				<p class="mt-1 text-xs font-medium">
					Available (point){' '}
					{formatTransactionAmount(projection.available, projection.currency)} · Min{' '}
					{formatTransactionAmount(projection.availableMin, projection.currency)} · Max{' '}
					{formatTransactionAmount(projection.availableMax, projection.currency)}
				</p>
				{#if projection.recoveryDeduction > 0}
					<p class="text-muted-foreground mt-1 text-xs">
						Recovery set-aside: −{formatTransactionAmount(
							projection.recoveryDeduction,
							projection.currency,
							false
						)}
					</p>
				{/if}
			</AlertDescription>
		</Alert>
	{/if}

	{#if showNegativeWarning && negativeStatus?.warningMessage}
		<Alert variant="destructive" class="border-destructive/50">
			<AlertTriangle class="size-4" />
			<AlertTitle>Over lifestyle budget</AlertTitle>
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

	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<Wallet class="h-5 w-5" />
				Daily allowance
			</CardTitle>
			<CardDescription>Household lifestyle budgets · {allowance.currency}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if allowance.lifestyleBudget <= 0 && allowance.confidenceLevel === 'low'}
				<div
					class="bg-muted/50 border-border text-muted-foreground rounded-lg border px-4 py-3 text-sm"
				>
					No lifestyle category budgets yet — showing a simplified estimate. Add lifestyle
					budgets for a tier-attributed daily allowance.
				</div>
			{/if}

			<div class="space-y-2 text-center">
				<div class="text-primary text-3xl font-bold">
					{formatTransactionAmount(allowance.daily, allowance.currency)}
				</div>
				<div class="text-muted-foreground text-sm">per day across lifestyle categories</div>
				<div class="flex items-center justify-center gap-2 pt-1">
					<PaceIcon class="h-4 w-4" />
					<Badge variant={paceBadge.variant}>{paceBadge.label}</Badge>
					<span class="text-muted-foreground text-xs"
						>Pace {allowance.pace.toFixed(2)}× · {allowance.lifestyleRemaining > 0
							? formatTransactionAmount(
									allowance.lifestyleRemaining,
									allowance.currency
								)
							: '0'} left</span
					>
				</div>
			</div>

			{#if showAllowanceRangeBand && allowanceRangeValues}
				<div class="bg-muted/40 mt-2 space-y-2 rounded-md px-3 py-2 text-left">
					<p class="text-muted-foreground text-xs font-medium">
						Remaining range
						<span
							class={confidence?.tier === 'low' ? 'text-destructive' : 'text-warning'}
							>({confidence?.tier} confidence)</span
						>
					</p>
					<div class="bg-muted/70 relative h-2 overflow-hidden rounded-full">
						<div
							class="bg-primary/30 absolute inset-y-0 rounded-full"
							style="left: {allowanceRangeValues.rangeStartPercent}%; width: {allowanceRangeValues.rangeWidthPercent}%;"
						></div>
					</div>
				</div>
			{/if}

			<div class="space-y-2">
				<div class="flex items-center justify-between text-sm">
					<span class="text-muted-foreground">Lifestyle spend</span>
					<span class="font-medium">
						{formatTransactionAmount(allowance.lifestyleSpent, allowance.currency)} / {formatTransactionAmount(
							allowance.lifestyleBudget,
							allowance.currency
						)}
					</span>
				</div>
				<Progress value={lifestyleUsage()} max={100} class="h-3" />
			</div>

			{#if showDetails}
				<Badge variant="outline">{confidencePercent}% confidence</Badge>
			{/if}
		</CardContent>
	</Card>

	{#if showDetails && allowance.lifestyleLines.length > 0}
		<div class="space-y-2">
			<button
				type="button"
				class="bg-muted/50 hover:bg-muted flex w-full items-center justify-between rounded-lg border p-3 transition-colors"
				onclick={() => (showCategoryDetails = !showCategoryDetails)}
			>
				<span class="flex items-center gap-2 text-sm font-medium">
					<ShoppingBag class="h-4 w-4" />
					By category ({allowance.lifestyleLines.length})
				</span>
				<ChevronDown
					class="h-4 w-4 transition-transform {showCategoryDetails ? 'rotate-180' : ''}"
				/>
			</button>
			{#if showCategoryDetails}
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					{#each allowance.lifestyleLines as line (line.categoryId)}
						<Card>
							<CardHeader class="pb-2">
								<CardTitle class="text-base">{line.categoryName}</CardTitle>
							</CardHeader>
							<CardContent class="space-y-2 text-sm">
								<div class="flex justify-between">
									<span class="text-muted-foreground">Daily rate</span>
									<span class="font-medium"
										>{formatTransactionAmount(
											line.dailyRate,
											allowance.currency
										)}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-muted-foreground">Remaining</span>
									<span class="font-medium"
										>{formatTransactionAmount(
											line.remaining,
											allowance.currency
										)}</span
									>
								</div>
								<Progress
									value={line.budgetAmount > 0
										? Math.min(
												100,
												(line.spentAmount / line.budgetAmount) * 100
											)
										: 0}
									max={100}
									class="h-2"
								/>
							</CardContent>
						</Card>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if showRecommendations && allowance.recommendations.length > 0}
		<div class="space-y-2">
			<button
				type="button"
				class="bg-muted/50 hover:bg-muted flex w-full items-center justify-between rounded-lg border p-3 transition-colors"
				onclick={() => (showRecommendationsExpanded = !showRecommendationsExpanded)}
			>
				<span class="flex items-center gap-2 text-sm font-medium">
					<Info class="h-4 w-4" />
					Recommendations ({allowance.recommendations.length})
				</span>
				<ChevronDown
					class="h-4 w-4 transition-transform {showRecommendationsExpanded
						? 'rotate-180'
						: ''}"
				/>
			</button>
			{#if showRecommendationsExpanded}
				<div class="space-y-2">
					{#each allowance.recommendations as rec}
						<Card>
							<CardContent class="pt-4 text-sm">{rec.message}</CardContent>
						</Card>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
