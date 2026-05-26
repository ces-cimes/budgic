<script lang="ts">
	import type { RecoveryHorizonSnapshot } from '$lib/core/services/core/recovery-horizon';
	import { dateUtils } from '$lib/utils/date-utils';

	interface Props {
		horizon: RecoveryHorizonSnapshot;
	}

	const { horizon }: Props = $props();

	const clearanceLabel = $derived(
		!horizon.aggregateClearanceDate
			? 'Clearance unknown at current pace'
			: `Debt-free by ${dateUtils.formatMonthYear(horizon.aggregateClearanceDate)} at current pace`
	);

	const progressPctDisplay = $derived(Math.min(100, Math.max(0, horizon.progressPct)));
</script>

<div class="space-y-1.5" aria-label="Recovery horizon progress">
	<div
		class="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-surface)]"
		role="progressbar"
		aria-valuenow={progressPctDisplay}
		aria-valuemin={0}
		aria-valuemax={100}
		aria-label="Progress toward debt-free"
	>
		<div
			class="h-full rounded-full bg-[var(--color-sage-green)] transition-all duration-700 ease-out"
			style="width: {progressPctDisplay}%"
		></div>
	</div>
	<p class="text-muted-foreground text-[10px] leading-snug">
		{clearanceLabel}
		{#if horizon.totalObligationBalance > 0.005}
			· {Math.round(progressPctDisplay)}% toward debt-free
		{/if}
	</p>
</div>
