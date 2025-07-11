<script lang="ts">
	import Button from '$lib/components/primitives/Button.svelte';
	import { Tag, Download, Merge, Trash2, X } from '@lucide/svelte';

	interface Props {
		selectedTransactions: Set<string>;
		updateCounter?: number;
		onClearSelection: () => void;
		onBulkCategorize: () => void;
		onBulkExport: () => void;
		onBulkMerge: () => void;
		onBulkDelete: () => void;
	}

	let {
		selectedTransactions,
		updateCounter = 0,
		onClearSelection,
		onBulkCategorize,
		onBulkExport,
		onBulkMerge,
		onBulkDelete
	}: Props = $props();

	// Calculate selected count reactively
	const selectedCount = $derived.by(() => selectedTransactions.size);


</script>

<div class="space-y-3">
	<!-- Header with count and clear button -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<span class="text-lg font-semibold text-text-primary">
				{selectedCount} selected
			</span>
			<Button 
				variant="neutral" 
				size="sm" 
				onclick={onClearSelection}
				class="text-text-secondary hover:text-text-primary"
			>
				<X class="size-4" />
				<span class="ml-1">Clear</span>
			</Button>
		</div>
	</div>

	<!-- Bulk Actions -->
	<div class="flex items-center gap-2 flex-wrap">
		<Button 
			variant="neutral" 
			size="sm" 
			onclick={onBulkCategorize}
			class="flex-1 min-w-0"
		>
			<Tag class="size-3" />
			<span class="ml-1 hidden sm:inline">Categorize</span>
		</Button>
		
		<Button 
			variant="neutral" 
			size="sm" 
			onclick={onBulkExport}
			class="flex-1 min-w-0"
		>
			<Download class="size-3" />
			<span class="ml-1 hidden sm:inline">Export</span>
		</Button>
		
		<Button 
			variant="neutral" 
			size="sm" 
			onclick={onBulkMerge}
			class="flex-1 min-w-0"
		>
			<Merge class="size-3" />
			<span class="ml-1 hidden sm:inline">Merge</span>
		</Button>
		
		<Button 
			variant="danger" 
			size="sm" 
			onclick={onBulkDelete}
			class="flex-1 min-w-0"
		>
			<Trash2 class="size-3" />
			<span class="ml-1 hidden sm:inline">Delete</span>
		</Button>
	</div>
</div> 