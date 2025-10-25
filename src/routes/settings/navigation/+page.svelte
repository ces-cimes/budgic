<script lang="ts">
	import { onMount } from 'svelte';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Switch } from '$lib/components/ui/switch/index.ts';
	import { 
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card/index.ts';
	import * as Alert from '$lib/components/ui/alert/index.ts';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { PageLayout } from '$lib/components/layouts';
	import { toast } from 'svelte-sonner';
	
	// Lucide icons
	import { HomeIcon, ReceiptIcon, TargetIcon, WalletIcon, TrendingUpIcon, CalendarIcon, BellIcon, SettingsIcon, CreditCardIcon, GripVerticalIcon, InfoIcon, SmartphoneIcon, MonitorIcon } from '@lucide/svelte';

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
	<title>Navigation Settings | Budgic</title>
</svelte:head>

<PageLayout>
	<div class="container max-w-4xl mx-auto p-4 space-y-6">
		<div class="space-y-2">
			<h1 class="text-3xl font-bold text-[var(--color-text-primary)]">Navigation Settings</h1>
			<p class="text-[var(--color-text-secondary)]">
				Customize the order and visibility of navigation items for desktop and mobile
			</p>
		</div>

		<Alert.Root>
			<InfoIcon class="h-4 w-4" />
			<Alert.Title>Pro Tip</Alert.Title>
			<Alert.Description>
				Drag and drop items to reorder them. Both desktop and mobile navigation use the same order - the first 4 items appear in the mobile main bar, with the rest accessible via the "More" button.
			</Alert.Description>
		</Alert.Root>

		{#if loading}
			<div class="flex items-center justify-center py-12">
				<LoadingSpinner />
			</div>
		{:else}
			<Card class="border border-[var(--color-border)]">
				<CardHeader>
					<CardTitle>Navigation Items</CardTitle>
					<CardDescription>
						Customize which navigation items appear and in what order
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="space-y-2">
						{#each items as item, index (item.id)}
							{@const IconComponent = iconMap[item.icon] || HomeIcon}
							<div
								role="listitem"
								draggable="true"
								ondragstart={(e) => handleDragStart(e, item)}
								ondragover={(e) => handleDragOver(e, index)}
								ondrop={(e) => handleDrop(e, index)}
								ondragend={handleDragEnd}
								class="flex items-center gap-3 p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] transition-all
									{dragOverIndex === index ? 'border-[var(--color-golden-amber)] bg-[var(--color-bg-tertiary)]' : ''}
									hover:border-[var(--color-border-hover)] cursor-move"
							>
								<GripVerticalIcon class="w-5 h-5 text-[var(--color-text-tertiary)] flex-shrink-0" />
								
								<div class="flex items-center gap-3 flex-1">
									<IconComponent class="w-5 h-5 text-[var(--color-text-secondary)] flex-shrink-0" />
									<div class="flex-1">
										<div class="font-medium text-[var(--color-text-primary)]">
											{item.label}
										</div>
										<div class="text-xs text-[var(--color-text-tertiary)]">{item.path}</div>
									</div>
								</div>

								<div class="flex flex-col gap-2 flex-shrink-0">
									<!-- Mobile toggle -->
									<div class="flex items-center gap-1" title="Show on Mobile">
										<SmartphoneIcon class="w-4 h-4 text-[var(--color-text-secondary)]" />
										<Switch 
											checked={item.showInMobile}
											onCheckedChange={(checked) => toggleVisibility(item.id, 'showInMobile', checked)}
											disabled={saving}
										/>
									</div>

									<!-- Desktop toggle -->
									<div class="flex items-center gap-1" title="Show on Desktop">
										<MonitorIcon class="w-4 h-4 text-[var(--color-text-secondary)]" />
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
				</CardContent>
				<CardFooter class="flex justify-end gap-2">
					<Button 
						variant="outline" 
						onclick={resetToDefaults}
						disabled={saving}
					>
						Reset to Defaults
					</Button>
					<Button 
						onclick={() => navigationStore.refresh()}
						disabled={saving}
					>
						{saving ? 'Saving...' : 'Refresh'}
					</Button>
				</CardFooter>
			</Card>
		{/if}
	</div>
</PageLayout>

