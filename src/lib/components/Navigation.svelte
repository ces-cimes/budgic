<script lang="ts">
	import { page } from '$app/stores';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import { SidebarNavLink, SidebarNavCollapsible } from '$lib/components/navigation';
	import { SidebarFooterCards } from '$lib/components/navigation/sidebar-footer';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';
	import { defaultTabByRoute } from '$lib/config/nav-tabs';
	import { onMount } from 'svelte';
	import type { NavItemConfig } from '$lib/stores/navigation-store.svelte';

	// Lucide icons – single source for sidebar nav
	import { Home, Receipt, Target, Wallet, TrendingUp, Bell, Settings, CreditCard } from '@lucide/svelte';

	const iconMap: Record<string, typeof Home> = {
		'home': Home,
		'receipt': Receipt,
		'target': Target,
		'wallet': Wallet,
		'trending-up': TrendingUp,
		'bell': Bell,
		'settings': Settings,
		'credit-card': CreditCard,
		'plan': Wallet,
		'reports': TrendingUp
	};

	// Which section (path) is expanded for tab sub-menus. Chevron toggles; current route auto-expands.
	let expandedByPath = $state<Record<string, boolean>>({});

	$effect(() => {
		const p = $page.url.pathname;
		if (p === '/plan' || p === '/insights' || p === '/reports') {
			// On navigation: only the current section stays expanded; close all others
			expandedByPath = { [p]: true };
		} else {
			// Not on a collapsible route — close all collapsibles
			expandedByPath = {};
		}
	});

	function toggleExpanded(path: string) {
		expandedByPath = { ...expandedByPath, [path]: !expandedByPath[path] };
	}

	function isActive(path: string) {
		const currentPath = $page.url.pathname;
		if (currentPath === path) return true;
		if (currentPath.startsWith(path + '/')) return true;
		return false;
	}

	function isTabActive(path: string, tabId: string): boolean {
		if ($page.url.pathname !== path) return false;
		const param = $page.url.searchParams.get('tab');
		const defaultTab = defaultTabByRoute[path];
		return (param === null && tabId === defaultTab) || param === tabId;
	}

	function isParentActive(path: string): boolean {
		return $page.url.pathname === path;
	}

	function defaultTabHref(path: string): string {
		const defaultTab = defaultTabByRoute[path];
		return defaultTab ? `${path}?tab=${defaultTab}` : path;
	}

	function getBadgeColorClass(color?: string): string {
		switch (color) {
			case 'success': return 'bg-[var(--color-sage-green)] text-white';
			case 'warning': return 'bg-[var(--color-golden-amber)] text-[var(--color-warm-charcoal)]';
			case 'danger': return 'bg-[var(--color-warm-coral)] text-white';
			case 'info': return 'bg-blue-500 text-white';
			case 'primary':
			default: return 'bg-primary text-primary-foreground';
		}
	}

	const sidebar = Sidebar.useSidebar();
	let desktopItems = $derived(navigationStore.desktopItems);
	let badges = $derived(navigationStore.badges);
	let loading = $derived(navigationStore.loading);

	let mainItems = $derived(desktopItems.filter((i) => i.group === 'main'));
	let insightsItems = $derived(desktopItems.filter((i) => i.group === 'insights'));
	let bottomItems = $derived(desktopItems.filter((i) => i.group === 'bottom'));

	onMount(() => {
		if (!navigationStore.initialized) {
			navigationStore.initialize();
		}
	});
</script>

