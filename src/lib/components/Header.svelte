<script lang="ts">
	import { Separator } from "$lib/components/ui/separator/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { goto } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	interface Props {
		title?: string;
		children?: any;
		showBackButton?: boolean;
		backButtonLink?: string;
		backButtonLabel?: string;
	}

	let {
		title = '',
		children = null,
		showBackButton = false,
		backButtonLink = '',
		backButtonLabel = 'Back'
	}: Props = $props();

	// Use sidebar context to access isMobile state
	const sidebar = Sidebar.useSidebar();

	function handleBackClick() {
		if (backButtonLink) {
			goto(backButtonLink);
		} else {
			// Use browser back navigation
			history.back();
		}
	}
</script>
  
<header
class="h-(--header-height) group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) flex shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear sticky top-0 left-0 right-0 z-10 rounded-t-2xl bg-background"
>
	<div class="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 my-2">
		{#if !sidebar.isMobile}
			<Sidebar.Trigger class="-ml-1 size-8" />
		{/if}
		
		{#if showBackButton}
			<Button 
				variant="ghost"
				onclick={handleBackClick}
				class="size-8"
			>
				<ArrowLeft size={16} />
			</Button>
		{/if}

		{#if !sidebar.isMobile || showBackButton}
			<Separator orientation="vertical" class="mx-1 data-[orientation=vertical]:h-4" />
		{/if}
		
		<h1 class="ml-2 text-lg font-bold">{title}</h1>
		<div class="ml-auto flex items-center gap-2">
			{@render children?.()}
		</div>
	</div>
</header>