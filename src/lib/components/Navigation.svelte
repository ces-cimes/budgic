<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	
	// Lucide icons
	import TargetIcon from '@lucide/svelte/icons/target';
	import SunIcon from '@lucide/svelte/icons/sun';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import SlidersIcon from '@lucide/svelte/icons/sliders';
	import TagIcon from '@lucide/svelte/icons/tag';

	const navItems = [
		{ path: '/', label: 'Today', icon: SunIcon },
		{ path: '/transactions', label: 'Trans.', icon: SquarePenIcon },
		{ path: '/categories', label: 'Categories', icon: TagIcon },
		{ path: '/plan', label: 'Plan', icon: CalendarDaysIcon },
		{ path: '/insights', label: 'Insights', icon: ChartPieIcon },
		{ path: '/settings', label: 'Settings', icon: SlidersIcon }
	];

	function isActive(path: string) {
		return $page.url.pathname === path;
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
											class="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
											{...props}
										>
											<item.icon />
											<span>{item.label}</span>
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