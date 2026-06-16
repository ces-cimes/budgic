<script lang="ts">
	export type TierChoice = 'survival' | 'security' | 'growth' | 'lifestyle' | 'unclassified';
	export interface CandidateRow {
		patternKey: string;
		suggestedTier: TierChoice;
		matchedTransactionIds: string[];
		allowanceImpact: number;
		cadence: 'monthly' | 'weekly' | 'irregular';
		confidence: number;
		reason: string;
	}

	interface Props {
		candidates: CandidateRow[];
		onApproveAll: () => void;
		onApproveRow: (candidate: CandidateRow, tier: TierChoice) => void;
		onSkipRow: (candidate: CandidateRow) => void;
		onNext: () => void;
	}

	let { candidates, onApproveAll, onApproveRow, onSkipRow, onNext }: Props = $props();
	let overrides = $state<Record<string, TierChoice>>({});

	const tierOptions: TierChoice[] = [
		'survival',
		'security',
		'growth',
		'lifestyle',
		'unclassified'
	];
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold text-[var(--color-text-primary)]">Essential candidates</h3>
		<button class="text-sm text-[var(--color-amber)] hover:underline" onclick={onApproveAll}>
			Approve all essentials
		</button>
	</div>
	<div class="max-h-80 space-y-2 overflow-y-auto">
		{#each candidates as c (c.patternKey)}
			<div
				class="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3"
			>
				<p class="text-sm font-medium text-[var(--color-text-primary)]">{c.reason}</p>
				<p class="text-xs text-[var(--color-text-tertiary)]">
					{c.patternKey} · {(c.allowanceImpact * 100).toFixed(1)}% impact · {c.cadence}
				</p>
				<div class="flex items-center gap-2">
					<select
						class="border-border rounded-md border bg-[var(--color-bg-secondary)] px-2 py-1 text-xs"
						bind:value={overrides[c.patternKey]}
					>
						<option value={c.suggestedTier}>{c.suggestedTier} (suggested)</option>
						{#each tierOptions as tier}
							<option value={tier}>{tier}</option>
						{/each}
					</select>
					<button
						class="rounded-md bg-[var(--color-amber)] px-2 py-1 text-xs font-semibold text-[var(--color-bg-primary)]"
						onclick={() => onApproveRow(c, overrides[c.patternKey] ?? c.suggestedTier)}
					>
						Approve
					</button>
					<button
						class="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs"
						onclick={() => onSkipRow(c)}
					>
						Skip
					</button>
				</div>
			</div>
		{/each}
	</div>
	<div class="flex justify-end">
		<button
			class="rounded-xl bg-[var(--color-amber)] px-4 py-2 text-sm font-semibold text-[var(--color-bg-primary)]"
			onclick={onNext}
		>
			Continue
		</button>
	</div>
</div>