{#if !sidebar.isMobile}
	<Sidebar.Root variant="inset" collapsible="icon">
		<Sidebar.Content>
			<Sidebar.Header>
				<div class="flex items-center gap-2 px-2 py-3 w-full min-w-0 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:py-2">
					<div class="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-[var(--color-sage-green)] to-[var(--color-golden-amber)] group-data-[collapsible=icon]:w-6 group-data-[collapsible=icon]:h-6">
						<Target class="w-5 h-5 text-white group-data-[collapsible=icon]:w-4 group-data-[collapsible=icon]:h-4" />
					</div>
					<span class="text-lg font-semibold text-[var(--color-text-primary)] truncate group-data-[collapsible=icon]:hidden">Budgic</span>
					<Sidebar.Trigger class="ml-auto size-8 shrink-0 group-data-[collapsible=icon]:ml-0" />
				</div>
			</Sidebar.Header>

			<div class="flex-1 min-h-0 overflow-auto flex flex-col gap-2">
				<!-- Main: Home, Transactions, Plan (+ tabs), Accounts -->
				<Sidebar.Group>
					<Sidebar.GroupLabel class="group-data-[collapsible=icon]:hidden">Main</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#if loading}
								{#each Array(4) as _, i}
									<Sidebar.MenuItem>
										<div class="h-10 bg-[var(--color-bg-tertiary)] rounded-md animate-pulse"></div>
									</Sidebar.MenuItem>
								{/each}
							{:else}
								{#each mainItems as item (item.id)}
									{@const IconComponent = iconMap[item.icon || 'home'] || Home}
									{@const badgeValue = item.badge?.countKey ? badges.get(item.badge.countKey) : undefined}
									{@const showBadge = item.badge && badgeValue !== undefined && badgeValue !== 0}
									{#if item.tabs?.length}
										<SidebarNavCollapsible
											{item}
											iconComponent={IconComponent}
											tabs={item.tabs}
											defaultTabHref={defaultTabHref(item.path)}
											isParentActive={isParentActive(item.path)}
											expanded={!!expandedByPath[item.path]}
											onToggle={() => toggleExpanded(item.path)}
											isTabActive={isTabActive}
											showBadge={showBadge}
											{badgeValue}
											badgeColorClass={getBadgeColorClass(item.badge?.color)}
										/>
									{:else}
										<SidebarNavLink
											{item}
											iconComponent={IconComponent}
											isActive={isActive(item.path)}
											showBadge={showBadge}
											{badgeValue}
											badgeColorClass={getBadgeColorClass(item.badge?.color)}
										/>
									{/if}
								{/each}
							{/if}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>

				{#if insightsItems.length > 0}
					<Sidebar.Group>
						<Sidebar.GroupLabel class="group-data-[collapsible=icon]:hidden">Insights</Sidebar.GroupLabel>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each insightsItems as item (item.id)}
									{@const IconComponent = iconMap[item.icon || 'home'] || Home}
									{@const badgeValue = item.badge?.countKey ? badges.get(item.badge.countKey) : undefined}
									{@const showBadge = item.badge && badgeValue !== undefined && badgeValue !== 0}
									{#if item.tabs?.length}
										<SidebarNavCollapsible
											{item}
											iconComponent={IconComponent}
											tabs={item.tabs}
											defaultTabHref={defaultTabHref(item.path)}
											isParentActive={isParentActive(item.path)}
											expanded={!!expandedByPath[item.path]}
											onToggle={() => toggleExpanded(item.path)}
											isTabActive={isTabActive}
											showBadge={showBadge}
											{badgeValue}
											badgeColorClass={getBadgeColorClass(item.badge?.color)}
										/>
									{:else}
										<SidebarNavLink
											{item}
											iconComponent={IconComponent}
											isActive={isActive(item.path)}
											showBadge={showBadge}
											{badgeValue}
											badgeColorClass={getBadgeColorClass(item.badge?.color)}
										/>
									{/if}
								{/each}
							</Sidebar.Menu>
						</Sidebar.GroupContent>
					</Sidebar.Group>
				{/if}
			</div>

			<!-- Footer: info cards + bottom nav (Settings, etc.) -->
			<div class="mt-auto shrink-0 flex flex-col gap-2 pt-2">
				<SidebarFooterCards />
				{#if bottomItems.length > 0}
					<Sidebar.Separator class="group-data-[collapsible=icon]:hidden" />
					<Sidebar.Group>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each bottomItems as item (item.id)}
									{@const IconComponent = iconMap[item.icon || 'home'] || Home}
									<SidebarNavLink
										{item}
										iconComponent={IconComponent}
										isActive={isActive(item.path)}
										variant="outline"
									/>
								{/each}
							</Sidebar.Menu>
						</Sidebar.GroupContent>
					</Sidebar.Group>
				{/if}
			</div>
		</Sidebar.Content>
	</Sidebar.Root>
{/if}
