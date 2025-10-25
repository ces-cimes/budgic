<script lang="ts">
	import { page } from '$app/stores';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';
	import { onMount } from 'svelte';
	
	// Lucide icons - dynamic import
	import HomeIcon from '@lucide/svelte/icons/home';
	import ReceiptIcon from '@lucide/svelte/icons/receipt';
	import TargetIcon from '@lucide/svelte/icons/target';
	import WalletIcon from '@lucide/svelte/icons/wallet';
	import TrendingUpIcon from '@lucide/svelte/icons/trending-up';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import BellIcon from '@lucide/svelte/icons/bell';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import CreditCardIcon from '@lucide/svelte/icons/credit-card';

	// Icon mapping
	const iconMap: Record<string, any> = {
		'home': HomeIcon,
		'receipt': ReceiptIcon,
		'target': TargetIcon,
		'wallet': WalletIcon,
		'trending-up': TrendingUpIcon,
		'calendar': CalendarIcon,
		'bell': BellIcon,
		'settings': SettingsIcon,
		'credit-card': CreditCardIcon
	};

	function isActive(path: string) {
		const currentPath = $page.url.pathname;
		
		// Exact match
		if (currentPath === path) return true;
		
		// Sub-route match (e.g., /insights/alerts should highlight /insights)
		if (currentPath.startsWith(path + '/')) return true;
		
		return false;
	}
	
	// Use sidebar context for mobile sidebar functionality
	const sidebar = Sidebar.useSidebar();

	// Get desktop items and badges from store
	let desktopItems = $derived(navigationStore.desktopItems);
	let badges = $derived(navigationStore.badges);
	let loading = $derived(navigationStore.loading);

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

	onMount(() => {
		// Initialize navigation store if not already initialized
		if (!navigationStore.initialized) {
			navigationStore.initialize();
		}
	});
</script>

<!-- Desktop Sidebar -->
{#if !sidebar.isMobile}
	<Sidebar.Root variant="inset">
		<Sidebar.Content>
			<Sidebar.Header>
				<div class="flex items-center gap-2 px-2 py-3">
					<div class="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-sage-green)] to-[var(--color-golden-amber)]">
						<TargetIcon class="w-5 h-5 text-white" />
					</div>
					<span class="text-lg font-semibold text-[var(--color-text-primary)]">Budgic</span>
				</div>
			</Sidebar.Header>
			
			<Sidebar.Group>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#if loading}
							<!-- Loading skeleton -->
							{#each Array(9) as _, i}
								<Sidebar.MenuItem>
									<div class="h-10 bg-[var(--color-bg-tertiary)] rounded-md animate-pulse"></div>
								</Sidebar.MenuItem>
							{/each}
						{:else}
							{#each desktopItems as item (item.id)}
								{@const IconComponent = iconMap[item.icon || 'home'] || HomeIcon}
								{@const badgeValue = item.badge?.countKey ? badges.get(item.badge.countKey) : undefined}
								{@const showBadge = item.badge && badgeValue !== undefined && badgeValue !== 0}
								
								<Sidebar.MenuItem>
									<Sidebar.MenuButton 
										isActive={isActive(item.path)}
									>
										{#snippet child({ props })}
											<a 
												href={item.path}
												class="group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
													{isActive(item.path) 
														? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] font-medium shadow-sm' 
														: 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]/50'}"
												{...props}
											>
												<div class="relative flex-shrink-0">
													<IconComponent 
														class="w-5 h-5 transition-transform duration-200 {isActive(item.path) ? 'scale-110' : 'group-hover:scale-105'}" 
													/>
												</div>
												
												<span class="flex-1 text-sm">{item.label}</span>
												
												{#if showBadge}
													<Badge 
														variant="secondary"
														class="ml-auto h-5 min-w-5 px-1.5 text-xs font-medium {getBadgeColorClass(item.badge?.color)}"
													>
														{badgeValue}
													</Badge>
												{/if}
											</a>
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
						{/if}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>

			<Sidebar.Footer class="mt-auto">
				<div class="px-3 py-2 text-xs text-[var(--color-text-tertiary)]">
					v1.0.0
				</div>
			</Sidebar.Footer>
		</Sidebar.Content>
	</Sidebar.Root>
{/if}

<!-- Mobile navigation is now handled by the MobileNavigation component -->
