<script lang="ts">
	import type { ImportResult } from '$lib/core/services/import-export';

	type Hint = NonNullable<NonNullable<ImportResult['importBatch']>['patternHints']>[number];

	interface Props {
		patternHints: Hint[];
		onGoPatterns: () => void;
		onNext: () => void;
		onSkip: () => void;
	}

	let { patternHints, onGoPatterns, onNext, onSkip }: Props = $props();
</script>

<div class="space-y-4">
	<h3 class="text-lg font-semibold text-[var(--color-text-primary)]">Uncertain patterns</h3>
	<p class="text-xs text-[var(--color-text-secondary)]">
		Clusters of similar unclassified expenses from this import. Refine recurring rules under
		Patterns when you are ready.
	</p>

	{#if patternHints.length === 0}
		<p class="text-sm text-[var(--color-text-tertiary)]">No strong clusters found in this batch.</p>
	{:else}
		<ul class="max-h-72 space-y-2 overflow-y-auto">
			{#each patternHints as h (h.hintId)}
				<li
					class="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-xs"
				>
					<p class="font-medium text-[var(--color-text-primary)]">{h.representativeDescription}</p>
					<p class="text-[var(--color-text-tertiary)]">
						{h.transactionIds.length} tx · {h.totalAbsAmount.toFixed(2)} total
					</p>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="flex flex-wrap items-center justify-between gap-2">
		<button
			type="button"
			class="text-sm text-[var(--color-text-tertiary)] hover:underline"
			onclick={onSkip}
		>
			Skip
		</button>
		<button
			type="button"
			class="text-sm text-[var(--color-amber)] hover:underline"
			onclick={onGoPatterns}
		>
			Open Patterns
		</button>
		<button
			type="button"
			class="rounded-xl bg-[var(--color-amber)] px-4 py-2 text-sm font-semibold text-[var(--color-bg-primary)]"
			onclick={onNext}
		>
			Continue
		</button>
	</div>
</div>
