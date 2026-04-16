<script lang="ts">
	/**
	 * Responsive container: Sheet (md+) for desktop, Drawer on small screens.
	 * Use for secondary panels (history, details) instead of duplicating Sheet/Drawer calls.
	 */
	import { onMount } from 'svelte';
	import * as Sheet from '$lib/components/ui/sheet/index.ts';
	import * as Drawer from '$lib/components/ui/drawer/index.ts';

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		title: string;
		description?: string;
		children: import('svelte').Snippet;
	}

	let { open, onOpenChange, title, description = '', children }: Props = $props();

	let isDesktop = $state(true);

	onMount(() => {
		const mq = window.matchMedia('(min-width: 768px)');
		isDesktop = mq.matches;
		const fn = () => {
			isDesktop = mq.matches;
		};
		mq.addEventListener('change', fn);
		return () => mq.removeEventListener('change', fn);
	});
</script>

{#if isDesktop}
	<Sheet.Root {open} {onOpenChange}>
		<Sheet.Content side="right" class="flex w-full max-w-lg flex-col sm:max-w-xl">
			<Sheet.Header>
				<Sheet.Title>{title}</Sheet.Title>
				{#if description}
					<Sheet.Description>{description}</Sheet.Description>
				{/if}
			</Sheet.Header>
			<div class="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6">
				{@render children()}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Drawer.Root {open} {onOpenChange}>
		<Drawer.Content class="max-h-[88vh]">
			<Drawer.Header class="text-left">
				<Drawer.Title>{title}</Drawer.Title>
				{#if description}
					<Drawer.Description>{description}</Drawer.Description>
				{/if}
			</Drawer.Header>
			<div class="max-h-[calc(88vh-5rem)] overflow-y-auto px-4 pb-8">
				{@render children()}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
