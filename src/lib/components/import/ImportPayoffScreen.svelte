<script lang="ts">
	interface Props {
		beforeClassifiedExpenseShare: number;
		afterClassifiedExpenseShare: number;
		remainingUnclassified: number;
		onGoPatterns: () => void;
		onDone: () => void;
	}

	let {
		beforeClassifiedExpenseShare,
		afterClassifiedExpenseShare,
		remainingUnclassified,
		onGoPatterns,
		onDone
	}: Props = $props();
</script>

<div class="space-y-4">
	<h3 class="text-lg font-semibold text-[var(--color-text-primary)]">Import payoff</h3>
	<div class="space-y-2 rounded-xl bg-[var(--color-bg-surface)] p-4 text-sm">
		<p>
			<span class="text-[var(--color-text-tertiary)]">Classified expense share (this import):</span>
			{(beforeClassifiedExpenseShare * 100).toFixed(0)}% → {(
				afterClassifiedExpenseShare * 100
			).toFixed(0)}%
		</p>
		<p>
			<span class="text-[var(--color-text-tertiary)]">Unclassified rows left (tier view):</span>
			{remainingUnclassified}
		</p>
	</div>
	<div class="flex items-center justify-between">
		<button
			type="button"
			class="text-sm text-[var(--color-amber)] hover:underline"
			onclick={onGoPatterns}
		>
			Go to Patterns
		</button>
		<button
			type="button"
			class="rounded-xl bg-[var(--color-amber)] px-4 py-2 text-sm font-semibold text-[var(--color-bg-primary)]"
			onclick={onDone}
		>
			Done
		</button>
	</div>
</div>
