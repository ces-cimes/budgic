<!-- src/lib/components/Fab.svelte -->
<script lang="ts">
	import { Button, type ButtonVariant, type ButtonSize } from '$lib/components/ui/button/index.js';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';

	type Position = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
	type FabSize = 'sm' | 'md' | 'lg';

	interface FabProps {
		variant?: ButtonVariant;
		size?: FabSize;
		position?: Position;
		children?: any;
		class?: string;
		onclick?: (event: MouseEvent) => void;
		[key: string]: any;
	}

	let {
		variant = 'default',
		size = 'md',
		position = 'bottom-right',
		children = $bindable(),
		class: className = '',
		onclick,
		...rest
	}: FabProps = $props();

	const isMobile = new IsMobile();

	// Desktop position classes (no mobile navigation, so closer to bottom)
	const desktopPositionMap: Record<Position, string> = {
		'top-left': 'top-4 left-4',
		'top-right': 'top-4 right-4',
		'bottom-left': 'bottom-4 left-4', // Closer to bottom on desktop (no mobile nav)
		'bottom-right': 'bottom-4 right-4', // Closer to bottom on desktop (no mobile nav)
		center: 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2'
	};

	// Mobile-specific position classes (accounting for mobile navigation bar)
	const mobilePositionMap: Record<Position, string> = {
		'top-left': 'top-3 left-3',
		'top-right': 'top-3 right-3',
		'bottom-left': 'bottom-20 left-3', // Positioned above mobile nav
		'bottom-right': 'bottom-20 right-3', // Positioned above mobile nav
		center: 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2'
	};

	// Size dimensions with proper typing
	const sizeMap: Record<FabSize, string> = {
		sm: 'w-10 h-10',
		md: 'w-14 h-14',
		lg: 'w-20 h-20'
	};

	// Map FabSize to ButtonSize
	const buttonSizeMap: Record<FabSize, ButtonSize> = {
		sm: 'sm' as ButtonSize,
		md: 'default' as ButtonSize,
		lg: 'lg' as ButtonSize
	};

	// Derived values
	const positionClasses = $derived(
		isMobile.current ? mobilePositionMap[position] : desktopPositionMap[position]
	);
	const sizeDimensions = $derived(sizeMap[size]);
	const buttonSize = $derived(buttonSizeMap[size]);
	const classes = $derived(
		[
			'!p-0 flex items-center justify-center',
			'shadow-lg hover:shadow-xl transition-all',
			'fixed',
			sizeDimensions,
			className
		].join(' ')
	);
</script>

<div class="fixed {positionClasses} {sizeDimensions} z-50">
	<Button {variant} size={buttonSize} class={classes} {onclick} {...rest}>
		{#if children}
			<span class="flex items-center justify-center">
				{@render children()}
			</span>
		{/if}
	</Button>
</div>
