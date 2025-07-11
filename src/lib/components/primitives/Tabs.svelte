<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Button from './Button.svelte';

	type TabItem = string | { label?: string; icon?: any };

	let {
		items = [],
		selectedIndex = $bindable(0),
		class: className = ''
	} = $props<{
		items?: TabItem[];
		selectedIndex?: number;
		class?: string;
	}>();

	const dispatch = createEventDispatcher();

	function handleTabClick(index: number) {
		selectedIndex = index;
		dispatch('change', { index, value: items[index] });
	}

	function isComponentItem(item: TabItem): item is { label?: string; icon?: any } {
		return typeof item === 'object' && item !== null;
	}
</script>

<div class="flex flex-wrap gap-2 {className}">
	{#each items as item, index}
		<Button
			onclick={() => handleTabClick(index)}
			variant={selectedIndex === index ? "primary" : "neutral"}
			size="sm"
			icon={isComponentItem(item) && item.icon}
		>
			{#if isComponentItem(item)}
				{#if item.icon}
					{@render item.icon({ class: 'w-4 h-4' })}
				{/if}
				{#if item.label}
					{item.label}
				{/if}
			{:else}
				{item}
			{/if}
		</Button>
	{/each}
</div>
