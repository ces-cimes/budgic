<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { userService } from '$lib/core/services';
	import {
		SIDEBAR_FOOTER_CARDS,
		SIDEBAR_FOOTER_CARD_IDS,
		DEFAULT_SIDEBAR_FOOTER_CARDS,
		type SidebarFooterCardId
	} from '$lib/config/sidebar-footer-cards';
	import { PageLayout } from '$lib/components/layouts';
	import * as Card from '$lib/components/ui/card/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';
	import * as Alert from '$lib/components/ui/alert/index.ts';
	import { Switch } from '$lib/components/ui/switch/index.ts';
	import { toast } from 'svelte-sonner';
	import { GripVertical } from '@lucide/svelte';

	let isLoading = $state(true);
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	/** Ordered list of enabled card ids (what appears in the sidebar footer) */
	let enabledIds = $state<SidebarFooterCardId[]>([]);
	let draggedId = $state<SidebarFooterCardId | null>(null);
	let dragOverIndex = $state<number | null>(null);

	onMount(async () => {
		try {
			const prefs = await userService.getUserPreferences();
			const raw = prefs?.sidebarFooterCards;
			if (Array.isArray(raw) && raw.length > 0) {
				const valid = raw.filter((id): id is SidebarFooterCardId =>
					SIDEBAR_FOOTER_CARD_IDS.includes(id as SidebarFooterCardId)
				);
				// Deduplicate while preserving order (avoids each_key_duplicate)
				enabledIds = valid.filter((id, i, arr) => arr.indexOf(id) === i);
			} else {
				enabledIds = [...DEFAULT_SIDEBAR_FOOTER_CARDS];
			}
		} catch (err) {
			error = 'Failed to load sidebar settings';
			console.error(err);
		} finally {
			isLoading = false;
		}
	});

	function isEnabled(id: SidebarFooterCardId): boolean {
		return enabledIds.includes(id);
	}

	function setEnabled(id: SidebarFooterCardId, checked: boolean) {
		if (checked) {
			if (enabledIds.includes(id)) return;
			enabledIds = [...enabledIds, id];
		} else {
			enabledIds = enabledIds.filter((x) => x !== id);
		}
		saveOrder();
	}

	function moveCard(fromIndex: number, toIndex: number) {
		if (toIndex < 0 || toIndex >= enabledIds.length) return;
		const next = [...enabledIds];
		const [removed] = next.splice(fromIndex, 1);
		next.splice(toIndex, 0, removed);
		enabledIds = next;
		saveOrder();
	}

	async function saveOrder() {
		if (isSaving) return;
		isSaving = true;
		error = null;
		try {
			await userService.updateUserPreferences({ sidebarFooterCards: enabledIds });
			toast.success('Sidebar footer cards updated');
		} catch (err) {
			error = 'Failed to save';
			toast.error('Failed to save sidebar settings');
			console.error(err);
		} finally {
			isSaving = false;
		}
	}

	function handleDragStart(_e: DragEvent, id: SidebarFooterCardId) {
		draggedId = id;
	}

	function handleDragOver(e: DragEvent, index: number) {
		e.preventDefault();
		dragOverIndex = index;
	}

	function handleDragEnd() {
		draggedId = null;
		dragOverIndex = null;
	}

	async function handleDrop(e: DragEvent, targetIndex: number) {
		e.preventDefault();
		if (draggedId == null) return;
		const fromIndex = enabledIds.indexOf(draggedId);
		if (fromIndex === targetIndex) {
			draggedId = null;
			dragOverIndex = null;
			return;
		}
		const next = [...enabledIds];
		const [removed] = next.splice(fromIndex, 1);
		next.splice(targetIndex, 0, removed);
		enabledIds = next;
		draggedId = null;
		dragOverIndex = null;
		await saveOrder();
	}

	function resetToDefaults() {
		enabledIds = [...DEFAULT_SIDEBAR_FOOTER_CARDS];
		saveOrder();
	}
</script>

<svelte:head>
	<title>Sidebar | Settings | Budgic</title>
</svelte:head>

<PageLayout>
	<div class="container mx-auto max-w-2xl px-4 py-6">
		<header class="mb-6">
			<Button.Root variant="ghost" size="sm" onclick={() => goto('/settings')}>
				← Back to Settings
			</Button.Root>
			<h1 class="mt-2 text-2xl font-bold text-primary">Sidebar</h1>
			<p class="text-muted-foreground text-sm">
				Choose which info cards appear in the desktop sidebar footer (above Settings)
			</p>
		</header>

		{#if error}
			<Alert.Root variant="destructive" class="mb-4">
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}

		{#if isLoading}
			<div class="text-muted-foreground py-8 text-center">Loading…</div>
		{:else}
			<Card.Root>
				<Card.Header>
					<Card.Title>Footer info cards</Card.Title>
					<Card.Description>
						Toggle cards on or off and drag to reorder. Only enabled cards are shown in the sidebar.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-3">
					<!-- Enabled cards in order (draggable) -->
					{#each enabledIds as id, index (`enabled-${id}`)}
						{@const meta = SIDEBAR_FOOTER_CARDS[id]}
						<div
							class="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 {dragOverIndex === index && draggedId
								? 'border-primary ring-1 ring-primary/30'
								: ''}"
							draggable="true"
							ondragstart={(e) => handleDragStart(e, id)}
							ondragover={(e) => handleDragOver(e, index)}
							ondrop={(e) => handleDrop(e, index)}
							ondragend={handleDragEnd}
							role="listitem"
						>
							<GripVertical class="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
							<div class="min-w-0 flex-1">
								<div class="font-medium text-primary">{meta.label}</div>
								<div class="text-muted-foreground text-xs">{meta.description}</div>
							</div>
							<Switch
								checked={true}
								onCheckedChange={(c) => setEnabled(id, !c)}
								disabled={isSaving}
								aria-label="Hide {meta.label} from sidebar"
							/>
						</div>
					{/each}
					<!-- Disabled cards (can be enabled) -->
					{#each SIDEBAR_FOOTER_CARD_IDS.filter((id) => !enabledIds.includes(id)) as id (`disabled-${id}`)}
						{@const meta = SIDEBAR_FOOTER_CARDS[id]}
						<div class="flex items-center gap-3 rounded-lg border border-border border-dashed bg-muted/10 p-3 opacity-80" role="listitem">
							<span class="size-4 shrink-0"></span>
							<div class="min-w-0 flex-1">
								<div class="font-medium text-primary">{meta.label}</div>
								<div class="text-muted-foreground text-xs">{meta.description}</div>
							</div>
							<Switch
								checked={false}
								onCheckedChange={(c) => setEnabled(id, c)}
								disabled={isSaving}
								aria-label="Show {meta.label} in sidebar"
							/>
						</div>
					{/each}
				</Card.Content>
				<Card.Footer class="flex justify-end gap-2">
					<Button.Root variant="outline" onclick={resetToDefaults} disabled={isSaving}>
						Reset to defaults
					</Button.Root>
				</Card.Footer>
			</Card.Root>
		{/if}
	</div>
</PageLayout>
