<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import Navigation from '$lib/components/Navigation.svelte';
	import MobileNavigation from './MobileNavigation.svelte';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';

	interface Props {
		children: any;
	}

	const { children }: Props = $props();
	
	let isMobile = new IsMobile();
</script>

<Sidebar.Provider>
	<!-- Desktop Sidebar is handled in Navigation component -->
	<Navigation />
	
	<!-- Main content area with inset effect -->
	<main 
		class="w-screen bg-(--color-bg-primary) rounded-2xl 
			shadow-md overflow-hidden flex flex-col
			m-1 md:m-2 
			{isMobile.current 
				? 'h-[calc(100svh-2*var(--spacing)-71px)] min-h-[calc(100svh-2*var(--spacing)-71px)] mb-0' 
				: 'h-[calc(100svh-2*2*var(--spacing))] min-h-[calc(100svh-2*2*var(--spacing))] mb-[calc(2*var(--spacing))]'}"
	>
		{@render children()}
	</main>

	<!-- Mobile Navigation (bottom bar) -->
	{#if isMobile.current}
		<MobileNavigation />
	{/if}
</Sidebar.Provider>
