<script lang="ts">
	import Tabs from '$lib/components/primitives/Tabs.svelte';
	import { List, Calendar, Clock, CheckCircle, BarChart3 } from '@lucide/svelte';

	interface Props {
		selectedView: string;
		onViewChange: (view: string) => void;
	}

	let { selectedView, onViewChange }: Props = $props();

	const viewOptions = [
		{ id: 'list', label: 'List', icon: List },
		{ id: 'calendar', label: 'Calendar', icon: Calendar },
		{ id: 'planning', label: 'Planning', icon: Clock },
		{ id: 'cleared', label: 'Cleared', icon: CheckCircle },
		{ id: 'analysis', label: 'Analysis', icon: BarChart3 }
	];

	const selectedIndex = $derived(viewOptions.findIndex(option => option.id === selectedView));
</script>

<div class="flex items-center gap-1 p-1 bg-surface-secondary rounded-lg">
	{#each viewOptions as option, index}
        {@const Icon = option.icon}
		<button
			class="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors {selectedView === option.id ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}"
			onclick={() => onViewChange(option.id)}
		>
			<Icon class="size-4" />
			<span class="hidden sm:inline">{option.label}</span>
		</button>
	{/each}
</div> 