<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	
	// Lucide icons
	import TargetIcon from '@lucide/svelte/icons/target';
	import HomeIcon from '@lucide/svelte/icons/home';
	import ReceiptIcon from '@lucide/svelte/icons/receipt';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import BellIcon from '@lucide/svelte/icons/bell';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import CreditCardIcon from '@lucide/svelte/icons/credit-card';

	const navItems = [
		{ path: '/', label: 'Dashboard', icon: HomeIcon, hasSubRoutes: false },
		{ path: '/transactions', label: 'Transactions', icon: ReceiptIcon, hasSubRoutes: false },
		{ path: '/budget', label: 'Budget', icon: TargetIcon, hasSubRoutes: true },
		{ path: '/forecast', label: 'Forecast', icon: CalendarIcon, hasSubRoutes: true },
		{ path: '/insights', label: 'Insights', icon: BellIcon, hasSubRoutes: true },
		{ path: '/accounts', label: 'Accounts', icon: CreditCardIcon, hasSubRoutes: false },
		{ path: '/settings', label: 'Settings', icon: SettingsIcon, hasSubRoutes: true }
	];

	function isActive(path: string) {
		const currentPath = $page.url.pathname;
		
		// Exact match
		if (currentPath === path) return true;
		
		// Sub-route match (e.g., /insights/notifications should highlight /insights)
		if (currentPath.startsWith(path + '/')) return true;
		
		return false;
	}
	
	// Use sidebar context for mobile sidebar functionality
	const sidebar = Sidebar.useSidebar();
</script>

<!-- Desktop Sidebar -->
{#if !sidebar.isMobile}
	<Sidebar.Root variant="inset">
		<Sidebar.Content>
			<Sidebar.Header>
				<span class="inline-flex items-center gap-2">
					<TargetIcon />
					Budgic
				</span>
			</Sidebar.Header>
			
			<Sidebar.Group>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each navItems as item (item.label)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton 
									isActive={isActive(item.path)}
								>
									{#snippet child({ props })}
										<a 
											href={item.path}
											class="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-2 relative"
											{...props}
										>
											<item.icon />
											<span>{item.label}</span>
											{#if item.hasSubRoutes && isActive(item.path)}
												<div class="w-1.5 h-1.5 bg-[var(--color-golden-amber)] rounded-full"></div>
											{/if}
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		</Sidebar.Content>
	</Sidebar.Root>
{/if}

<!-- Mobile navigation is now handled by the PageLayout component --> 