<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { userService } from '$lib/core/services';
	import { SIDEBAR_FOOTER_CARD_IDS, type SidebarFooterCardId } from '$lib/config/sidebar-footer-cards';
	import SidebarFooterCardTotalBalance from './SidebarFooterCardTotalBalance.svelte';
	import SidebarFooterCardTodayAllowance from './SidebarFooterCardTodayAllowance.svelte';
	import { ChevronLeft, ChevronRight, CreditCard, Wallet } from '@lucide/svelte';
	import type { Component } from 'svelte';

	const CARD_HREF: Record<SidebarFooterCardId, string> = {
		total_balance: '/accounts',
		today_allowance: '/plan?tab=allowance'
	};

	const CARD_ICON: Record<SidebarFooterCardId, Component> = {
		total_balance: CreditCard,
		today_allowance: Wallet
	};

	const CARD_LABEL: Record<SidebarFooterCardId, string> = {
		total_balance: 'Total balance',
		today_allowance: "Today's allowance"
	};

	let cardIds = $state<SidebarFooterCardId[]>([]);
	let loading = $state(true);
	let currentIndex = $state(0);

	let wrapperEl = $state<HTMLDivElement | null>(null);

	/**
	 * Switch to a new widget:
	 *  1. Lock wrapper height so it doesn't jump during DOM change
	 *  2. Update currentIndex (Svelte re-renders synchronously on next tick)
	 *  3. Animate to the new natural scrollHeight
	 *  4. onTransitionEnd resets back to `height: auto`
	 */
	async function switchTo(newIndex: number) {
		if (newIndex === currentIndex || !wrapperEl) return;
		wrapperEl.style.height = wrapperEl.offsetHeight + 'px';
		currentIndex = newIndex;
		await tick();
		requestAnimationFrame(() => {
			if (wrapperEl) wrapperEl.style.height = wrapperEl.scrollHeight + 'px';
		});
	}

	function onTransitionEnd(e: TransitionEvent) {
		if (e.propertyName === 'height' && wrapperEl) {
			wrapperEl.style.height = 'auto';
		}
	}

	onMount(async () => {
		try {
			const prefs = await userService.getUserPreferences();
			const raw = prefs?.sidebarFooterCards;
			if (Array.isArray(raw) && raw.length > 0) {
				cardIds = raw.filter((id): id is SidebarFooterCardId =>
					SIDEBAR_FOOTER_CARD_IDS.includes(id as SidebarFooterCardId)
				);
			} else {
				cardIds = ['total_balance', 'today_allowance'];
			}
		} catch {
			cardIds = ['total_balance', 'today_allowance'];
		} finally {
			loading = false;
		}
	});

	$effect(() => {
		if (cardIds.length > 0 && currentIndex >= cardIds.length) currentIndex = 0;
	});

	const multiWidget = $derived(cardIds.length > 1);
	const currentCardId = $derived(cardIds[currentIndex] ?? cardIds[0]);

	function goPrev(e: Event) {
		e.preventDefault();
		e.stopPropagation();
		switchTo((currentIndex - 1 + cardIds.length) % cardIds.length);
	}
	function goNext(e: Event) {
		e.preventDefault();
		e.stopPropagation();
		switchTo((currentIndex + 1) % cardIds.length);
	}

	let touchStartX = 0;
	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0]?.clientX ?? 0;
	}
	function handleTouchEnd(e: TouchEvent) {
		const diff = touchStartX - (e.changedTouches[0]?.clientX ?? 0);
		if (Math.abs(diff) < 30) return;
		if (diff > 0) goNext(e as unknown as Event);
		else goPrev(e as unknown as Event);
	}
</script>

