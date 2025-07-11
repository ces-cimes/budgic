<!-- src/lib/components/ui/Dialog.svelte -->
<script lang="ts">
	import { X } from "@lucide/svelte";
	import Button from "./Button.svelte";
	import { getState, closeDialog } from "./Dialog.svelte.ts";
	
    let { isOpen, content, isTransitioning } = $derived(getState());
</script>

<div class="fixed inset-0 bg-black/50 z-[9998] transition-all duration-300 ease-in-out"
	class:opacity-0={!isOpen || isTransitioning}
	class:opacity-100={isOpen && !isTransitioning}
	class:pointer-events-none={!isOpen}
	class:pointer-events-auto={isOpen}
	onclick={closeDialog}
	aria-hidden="true">
</div>

<div class="fixed z-[9999] flex items-center justify-center inset-0 pointer-events-none transition-all duration-300 ease-in-out {isOpen ? 'visible' : 'invisible'}">
	<div class="relative m-4 pointer-events-auto transition-all duration-300 ease-in-out max-w-lg w-full border-2 border-primary rounded-lg overflow-hidden bg-bg-secondary shadow-xl transform"
		class:opacity-0={!isOpen || isTransitioning}
		class:opacity-100={isOpen && !isTransitioning}
		class:scale-95={!isOpen || isTransitioning}
		class:scale-100={isOpen && !isTransitioning}
		role="dialog"
		aria-modal="true">
		
		{#if content}
            {@const Component = content.component}
			<Component {...content.props} />
		{/if}
	</div>
</div>

<style>
	/* Add smooth transitions for all animated properties */
	.transition-all {
		transition-property: all;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
	}

	.transform {
		transform: translateY(0);
		will-change: transform, opacity;
	}
</style> 