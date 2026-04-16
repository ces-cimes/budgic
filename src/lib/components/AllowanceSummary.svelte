<script lang="ts">
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import type {
		NegativeAllowanceStatus,
		RecoverySuggestion
	} from '$lib/core/services/core/negative-allowance-service';
	import type { AllowanceTierRow } from '$lib/utils/budget-tier-display';
	import { getWaterfallTierLabel } from '$lib/utils/waterfall-tier-utils';
	import { formatAmount, formatTransactionAmount } from '$lib/utils/currency-utils';
	import { TrendingUp, TrendingDown, Lightbulb } from '@lucide/svelte';

	interface Props {
		allowance: EnhancedAllowance | null;
		isLoading?: boolean;
		negativeStatus?: NegativeAllowanceStatus | null;
		recoverySuggestions?: RecoverySuggestion[];
		confidence?: {
			ratio: number;
			tier: 'low' | 'medium' | 'high';
			unclassifiedSpend: number;
			totalSpend: number;
		} | null;
		/** From same `getBudgetSummary()` snapshot as home `confidence` (Phase 8 follow-up). */
		tierRows?: AllowanceTierRow[];
	}

	const {
		allowance,
		isLoading = false,
		negativeStatus = null,
		recoverySuggestions = [],
		confidence = null,
		tierRows = []
	}: Props = $props();

	const showConfidenceBand = $derived(Boolean(confidence) && confidence?.tier !== 'high');

	const conservativeRemaining = $derived(
		allowance && confidence
			? Math.max(allowance.total.remaining - confidence.unclassifiedSpend, 0)
			: null
	);

	// Raw percentage (can exceed 100 for overspend); display cap at 100 for non-overflow fill
	const rawPct = $derived(() => {
		if (!allowance) return 0;
		if (allowance.total.monthly === 0) return allowance.total.spentSoFar > 0 ? 100 : 0;
		return (allowance.total.spentSoFar / allowance.total.monthly) * 100;
	});

	const isOverBudget = $derived(
		negativeStatus?.isNegative &&
			(negativeStatus.handlingMode === 'allow_with_strong_warning' ||
				negativeStatus.handlingMode === 'block_with_warning')
	);

	const pct = $derived(rawPct());

	const passiveAccrualNote = $derived(
		allowance?.projection && allowance.projection.passiveAccrualAdjustment > 0.005
			? allowance.projection.passiveAccrualAdjustment
			: null
	);

	// Progress bar: normal fill capped at 100%; overspent = red overflow beyond 100% (UX_SPEC 3.1.1)
	const fillWidth = $derived(Math.min(pct, 100));
	const isOverspent = $derived(pct > 100);
	const overflowPct = $derived(isOverspent ? Math.min(pct - 100, 50) : 0);
</script>

