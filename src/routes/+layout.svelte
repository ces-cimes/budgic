<script lang="ts">
	import { onMount } from 'svelte';
	import NavigationBar from '$lib/components/layout/NavigationBar.svelte';
	import Dialog from '$lib/components/primitives/Dialog.svelte';
	import '../app.css';
	//import { dataService } from '$lib/core/data-service';

	let { children } = $props();
	let navBarHeight = $state(0);

	onMount(() => {
		// Find the actual nav element that's fixed positioned
		const navElement = document.querySelector('nav.fixed.bottom-0') as HTMLElement;
		
		if (navElement) {
			// Set initial height
			navBarHeight = navElement.offsetHeight;
			
			// Set up ResizeObserver to watch for size changes
			const resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					navBarHeight = entry.contentRect.height;
				}
			});
			
			resizeObserver.observe(navElement);
			
			// Fallback: measure again after a short delay
			setTimeout(() => {
				navBarHeight = navElement.offsetHeight;
			}, 100);
		}
	});
</script>

<div class="w-full min-h-screen flex flex-col" style="margin-bottom: calc(var(--spacing) * 2 + {navBarHeight}px);">
	{@render children()}
</div>

<Dialog />

<NavigationBar />