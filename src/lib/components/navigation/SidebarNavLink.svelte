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

	let { item, iconComponent: IconComponent, isActive, variant = 'default', showBadge = false, badgeValue, badgeColorClass = '' }: Props = $props();
</script>

<Sidebar.MenuItem>
	<Sidebar.MenuButton variant={variant} isActive={isActive} tooltipContent={item.label} tooltipContentProps={{ class: 'rounded-lg' }}>
		{#snippet child({ props })}
			<a
				href={item.path}
				class="group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group-data-[collapsible=icon]:justify-center
					{isActive
						? 'bg-[var(--color-amber-subtle)] text-[var(--color-amber)] font-semibold'
						: 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]'}"
				{...props}
			>
				<div class="relative flex-shrink-0">
					<IconComponent class="w-4 h-4" />
				</div>
				<span class="flex-1 text-sm truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
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
