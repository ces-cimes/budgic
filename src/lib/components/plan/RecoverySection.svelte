<script lang="ts">
	import type { RecoveryHorizonSnapshot } from '$lib/core/services/core/recovery-horizon';
	import { formatAmount } from '$lib/utils/currency-utils';
	import { dateUtils } from '$lib/utils/date-utils';
	import { getTierColorToken } from '$lib/utils/budget-tier-display';
	import { getWaterfallTierLabel } from '$lib/utils/waterfall-tier-utils';

	interface Props {
		horizon: RecoveryHorizonSnapshot;
	}

	const { horizon }: Props = $props();

	const tierLockCopy: Record<string, string> = {
		survival: 'Non-negotiable',
		security: 'Non-negotiable',
		growth: 'Debt progress',
		lifestyle: 'Voluntary sacrifice'
	};
</script>

<section class="space-y-5" aria-label="Recovery focus">
	<div class="space-y-3">
		<h3 class="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
			Recovery horizon
		</h3>
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="border-border rounded-lg border px-4 py-3">
				<p class="text-muted-foreground text-[10px] uppercase">Weekly surplus</p>
				<p class="text-amount text-lg font-semibold">
					{formatAmount(horizon.weeklySurplus, horizon.currency)}
				</p>
			</div>
			<div class="border-border rounded-lg border px-4 py-3">
				<p class="text-muted-foreground text-[10px] uppercase">Projected clearance</p>
				<p class="text-sm font-medium">
					{#if horizon.aggregateClearanceDate}
						{dateUtils.formatMonthYear(horizon.aggregateClearanceDate)}
					{:else}
						Unknown at current pace
					{/if}
				</p>
			</div>
		</div>
	</div>

	{#if horizon.obligations.length > 0}
		<div class="space-y-2">
			<h4 class="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
				Active obligations
			</h4>
			<ul class="space-y-2">
				{#each horizon.obligations as obligation (obligation.id)}
					<li
						class="border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
					>
						<span class="truncate text-sm font-medium">{obligation.label}</span>
						<div class="shrink-0 text-right text-xs">
							<p>{formatAmount(obligation.balance, horizon.currency)}</p>
							<p class="text-muted-foreground">
								{#if obligation.projectedClearanceDate}
									Clear {dateUtils.formatMonthYear(obligation.projectedClearanceDate)}
								{:else}
									No clearance date
								{/if}
							</p>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if horizon.tradeOff}
		<p
			class="text-muted-foreground border-border rounded-lg border px-3 py-2 text-xs leading-relaxed"
		>
			Reducing lifestyle by
			<span class="text-foreground font-medium">
				{formatAmount(horizon.tradeOff.lifestyleReductionPerWeek, horizon.currency)}/week
			</span>
			could shorten your timeline by about
			<span class="text-foreground font-medium">{horizon.tradeOff.weeksSaved} week(s)</span>.
		</p>
	{/if}

	<div class="space-y-2">
		<h4 class="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
			Tier lock
		</h4>
		<ul class="space-y-2">
			{#each horizon.tierRows as row (row.tier)}
				<li class="flex items-center gap-2 text-xs">
					<span
						class="inline-block h-2 w-2 shrink-0 rounded-full"
						style="background: {getTierColorToken(row.tier)}"
						aria-hidden="true"
					></span>
					<span class="min-w-[4.5rem] font-medium">{getWaterfallTierLabel(row.tier)}</span>
					<span class="text-muted-foreground">{tierLockCopy[row.tier] ?? ''}</span>
					<span class="text-muted-foreground ml-auto">
						{formatAmount(row.spent, horizon.currency)} /
						{formatAmount(row.allocated, horizon.currency)}
					</span>
				</li>
			{/each}
		</ul>
	</div>
</section>
