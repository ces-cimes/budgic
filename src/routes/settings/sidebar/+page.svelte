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
	import Header from '$lib/components/Header.svelte';
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
	<title>Sidebar | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header title="Sidebar" backButtonLabel="Back to settings" backButtonLink="/settings" />
	{/snippet}

	<div class="mx-auto max-w-2xl px-4 py-6 space-y-4">
		{#if error}
			<div class="rounded-xl border border-[var(--color-warm-coral)]/30 bg-[var(--color-warm-coral)]/8 px-4 py-3">
				<p class="text-sm text-[var(--color-warm-coral)]">{error}</p>
			</div>
		{/if}

		{#if isLoading}
			<div class="space-y-2">
				{#each [1,2,3] as _}
					<div class="h-14 animate-pulse rounded-xl bg-[var(--color-bg-tertiary)]"></div>
				{/each}
			</div>
		{:else}
			<div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] overflow-hidden">
				<div class="px-5 py-2.5 border-b border-border">
					<h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Footer info cards</h2>
					<p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">Toggle and drag to reorder. Only enabled cards appear in the sidebar.</p>
				</div>
				<div class="divide-y divide-border">
					<!-- Enabled cards in order (draggable) -->
					{#each enabledIds as id, index (`enabled-${id}`)}
						{@const meta = SIDEBAR_FOOTER_CARDS[id]}
						<div
							class="flex items-center gap-3 px-4 py-3 cursor-move transition-colors {dragOverIndex === index && draggedId ? 'bg-[var(--color-amber-subtle)]' : 'hover:bg-[var(--color-bg-surface)]'}"
							draggable="true"
							ondragstart={(e) => handleDragStart(e, id)}
							ondragover={(e) => handleDragOver(e, index)}
							ondrop={(e) => handleDrop(e, index)}
							ondragend={handleDragEnd}
							role="listitem"
						>
							<GripVertical class="size-4 shrink-0 text-[var(--color-text-tertiary)]" />
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-[var(--color-text-primary)]">{meta.label}</p>
								<p class="text-xs text-[var(--color-text-tertiary)]">{meta.description}</p>
							</div>
							<Switch
								checked={true}
								onCheckedChange={(c) => setEnabled(id, !c)}
								disabled={isSaving}
								aria-label="Hide {meta.label} from sidebar"
							/>
						</div>
					{/each}
					<!-- Disabled cards -->
					{#each SIDEBAR_FOOTER_CARD_IDS.filter((id) => !enabledIds.includes(id)) as id (`disabled-${id}`)}
						{@const meta = SIDEBAR_FOOTER_CARDS[id]}
						<div class="flex items-center gap-3 px-4 py-3 opacity-50" role="listitem">
							<span class="size-4 shrink-0"></span>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-[var(--color-text-primary)]">{meta.label}</p>
								<p class="text-xs text-[var(--color-text-tertiary)]">{meta.description}</p>
							</div>
							<Switch
								checked={false}
								onCheckedChange={(c) => setEnabled(id, c)}
								disabled={isSaving}
								aria-label="Show {meta.label} in sidebar"
							/>
						</div>
					{/each}
				</div>
			</div>

			<button
				type="button"
				onclick={resetToDefaults}
				disabled={isSaving}
				class="rounded-xl border border-border px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
			>
				Reset to defaults
			</button>
		{/if}
	</div>
</PageLayout>

