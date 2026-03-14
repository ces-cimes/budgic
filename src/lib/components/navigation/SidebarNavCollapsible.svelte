<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import * as Popover from '$lib/components/ui/popover/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import type { NavItemConfig, NavTabDef } from '$lib/stores/navigation-store.svelte';
	import type { Component } from 'svelte';
	import { ChevronDown } from '@lucide/svelte';
	import { useSidebar } from '$lib/components/ui/sidebar/context.svelte.js';

	interface Props {
		item: NavItemConfig;
		iconComponent: Component;
		tabs: NavTabDef[];
		defaultTabHref: string;
		isParentActive: boolean;
		expanded: boolean;
		onToggle: () => void;
		isTabActive: (path: string, tabId: string) => boolean;
		showBadge?: boolean;
		badgeValue?: number | string | boolean;
		badgeColorClass?: string;
	}

	let {
		item,
		iconComponent: IconComponent,
		tabs,
		defaultTabHref,
		isParentActive,
		expanded,
		onToggle,
		isTabActive,
		showBadge = false,
		badgeValue,
		badgeColorClass = ''
	}: Props = $props();

	const sidebar = useSidebar();
	const isCollapsed = $derived(sidebar.state === 'collapsed' && !sidebar.isMobile);

	let flyoutOpen = $state(false);
	let openTimeout: ReturnType<typeof setTimeout> | null = null;
	let closeTimeout: ReturnType<typeof setTimeout> | null = null;

	function openFlyout() {
		if (closeTimeout) {
			clearTimeout(closeTimeout);
			closeTimeout = null;
		}
		if (flyoutOpen) return;
		if (openTimeout) clearTimeout(openTimeout);
		openTimeout = setTimeout(() => {
			flyoutOpen = true;
			openTimeout = null;
		}, 150);
	}
	function closeFlyout() {
		if (openTimeout) {
			clearTimeout(openTimeout);
			openTimeout = null;
		}
		closeTimeout = setTimeout(() => {
			flyoutOpen = false;
			closeTimeout = null;
		}, 120);
	}
</script>

<Sidebar.MenuItem>
	<!-- Link (opens first tab) + separate chevron (toggles expand). In icon mode wrapper shrinks so it looks like a single icon. -->
	<div
		role="group"
		aria-label={item.label}
		class="flex items-center w-full min-w-0 gap-0 group-data-[collapsible=icon]:w-fit group-data-[collapsible=icon]:min-w-0 relative"
		onmouseenter={isCollapsed ? openFlyout : undefined}
		onmouseleave={isCollapsed ? closeFlyout : undefined}
	>
		{#if isCollapsed}
			<Popover.Root bind:open={flyoutOpen}>
				<Popover.Trigger
					class="flex size-8 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)]"
				>
					<Sidebar.MenuButton
						isActive={isParentActive}
						tooltipContent={item.label}
						tooltipContentProps={{ class: 'rounded-lg' }}
						class="flex-1 min-w-0 rounded-none rounded-l-lg group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:min-w-0 group-data-[collapsible=icon]:!rounded-lg size-full justify-center"
					>
						{#snippet child({ props })}
							<a
								href={defaultTabHref}
								class="group/link flex items-center justify-center size-full rounded-lg transition-all duration-150
									{isParentActive
										? 'bg-[var(--color-amber-subtle)] text-[var(--color-amber)] font-semibold'
										: 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]'}"
								{...props}
							>
								<IconComponent class="w-4 h-4" />
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Popover.Trigger>
				<Popover.Content class="w-48 p-1 rounded-lg shadow-lg border border-border bg-sidebar" side="right" align="start" sideOffset={4}>
					<div role="navigation" aria-label="{item.label} submenu" class="py-0.5" onmouseenter={openFlyout} onmouseleave={closeFlyout}>
						{#each tabs as tab (tab.id)}
							<a
								href={item.path + '?tab=' + tab.id}
								class="flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors
									{isTabActive(item.path, tab.id)
									? 'bg-[var(--color-amber-subtle)] text-[var(--color-amber)] font-medium'
									: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]'}"
							>
								{tab.label}
							</a>
						{/each}
					</div>
				</Popover.Content>
			</Popover.Root>
		{:else}
			<Sidebar.MenuButton
				isActive={isParentActive}
				tooltipContent={item.label}
				tooltipContentProps={{ class: 'rounded-lg' }}
				class="flex-1 min-w-0 rounded-none rounded-l-lg group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:min-w-0 group-data-[collapsible=icon]:!rounded-lg"
			>
				{#snippet child({ props })}
					<a
						href={defaultTabHref}
						class="group/link flex items-center gap-3 px-3 py-2.5 rounded-l-lg transition-all duration-150 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:min-w-0
							{isParentActive
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
		{/if}
		<button
			type="button"
			class="shrink-0 p-2 rounded-r-lg border-l text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]/50 hover:text-[var(--color-text-primary)] group-data-[collapsible=icon]:hidden"
			onclick={onToggle}
			aria-expanded={expanded}
			aria-label={expanded ? 'Collapse' : 'Expand'}
		>
			<ChevronDown class="w-4 h-4 transition-transform {expanded ? 'rotate-0' : '-rotate-90'}" />
		</button>
	</div>
	{#if expanded}
		<!-- Sub list: extend to right edge so active tab highlight aligns with parent row -->
		<Sidebar.MenuSub class="!mr-0 !pr-0">
			{#each tabs as tab (tab.id)}
				<Sidebar.MenuSubItem>
					<Sidebar.MenuSubButton
						href={item.path + '?tab=' + tab.id}
						isActive={isTabActive(item.path, tab.id)}
						class="w-full"
					>
						{tab.label}
					</Sidebar.MenuSubButton>
				</Sidebar.MenuSubItem>
			{/each}
		</Sidebar.MenuSub>
	{/if}
</Sidebar.MenuItem>
