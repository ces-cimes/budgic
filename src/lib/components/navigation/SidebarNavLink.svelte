<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import type { NavItemConfig } from '$lib/stores/navigation-store.svelte';
	import type { Component } from 'svelte';

	interface Props {
		item: NavItemConfig;
		/** The Lucide icon component to render (e.g. Home, Settings). */
		iconComponent: Component;
		isActive: boolean;
		/** Use 'outline' for Settings/organizational links. */
		variant?: 'default' | 'outline';
		showBadge?: boolean;
		badgeValue?: number | string | boolean;
		badgeColorClass?: string;
	}

	let {
		item,
		iconComponent: IconComponent,
		isActive,
		variant = 'default',
		showBadge = false,
		badgeValue,
		badgeColorClass = ''
	}: Props = $props();
</script>

<Sidebar.MenuItem>
	<Sidebar.MenuButton
		{variant}
		{isActive}
		tooltipContent={item.label}
		tooltipContentProps={{ class: 'rounded-lg' }}
	>
		{#snippet child({ props })}
			<a
				href={item.path}
				class="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:min-w-0 group-data-[collapsible=icon]:justify-center
					{isActive
					? 'bg-[var(--color-amber-subtle)] font-semibold text-[var(--color-amber)]'
					: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]'}"
				{...props}
			>
				<div class="relative flex flex-shrink-0 items-center justify-center">
					<IconComponent class="h-4 w-4" />
				</div>
				<span class="flex-1 truncate text-sm group-data-[collapsible=icon]:hidden"
					>{item.label}</span
				>
				{#if showBadge && badgeValue !== undefined && badgeValue !== 0}
					<Badge
						variant="secondary"
						class="ml-auto h-5 min-w-5 px-1.5 text-xs font-medium group-data-[collapsible=icon]:hidden {badgeColorClass}"
					>
						{badgeValue}
					</Badge>
				{/if}
			</a>
		{/snippet}
	</Sidebar.MenuButton>
</Sidebar.MenuItem>
