<script lang="ts">
	import type { EnhancedAllowance } from '$lib/core/services/core/budget-service';
	import type {
		NegativeAllowanceStatus,
		RecoverySuggestion
	} from '$lib/core/services/core/negative-allowance-service';
	import {
		computeTierSegmentLayout,
		type AllowanceTierRow
	} from '$lib/utils/budget-tier-display';
	import { formatAmount, formatTransactionAmount } from '$lib/utils/currency-utils';
	import { dateUtils } from '$lib/utils/date-utils';
	import { TrendingDown, Lightbulb } from '@lucide/svelte';
	import { EmptyState } from '$lib/components/ui/empty-state';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import TierSegmentedAllowanceBar from '$lib/components/TierSegmentedAllowanceBar.svelte';
	import RecoveryHorizonCard from '$lib/components/RecoveryHorizonCard.svelte';
	import type { RecoveryHorizonSnapshot } from '$lib/core/services/core/recovery-horizon';

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
		/**
		 * When true, render recovery horizon card instead of normal allowance UI.
		 * Stub in Milestone E — body implemented in Milestone F (CHECKLIST F L602).
		 * Wired from `userPreferences.recoveryModeActive` in F batch; Home passes prop in F.
		 */
		recoveryModeActive?: boolean;
		/** Loaded when recovery mode active; renders horizon card in bar slot. */
		recoveryHorizon?: RecoveryHorizonSnapshot | null;
	}

	const {
		allowance,
		isLoading = false,
		negativeStatus = null,
		recoverySuggestions = [],
		confidence = null,
		tierRows = [],
		recoveryModeActive = false,
		recoveryHorizon = null
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

	const isOverspent = $derived(pct > 100);

	const tierSegments = $derived(computeTierSegmentLayout(tierRows));
	const anyTierOverspent = $derived(tierSegments.some((segment) => segment.isOverspent));
	const showTierBar = $derived(tierSegments.length > 0);
	const showRecoveryHero = $derived(recoveryModeActive && recoveryHorizon != null);
</script>

{#if isLoading}
	<!-- Skeleton -->
	<div class="squircle-4xl squircle-border bg-card space-y-3 p-6 shadow-sm">
		<Skeleton class="h-3 w-28 rounded bg-[var(--color-bg-surface)]" />
		<Skeleton class="h-8 w-36 rounded bg-[var(--color-bg-surface)]" />
		<Skeleton class="h-2 w-full rounded-full bg-[var(--color-bg-surface)]" />
	</div>
{:else if allowance}
	<div
		class="squircle-4xl squircle-border bg-card space-y-4 p-6 shadow-sm"
		style={isOverBudget || isOverspent || anyTierOverspent
			? '--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent);'
			: ''}
	>
		<!-- Header row -->
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<p class="text-muted-foreground mb-1 text-xs font-medium tracking-widest uppercase">
					{showRecoveryHero ? 'Weekly surplus' : 'Safe to spend'}
				</p>
				<!-- Hero: weekly surplus in recovery view, daily allowance otherwise -->
				<div
					class="text-hero-sm {isOverBudget || isOverspent
						? 'text-[var(--color-warm-coral)]'
						: ''}"
				>
					{#if showRecoveryHero}
						{formatAmount(recoveryHorizon!.weeklySurplus, recoveryHorizon!.currency)}
						<span class="text-muted-foreground ml-1 text-xs"> / week </span>
					{:else}
						{formatAmount(allowance.total.dailySafe, allowance.total.currency)}
						<span class="text-muted-foreground ml-1 text-xs"> / day </span>
					{/if}
				</div>
			</div>

			<!-- Remaining badge -->
			<div class="shrink-0 text-right">
				{#if showRecoveryHero}
					<p class="text-muted-foreground mb-0.5 text-xs">Obligations</p>
					<div
						class="text-amount text-sm font-semibold text-[var(--color-text-secondary)]"
					>
						{formatAmount(
							recoveryHorizon!.totalObligationBalance,
							recoveryHorizon!.currency
						)}
					</div>
					<p class="text-muted-foreground mt-0.5 text-[10px]">
						{#if recoveryHorizon!.aggregateClearanceDate}
							Clear {dateUtils.formatMonthYear(
								recoveryHorizon!.aggregateClearanceDate
							)}
						{:else}
							Clearance unknown
						{/if}
					</p>
				{:else}
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
				{/if}
			</div>
		</div>

		{#if passiveAccrualNote != null && !showRecoveryHero}
			<p class="text-muted-foreground text-[10px] leading-snug">
				Safe to spend includes about
				{formatAmount(passiveAccrualNote, allowance.total.currency)} estimated savings accrual
				not yet logged as income.
			</p>
		{/if}

		{#if recoveryModeActive && recoveryHorizon}
			<RecoveryHorizonCard horizon={recoveryHorizon} />
		{:else if recoveryModeActive}
			<div
				class="text-muted-foreground border-border rounded-lg border border-dashed px-3 py-4 text-center text-xs"
			>
				Loading recovery horizon…
			</div>
		{:else if showTierBar}
			<!-- Normal mode: tier-coloured segmented allowance bar (Milestone E) -->
			<TierSegmentedAllowanceBar
				segments={tierSegments}
				currency={allowance.total.currency}
			/>
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

		<!-- Confidence band (only when tier is low or medium; hidden in recovery view) -->
		{#if !showRecoveryHero && showConfidenceBand && confidence && conservativeRemaining !== null}
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
					<span class="text-[var(--color-text-tertiary)]"
						>If all unclassified counted</span
					>
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
	<EmptyState variant="card" body="No spending plan set up yet." class="px-5 py-6">
		{#snippet children()}
			<a href="/plan" class="text-amber mt-1 inline-block text-sm hover:underline">
				Set up your plan →
			</a>
		{/snippet}
	</EmptyState>
{/if}
