<script lang="ts">
	import { notificationsService } from '$lib/core/services';
	import { splitByTier } from '$lib/utils/alert-tiers';
	import { alertsPanelStore } from '$lib/stores/alerts-panel-store.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Bell from '@lucide/svelte/icons/bell';
	import { Button } from '$lib/components/ui/button';
	import * as Drawer from '$lib/components/ui/drawer';
	import NotificationCard from '$lib/components/NotificationCard.svelte';
	import type { Insight } from '$lib/core/db';

	let unreadCount = $state(0);
	let unreadInsights = $state<Insight[]>([]);
	let earlierAlerts = $state<Insight[]>([]);
	let isOpen = $state(false);
	let isLoading = $state(true);

	// Sync with global store: store opens panel; closing panel updates store
	$effect(() => {
		isOpen = alertsPanelStore.open;
	});
	$effect(() => {
		if (!isOpen) alertsPanelStore.open = false;
	});

	const { critical, high } = $derived(splitByTier(unreadInsights));
	const hasUnread = $derived(unreadCount > 0);

	onMount(() => {
		window.addEventListener('open-alerts-panel', handleOpenPanel);
		return () => window.removeEventListener('open-alerts-panel', handleOpenPanel);
	});

	function handleOpenPanel() {
		alertsPanelStore.openPanel();
	}

	$effect(() => {
		if (isOpen) {
			refreshData();
		}
	});

	async function refreshData() {
		isLoading = true;
		await notificationsService.refresh();
		unreadCount = notificationsService.unreadCount;
		unreadInsights = notificationsService.unreadInsights;
		earlierAlerts = notificationsService.earlierAlerts;
		isLoading = false;
	}

	async function handleInsightClick(insight: Insight) {
		await notificationsService.markAsRead(insight.id);
		await refreshData();
		window.dispatchEvent(new CustomEvent('alerts-updated'));
		if (insight.actionUrl) {
			await goto(insight.actionUrl);
		} else {
			await goto('/insights');
		}
		alertsPanelStore.closePanel();
	}

	async function handleMarkAllRead() {
		await notificationsService.markAllAsRead();
		await refreshData();
	}

	async function handleDismiss(insight: Insight) {
		await notificationsService.dismiss(insight.id);
		await refreshData();
	}

	function formatEarlierTime(insight: Insight): string {
		const ts = insight.dismissedAt || insight.readAt || insight.updatedAt || '';
		if (!ts) return '';
		const date = new Date(ts);
		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Desktop: right panel 320px; mobile: bottom drawer ~70vh
	let isMobile = $state(true);
	onMount(() => {
		const mq = window.matchMedia('(max-width: 640px)');
		isMobile = mq.matches;
		const handler = () => {
			isMobile = mq.matches;
		};
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});
</script>

<Drawer.Root
	bind:open={isOpen}
	direction={isMobile ? 'bottom' : 'right'}
>
	<Drawer.Content
		class="w-full bg-background backdrop-blur-sm {isMobile ? 'max-h-[70vh] rounded-t-xl' : 'w-[320px] max-w-[320px] rounded-l-xl border-l'}"
	>
		<Drawer.Header class="flex flex-row items-center justify-between gap-2">
			<div>
				<Drawer.Title>Alerts</Drawer.Title>
				<Drawer.Description>
					{#if unreadCount === 0}
						All caught up!
					{:else}
						{unreadCount} unread
					{/if}
				</Drawer.Description>
			</div>
			{#if hasUnread}
				<Button
					variant="ghost"
					size="sm"
					class="shrink-0 text-xs"
					onclick={handleMarkAllRead}
				>
					Mark all read
				</Button>
			{/if}
		</Drawer.Header>

		<div class="px-4 overflow-y-auto flex-1 min-h-0 pb-6">
			{#if isLoading}
				<div class="flex items-center justify-center py-8 text-muted-foreground text-sm">
					Loading...
				</div>
			{:else if unreadInsights.length === 0 && earlierAlerts.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<Bell class="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
					<p class="text-sm font-medium">No alerts</p>
					<p class="text-xs text-muted-foreground mt-1">You're all caught up!</p>
				</div>
			{:else}
				{#if critical.length > 0}
					<p class="text-xs font-semibold uppercase tracking-wider text-destructive mt-2 mb-1.5">
						Critical
					</p>
					<div class="space-y-3 mb-4">
						{#each critical as insight (insight.id)}
							<NotificationCard
								{insight}
								onClick={handleInsightClick}
								onDismiss={handleDismiss}
							/>
						{/each}
					</div>
				{/if}

				{#if high.length > 0}
					<p class="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mt-2 mb-1.5">
						High
					</p>
					<div class="space-y-3 mb-4">
						{#each high as insight (insight.id)}
							<NotificationCard
								{insight}
								onClick={handleInsightClick}
								onDismiss={handleDismiss}
							/>
						{/each}
					</div>
				{/if}

				{#if earlierAlerts.length > 0}
					<details class="mt-4 border-t border-border pt-3">
						<summary class="text-xs font-medium text-muted-foreground cursor-pointer list-none flex items-center gap-1">
							Earlier (read) — {earlierAlerts.length}
						</summary>
						<div class="space-y-2 mt-2">
							{#each earlierAlerts as insight (insight.id)}
								<div
									class="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
								>
									<div class="font-medium text-foreground">{insight.title}</div>
									<div class="text-xs text-muted-foreground mt-0.5">
										{formatEarlierTime(insight)}
									</div>
								</div>
							{/each}
						</div>
					</details>
				{/if}
			{/if}
		</div>
	</Drawer.Content>
</Drawer.Root>
