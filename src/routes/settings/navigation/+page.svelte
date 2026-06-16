<script lang="ts">
	import { onMount } from 'svelte';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';
	import { userService } from '$lib/core/services';
	import {
		SIDEBAR_FOOTER_CARDS,
		SIDEBAR_FOOTER_CARD_IDS,
		DEFAULT_SIDEBAR_FOOTER_CARDS,
		type SidebarFooterCardId
	} from '$lib/config/sidebar-footer-cards';
	import { Switch } from '$lib/components/ui/switch/index.ts';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { toast } from 'svelte-sonner';
	import { Skeleton } from '$lib/components/ui/skeleton';

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
		GripVertical,
		Smartphone,
		Monitor
	} from '@lucide/svelte';

	// Icon mapping
	const iconMap: Record<string, any> = {
		home: HomeIcon,
		receipt: ReceiptIcon,
		target: TargetIcon,
		wallet: WalletIcon,
		'trending-up': TrendingUpIcon,
		calendar: CalendarIcon,
		bell: BellIcon,
		settings: SettingsIcon,
		'credit-card': CreditCardIcon
	};

	let items = $state<any[]>([]);
	let loading = $state(true);
	let saving = $state(false);

	// Drag and drop state (nav items)
	let draggedItem = $state<any | null>(null);
	let dragOverIndex = $state<number | null>(null);

	// Widget rotation (formerly sidebar page)
	let widgetLoading = $state(true);
	let widgetSaving = $state(false);
	let widgetError = $state<string | null>(null);
	let enabledWidgetIds = $state<SidebarFooterCardId[]>([]);
	let widgetDraggedId = $state<SidebarFooterCardId | null>(null);
	let widgetDragOverIndex = $state<number | null>(null);

	async function loadItems() {
		loading = true;
		try {
			const allItems = navigationStore.items;
			items = [...allItems];
		} catch (error) {
			toast.error('Failed to load navigation items');
			console.error(error);
		} finally {
			loading = false;
		}
	}

	function handleDragStart(event: DragEvent, item: any) {
		draggedItem = item;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		dragOverIndex = index;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	function handleDragEnd() {
		draggedItem = null;
		dragOverIndex = null;
	}

	async function handleDrop(event: DragEvent, targetIndex: number) {
		event.preventDefault();

		if (!draggedItem) return;

		const draggedIndex = items.findIndex((item) => item.id === draggedItem.id);
		if (draggedIndex === targetIndex) return;

		// Reorder items
		const newItems = [...items];
		const [removed] = newItems.splice(draggedIndex, 1);
		newItems.splice(targetIndex, 0, removed);

		// Update order values
		newItems.forEach((item, index) => {
			item.order = index;
		});

		items = newItems;

		// Save to database
		try {
			await navigationStore.updateItemOrder(draggedItem.id, targetIndex);
			toast.success('Order saved');
		} catch (error) {
			toast.error('Failed to update navigation order');
			console.error(error);
			await loadItems(); // Reload on error
		}

		draggedItem = null;
		dragOverIndex = null;
	}

	async function toggleVisibility(
		itemId: string,
		field: 'showInMobile' | 'showInDesktop',
		value: boolean
	) {
		saving = true;
		try {
			await navigationStore.updateItemVisibility(itemId, { [field]: value });
			await loadItems();
			toast.success('Saved');
		} catch (error) {
			toast.error('Failed to update visibility');
			console.error(error);
		} finally {
			saving = false;
		}
	}

	async function resetToDefaults() {
		if (
			!confirm(
				'Are you sure you want to reset navigation to default settings? This cannot be undone.'
			)
		) {
			return;
		}

		saving = true;
		try {
			await navigationStore.resetToDefaults();
			await loadItems();
			toast.success('Reset to defaults');
		} catch (error) {
			toast.error('Failed to reset navigation');
			console.error(error);
		} finally {
			saving = false;
		}
	}

	// --- Widget rotation (Slot A) ---
	async function loadWidgets() {
		widgetLoading = true;
		widgetError = null;
		try {
			const prefs = await userService.getUserPreferences();
			const raw = prefs?.sidebarFooterCards;
			if (Array.isArray(raw) && raw.length > 0) {
				const valid = raw.filter((id): id is SidebarFooterCardId =>
					SIDEBAR_FOOTER_CARD_IDS.includes(id as SidebarFooterCardId)
				);
				enabledWidgetIds = valid.filter((id, i, arr) => arr.indexOf(id) === i);
			} else {
				enabledWidgetIds = [...DEFAULT_SIDEBAR_FOOTER_CARDS];
			}
		} catch (err) {
			widgetError = 'Failed to load widget settings';
			console.error(err);
		} finally {
			widgetLoading = false;
		}
	}

	function setWidgetEnabled(id: SidebarFooterCardId, checked: boolean) {
		if (checked) {
			if (enabledWidgetIds.includes(id)) return;
			enabledWidgetIds = [...enabledWidgetIds, id];
		} else {
			enabledWidgetIds = enabledWidgetIds.filter((x) => x !== id);
		}
		saveWidgetOrder();
	}

	async function saveWidgetOrder() {
		if (widgetSaving) return;
		widgetSaving = true;
		widgetError = null;
		try {
			await userService.updateUserPreferences({ sidebarFooterCards: enabledWidgetIds });
			toast.success('Widget order saved');
		} catch (err) {
			widgetError = 'Failed to save';
			toast.error('Failed to save widget settings');
			console.error(err);
		} finally {
			widgetSaving = false;
		}
	}

	function widgetDragStart(_e: DragEvent, id: SidebarFooterCardId) {
		widgetDraggedId = id;
	}

	function widgetDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		widgetDragOverIndex = index;
	}

	function widgetDragEnd() {
		widgetDraggedId = null;
		widgetDragOverIndex = null;
	}

	async function widgetDrop(e: DragEvent, targetIndex: number) {
		e.preventDefault();
		if (widgetDraggedId == null) return;
		const fromIndex = enabledWidgetIds.indexOf(widgetDraggedId);
		if (fromIndex === targetIndex) {
			widgetDraggedId = null;
			widgetDragOverIndex = null;
			return;
		}
		const next = [...enabledWidgetIds];
		const [removed] = next.splice(fromIndex, 1);
		next.splice(targetIndex, 0, removed);
		enabledWidgetIds = next;
		widgetDraggedId = null;
		widgetDragOverIndex = null;
		await saveWidgetOrder();
	}

	function resetWidgetsToDefaults() {
		enabledWidgetIds = [...DEFAULT_SIDEBAR_FOOTER_CARDS];
		saveWidgetOrder();
	}

	onMount(() => {
		loadItems();
		loadWidgets();
	});
