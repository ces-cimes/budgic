<script lang="ts">
	import { Edit, Trash2, Copy, Split } from '@lucide/svelte';
	import { createEventDispatcher } from 'svelte';

	let { class: className = '' } = $props();

	const dispatch = createEventDispatcher();

	function handleAction(action: string) {
		dispatch('action', { action });
	}
</script>

<div class="flex items-center gap-1 {className}">
	<button
		class="bg-info text-text-primary hover:bg-info/90 flex h-12 w-12 items-center justify-center rounded-l-lg transition-colors"
		onclick={() => handleAction('edit')}
		title="Edit"
	>
		<Edit class="size-4" />
	</button>

	<button
		class="bg-golden-amber text-warm-charcoal hover:bg-golden-amber/90 flex h-12 w-12 items-center justify-center transition-colors"
		onclick={() => handleAction('duplicate')}
		title="Duplicate"
	>
		<Copy class="size-4" />
	</button>

	<button
		class="bg-sage-green text-text-primary hover:bg-sage-green/90 flex h-12 w-12 items-center justify-center transition-colors"
		onclick={() => handleAction('split')}
		title="Split"
	>
		<Split class="size-4" />
	</button>

	<button
		class="bg-warm-coral text-text-primary hover:bg-warm-coral/90 flex h-12 w-12 items-center justify-center rounded-r-lg transition-colors"
		onclick={() => handleAction('delete')}
		title="Delete"
	>
		<Trash2 class="size-4" />
	</button>
</div>
