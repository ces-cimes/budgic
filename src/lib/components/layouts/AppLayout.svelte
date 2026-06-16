<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import Navigation from '$lib/components/Navigation.svelte';
	import MobileNavigation from './MobileNavigation.svelte';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
	import { goto } from '$app/navigation';
	import { typePicker, closeTypePicker } from '$lib/stores/type-picker-store.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Popover from '$lib/components/ui/popover/index.ts';
	import { TypePicker } from '$lib/components/transactions';
	import Fab from '$lib/components/Fab.svelte';
	import { Plus } from '@lucide/svelte';
	import { bulkSelection } from '$lib/stores/bulk-selection-store.svelte';
	import type { Transaction } from '$lib/core/db';

	interface Props {
		children: any;
	}

	const { children }: Props = $props();

	let isMobile = new IsMobile();
	let fabPopoverOpen = $state(false);

	function handleTypeSelect(type: Transaction['type'], status: Transaction['status']) {
		closeTypePicker();
		fabPopoverOpen = false;
		goto(
			`/transactions/add?type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}`
		);
	}
</script>

<Sidebar.Provider>
	<!-- Desktop Sidebar is handled in Navigation component -->
	<Navigation />

	<!-- Main content area with inset effect -->
	<main
		class="m-1 flex w-screen
			flex-col overflow-hidden rounded-2xl bg-(--color-bg-primary)
			shadow-md md:m-2
			{isMobile.current
			? 'mb-0 h-[calc(100svh-2*var(--spacing)-71px)] min-h-[calc(100svh-2*var(--spacing)-71px)]'
			: 'mb-[calc(2*var(--spacing))] h-[calc(100svh-2*2*var(--spacing))] min-h-[calc(100svh-2*2*var(--spacing))]'}"
	>
		{@render children()}
	</main>

	<!-- Type picker Dialog: used on mobile for FAB, and when openTypePicker() is called (e.g. list empty state, Home CTA) -->
	<Dialog.Root
		open={typePicker.open}
		onOpenChange={(o) => {
			typePicker.open = !!o;
		}}
	>
		<Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-sm" showCloseButton={true}>
			<Dialog.Header>
				<Dialog.Title>Add transaction</Dialog.Title>
				<Dialog.Description>Choose type</Dialog.Description>
			</Dialog.Header>
			<TypePicker onSelect={handleTypeSelect} />
		</Dialog.Content>
	</Dialog.Root>

	<!-- Global FAB: mobile = opens Dialog; desktop = Popover anchored to FAB -->
	{#if !bulkSelection.active}
		{#if isMobile.current}
			<Fab
				position="bottom-right"
				size="md"
				variant="default"
				onclick={() => (typePicker.open = true)}
			>
				{#snippet children()}
					<Plus />
				{/snippet}
			</Fab>
		{:else}
			<!-- Desktop: Popover anchored to FAB -->
			<Popover.Root bind:open={fabPopoverOpen}>
				<Popover.Trigger
					class="border-border bg-primary text-primary-foreground fixed right-4 bottom-4 z-50 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border shadow-lg transition-all hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)]"
					aria-label="Add transaction"
				>
					<Plus class="h-5 w-5" />
				</Popover.Trigger>
				<Popover.Content
					class="w-[min(calc(100vw-2rem),20rem)] p-0"
					align="end"
					side="top"
					sideOffset={8}
				>
					<div class="p-2">
						<p class="text-muted-foreground px-2 pb-2 text-xs font-medium">
							Choose type
						</p>
						<TypePicker onSelect={handleTypeSelect} />
					</div>
				</Popover.Content>
			</Popover.Root>
		{/if}
	{/if}

	<!-- Mobile Navigation (bottom bar) -->
	{#if isMobile.current}
		<MobileNavigation />
	{/if}
</Sidebar.Provider>
