<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import type { FilterState } from '../TransactionList.svelte';

	interface Props {
		filters: FilterState;
		onFiltersChange: (filters: FilterState) => void;
		userCurrency?: string | null;
	}

	let { filters, onFiltersChange, userCurrency = 'USD' }: Props = $props();

	let minAmount = $state(filters.minAmount?.toString() || '');
	let maxAmount = $state(filters.maxAmount?.toString() || '');

	$effect(() => {
		minAmount = filters.minAmount?.toString() || '';
		maxAmount = filters.maxAmount?.toString() || '';
	});

	function updateAmounts() {
		onFiltersChange({
			...filters,
			minAmount: minAmount ? parseFloat(minAmount) : undefined,
			maxAmount: maxAmount ? parseFloat(maxAmount) : undefined
		});
	}

	const quickPresets = [
		{ label: '< $10', min: undefined, max: 10 },
		{ label: '$10 - $50', min: 10, max: 50 },
		{ label: '$50 - $100', min: 50, max: 100 },
		{ label: '$100 - $500', min: 100, max: 500 },
		{ label: '> $500', min: 500, max: undefined }
	];

	function applyPreset(min: number | undefined, max: number | undefined) {
		minAmount = min?.toString() || '';
		maxAmount = max?.toString() || '';
		updateAmounts();
	}
</script>

<div class="space-y-4">
	<!-- Amount Inputs -->
	<div class="grid grid-cols-2 gap-2">
		<div class="space-y-1">
			<label class="text-xs font-medium text-muted-foreground">Min Amount</label>
			<Input
				type="number"
				step="0.01"
				placeholder="0.00"
				bind:value={minAmount}
				oninput={updateAmounts}
				class="text-sm"
			/>
		</div>
		<div class="space-y-1">
			<label class="text-xs font-medium text-muted-foreground">Max Amount</label>
			<Input
				type="number"
				step="0.01"
				placeholder="0.00"
				bind:value={maxAmount}
				oninput={updateAmounts}
				class="text-sm"
			/>
		</div>
	</div>

	<!-- Quick Presets -->
	<div class="space-y-2">
		<label class="text-xs font-medium text-muted-foreground">Quick Presets</label>
		<div class="flex flex-wrap gap-2">
			{#each quickPresets as preset}
				<Button
					variant="outline"
					size="sm"
					onclick={() => applyPreset(preset.min, preset.max)}
					class="text-xs"
				>
					{preset.label}
				</Button>
			{/each}
		</div>
	</div>
</div>
