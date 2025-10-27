<script lang="ts">
	import { notificationsService } from '$lib/core/services';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Bell from '@lucide/svelte/icons/bell';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Drawer from '$lib/components/ui/drawer';
	import NotificationCard from '$lib/components/NotificationCard.svelte';
	import type { Insight } from '$lib/core/db';

	let unreadCount = $state(0);
	let unreadInsights = $state<Insight[]>([]);
	let isOpen = $state(false);
	let isLoading = $state(true);
	let updateInterval: ReturnType<typeof setInterval> | null = null;

	onMount(async () => {
		await notificationsService.initialize();
		
		// Initial load
		await refreshData();
		
		// Poll for updates every 30 seconds
		updateInterval = setInterval(async () => {
			await refreshData();
		}, 30 * 1000);
	});

	// Cleanup on unmount
	$effect(() => {
		return () => {
			notificationsService.stopPolling();
			if (updateInterval) {
				clearInterval(updateInterval);
			}
		};
	});

	async function refreshData() {
		await notificationsService.refresh();
		unreadCount = notificationsService.unreadCount;
		unreadInsights = notificationsService.unreadInsights;
		isLoading = false;
	}

	async function handleInsightClick(insight: Insight) {
		// Mark as read
		await notificationsService.markAsRead(insight.id);
		await refreshData();
		
		// Navigate to relevant page if actionUrl exists
		if (insight.actionUrl) {
			await goto(insight.actionUrl);
		} else {
			// Navigate to insights page
			await goto('/insights');
		}
		
		isOpen = false;
	}

	async function handleMarkAllRead() {
		await notificationsService.markAllAsRead();
		await refreshData();
	}

	async function handleDismiss(insight: Insight) {
		await notificationsService.markAsRead(insight.id);
		await refreshData();
	}
</script>

<!-- Notification Button - Only visible on mobile -->
<div class="flex items-center relative">
	<Button
		variant="ghost"
		size="square"
		class="relative"
		onclick={() => isOpen = true}
	>
		<Bell size={20} />
		{#if unreadCount > 0}
			<Badge
				variant="destructive"
				class="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-xs"
			>
				{unreadCount > 99 ? '99+' : unreadCount}
			</Badge>
		{/if}
	</Button>

	<!-- Notification Drawer -->
	<Drawer.Root bind:open={isOpen}>
		<Drawer.Content class="w-full bg-background backdrop-blur-sm">
			<Drawer.Header>
				<Drawer.Title>Notifications</Drawer.Title>
				<Drawer.Description>
					{#if unreadCount === 0}
						All caught up!
					{:else}
						{unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
					{/if}
				</Drawer.Description>
			</Drawer.Header>

			<div class="px-4 overflow-y-auto">
				{#if isLoading}
					<div class="flex items-center justify-center py-8 text-muted-foreground">
						Loading notifications...
					</div>
				{:else if unreadInsights.length === 0}
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<Bell class="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
						<p class="text-sm font-medium">No new notifications</p>
						<p class="text-xs text-muted-foreground mt-1">You're all caught up!</p>
					</div>
				{:else}
					<div class="space-y-3 pb-4">
						{#each unreadInsights as insight (insight.id)}
							<NotificationCard
								{insight}
								onClick={handleInsightClick}
								onDismiss={handleDismiss}
							/>
						{/each}
					</div>
				{/if}
			</div>

			{#if unreadInsights.length > 0}
				<Drawer.Footer class="py-2">
					<div class="flex gap-2">
						<Button
							variant="default"
							class="flex-1"
							onclick={() => {
								isOpen = false;
								goto('/insights');
							}}
						>
							View all
						</Button>
						<Button
							variant="outline"
							class="flex-1"
							onclick={handleMarkAllRead}
							disabled={unreadCount === 0}
						>
							Clear
						</Button>
					</div>
				</Drawer.Footer>
			{/if}
		</Drawer.Content>
	</Drawer.Root>
</div>