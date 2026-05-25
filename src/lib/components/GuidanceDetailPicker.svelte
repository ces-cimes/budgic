<script lang="ts">
	import type { ExplanationDetail, GuidanceTone } from '$lib/utils/guidance-presentation';

	interface Props {
		guidanceTone: GuidanceTone;
		explanationDetail: ExplanationDetail;
		onGuidanceToneChange: (value: GuidanceTone) => void;
		onExplanationDetailChange: (value: ExplanationDetail) => void;
	}

	const {
		guidanceTone,
		explanationDetail,
		onGuidanceToneChange,
		onExplanationDetailChange
	}: Props = $props();

	const guidanceOptions: Array<{ value: GuidanceTone; label: string; description: string }> = [
		{
			value: 'supportive',
			label: 'Supportive',
			description: 'More tips and encouragement as you explore'
		},
		{
			value: 'balanced',
			label: 'Balanced',
			description: 'Helpful hints without extra noise'
		},
		{
			value: 'minimal',
			label: 'Minimal',
			description: 'Just the essentials — fewer prompts'
		}
	];

	const detailOptions: Array<{ value: ExplanationDetail; label: string; description: string }> = [
		{
			value: 'full',
			label: 'Full',
			description: 'Longer explanations when Budgic offers guidance'
		},
		{
			value: 'standard',
			label: 'Standard',
			description: 'Default helper copy length'
		},
		{
			value: 'brief',
			label: 'Brief',
			description: 'Short one-line hints only'
		}
	];
</script>

<div class="space-y-5">
	<div class="space-y-2">
		<p class="text-sm font-medium text-[var(--color-text-primary)]">Guidance</p>
		<p class="text-xs text-[var(--color-text-tertiary)]">
			How much coaching Budgic shows — not which features you can access
		</p>
		<div class="space-y-2">
			{#each guidanceOptions as option}
				<button
					type="button"
					onclick={() => onGuidanceToneChange(option.value)}
					class="w-full rounded-xl border p-3.5 text-left transition-colors {guidanceTone ===
					option.value
						? 'border-[var(--color-amber)] bg-[var(--color-amber-subtle)]'
						: 'border-border hover:border-[var(--color-amber)]/40'}"
				>
					<p
						class="text-sm font-medium {guidanceTone === option.value
							? 'text-[var(--color-amber)]'
							: 'text-[var(--color-text-primary)]'}"
					>
						{option.label}
					</p>
					<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{option.description}</p>
				</button>
			{/each}
		</div>
	</div>

	<div class="space-y-2">
		<p class="text-sm font-medium text-[var(--color-text-primary)]">Detail</p>
		<p class="text-xs text-[var(--color-text-tertiary)]">How long helper text runs when shown</p>
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
			{#each detailOptions as option}
				<button
					type="button"
					onclick={() => onExplanationDetailChange(option.value)}
					class="rounded-xl border p-3 text-left transition-colors {explanationDetail ===
					option.value
						? 'border-[var(--color-amber)] bg-[var(--color-amber-subtle)]'
						: 'border-border bg-[var(--color-bg-surface)] hover:border-[var(--color-amber)]/40'}"
				>
					<p
						class="text-sm font-medium {explanationDetail === option.value
							? 'text-[var(--color-amber)]'
							: 'text-[var(--color-text-primary)]'}"
					>
						{option.label}
					</p>
					<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{option.description}</p>
				</button>
			{/each}
		</div>
	</div>
</div>
