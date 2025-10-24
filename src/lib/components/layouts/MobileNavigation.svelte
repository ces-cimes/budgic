<script lang="ts">
	import { page } from '$app/stores';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import * as Drawer from '$lib/components/ui/drawer/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { onMount } from 'svelte';
	
	// Lucide icons
	import { HomeIcon, ReceiptIcon, TargetIcon, BarChart3Icon, CalendarIcon, BellIcon, SettingsIcon, CreditCardIcon, MoreHorizontalIcon, ChevronRightIcon } from '@lucide/svelte';

	// Icon mapping
	const iconMap: Record<string, any> = {
		'home': HomeIcon,
		'receipt': ReceiptIcon,
		'target': TargetIcon,
		'bar-chart-3': BarChart3Icon,
		'calendar': CalendarIcon,
		'bell': BellIcon,
		'settings': SettingsIcon,
		'credit-card': CreditCardIcon
	};

	let moreDrawerOpen = $state(false);
	let visibleItems = $state<any[]>([]);
	let overflowItems = $state<any[]>([]);
	let badges = $derived(navigationStore.badges);

	function isActive(path: string) {
		const currentPath = $page.url.pathname;
		
		// Exact match
		if (currentPath === path) return true;
		
		// Sub-route match
		if (currentPath.startsWith(path + '/')) return true;
		
		return false;
	}

	// Helper function to get badge color class
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

	// Load navigation items
	async function loadItems() {
		const items = await navigationStore.getMobileItemsWithOverflow(4); // 4 visible + 1 "More" button
		visibleItems = items.visible;
		overflowItems = items.overflow;
	}

	// Check if there are any active overflow items
	let hasActiveOverflowItem = $derived(
		overflowItems.some(item => isActive(item.path))
	);

	// Get total badge count for overflow items
	let overflowBadgeCount = $derived(overflowItems.length);

	onMount(async () => {
		// Initialize navigation store if not already initialized
		if (!navigationStore.initialized) {
			await navigationStore.initialize();
		}
		await loadItems();
	});
</script>

<nav class="fixed bottom-0 left-0 right-0 z-50 p-1 flex justify-between sm:justify-center bg-[var(--color-bg-secondary)]/95 backdrop-blur-md border-t border-[var(--color-border)] rounded-t-2xl shadow-lg">
	<div class="flex w-full justify-between gap-1 max-w-md mx-auto">
		{#each visibleItems as item (item.id)}
			{@const IconComponent = iconMap[item.icon] || HomeIcon}
			{@const badgeValue = item.badge?.countKey ? badges.get(item.badge.countKey) : undefined}
			{@const showBadge = item.badge && badgeValue !== undefined && badgeValue !== 0}
			
			<a
				href={item.path}
				class="flex flex-col items-center justify-center p-2 flex-1 min-h-[60px] min-w-[60px] border border-transparent rounded-xl transition-all duration-150 
					{isActive(item.path) 
						? 'bg-[var(--color-bg-tertiary)] border-[var(--color-golden-amber)]/30 text-[var(--color-golden-amber)] font-semibold shadow-sm' 
						: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]/50 hover:border-[var(--color-border)]'} 
					relative"
			>
				<div class="relative">
					<IconComponent class="w-6 h-6 drop-shadow-lg" />
					{#if showBadge}
						<div class="absolute -top-1 -right-2">
							<Badge 
								variant="secondary"
								class="h-4 min-w-4 px-1 text-[10px] font-bold {getBadgeColorClass(item.badge?.color)}"
							>
								{badgeValue}
							</Badge>
						</div>
					{/if}
				</div>
				<p class="text-xs whitespace-nowrap mt-1">{item.label}</p>
			</a>
		{/each}

		{#if overflowItems.length > 0}
			<!-- More button -->
			<button
				onclick={() => moreDrawerOpen = true}
				class="flex flex-col items-center justify-center p-2 flex-1 min-h-[60px] min-w-[60px] border border-transparent rounded-xl transition-all duration-150 
					{hasActiveOverflowItem 
						? 'bg-[var(--color-bg-tertiary)] border-[var(--color-golden-amber)]/30 text-[var(--color-golden-amber)] font-semibold shadow-sm' 
						: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]/50 hover:border-[var(--color-border)]'}
					relative"
			>
				<div class="relative">
					<MoreHorizontalIcon class="w-6 h-6 drop-shadow-lg" />
					{#if overflowBadgeCount > 0}
						<div class="absolute -top-3 -right-3">
							<Badge 
								variant="secondary"
								class="h-4 min-w-4 px-1 text-[10px] font-bold bg-[var(--color-golden-amber)] text-[var(--color-warm-charcoal)]"
							>
								{overflowBadgeCount}
							</Badge>
						</div>
					{/if}
				</div>
				<p class="text-xs whitespace-nowrap mt-1">More</p>
			</button>

			<!-- More menu drawer -->
			<Drawer.Root bind:open={moreDrawerOpen} direction="bottom">
				<Drawer.Content>
					<Drawer.Header>
						<Drawer.Title>More Options</Drawer.Title>
						<Drawer.Description>
							Additional navigation items and settings
						</Drawer.Description>
					</Drawer.Header>
					
					<div class="p-4 pb-6 space-y-1">
						{#each overflowItems as item (item.id)}
							{@const IconComponent = iconMap[item.icon] || HomeIcon}
							{@const badgeValue = item.badge?.countKey ? badges.get(item.badge.countKey) : undefined}
							{@const showBadge = item.badge && badgeValue !== undefined && badgeValue !== 0}
							
							<a
								href={item.path}
								onclick={() => moreDrawerOpen = false}
								class="flex items-center gap-3 p-3 rounded-lg transition-all duration-150
									{isActive(item.path) 
										? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] font-medium' 
										: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]/50 hover:text-[var(--color-text-primary)]'}"
							>
								<div class="relative">
									<IconComponent class="w-5 h-5" />
									{#if item.hasSubRoutes && isActive(item.path)}
										<div class="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-[var(--color-golden-amber)] rounded-full animate-pulse"></div>
									{/if}
								</div>
								
								<span class="flex-1 text-sm">{item.label}</span>
								
								{#if showBadge}
									<Badge 
										variant="secondary"
										class="h-5 min-w-5 px-1.5 text-xs font-medium {getBadgeColorClass(item.badge?.color)}"
									>
										{badgeValue}
									</Badge>
								{/if}
								
								<ChevronRightIcon class="w-4 h-4 text-[var(--color-text-tertiary)]" />
							</a>
						{/each}
					</div>
				</Drawer.Content>
			</Drawer.Root>
		{/if}
	</div>
</nav>
