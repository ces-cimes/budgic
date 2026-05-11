<script lang="ts">
	import { page } from '$app/stores';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import * as Drawer from '$lib/components/ui/drawer/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { onMount } from 'svelte';

	// Lucide icons
	import {
		HomeIcon,
		ReceiptIcon,
		TargetIcon,
		WalletIcon,
		TrendingUpIcon,
		CalendarIcon,
		BellIcon,
		SettingsIcon,
		CreditCardIcon,
		DatabaseIcon,
		MoreHorizontalIcon,
		ChevronRightIcon,
		CalculatorIcon
	} from '@lucide/svelte';

	// Icon mapping (plan/reports use wallet and trending-up)
	const iconMap: Record<string, any> = {
		home: HomeIcon,
		receipt: ReceiptIcon,
		target: TargetIcon,
		wallet: WalletIcon,
		'trending-up': TrendingUpIcon,
		calendar: CalendarIcon,
		bell: BellIcon,
		settings: SettingsIcon,
		'credit-card': CreditCardIcon,
		database: DatabaseIcon,
		plan: WalletIcon,
		reports: TrendingUpIcon,
		calculator: CalculatorIcon
	};

	let moreDrawerOpen = $state(false);
	let badges = $derived(navigationStore.badges);

	// Reactive mobile items - automatically updates when store changes
	let mobileItems = $derived(navigationStore.mobileItems);
	let visibleItems = $derived(mobileItems.slice(0, 4)); // First 4 items
	let overflowItems = $derived(mobileItems.slice(4)); // Rest go to overflow

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

	// Check if there are any active overflow items
	let hasActiveOverflowItem = $derived(overflowItems.some((item) => isActive(item.path)));

	// Get total badge count for overflow items
	let overflowBadgeCount = $derived(overflowItems.length);

	onMount(async () => {
		// Initialize navigation store if not already initialized
		if (!navigationStore.initialized) {
			await navigationStore.initialize();
		}
	});
</script>

<nav
	class="glass border-border fixed right-0 bottom-0 left-0 z-50 flex justify-between rounded-t-2xl border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:justify-center"
>
	<div class="mx-auto flex w-full max-w-md justify-between">
		{#each visibleItems as item (item.id)}
			{@const IconComponent = iconMap[item.icon || 'home'] || HomeIcon}
			{@const badgeValue = item.badge?.countKey ? badges.get(item.badge.countKey) : undefined}
			{@const showBadge = item.badge && badgeValue !== undefined && badgeValue !== 0}
			{@const active = isActive(item.path)}

			<a
				href={item.path}
				class="relative flex min-h-[56px] min-w-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-all duration-150"
			>
				<!-- Icon + badge -->
				<div class="relative">
					<IconComponent
						class="h-[22px] w-[22px] transition-colors duration-150 {active
							? 'text-[var(--color-amber)]'
							: 'text-[var(--color-text-tertiary)]'}"
					/>
					{#if showBadge}
						<div class="absolute -top-1 -right-2">
							<Badge
								variant="secondary"
								class="h-4 min-w-4 px-1 text-[10px] font-bold {getBadgeColorClass(
									item.badge?.color
								)}"
							>
								{badgeValue}
							</Badge>
						</div>
					{/if}
				</div>

				<!-- Label -->
				<span
					class="text-[10px] leading-none font-medium whitespace-nowrap transition-colors duration-150 {active
						? 'text-[var(--color-amber)]'
						: 'text-[var(--color-text-tertiary)]'}"
				>
					{item.label}
				</span>

				<!-- Active pill indicator -->
				{#if active}
					<span
						class="absolute bottom-1 left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-full bg-[var(--color-amber)]"
					></span>
				{/if}
			</a>
		{/each}

		{#if overflowItems.length > 0}
			<!-- More button -->
			{@const moreActive = hasActiveOverflowItem}
			<button
				onclick={() => (moreDrawerOpen = true)}
				class="relative flex min-h-[56px] min-w-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-all duration-150"
			>
				<div class="relative">
					<MoreHorizontalIcon
						class="h-[22px] w-[22px] transition-colors duration-150 {moreActive
							? 'text-[var(--color-amber)]'
							: 'text-[var(--color-text-tertiary)]'}"
					/>
					{#if overflowBadgeCount > 0}
						<div class="absolute -top-1 -right-2">
							<Badge
								variant="secondary"
								class="h-4 min-w-4 bg-[var(--color-amber)] px-1 text-[10px] font-bold text-[var(--color-warm-charcoal)]"
							>
								{overflowBadgeCount}
							</Badge>
						</div>
					{/if}
				</div>
				<span
					class="text-[10px] leading-none font-medium whitespace-nowrap transition-colors duration-150 {moreActive
						? 'text-[var(--color-amber)]'
						: 'text-[var(--color-text-tertiary)]'}"
				>
					More
				</span>
				{#if moreActive}
					<span
						class="absolute bottom-1 left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-full bg-[var(--color-amber)]"
					></span>
				{/if}
			</button>

			<!-- More menu drawer -->
			<Drawer.Root bind:open={moreDrawerOpen} direction="bottom">
				<Drawer.Content>
					<Drawer.Header>
						<Drawer.Title>More Options</Drawer.Title>
						<Drawer.Description>Additional navigation items and settings</Drawer.Description>
					</Drawer.Header>

					<div class="space-y-0.5 p-3">
						{#each overflowItems as item (item.id)}
							{@const IconComponent = iconMap[item.icon || 'home'] || HomeIcon}
							{@const badgeValue = item.badge?.countKey
								? badges.get(item.badge.countKey)
								: undefined}
							{@const showBadge = item.badge && badgeValue !== undefined && badgeValue !== 0}
							{@const active = isActive(item.path)}

							<a
								href={item.path}
								onclick={() => (moreDrawerOpen = false)}
								class="flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-150 {active
									? 'bg-[var(--color-amber-subtle)] text-[var(--color-amber)]'
									: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]'}"
							>
								<IconComponent class="h-5 w-5 shrink-0" />
								<span class="flex-1 text-sm font-medium">{item.label}</span>
								{#if showBadge}
									<Badge
										variant="secondary"
										class="h-5 min-w-5 px-1.5 text-xs font-medium {getBadgeColorClass(
											item.badge?.color
										)}"
									>
										{badgeValue}
									</Badge>
								{/if}
								<ChevronRightIcon class="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" />
							</a>
						{/each}
					</div>
				</Drawer.Content>
			</Drawer.Root>
		{/if}
	</div>
</nav>
