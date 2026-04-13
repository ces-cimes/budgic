<script lang="ts">
	import type { ActionButtonProps } from '../types.js';
	import { Button } from '$lib/components/ui/button/index.ts';

	interface Props extends ActionButtonProps {
		children?: any;
	}

	const {
		icon: Icon,
		label,
		subtitle,
		onClick,
		variant = 'outline',
		className = '',
		children
	}: Props = $props();
</script>

<Button {variant} class="flex h-auto flex-col items-center gap-2 p-4 {className}" onclick={onClick}>
	<Icon class="h-5 w-5" />
	<span class="text-sm font-medium">{label}</span>
	{#if subtitle}
		<span class="text-muted-foreground text-xs">{subtitle}</span>
	{/if}

	{#if children}
		{@render children()}
	{/if}
</Button>
