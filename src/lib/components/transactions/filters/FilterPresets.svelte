<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { FilterState } from '../TransactionList.svelte';

	interface Props {
		currentFilters: FilterState;
		onPresetSelect: (filters: FilterState) => void;
	}

	let { currentFilters, onPresetSelect }: Props = $props();

	function applyPreset(preset: string) {
		const now = new Date();
		let newFilters: Partial<FilterState> = {};

		switch (preset) {
			case 'uncategorized':
				newFilters = {
					categoryIds: ['__uncategorized__']
				};
				break;
			case 'thisMonthExpenses':
				const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
				const monthEnd = new Date(
					now.getFullYear(),
					now.getMonth() + 1,
					0,
					23,
					59,
					59,
					999
				);
				newFilters = {
					dateRange: { start: monthStart, end: monthEnd },
					types: ['expense'] as FilterState['types']
				};
				break;
			case 'pendingReview':
				newFilters = {
					statuses: ['pending', 'planned'] as FilterState['statuses']
				};
				break;
			case 'largeTransactions':
				newFilters = {
					minAmount: 100
				};
				break;
			case 'recurringBills':
				newFilters = {
					recurring: true,
					types: ['expense'] as FilterState['types']
				};
				break;
			case 'overBudget':
				newFilters = {
					overBudget: true
				};
				break;
		}

		// Merge with existing filters
		onPresetSelect({ ...currentFilters, ...newFilters } as FilterState);
	}

	const presets = [
		{ id: 'uncategorized', label: 'Uncategorized' },
		{ id: 'thisMonthExpenses', label: 'This Month Expenses' },
		{ id: 'pendingReview', label: 'Pending Review' },
		{ id: 'largeTransactions', label: 'Large Transactions' },
		{ id: 'recurringBills', label: 'Recurring Bills' },
		{ id: 'overBudget', label: 'Over Budget' }
	];
</script>

<div class="flex flex-wrap gap-2">
	{#each presets as preset}
		<Button variant="outline" size="sm" onclick={() => applyPreset(preset.id)} class="text-xs">
			{preset.label}
		</Button>
	{/each}
</div>
