<script lang="ts">
	import type { Transaction } from '$lib/core/db';

	/** UX_SPEC: Row 3 (bottom) = Expense | Income; Row 2 = Planned expense | Planned income; Row 1 (top) = Transfer */
	interface Option {
		label: string;
		type: Transaction['type'];
		status: Transaction['status'];
		borderClass: string; // solid red, solid green, dashed red, dashed green, dotted neutral
		fullWidth?: boolean;
	}

	const options: Option[] = [
		{ label: 'Expense', type: 'expense', status: 'cleared', borderClass: 'border-2 border-solid border-[var(--color-warm-coral)]' },
		{ label: 'Income', type: 'income', status: 'cleared', borderClass: 'border-2 border-solid border-[var(--color-sage-green)]' },
		{ label: 'Planned expense', type: 'expense', status: 'planned', borderClass: 'border-2 border-dashed border-[var(--color-warm-coral)]' },
		{ label: 'Planned income', type: 'income', status: 'planned', borderClass: 'border-2 border-dashed border-[var(--color-sage-green)]' },
		{ label: 'Transfer', type: 'transfer', status: 'cleared', borderClass: 'border-2 border-dotted border-[var(--color-text-tertiary)]', fullWidth: true }
	];

	interface Props {
		onSelect: (type: Transaction['type'], status: Transaction['status']) => void;
	}

	const { onSelect }: Props = $props();

	function handleSelect(type: Transaction['type'], status: Transaction['status']) {
		onSelect(type, status);
	}
</script>

<div class="grid gap-2" role="group" aria-label="Choose transaction type">
	<!-- Row 1 (top): Transfer - full width -->
	<button
		type="button"
		class="rounded-xl border-2 border-dotted border-[var(--color-text-tertiary)] bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--color-bg-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)] {options[4].borderClass}"
		onclick={() => handleSelect(options[4].type, options[4].status)}
	>
		<span class="text-sm font-medium">{options[4].label}</span>
	</button>
	<!-- Row 2: Planned expense | Planned income -->
	<div class="grid grid-cols-2 gap-2">
		<button
			type="button"
			class="rounded-xl border-2 border-dashed border-[var(--color-warm-coral)] bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--color-bg-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)] {options[2].borderClass}"
			onclick={() => handleSelect(options[2].type, options[2].status)}
		>
			<span class="text-sm font-medium">{options[2].label}</span>
		</button>
		<button
			type="button"
			class="rounded-xl border-2 border-dashed border-[var(--color-sage-green)] bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--color-bg-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)] {options[3].borderClass}"
			onclick={() => handleSelect(options[3].type, options[3].status)}
		>
			<span class="text-sm font-medium">{options[3].label}</span>
		</button>
	</div>
	<!-- Row 3 (bottom, closest to thumb): Expense | Income -->
	<div class="grid grid-cols-2 gap-2">
		<button
			type="button"
			class="rounded-xl border-2 border-solid border-[var(--color-warm-coral)] bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--color-bg-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)] {options[0].borderClass}"
			onclick={() => handleSelect(options[0].type, options[0].status)}
		>
			<span class="text-sm font-medium">{options[0].label}</span>
		</button>
		<button
			type="button"
			class="rounded-xl border-2 border-solid border-[var(--color-sage-green)] bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--color-bg-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)] {options[1].borderClass}"
			onclick={() => handleSelect(options[1].type, options[1].status)}
		>
			<span class="text-sm font-medium">{options[1].label}</span>
		</button>
	</div>
</div>
