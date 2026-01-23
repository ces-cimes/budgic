<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import type { FilterState } from '../TransactionList.svelte';

	interface Props {
		filters: FilterState;
		onFiltersChange: (filters: FilterState) => void;
	}

	let { filters, onFiltersChange }: Props = $props();

	let startDate = $state('');
	let endDate = $state('');

	$effect(() => {
		if (filters.dateRange) {
			startDate = filters.dateRange.start.toISOString().split('T')[0];
			endDate = filters.dateRange.end.toISOString().split('T')[0];
		} else {
			startDate = '';
			endDate = '';
		}
	});

	function updateDateRange() {
		if (startDate && endDate) {
			onFiltersChange({
				...filters,
				dateRange: {
					start: new Date(startDate),
					end: new Date(endDate)
				}
			});
		} else {
			onFiltersChange({
				...filters,
				dateRange: undefined
			});
		}
	}

	function applyPreset(preset: 'today' | 'thisWeek' | 'thisMonth' | 'thisYear' | 'last7Days' | 'last30Days' | 'last90Days') {
		const now = new Date();
		let start: Date;
		let end: Date = new Date(now);

		switch (preset) {
			case 'today':
				start = new Date(now);
				start.setHours(0, 0, 0, 0);
				end.setHours(23, 59, 59, 999);
				break;
			case 'thisWeek':
				start = new Date(now);
				start.setDate(now.getDate() - now.getDay());
				start.setHours(0, 0, 0, 0);
				end.setHours(23, 59, 59, 999);
				break;
			case 'thisMonth':
				start = new Date(now.getFullYear(), now.getMonth(), 1);
				end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
				break;
			case 'thisYear':
				start = new Date(now.getFullYear(), 0, 1);
				end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
				break;
			case 'last7Days':
				start = new Date(now);
				start.setDate(now.getDate() - 7);
				start.setHours(0, 0, 0, 0);
				end.setHours(23, 59, 59, 999);
				break;
			case 'last30Days':
				start = new Date(now);
				start.setDate(now.getDate() - 30);
				start.setHours(0, 0, 0, 0);
				end.setHours(23, 59, 59, 999);
				break;
			case 'last90Days':
				start = new Date(now);
				start.setDate(now.getDate() - 90);
				start.setHours(0, 0, 0, 0);
				end.setHours(23, 59, 59, 999);
				break;
		}

		startDate = start.toISOString().split('T')[0];
		endDate = end.toISOString().split('T')[0];
		updateDateRange();
	}

	const dateTypeValue = $derived(filters.dateType || 'cleared');
	
	const presets = [
		{ value: 'today', label: 'Today' },
		{ value: 'thisWeek', label: 'This Week' },
		{ value: 'thisMonth', label: 'This Month' },
		{ value: 'thisYear', label: 'This Year' },
		{ value: 'last7Days', label: 'Last 7 Days' },
		{ value: 'last30Days', label: 'Last 30 Days' },
		{ value: 'last90Days', label: 'Last 90 Days' }
	] as const;
</script>

<div class="space-y-4">
	<!-- Date Type -->
	<div class="space-y-2">
		<label class="text-xs font-medium text-muted-foreground">Date Type</label>
		<Select.Root
			type="single"
			value={dateTypeValue}
			onValueChange={(value) => {
				onFiltersChange({
					...filters,
					dateType: value === 'cleared' ? undefined : (value as 'cleared' | 'planned' | undefined)
				});
			}}
		>
			<Select.Trigger class="w-full">
				{filters.dateType === 'planned' ? 'Planned' : 'Cleared'}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="cleared">Cleared Date</Select.Item>
				<Select.Item value="planned">Planned Date</Select.Item>
			</Select.Content>
		</Select.Root>
	</div>

	<!-- Date Range Inputs -->
	<div class="grid grid-cols-2 gap-2">
		<div class="space-y-1">
			<label class="text-xs font-medium text-muted-foreground">Start Date</label>
			<Input
				type="date"
				bind:value={startDate}
				oninput={updateDateRange}
				class="text-sm"
			/>
		</div>
		<div class="space-y-1">
			<label class="text-xs font-medium text-muted-foreground">End Date</label>
			<Input
				type="date"
				bind:value={endDate}
				oninput={updateDateRange}
				class="text-sm"
			/>
		</div>
	</div>

	<!-- Quick Presets -->
	<div class="space-y-2">
		<label class="text-xs font-medium text-muted-foreground">Quick Presets</label>
		<div class="flex flex-wrap gap-2">
			{#each presets as preset}
				<Button
					variant="outline"
					size="sm"
					onclick={() => applyPreset(preset.value)}
					class="text-xs"
				>
					{preset.label}
				</Button>
			{/each}
		</div>
	</div>
</div>
