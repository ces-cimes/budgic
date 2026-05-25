<script lang="ts">
	import { page } from '$app/stores';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import { SidebarNavLink, SidebarNavCollapsible } from '$lib/components/navigation';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import AlertBadge from '$lib/components/AlertBadge.svelte';
	import { SidebarFooterCards } from '$lib/components/navigation/sidebar-footer';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';
	import { defaultTabByRoute } from '$lib/config/nav-tabs';
	import { onMount } from 'svelte';
	import type { NavItemConfig } from '$lib/stores/navigation-store.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';

	// Lucide icons – single source for sidebar nav
	import {
		Home,
		Receipt,
		Target,
		Wallet,
		TrendingUp,
		Bell,
		Sparkles,
		Settings,
		CreditCard,
		Database,
		Plus,
		Calculator
	} from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import * as Popover from '$lib/components/ui/popover/index.ts';
	import { TypePicker } from '$lib/components/transactions';
	import type { Transaction } from '$lib/core/db';

	const iconMap: Record<string, typeof Home> = {
		home: Home,
		receipt: Receipt,
		target: Target,
		wallet: Wallet,
		'trending-up': TrendingUp,
		bell: Bell,
		sparkles: Sparkles,
		settings: Settings,
		'credit-card': CreditCard,
		database: Database,
		plan: Wallet,
		reports: TrendingUp,
		calculator: Calculator
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

	let slotBPopoverOpen = $state(false);

	function toggleExpanded(path: string) {
		expandedByPath = { ...expandedByPath, [path]: !expandedByPath[path] };
	}

	function handleSlotBTypeSelect(type: Transaction['type'], status: Transaction['status']) {
		slotBPopoverOpen = false;
		goto(`/transactions/add?type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}`);
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
			case 'success':
				return 'bg-[var(--color-sage-green)] text-white';
			case 'warning':
				return 'bg-[var(--color-golden-amber)] text-[var(--color-warm-charcoal)]';
			case 'danger':
				return 'bg-[var(--color-warm-coral)] text-white';
			case 'info':
				return 'bg-[var(--color-info)] text-white';
			case 'primary':
			default:
				return 'bg-primary text-primary-foreground';
		}
	}

	const sidebar = Sidebar.useSidebar();
	let desktopItems = $derived(navigationStore.desktopItems);
	let badges = $derived(navigationStore.badges);
	let alertsBadgeVariant = $derived(navigationStore.alertsBadgeVariant);
	let loading = $derived(navigationStore.loading);

	let mainItems = $derived(desktopItems.filter((i) => i.group === 'main'));
	let moreItems = $derived(desktopItems.filter((i) => i.group === 'more'));
	let bottomItems = $derived(desktopItems.filter((i) => i.group === 'bottom'));

	onMount(() => {
		if (!navigationStore.initialized) {
			navigationStore.initialize();
		}
		const onAlertsUpdated = () => navigationStore.updateBadges();
		window.addEventListener('alerts-updated', onAlertsUpdated);
		return () => window.removeEventListener('alerts-updated', onAlertsUpdated);
	});
</script>

