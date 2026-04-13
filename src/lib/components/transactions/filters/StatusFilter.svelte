<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import type { FilterState } from '../TransactionList.svelte';

	interface Props {
		filters: FilterState;
		onFiltersChange: (filters: FilterState) => void;
	}

	let { filters, onFiltersChange }: Props = $props();

	type StatusValue = NonNullable<FilterState['statuses']>[number];

	const statusOptions: Array<{ value: StatusValue; label: string }> = [
		{ value: 'cleared', label: 'Cleared' },
		{ value: 'pending', label: 'Pending' },
		{ value: 'planned', label: 'Planned' },
		{ value: 'cancelled', label: 'Cancelled' },
		{ value: 'upcoming', label: 'Upcoming' },
		{ value: 'overdue', label: 'Overdue' }
	];

	function toggleStatus(status: StatusValue) {
		const currentStatuses = filters.statuses ?? [];
		let newStatuses: NonNullable<FilterState['statuses']>;

		if (currentStatuses.includes(status)) {
			newStatuses = currentStatuses.filter((s) => s !== status);
		} else {
			newStatuses = [...currentStatuses, status];
		}

		onFiltersChange({
			...filters,
			statuses: newStatuses.length > 0 ? newStatuses : undefined
		});
	}
</script>

<div class="space-y-2">
	{#each statusOptions as option}
		<label class="flex cursor-pointer items-center space-x-2">
			<Checkbox
				checked={filters.statuses?.includes(option.value) || false}
				onCheckedChange={() => toggleStatus(option.value)}
			/>
			<span class="text-primary text-sm">{option.label}</span>
		</label>
	{/each}
</div>