</script>

<svelte:head>
	<title>Navigation | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header title="Navigation" backButtonLabel="Back to settings" backButtonLink="/settings" />
	{/snippet}

	<div class="mx-auto max-w-2xl space-y-4 px-4 py-6">
		<div
			class="rounded-xl border border-[var(--color-amber)]/20 bg-[var(--color-amber-subtle)] px-4 py-3"
		>
			<p class="text-xs text-[var(--color-text-secondary)]">
				Drag items to reorder. The first 4 visible items appear in the mobile bar; the rest
				are in the "More" menu.
			</p>
		</div>

		{#if loading}
			<div class="space-y-2">
				{#each [1, 2, 3, 4, 5] as _}
					<Skeleton class="h-16 w-full rounded-xl bg-[var(--color-bg-tertiary)]" />
				{/each}
			</div>
		{:else}
			<div
				class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]"
			>
				<div class="border-border border-b px-5 py-2.5">
					<h2
						class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
					>
						Navigation items
					</h2>
				</div>
				<div class="divide-border divide-y">
					{#each items as item, index (item.id)}
						{@const IconComponent = iconMap[item.icon] || HomeIcon}
						<div
							role="listitem"
							draggable="true"
							ondragstart={(e) => handleDragStart(e, item)}
							ondragover={(e) => handleDragOver(e, index)}
							ondrop={(e) => handleDrop(e, index)}
							ondragend={handleDragEnd}
							class="flex cursor-move items-center gap-3 px-4 py-3 transition-colors {dragOverIndex ===
							index
								? 'bg-[var(--color-amber-subtle)]'
								: 'hover:bg-[var(--color-bg-surface)]'}"
						>
							<GripVertical
								class="size-4 shrink-0 text-[var(--color-text-tertiary)]"
							/>
							<div
								class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-surface)]"
							>
								<IconComponent class="size-4 text-[var(--color-text-secondary)]" />
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-[var(--color-text-primary)]">
									{item.label}
								</p>
								<p class="truncate text-xs text-[var(--color-text-tertiary)]">
									{item.path}
								</p>
							</div>
							<div class="flex shrink-0 items-center gap-3">
								<div class="flex items-center gap-1.5" title="Mobile">
									<Smartphone
										class="size-3.5 text-[var(--color-text-tertiary)]"
									/>
									<Switch
										checked={item.showInMobile}
										onCheckedChange={(checked) =>
											toggleVisibility(item.id, 'showInMobile', checked)}
										disabled={saving}
									/>
								</div>
								<div class="flex items-center gap-1.5" title="Desktop">
									<Monitor class="size-3.5 text-[var(--color-text-tertiary)]" />
									<Switch
										checked={item.showInDesktop}
										onCheckedChange={(checked) =>
											toggleVisibility(item.id, 'showInDesktop', checked)}
										disabled={saving}
									/>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<button
				type="button"
				onclick={resetToDefaults}
				disabled={saving}
				class="border-border rounded-xl border px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
			>
				Reset to defaults
			</button>

			<!-- Section 2: Widget rotation (Slot A in desktop sidebar) -->
			<div class="border-border mt-8 border-t pt-8">
				<h2
					class="mb-3 px-1 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Widget rotation
				</h2>
				<p class="mb-4 px-1 text-xs text-[var(--color-text-tertiary)]">
					Choose which widgets appear in the desktop sidebar and their order. The first
					enabled widget is the default.
				</p>
				{#if widgetError}
					<div
						class="mb-4 rounded-xl border border-[var(--color-warm-coral)]/30 bg-[var(--color-warm-coral)]/8 px-4 py-3"
					>
						<p class="text-sm text-[var(--color-warm-coral)]">{widgetError}</p>
					</div>
				{/if}
				{#if widgetLoading}
					<div class="space-y-2">
						{#each [1, 2, 3] as _}
							<Skeleton
								class="h-14 w-full rounded-xl bg-[var(--color-bg-tertiary)]"
							/>
						{/each}
					</div>
				{:else}
					<div
						class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]"
					>
						<div class="divide-border divide-y">
							{#each enabledWidgetIds as id, index (`enabled-${id}`)}
								{@const meta = SIDEBAR_FOOTER_CARDS[id]}
								<div
									class="flex cursor-move items-center gap-3 px-4 py-3 transition-colors {widgetDragOverIndex ===
										index && widgetDraggedId
										? 'bg-[var(--color-amber-subtle)]'
										: 'hover:bg-[var(--color-bg-surface)]'}"
									draggable="true"
									ondragstart={(e) => widgetDragStart(e, id)}
									ondragover={(e) => widgetDragOver(e, index)}
									ondrop={(e) => widgetDrop(e, index)}
									ondragend={widgetDragEnd}
									role="listitem"
								>
									<GripVertical
										class="size-4 shrink-0 text-[var(--color-text-tertiary)]"
									/>
									<div class="min-w-0 flex-1">
										<p
											class="text-sm font-medium text-[var(--color-text-primary)]"
										>
											{meta.label}
										</p>
										<p class="text-xs text-[var(--color-text-tertiary)]">
											{meta.description}
										</p>
									</div>
									<Switch
										checked={true}
										onCheckedChange={(c) => setWidgetEnabled(id, !c)}
										disabled={widgetSaving}
										aria-label="Hide {meta.label} from sidebar"
									/>
								</div>
							{/each}
							{#each SIDEBAR_FOOTER_CARD_IDS.filter((id) => !enabledWidgetIds.includes(id)) as id (`disabled-${id}`)}
								{@const meta = SIDEBAR_FOOTER_CARDS[id]}
								<div
									class="flex items-center gap-3 px-4 py-3 opacity-50"
									role="listitem"
								>
									<span class="size-4 shrink-0"></span>
									<div class="min-w-0 flex-1">
										<p
											class="text-sm font-medium text-[var(--color-text-primary)]"
										>
											{meta.label}
										</p>
										<p class="text-xs text-[var(--color-text-tertiary)]">
											{meta.description}
										</p>
									</div>
									<Switch
										checked={false}
										onCheckedChange={(c) => setWidgetEnabled(id, c)}
										disabled={widgetSaving}
										aria-label="Show {meta.label} in sidebar"
									/>
								</div>
							{/each}
						</div>
					</div>
					<button
						type="button"
						onclick={resetWidgetsToDefaults}
						disabled={widgetSaving}
						class="border-border mt-4 rounded-xl border px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
					>
						Reset widgets to defaults
					</button>
				{/if}
			</div>
		{/if}
	</div>
</PageLayout>
