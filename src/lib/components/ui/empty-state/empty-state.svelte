<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { Component, Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		icon?: Component;
		heading?: string;
		body: string;
		variant?: 'plain' | 'card';
		iconVariant?: 'plain' | 'circle';
		class?: string;
		iconClass?: string;
		bodyClass?: string;
		headingClass?: string;
		children?: Snippet;
	}

	let {
		icon: Icon,
		heading,
		body,
		variant = 'plain',
		iconVariant = 'plain',
		class: className,
		iconClass,
		bodyClass,
		headingClass,
		children,
		...restProps
	}: Props = $props();
</script>

<div
	class={cn(
		'flex flex-col items-center text-center',
		variant === 'card' && 'squircle-4xl squircle-border bg-card py-10',
		variant === 'plain' && 'py-12',
		className
	)}
	{...restProps}
>
	{#if Icon}
		{#if iconVariant === 'circle'}
			<div
				class="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full sm:mb-6 sm:h-20 sm:w-20"
			>
				<Icon class={cn('text-muted-foreground h-8 w-8 sm:h-10 sm:w-10', iconClass)} />
			</div>
		{:else}
			<Icon class={cn('mb-4 size-8 text-[var(--color-text-disabled)]', iconClass)} />
		{/if}
	{/if}
	{#if heading}
		<h3 class={cn('text-foreground mb-2 text-lg font-semibold sm:text-xl', headingClass)}>
			{heading}
		</h3>
	{/if}
	<p
		class={cn(
			'text-sm text-[var(--color-text-secondary)] select-none',
			variant === 'card' && 'text-muted-foreground',
			bodyClass
		)}
	>
		{body}
	</p>
	{#if children}
		<div class="mt-3">
			{@render children()}
		</div>
	{/if}
</div>