{#if !loading && cardIds.length > 0}
	{@const CurrentIcon = CARD_ICON[currentCardId]}
	<div
		class="px-2 group-data-[collapsible=icon]:px-1.5"
		role="region"
		aria-label="Sidebar widget"
		ontouchstart={handleTouchStart}
		ontouchend={handleTouchEnd}
	>
		<!--
			COLLAPSED (icon-only, 60px sidebar):
			Single icon button, amber, taps to widget destination.
		-->
		<a
			href={CARD_HREF[currentCardId]}
			title={CARD_LABEL[currentCardId]}
			class="hidden group-data-[collapsible=icon]:flex items-center justify-center
				size-9 mx-auto rounded-xl glass
				text-[var(--color-amber)] hover:text-[var(--color-amber)]
				hover:bg-[var(--color-amber-subtle)] transition-colors
				focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)]"
		>
			<CurrentIcon class="size-4" />
		</a>

		<!--
			EXPANDED (full widget):
			· Stacked overlay: all cards mounted (preloaded), only active is in flow.
			  Inactive cards are absolute (out of flow) + opacity-0 → natural height, cross-fade.
			· Arrows: absolute, span full card height (content + dots). w-7 each.
			  Hidden (opacity-0) when only one widget so no padding is wasted.
			· Dots: in flow below active card, pill-shaped active indicator.
			· Height animation: lock → tick → scrollHeight → release to auto.
		-->
		<div
			bind:this={wrapperEl}
			class="glass rounded-xl relative overflow-hidden group-data-[collapsible=icon]:hidden"
			style="transition: height 200ms ease-out;"
			ontransitionend={onTransitionEnd}
		>
			<!-- Widget slots -->
			{#each cardIds as cardId, i (cardId)}
				<div
					class="left-0 right-0 top-0 transition-opacity duration-150 ease-out"
					class:relative={i === currentIndex}
					class:z-10={i === currentIndex}
					class:absolute={i !== currentIndex}
					class:opacity-0={i !== currentIndex}
					class:pointer-events-none={i !== currentIndex}
				>
					<!--
						Full-width, full-height link: padded px-7 to clear arrow buttons.
						Clicking anywhere in this area navigates to the widget destination.
					-->
					<a
						href={CARD_HREF[cardId]}
						class="flex w-full px-7 pt-3 transition-colors
							hover:bg-[var(--color-bg-surface)]/20
							focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-amber)]
							{multiWidget ? 'pb-6' : 'pb-3'}"
					>
						{#if cardId === 'total_balance'}
							<SidebarFooterCardTotalBalance embedded />
						{:else if cardId === 'today_allowance'}
							<SidebarFooterCardTodayAllowance embedded />
						{/if}
					</a>
				</div>
			{/each}

			<!-- Dot indicators: absolute at the bottom, z-20, never affect card height -->
			{#if multiWidget}
				<div class="absolute bottom-0 left-0 right-0 z-20 flex justify-center gap-1.5 pb-1.5 pointer-events-none">
					{#each cardIds as _, i}
						<button
							type="button"
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								switchTo(i);
							}}
							class="h-1 rounded-full transition-all duration-200 focus:outline-none pointer-events-auto
								{i === currentIndex
									? 'w-4 bg-[var(--color-amber)]'
									: 'w-1 bg-[var(--color-text-tertiary)]/40 hover:bg-[var(--color-text-tertiary)]/70'}"
							aria-label="Widget {i + 1}"
						></button>
					{/each}
				</div>
			{/if}

			<!--
				Arrow buttons: absolute, span full card height (top-0 bottom-0), z-30.
				opacity-0 when single widget (no padding lost, arrows just invisible).
				Narrow (w-7 = 28px) — matches px-7 padding on content links.
			-->
			<button
				type="button"
				onclick={goPrev}
				aria-label="Previous widget"
				class="absolute left-0 top-0 bottom-0 z-30 w-7 flex items-center justify-center
					rounded-l-xl transition-all duration-150
					text-[var(--color-text-tertiary)]/60 hover:text-[var(--color-text-secondary)]
					hover:bg-[var(--color-bg-surface)]/30 active:bg-[var(--color-bg-surface)]/50
					focus:outline-none
					{multiWidget ? 'opacity-100' : 'opacity-0 pointer-events-none'}"
			>
				<ChevronLeft class="size-3.5" />
			</button>
			<button
				type="button"
				onclick={goNext}
				aria-label="Next widget"
				class="absolute right-0 top-0 bottom-0 z-30 w-7 flex items-center justify-center
					rounded-r-xl transition-all duration-150
					text-[var(--color-text-tertiary)]/60 hover:text-[var(--color-text-secondary)]
					hover:bg-[var(--color-bg-surface)]/30 active:bg-[var(--color-bg-surface)]/50
					focus:outline-none
					{multiWidget ? 'opacity-100' : 'opacity-0 pointer-events-none'}"
			>
				<ChevronRight class="size-3.5" />
			</button>
		</div>
	</div>
{/if}
