<script lang="ts">
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Button, type ButtonProps } from '$lib/components/ui/button/index.js';
	import { goto } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import NotificationButton from './NotificationButton.svelte';

	interface ButtonConfig {
		text?: string;
		onclick?: () => void;
		href?: string;
		variant?: ButtonProps['variant'];
		size?: ButtonProps['size'];
		disabled?: boolean;
		icon?: any; // Lucide icon component
		className?: string;
		target?: string;
		rel?: string;
	}

	interface Props {
		title?: string;
		description?: string;
		buttonProps?: ButtonConfig[];
		/** Optional slot for custom right-side content (e.g. Popover); when set, renders instead of buttonProps in the actions area */
		rightSlot?: any;
		children?: any;
		variant?: 'default' | 'with-tabs';
		/** With `with-tabs`: only render the tab row on mobile (desktop uses sidebar). Avoids empty gap when TabHeader self-hides. */
		tabRowMobileOnly?: boolean;
		showBackButton?: boolean;
		backButtonLink?: string;
		backButtonLabel?: string;
	}

	let {
		title = '',
		description = '',
		buttonProps = [],
		rightSlot = null,
		children = null,
		variant = 'default',
		tabRowMobileOnly = false,
		showBackButton = false,
		backButtonLink = '',
		backButtonLabel = 'Back'
	}: Props = $props();

	// Use sidebar context to access isMobile state
	const sidebar = Sidebar.useSidebar();

	const showTabRow = $derived(!tabRowMobileOnly || sidebar.isMobile);

	function handleBackClick() {
		if (backButtonLink) {
			goto(backButtonLink);
		} else {
			// Use browser back navigation
			history.back();
		}
	}
</script>

<div
	class="sticky top-0 right-0 left-0 z-10 flex shrink-0 flex-col rounded-t-2xl bg-[var(--color-bg-primary)]/95 backdrop-blur-sm transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) {variant ===
		'with-tabs' && showTabRow
		? 'pt-3 pb-0'
		: 'py-3'}"
>
	<div class="flex w-full items-center gap-2 px-4">
		{#if showBackButton}
			<Button
				variant="ghost"
				onclick={handleBackClick}
				class="text-muted-foreground hover:text-foreground size-8 shrink-0"
			>
				<ArrowLeft size={16} />
			</Button>
			<Separator orientation="vertical" class="mx-0.5 shrink-0 data-[orientation=vertical]:h-4" />
		{/if}

		<div class="min-w-0 flex-1">
			<h1 class="truncate text-base leading-tight font-semibold tracking-tight">
				{title}
			</h1>
			{#if description}
				<p class="text-muted-foreground mt-0.5 truncate text-xs">{description}</p>
			{/if}
		</div>

		<div class="flex shrink-0 items-center gap-1.5">
			{#if sidebar.isMobile}
				<NotificationButton />
			{/if}

			{#if rightSlot}
				{@render rightSlot()}
			{:else if buttonProps.length > 0}
				{#each buttonProps as buttonConfig}
					<Button
						onclick={buttonConfig.onclick}
						href={buttonConfig.href}
						variant={buttonConfig.variant ?? 'ghost'}
						size={buttonConfig.size ?? 'sm'}
						disabled={buttonConfig.disabled}
						class="{buttonConfig.className ?? ''} text-muted-foreground hover:text-foreground"
						target={buttonConfig.target}
						rel={buttonConfig.rel}
					>
						{#if buttonConfig.icon}
							{@const IconComponent = buttonConfig.icon}
							<IconComponent class="h-4 w-4" />
						{/if}
						{#if buttonConfig.text}
							<span>{buttonConfig.text}</span>
						{/if}
					</Button>
				{/each}
			{/if}
		</div>
	</div>

	{#if children && showTabRow}
		<div class="mt-1 min-w-0 px-4">
			{@render children?.()}
		</div>
	{/if}
</div>
