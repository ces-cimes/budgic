<script lang="ts">
	import { Separator } from "$lib/components/ui/separator/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { Button, type ButtonProps } from "$lib/components/ui/button/index.js";
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
		children?: any;
		variant?: 'default' | 'with-tabs';
		showBackButton?: boolean;
		backButtonLink?: string;
		backButtonLabel?: string;
	}

	let {
		title = '',
		description = '',
		buttonProps = [],
		children = null,
		variant = 'default',
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
	class="group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) flex shrink-0 flex-col border-b border-border transition-[width,height] ease-linear sticky top-0 left-0 right-0 z-10 rounded-t-2xl bg-[var(--color-bg-secondary)]/95 backdrop-blur-sm {variant === 'with-tabs' ? 'pt-3 pb-0' : 'py-3'}"
>
	<div class="flex w-full items-center gap-2 px-4">
		{#if showBackButton}
			<Button
				variant="ghost"
				onclick={handleBackClick}
				class="size-8 shrink-0 text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft size={16} />
			</Button>
			<Separator orientation="vertical" class="mx-0.5 data-[orientation=vertical]:h-4 shrink-0" />
		{/if}

		<div class="flex-1 min-w-0">
			<h1 class="text-base font-semibold leading-tight tracking-tight truncate">
				{title}
			</h1>
			{#if description}
				<p class="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
			{/if}
		</div>

		<div class="flex items-center gap-1.5 shrink-0">
			{#if sidebar.isMobile}
				<NotificationButton />
			{/if}

			{#if buttonProps.length > 0}
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

	{#if children}
		<div class="{variant === 'with-tabs' ? 'mt-1' : 'mt-1 px-4'}">
			{@render children?.()}
		</div>
	{/if}
</header>