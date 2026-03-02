<script lang="ts">
	import { onMount } from 'svelte';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';
	import { Switch } from '$lib/components/ui/switch/index.ts';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { toast } from 'svelte-sonner';
	
	// Lucide icons
	import { HomeIcon, ReceiptIcon, TargetIcon, WalletIcon, TrendingUpIcon, CalendarIcon, BellIcon, SettingsIcon, CreditCardIcon, GripVertical, Smartphone, Monitor } from '@lucide/svelte';

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

	let items = $state<any[]>([]);
	let loading = $state(true);
	let saving = $state(false);

	// Drag and drop state
	let draggedItem = $state<any | null>(null);
	let dragOverIndex = $state<number | null>(null);

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

		const draggedIndex = items.findIndex(item => item.id === draggedItem.id);
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
			toast.success('Navigation order updated successfully');
		} catch (error) {
			toast.error('Failed to update navigation order');
			console.error(error);
			await loadItems(); // Reload on error
		}

		draggedItem = null;
		dragOverIndex = null;
	}

	async function toggleVisibility(itemId: string, field: 'showInMobile' | 'showInDesktop', value: boolean) {
		saving = true;
		try {
			await navigationStore.updateItemVisibility(itemId, { [field]: value });
			await loadItems();
			toast.success('Visibility updated successfully');
		} catch (error) {
			toast.error('Failed to update visibility');
			console.error(error);
		} finally {
			saving = false;
		}
	}

	async function resetToDefaults() {
		if (!confirm('Are you sure you want to reset navigation to default settings? This cannot be undone.')) {
			return;
		}

		saving = true;
		try {
			await navigationStore.resetToDefaults();
			await loadItems();
			toast.success('Navigation reset to defaults successfully');
		} catch (error) {
			toast.error('Failed to reset navigation');
			console.error(error);
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		loadItems();
	});
</script>

<svelte:head>
	<title>Navigation | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header title="Navigation" backButtonLabel="Back to settings" backButtonLink="/settings" />
	{/snippet}

	<div class="mx-auto max-w-2xl px-4 py-6 space-y-4">
		<div class="rounded-xl border border-[var(--color-amber)]/20 bg-[var(--color-amber-subtle)] px-4 py-3">
			<p class="text-xs text-[var(--color-text-secondary)]">
				Drag items to reorder. The first 4 visible items appear in the mobile bar; the rest are in the "More" menu.
			</p>
		</div>

		{#if loading}
			<div class="space-y-2">
				{#each [1,2,3,4,5] as _}
					<div class="h-16 animate-pulse rounded-xl bg-[var(--color-bg-tertiary)]"></div>
				{/each}
			</div>
		{:else}
			<div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] overflow-hidden">
				<div class="px-5 py-2.5 border-b border-border">
					<h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Navigation items</h2>
				</div>
				<div class="divide-y divide-border">
					{#each items as item, index (item.id)}
						{@const IconComponent = iconMap[item.icon] || HomeIcon}
						<div
							role="listitem"
							draggable="true"
							ondragstart={(e) => handleDragStart(e, item)}
							ondragover={(e) => handleDragOver(e, index)}
							ondrop={(e) => handleDrop(e, index)}
							ondragend={handleDragEnd}
							class="flex items-center gap-3 px-4 py-3 cursor-move transition-colors {dragOverIndex === index ? 'bg-[var(--color-amber-subtle)]' : 'hover:bg-[var(--color-bg-surface)]'}"
						>
							<GripVertical class="size-4 shrink-0 text-[var(--color-text-tertiary)]" />
							<div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-surface)]">
								<IconComponent class="size-4 text-[var(--color-text-secondary)]" />
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium text-[var(--color-text-primary)]">{item.label}</p>
								<p class="text-xs text-[var(--color-text-tertiary)] truncate">{item.path}</p>
							</div>
							<div class="flex items-center gap-3 shrink-0">
								<div class="flex items-center gap-1.5" title="Mobile">
									<Smartphone class="size-3.5 text-[var(--color-text-tertiary)]" />
									<Switch
										checked={item.showInMobile}
										onCheckedChange={(checked) => toggleVisibility(item.id, 'showInMobile', checked)}
										disabled={saving}
									/>
								</div>
								<div class="flex items-center gap-1.5" title="Desktop">
									<Monitor class="size-3.5 text-[var(--color-text-tertiary)]" />
									<Switch
										checked={item.showInDesktop}
										onCheckedChange={(checked) => toggleVisibility(item.id, 'showInDesktop', checked)}
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
				class="rounded-xl border border-border px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
			>
				Reset to defaults
			</button>
		{/if}
	</div>
</PageLayout>


