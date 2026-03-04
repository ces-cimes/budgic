<script lang="ts">
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import type { NegativeAllowanceStatus, RecoverySuggestion } from '$lib/core/services/core/negative-allowance-service';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { TrendingUp, TrendingDown, Lightbulb } from '@lucide/svelte';

	interface Props {
		allowance: EnhancedAllowance | null;
		isLoading?: boolean;
		negativeStatus?: NegativeAllowanceStatus | null;
		recoverySuggestions?: RecoverySuggestion[];
	}

	const { allowance, isLoading = false, negativeStatus = null, recoverySuggestions = [] }: Props =
		$props();

	const usagePct = $derived(() => {
		if (!allowance) return 0;
		if (allowance.total.monthly === 0) return allowance.total.spentSoFar > 0 ? 100 : 0;
		return Math.min(100, (allowance.total.spentSoFar / allowance.total.monthly) * 100);
	});

	const isOverBudget = $derived(
		negativeStatus?.isNegative &&
			(negativeStatus.handlingMode === 'allow_with_strong_warning' ||
				negativeStatus.handlingMode === 'block_with_warning')
	);

	const pct = $derived(usagePct());

	// Progress bar fill width — capped at 100%
	const fillWidth = $derived(Math.min(pct, 100));
</script>

{#if isLoading}
	<!-- Skeleton -->
	<div class="squircle-4xl squircle-border bg-card shadow-sm p-6 space-y-3">
		<div class="h-3 w-28 rounded bg-[var(--color-bg-surface)] animate-pulse"></div>
		<div class="h-8 w-36 rounded bg-[var(--color-bg-surface)] animate-pulse"></div>
		<div class="h-2 w-full rounded-full bg-[var(--color-bg-surface)] animate-pulse"></div>
	</div>
{:else if allowance}
	<div
		class="squircle-4xl squircle-border bg-card shadow-sm p-6 space-y-4"
		style={isOverBudget
			? '--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent);'
			: ''}
	>
		<!-- Header row -->
		<div class="flex items-start justify-between gap-3">
			<div class="flex-1 min-w-0">
				<p class="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">
					Safe to spend
				</p>
				<!-- Daily amount — hero number -->
				<div class="text-hero-sm {isOverBudget ? 'text-[var(--color-warm-coral)]' : ''}">
					{formatTransactionAmount(allowance.total.dailySafe, allowance.total.currency)}
					<span class="text-xs text-muted-foreground ml-1">
						/ day
					</span>
				</div>
			</div>

			<!-- Remaining badge -->
			<div class="text-right shrink-0">
				<p class="text-xs text-muted-foreground mb-0.5">Remaining</p>
				<div
					class="text-amount text-sm font-semibold {pct >= 100
						? 'text-[var(--color-warm-coral)]'
						: pct >= 80
							? 'text-[var(--color-amber)]'
							: 'text-[var(--color-sage-green)]'}"
				>
					{formatTransactionAmount(allowance.total.remaining, allowance.total.currency)}
				</div>
				<p class="text-[10px] text-muted-foreground mt-0.5">
					{allowance.total.daysRemaining}d left
				</p>
			</div>
		</div>

		<!-- Progress bar -->
		<div class="space-y-1.5">
			<div class="budget-progress">
				<div
					class="budget-progress-fill"
					style="width: {fillWidth}%; --fill-pct: {fillWidth};"
				></div>
			</div>
			<div class="flex justify-between text-[10px] text-muted-foreground">
				<span>
					{formatTransactionAmount(allowance.total.spentSoFar, allowance.total.currency)} spent
				</span>
				<span>
					{formatTransactionAmount(allowance.total.monthly, allowance.total.currency)} budget
				</span>
			</div>
		</div>

		<!-- Over-budget warning -->
		{#if isOverBudget && negativeStatus?.warningMessage}
			<div
				class="squircle-2xl squircle-border px-3.5 py-3 space-y-2"
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
							<li class="flex items-start gap-1.5 text-xs text-muted-foreground">
								<Lightbulb class="mt-0.5 h-3 w-3 shrink-0" />
								<span>{suggestion.title}: {suggestion.description}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		<!-- Quick breakdown: Essential / Discretionary / Buffer -->
		<div class="grid grid-cols-3 gap-2 pt-1 border-t border-border">
			{#each [
				{ label: 'Essential', value: allowance.essential.remaining, currency: allowance.essential.currency },
				{ label: 'Discretionary', value: allowance.discretionary.remaining, currency: allowance.discretionary.currency },
				{ label: 'Buffer', value: allowance.buffer.remaining, currency: allowance.buffer.currency }
			] as col}
				<div class="text-center">
					<p class="text-[10px] text-muted-foreground mb-0.5">{col.label}</p>
					<p class="text-amount text-xs font-medium">
						{formatTransactionAmount(col.value, col.currency)}
					</p>
				</div>
			{/each}
		</div>
	</div>
{:else}
	<!-- No allowance state -->
	<div class="squircle-4xl squircle-border bg-card px-5 py-6 text-center">
		<p class="text-sm text-muted-foreground">No spending plan set up yet.</p>
		<a href="/plan" class="text-sm text-amber hover:underline mt-1 inline-block">
			Set up your plan →
		</a>
	</div>
{/if}
