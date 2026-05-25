<script lang="ts">
	import type { TierSegmentLayout } from '$lib/utils/budget-tier-display';
	import { getWaterfallTierLabel } from '$lib/utils/waterfall-tier-utils';
	import { formatAmount } from '$lib/utils/currency-utils';

	interface Props {
		segments: TierSegmentLayout[];
		currency: string;
	}

	const { segments, currency }: Props = $props();

	const anyOverspent = $derived(segments.some((segment) => segment.isOverspent));

	const ariaLabel = $derived(
		segments
			.map(
				(segment) =>
					`${getWaterfallTierLabel(segment.tier)}: ${formatAmount(segment.spent, currency)} of ${formatAmount(segment.allocated, currency)}`
			)
			.join('; ')
	);
</script>

<div class="space-y-1.5">
	<div
		class="tier-segment-bar flex h-1.5 w-full rounded-full bg-[var(--color-bg-surface)] {anyOverspent
			? 'overflow-visible outline outline-2 outline-offset-[-1px] outline-[var(--color-warm-coral)]'
			: 'overflow-hidden'}"
		role="img"
		aria-label={ariaLabel}
	>
		{#each segments as segment, index (segment.tier)}
			<div
				class="relative h-full shrink-0 {index < segments.length - 1
					? 'border-border border-r'
					: ''}"
				style="width: {segment.widthPct}%"
				aria-hidden="true"
			>
				<div
					class="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
					style="width: {segment.fillPct}%; background: {segment.colorToken}; border-radius: {index ===
					0
						? '9999px 0 0 9999px'
						: index === segments.length - 1
							? '0 9999px 9999px 0'
							: '0'};"
				></div>
				{#if segment.isOverspent}
					<div
						class="absolute inset-y-0 bg-[var(--color-warm-coral)]"
						style="left: 100%; width: {segment.overflowPct}%; min-width: 2px; border-radius: 0 9999px 9999px 0;"
					></div>
				{/if}
			</div>
		{/each}
	</div>

	<div class="flex flex-wrap gap-x-3 gap-y-1">
		{#each segments as segment (segment.tier)}
			<div class="text-muted-foreground flex items-center gap-1 text-[10px]">
				<span
					class="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
					style="background: {segment.colorToken}"
					aria-hidden="true"
				></span>
				<span>{getWaterfallTierLabel(segment.tier)}</span>
				<span>
					{formatAmount(segment.spent, currency)} / {formatAmount(segment.allocated, currency)}
				</span>
			</div>
		{/each}
	</div>
</div>
