<script lang="ts">
	/**
	 * Desktop: sheet from the right. Mobile: bottom drawer (like AlertsPanel).
	 * Does not take full height; content has horizontal padding.
	 */
	import { onMount } from 'svelte';
	import * as Drawer from '$lib/components/ui/drawer';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
		title: string;
		description?: string;
		children: Snippet;
		/** Extra class for the content container (e.g. max width). */
		contentClass?: string;
	}

	const { open, onClose, title, description = '', children, contentClass = '' }: Props = $props();

	let isMobile = $state(true);
	onMount(() => {
		const mq = window.matchMedia('(max-width: 640px)');
		isMobile = mq.matches;
		const handler = () => {
			isMobile = mq.matches;
		};
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	let drawerOpen = $state(false);
	$effect(() => {
		drawerOpen = open;
	});
	$effect(() => {
		if (!drawerOpen && open) onClose();
	});
</script>

<Drawer.Root bind:open={drawerOpen} direction={isMobile ? 'bottom' : 'right'}>
	<Drawer.Content
		class="bg-background flex flex-col {isMobile
			? 'max-h-[70vh] rounded-t-xl border-t'
			: 'w-full max-w-md border-l rounded-l-xl'} {contentClass}"
	>
		<Drawer.Header class="flex flex-row items-start justify-between gap-2 shrink-0">
			<div class="min-w-0">
				<Drawer.Title class="text-base font-semibold truncate">{title}</Drawer.Title>
				{#if description}
					<Drawer.Description class="text-xs text-muted-foreground mt-0.5">
						{description}
					</Drawer.Description>
				{/if}
			</div>
			<Drawer.Close
				class="rounded-md p-1.5 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring shrink-0"
				aria-label="Close"
			/>
		</Drawer.Header>
		<div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-6">
			{@render children?.()}
		</div>
	</Drawer.Content>
</Drawer.Root>
