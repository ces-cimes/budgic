<script lang="ts">
	import { Separator } from "$lib/components/ui/separator/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { Button, type ButtonProps } from "$lib/components/ui/button/index.js";
	import { goto } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	interface ButtonConfig {
		text: string;
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
	class="group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) flex shrink-0 flex-col gap-2 lg:gap-2 border-b transition-[width,height] ease-linear sticky top-0 left-0 right-0 z-10 rounded-t-2xl bg-background {variant === 'with-tabs' ? 'pt-2 lg:pt-2' : 'py-2 lg:py-2'}"
>
	<div class="flex w-full items-center gap-2 px-4 lg:gap-2 lg:px-4">
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
		
		<div class="flex-1">
			<h1 class="text-lg font-bold">{title}</h1>
			{#if description}
				<p class="text-sm text-muted-foreground mt-1">{description}</p>
			{/if}
		</div>
		
		{#if buttonProps.length > 0}
			<div class="flex items-center gap-2">
				{#each buttonProps as buttonConfig}
					<Button
						onclick={buttonConfig.onclick}
						href={buttonConfig.href}
						variant={buttonConfig.variant}
						size={buttonConfig.size}
						disabled={buttonConfig.disabled}
						class={buttonConfig.className}
						target={buttonConfig.target}
						rel={buttonConfig.rel}
					>
						{#if buttonConfig.icon}
							{@const IconComponent = buttonConfig.icon}
							<IconComponent />
						{/if}
						<span>{buttonConfig.text}</span>
					</Button>
				{/each}
			</div>
		{/if}
	</div>
	
	{#if children}
		<div class={variant === 'with-tabs' ? '' : 'px-4 lg:px-6'}>
			{@render children?.()}
		</div>
	{/if}
</header>