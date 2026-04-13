<script lang="ts">
	import { notificationsService, userService } from '$lib/core/services';
	import { groupPanelAlertsForDisplay, splitByTier } from '$lib/utils/alert-tiers';
	import { alertsPanelStore } from '$lib/stores/alerts-panel-store.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Bell from '@lucide/svelte/icons/bell';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import X from '@lucide/svelte/icons/x';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { Button } from '$lib/components/ui/button';
	import * as Drawer from '$lib/components/ui/drawer';
	import NotificationCard from '$lib/components/NotificationCard.svelte';
	import { db, type Insight } from '$lib/core/db';

	let unreadCount = $state(0);
	let unreadInsights = $state<Insight[]>([]);
	let earlierAlerts = $state<Insight[]>([]);
	let isOpen = $state(false);
	let isLoading = $state(true);
	let categoryNames = $state<Record<string, string>>({});
	let goalNames = $state<Record<string, string>>({});
	let alertsCurrency = $state('USD');
	let alertsNumberLocale = $state('en-US');
	let alertsCriticalCoachmarkSeen = $state(true);
	/** Expanded "Earlier" row id for message + link review */
	let expandedEarlierId = $state<string | null>(null);

	// Sync with global store: store opens panel; closing panel updates store
	$effect(() => {
		isOpen = alertsPanelStore.open;
	});
	$effect(() => {
		if (!isOpen) alertsPanelStore.open = false;
	});

	const { critical, high } = $derived(splitByTier(unreadInsights));
	const criticalGroups = $derived(groupPanelAlertsForDisplay(critical));
	const highGroups = $derived(groupPanelAlertsForDisplay(high));
	const hasUnread = $derived(unreadCount > 0);
	const showCriticalCoachmark = $derived(
		critical.length > 0 && !alertsCriticalCoachmarkSeen && !isLoading
	);

	$effect(() => {
		if (
			expandedEarlierId &&
			!earlierAlerts.some((i) => i.id === expandedEarlierId)
		) {
			expandedEarlierId = null;
		}
	});

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

		const catIds = new Set<string>();
		const goalIds = new Set<string>();
		for (const i of unreadInsights) {
			if (i.categoryId) catIds.add(i.categoryId);
			if (i.goalId) goalIds.add(i.goalId);
		}
		try {
			const prefs = await userService.getUserPreferences();
			alertsCurrency = prefs.currency ?? 'USD';
			alertsNumberLocale = prefs.language === 'ru' ? 'ru-RU' : 'en-US';
			alertsCriticalCoachmarkSeen = prefs.alertsCriticalCoachmarkSeen ?? false;
			const catEntries = await Promise.all(
				[...catIds].map(async (id) => {
					const c = await db.categories.get(id);
					return [id, c?.name ?? ''] as const;
				})
			);
			const goalEntries = await Promise.all(
				[...goalIds].map(async (id) => {
					const g = await db.goals.get(id);
					return [id, g?.name ?? ''] as const;
				})
			);
			categoryNames = Object.fromEntries(catEntries);
			goalNames = Object.fromEntries(goalEntries);
		} catch {
			categoryNames = {};
			goalNames = {};
			alertsCriticalCoachmarkSeen = true;
		}

		isLoading = false;
	}

	async function handleInsightClickGroup(group: Insight[]) {
		const primary = group[0];
		for (const i of group) {
			await notificationsService.markAsRead(i.id);
		}
		await refreshData();
		window.dispatchEvent(new CustomEvent('alerts-updated'));
		if (primary.actionUrl) {
			await goto(primary.actionUrl);
		} else {
			await goto('/insights');
		}
		alertsPanelStore.closePanel();
	}

	async function handleMarkAllRead() {
		await notificationsService.markAllAsRead();
		await refreshData();
		window.dispatchEvent(new CustomEvent('alerts-updated'));
	}

	async function handleDismissGroup(group: Insight[]) {
		for (const i of group) {
			await notificationsService.dismiss(i.id);
		}
		await refreshData();
		window.dispatchEvent(new CustomEvent('alerts-updated'));
	}

	async function dismissCriticalCoachmark() {
		await userService.updateUserPreferences({ alertsCriticalCoachmarkSeen: true });
		alertsCriticalCoachmarkSeen = true;
	}

	function earlierWasDismissed(insight: Insight): boolean {
		return insight.dismissedAt != null;
	}

	function earlierWasRead(insight: Insight): boolean {
		return insight.readAt != null && insight.dismissedAt == null;
	}

	function toggleEarlierExpand(id: string) {
		expandedEarlierId = expandedEarlierId === id ? null : id;
	}

	function handleEarlierLinkClick(e: MouseEvent, url: string) {
		e.stopPropagation();
		e.preventDefault();
		goto(url);
		alertsPanelStore.closePanel();
	}

	function earlierSeverityLabel(severity: Insight['severity']): string {
		switch (severity) {
			case 'alert':
				return 'Critical';
			case 'warning':
				return 'High';
			default:
				return severity;
		}
	}

	function formatEarlierTime(insight: Insight): string {
		const ts = insight.dismissedAt || insight.readAt || insight.updatedAt || '';
		if (!ts) return '';
		const date = new Date(ts);
		const now = new Date();
		const opts: Intl.DateTimeFormatOptions = {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		};
		if (date.getFullYear() !== now.getFullYear()) {
			opts.year = 'numeric';
		}
		return date.toLocaleString(undefined, opts);
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

		<div class="px-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0 pb-6">
			<!-- data-vaul-no-drag only on content: cards and "Earlier" section; empty area below stays draggable -->
			<div data-vaul-no-drag>
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
					<div class="flex flex-col gap-4">
						{#if critical.length > 0}
							<div>
								{#if showCriticalCoachmark}
									<div
										class="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
										role="note"
									>
										<p class="text-foreground font-medium mb-1">How alerts work</p>
										<p>
											<strong>Tap the alert</strong> to mark read and open the linked screen.
											<strong>Details</strong> expands the full message when there is more to read.
											<strong>Dismiss</strong> (✕) removes it until the issue returns.
											<strong>Mark all read</strong> in the header marks every unread alert here as read.
										</p>
										<Button variant="ghost" size="sm" class="mt-2 h-7 px-2 text-xs" onclick={dismissCriticalCoachmark}>
											Got it
										</Button>
									</div>
								{/if}
								<div class="space-y-3">
									{#each criticalGroups as group (group.map((i) => i.id).join('-'))}
										{@const p = group[0]}
										<NotificationCard
											insights={group}
											categoryLabel={p.categoryId ? categoryNames[p.categoryId] : undefined}
											goalLabel={p.goalId ? goalNames[p.goalId] : undefined}
											displayCurrency={alertsCurrency}
											numberLocale={alertsNumberLocale}
											onClick={handleInsightClickGroup}
											onDismiss={handleDismissGroup}
										/>
									{/each}
								</div>
							</div>
						{/if}

						{#if high.length > 0}
							<div class="space-y-3">
								{#each highGroups as group (group.map((i) => i.id).join('-'))}
									{@const p = group[0]}
									<NotificationCard
										insights={group}
										categoryLabel={p.categoryId ? categoryNames[p.categoryId] : undefined}
										goalLabel={p.goalId ? goalNames[p.goalId] : undefined}
										displayCurrency={alertsCurrency}
										numberLocale={alertsNumberLocale}
										onClick={handleInsightClickGroup}
										onDismiss={handleDismissGroup}
									/>
								{/each}
							</div>
						{/if}
					</div>

					{#if earlierAlerts.length > 0}
						<details class="mt-4 border-t border-border pt-3">
							<summary class="text-xs font-medium text-muted-foreground cursor-pointer list-none">
								Earlier — {earlierAlerts.length}
							</summary>
							<div class="space-y-2 mt-2">
								{#each earlierAlerts as insight (insight.id)}
									{@const dismissed = earlierWasDismissed(insight)}
									{@const read = earlierWasRead(insight)}
									<div
										class="rounded-lg border overflow-hidden transition-colors {dismissed
											? 'border-amber-500/35 bg-amber-500/[0.07] dark:border-amber-400/30 dark:bg-amber-500/[0.09]'
											: read
												? 'border-sky-500/35 bg-sky-500/[0.06] dark:border-sky-400/30 dark:bg-sky-500/[0.08]'
												: 'border-border bg-muted/30'}"
									>
										<div class="flex min-w-0">
											<div class="flex min-w-0 flex-1 flex-col">
												<button
													type="button"
													class="flex w-full gap-2 items-start rounded-none py-2 pl-3 pr-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.05] focus-visible:outline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
													onclick={() => toggleEarlierExpand(insight.id)}
													aria-expanded={expandedEarlierId === insight.id}
												>
													<span class="mt-0.5 shrink-0" aria-hidden="true">
														{#if dismissed}
															<X class="w-4 h-4 text-amber-600 dark:text-amber-400" />
														{:else}
															<CheckCircle2 class="w-4 h-4 text-sky-600 dark:text-sky-400" />
														{/if}
													</span>
													<div class="min-w-0 flex-1">
														<div
															class="mb-0.5 flex min-w-0 items-center justify-between gap-x-2 gap-y-0.5"
														>
															<div class="flex min-w-0 flex-wrap items-center gap-x-1.5">
																<span
																	class="text-[10px] font-semibold uppercase tracking-wider {dismissed
																		? 'text-amber-700 dark:text-amber-400'
																		: 'text-sky-700 dark:text-sky-400'}"
																>
																	{dismissed ? 'Dismissed' : read ? 'Read' : 'Earlier'}
																</span>
																{#if insight.severity === 'alert' || insight.severity === 'warning'}
																	<span class="text-[10px] text-muted-foreground">
																		· {earlierSeverityLabel(insight.severity)}
																	</span>
																{/if}
															</div>
															<span
																class="shrink-0 text-[10px] text-muted-foreground tabular-nums"
															>
																{formatEarlierTime(insight)}
															</span>
														</div>
														<div class="font-medium text-foreground text-sm leading-snug">
															{insight.title}
														</div>
													</div>
												</button>
												{#if insight.actionUrl}
													<div class="px-3 pb-2 pl-9">
														<button
															type="button"
															class="inline-flex max-w-full items-center gap-0.5 rounded border border-border bg-background/60 px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
															onclick={(e) => handleEarlierLinkClick(e, insight.actionUrl!)}
														>
															<span class="truncate">Open linked page</span>
															<span class="shrink-0 opacity-70" aria-hidden="true">→</span>
														</button>
													</div>
												{/if}
											</div>
											<div
												class="flex w-11 shrink-0 flex-col self-stretch border-l border-border/50"
											>
												<button
													type="button"
													class="flex min-h-10 flex-1 items-center justify-center text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08] focus-visible:outline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
													aria-expanded={expandedEarlierId === insight.id}
													aria-label={expandedEarlierId === insight.id
														? 'Hide details'
														: 'Show details'}
													onclick={() => toggleEarlierExpand(insight.id)}
												>
													<ChevronDown
														class="w-4 h-4 transition-transform duration-200 {expandedEarlierId === insight.id
															? 'rotate-180'
															: ''}"
														aria-hidden="true"
													/>
												</button>
											</div>
										</div>
										{#if expandedEarlierId === insight.id}
											<div
												class="space-y-2 border-t border-border/60 px-3 pb-3 pt-2"
												role="region"
											>
												<p class="text-xs text-muted-foreground leading-relaxed">
													{insight.message}
												</p>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</details>
					{/if}
				{/if}
			</div>
		</div>
	</Drawer.Content>
</Drawer.Root>
