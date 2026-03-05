<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import Navigation from '$lib/components/Navigation.svelte';
	import MobileNavigation from './MobileNavigation.svelte';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
	import { goto } from '$app/navigation';
	import { typePickerOpen, closeTypePicker } from '$lib/stores/type-picker-store.svelte';
	import * as Sheet from '$lib/components/ui/sheet/index.ts';
	import { TypePicker } from '$lib/components/transactions';
	import Fab from '$lib/components/Fab.svelte';
	import { Plus } from '@lucide/svelte';
	import type { Transaction } from '$lib/core/db';

	interface Props {
		children: any;
	}

	const { children }: Props = $props();

	let isMobile = new IsMobile();

	function handleTypeSelect(type: Transaction['type'], status: Transaction['status']) {
		closeTypePicker();
		goto(`/transactions/add?type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}`);
	}
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

	<!-- Global FAB: opens type picker first, then form (UX_SPEC §2.4) -->
	<Fab
		position="bottom-right"
		size="md"
		variant="default"
		onclick={() => typePickerOpen.set(true)}
	>
		{#snippet children()}
			<Plus />
		{/snippet}
	</Fab>

	<!-- Type picker sheet (mobile bottom sheet, thumb-optimised layout per UX_SPEC §2.4) -->
	<Sheet.Root
		open={$typePickerOpen}
		onOpenChange={(o) => {
			typePickerOpen.set(!!o);
		}}
	>
		<Sheet.Content side="bottom" class="max-h-[70vh] rounded-t-2xl pb-safe">
			<Sheet.Header>
				<Sheet.Title>Add transaction</Sheet.Title>
				<Sheet.Description>Choose type</Sheet.Description>
			</Sheet.Header>
			<TypePicker onSelect={handleTypeSelect} />
		</Sheet.Content>
	</Sheet.Root>

	<!-- Mobile Navigation (bottom bar) -->
	{#if isMobile.current}
		<MobileNavigation />
	{/if}
</Sidebar.Provider>