{#if !sidebar.isMobile}
	<Sidebar.Root variant="inset" collapsible="icon">
		<Sidebar.Content>
			<Sidebar.Header>
				<div
					class="flex w-full min-w-0 items-center gap-2 px-2 py-3 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:py-2"
				>
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-sage-green)] to-[var(--color-golden-amber)] group-data-[collapsible=icon]:h-6 group-data-[collapsible=icon]:w-6"
					>
						<Target
							class="h-5 w-5 text-white group-data-[collapsible=icon]:h-4 group-data-[collapsible=icon]:w-4"
						/>
					</div>
					<span
						class="truncate text-lg font-semibold text-[var(--color-text-primary)] group-data-[collapsible=icon]:hidden"
						>Budgic</span
					>
					<Sidebar.Trigger class="ml-auto size-8 shrink-0 group-data-[collapsible=icon]:ml-0" />
				</div>
			</Sidebar.Header>

			<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
				<!-- Main: Home, Transactions, Plan (+ tabs), Insights (+ tabs) -->
				<Sidebar.Group>
					<Sidebar.GroupLabel class="group-data-[collapsible=icon]:hidden">Main</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#if loading}
								{#each Array(4) as _, i}
									<Sidebar.MenuItem>
										<Skeleton class="h-10 w-full rounded-md bg-[var(--color-bg-tertiary)]" />
									</Sidebar.MenuItem>
								{/each}
							{:else}
								{#each mainItems as item (item.id)}
									{@const IconComponent = iconMap[item.icon || 'home'] || Home}
									{@const badgeValue = item.badge?.countKey
										? badges.get(item.badge.countKey)
										: undefined}
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
											{isTabActive}
											{showBadge}
											{badgeValue}
											badgeColorClass={getBadgeColorClass(item.badge?.color)}
										/>
									{:else}
										<SidebarNavLink
											{item}
											iconComponent={IconComponent}
											isActive={isActive(item.path)}
											{showBadge}
											{badgeValue}
											badgeColorClass={getBadgeColorClass(item.badge?.color)}
										/>
									{/if}
								{/each}
							{/if}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>

				{#if moreItems.length > 0}
					<Sidebar.Group>
						<Sidebar.GroupLabel class="group-data-[collapsible=icon]:hidden"
							>More</Sidebar.GroupLabel
						>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each moreItems as item (item.id)}
									{@const IconComponent = iconMap[item.icon || 'home'] || Home}
									{@const badgeValue = item.badge?.countKey
										? badges.get(item.badge.countKey)
										: undefined}
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
											{isTabActive}
											{showBadge}
											{badgeValue}
											badgeColorClass={getBadgeColorClass(item.badge?.color)}
										/>
									{:else}
										<SidebarNavLink
											{item}
											iconComponent={IconComponent}
											isActive={isActive(item.path)}
											{showBadge}
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

			<!-- Footer: Slot A (widgets), Slot B (quick-add), then Alerts + Settings -->
			<div class="mt-auto flex shrink-0 flex-col gap-2 pt-2">
				<SidebarFooterCards />
				<!-- Slot B: quick-add → Popover type picker (desktop; sidebar is desktop-only) -->
				<Sidebar.Group>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							<Sidebar.MenuItem>
								<Popover.Root bind:open={slotBPopoverOpen}>
									<Popover.Trigger
										class="group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left
											text-[var(--color-text-secondary)] transition-all duration-150
											outline-none group-data-[collapsible=icon]:justify-center hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-amber)]"
										aria-label="Add transaction"
									>
										<Plus class="h-4 w-4 shrink-0" />
										<span class="truncate text-sm group-data-[collapsible=icon]:hidden"
											>Add transaction</span
										>
									</Popover.Trigger>
									<Popover.Content
										class="w-[min(calc(100vw-2rem),20rem)] p-0"
										align="start"
										side="right"
										sideOffset={8}
									>
										<div class="p-2">
											<p class="text-muted-foreground px-2 pb-2 text-xs font-medium">Choose type</p>
											<TypePicker onSelect={handleSlotBTypeSelect} />
										</div>
									</Popover.Content>
								</Popover.Root>
							</Sidebar.MenuItem>
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>
				{#if bottomItems.length > 0}
					<Sidebar.Group>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each bottomItems as item (item.id)}
									{@const IconComponent = iconMap[item.icon || 'home'] || Home}
									{@const badgeValue = item.badge?.countKey
										? badges.get(item.badge.countKey)
										: undefined}
									{@const showBadge = item.badge && badgeValue !== undefined && badgeValue !== 0}
									{#if item.opensPanel}
										<Sidebar.MenuItem>
											<Sidebar.MenuButton
												variant="outline"
												isActive={false}
												tooltipContent={item.label}
												tooltipContentProps={{ class: 'rounded-lg' }}
												onclick={() => window.dispatchEvent(new CustomEvent('open-alerts-panel'))}
											>
												{#snippet child({ props })}
													<button
														type="button"
														class="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[var(--color-text-secondary)] transition-all duration-150
															group-data-[collapsible=icon]:justify-center hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
														{...props}
													>
														<div class="relative flex-shrink-0">
															<IconComponent class="h-4 w-4" />
														</div>
														<span
															class="flex-1 truncate text-left text-sm group-data-[collapsible=icon]:hidden"
															>{item.label}</span
														>
														<div class="ml-auto shrink-0 overflow-visible">
															<AlertBadge
																count={typeof badgeValue === 'number' ? badgeValue : 0}
																variant={alertsBadgeVariant === 'warning'
																	? 'warning'
																	: 'destructive'}
															/>
														</div>
													</button>
												{/snippet}
											</Sidebar.MenuButton>
										</Sidebar.MenuItem>
									{:else}
										<SidebarNavLink
											{item}
											iconComponent={IconComponent}
											isActive={isActive(item.path)}
											variant="outline"
											{showBadge}
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
		</Sidebar.Content>
	</Sidebar.Root>
{/if}