{#if isLoading}
	<!-- Skeleton -->
	<div class="squircle-4xl squircle-border bg-card space-y-3 p-6 shadow-sm">
		<div class="h-3 w-28 animate-pulse rounded bg-[var(--color-bg-surface)]"></div>
		<div class="h-8 w-36 animate-pulse rounded bg-[var(--color-bg-surface)]"></div>
		<div class="h-2 w-full animate-pulse rounded-full bg-[var(--color-bg-surface)]"></div>
	</div>
{:else if allowance}
	<div
		class="squircle-4xl squircle-border bg-card space-y-4 p-6 shadow-sm"
		style={isOverBudget || isOverspent
			? '--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent);'
			: ''}
	>
		<!-- Header row -->
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<p class="text-muted-foreground mb-1 text-xs font-medium tracking-widest uppercase">
					Safe to spend
				</p>
				<!-- Daily amount — hero number -->
				<div
					class="text-hero-sm {isOverBudget || isOverspent ? 'text-[var(--color-warm-coral)]' : ''}"
				>
					{formatAmount(allowance.total.dailySafe, allowance.total.currency)}
					<span class="text-muted-foreground ml-1 text-xs"> / day </span>
				</div>
			</div>

			<!-- Remaining badge -->
			<div class="shrink-0 text-right">
				<p class="text-muted-foreground mb-0.5 text-xs">Remaining</p>
				<div
					class="text-amount text-sm font-semibold {pct >= 100
						? 'text-[var(--color-warm-coral)]'
						: pct >= 80
							? 'text-[var(--color-amber)]'
							: 'text-[var(--color-sage-green)]'}"
				>
					{formatAmount(allowance.total.remaining, allowance.total.currency)}
				</div>
				<p class="text-muted-foreground mt-0.5 text-[10px]">
					{allowance.total.daysRemaining}d left
				</p>
			</div>
		</div>

		{#if passiveAccrualNote != null}
			<p class="text-muted-foreground text-[10px] leading-snug">
				Safe to spend includes about
				{formatAmount(passiveAccrualNote, allowance.total.currency)} estimated savings accrual not yet
				logged as income.
			</p>
		{/if}

		<!-- Progress bar (overspent: red overflow + red stroke per UX_SPEC 3.1.1) -->
		<div class="space-y-1.5">
			<div
				class="budget-progress {isOverspent ? 'budget-progress-overspent' : ''}"
				style={isOverspent ? '--overflow-pct: ' + overflowPct : ''}
			>
				<div
					class="budget-progress-fill"
					style="width: {fillWidth}%; --fill-pct: {fillWidth};"
				></div>
				{#if isOverspent}
					<div class="budget-progress-overflow" style="width: {overflowPct}%;"></div>
				{/if}
			</div>
			<div class="text-muted-foreground flex justify-between text-[10px]">
				<span>
					{formatAmount(allowance.total.spentSoFar, allowance.total.currency)} spent
				</span>
				<span>
					{formatAmount(allowance.total.monthly, allowance.total.currency)} budget
				</span>
			</div>
		</div>

		{#if tierRows.length > 0 && allowance}
			<div class="border-border space-y-1.5 border-t pt-3">
				<p class="text-[10px] font-medium tracking-widest text-[var(--color-text-tertiary)] uppercase">
					By tier
				</p>
				<ul class="space-y-1">
					{#each tierRows as row (row.tier)}
						<li class="text-muted-foreground flex justify-between text-[10px]">
							<span>{getWaterfallTierLabel(row.tier)}</span>
							<span>
								{formatAmount(row.spent, allowance.total.currency)} / {formatAmount(
									row.allocated,
									allowance.total.currency
								)}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Over-budget warning -->
		{#if isOverBudget && negativeStatus?.warningMessage}
			<div
				class="squircle-2xl squircle-border space-y-2 px-3.5 py-3"
				style="--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 25%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);"
			>
				<div class="flex items-center gap-2">
					<TrendingDown class="h-3.5 w-3.5 shrink-0 text-[var(--color-warm-coral)]" />
					<p class="text-xs font-medium text-[var(--color-warm-coral)]">
						{negativeStatus.warningMessage}
					</p>
				</div>
				{#if recoverySuggestions.length > 0}
					<ul class="space-y-1 pl-5">
						{#each recoverySuggestions.slice(0, 2) as suggestion}
							<li class="text-muted-foreground flex items-start gap-1.5 text-xs">
								<Lightbulb class="mt-0.5 h-3 w-3 shrink-0" />
								<span>{suggestion.title}: {suggestion.description}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		<!-- Confidence band (only when tier is low or medium) -->
		{#if showConfidenceBand && confidence && conservativeRemaining !== null}
			<div class="border-border space-y-1.5 border-t pt-3">
				<div class="flex items-center justify-between">
					<p class="text-[10px] text-[var(--color-text-tertiary)]">
						Remaining range
						<span
							class={confidence.tier === 'low'
								? 'text-[var(--color-warm-coral)]'
								: 'text-[var(--color-amber)]'}>· {confidence.tier} confidence</span
						>
					</p>
				</div>
				<div class="flex items-center justify-between gap-3 text-[10px]">
					<span class="text-[var(--color-text-tertiary)]">If all unclassified counted</span>
					<span
						class="font-medium {conservativeRemaining < 0
							? 'text-[var(--color-warm-coral)]'
							: 'text-[var(--color-text-secondary)]'}"
					>
						{formatTransactionAmount(conservativeRemaining, allowance.total.currency)}
					</span>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<!-- No allowance state -->
	<div class="squircle-4xl squircle-border bg-card px-5 py-6 text-center">
		<p class="text-muted-foreground text-sm">No spending plan set up yet.</p>
		<a href="/plan" class="text-amber mt-1 inline-block text-sm hover:underline">
			Set up your plan →
		</a>
	</div>
{/if}
