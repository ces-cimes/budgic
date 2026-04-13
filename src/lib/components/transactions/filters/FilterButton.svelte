<script lang="ts">
	import { MoreVertical } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';

	interface Props {
		activeFilterCount: number;
		onClick: () => void;
	}

	let { activeFilterCount, onClick }: Props = $props();

	const hasActiveFilters = $derived(activeFilterCount > 0);
</script>

<Button
	variant={hasActiveFilters ? 'default' : 'outline'}
	size="icon"
	onclick={onClick}
	aria-label="Filter transactions"
	class="relative"
>
	<MoreVertical size={20} />
	{#if hasActiveFilters}
		<Badge
			variant="secondary"
			class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center p-0 text-xs"
		>
			{activeFilterCount}
		</Badge>
	{/if}
</Button>
