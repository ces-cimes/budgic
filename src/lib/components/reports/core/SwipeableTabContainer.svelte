<script lang="ts">
	import type { SwipeableTabContainerProps, TabConfig } from '../types.js';
	import * as Tabs from '$lib/components/ui/tabs/index.ts';
	import { onMount } from 'svelte';

	interface Props extends SwipeableTabContainerProps {
		children: any;
	}

	const {
		tabs,
		activeTab,
		onTabChange,
		contentHeight = 'auto',
		className = '',
		children
	}: Props = $props();

	// Enhanced swipe-aware state
	let swipeProgress = $state(0); // -1 to 1 (left/right progress)
	let isDragging = $state(false);
	let dragStartX = $state(0);
	let currentDragX = $state(0);
	let activeTabIndex = $derived(tabs.findIndex((tab) => tab.id === activeTab));

	// Touch tracking for compatibility
	let touchStartX = $state(0);
	let touchStartY = $state(0);
	let touchEndX = $state(0);
	let touchEndY = $state(0);

	// Calculate transform based on swipe progress
	let contentTransform = $state('translateX(0%)');

	// Update transform when activeTab or swipeProgress changes
	$effect(() => {
		// Calculate base offset as percentage of viewport (divide by number of tabs)
		const baseOffset = (-activeTabIndex * 100) / tabs.length;

		// Calculate swipe offset as percentage of viewport (divide by number of tabs)
		const swipeOffset = (swipeProgress * 100) / tabs.length;

		contentTransform = `translateX(${baseOffset + swipeOffset}%)`;
	});

	// Reference for tab container scrolling
	let tabContainer: HTMLDivElement;
	let contentContainer: HTMLDivElement;

	// Dynamic height tracking
	let tabHeights = $state<Record<string, number>>({});
	let currentContentHeight = $state<'auto' | string | number>('auto');

	$effect.pre(() => {
		currentContentHeight = contentHeight;
	});

	// Enhanced swipe gesture functions
	function handleTouchStart(event: TouchEvent) {
		const touch = event.touches[0];
		dragStartX = touch.clientX;
		currentDragX = touch.clientX;
		isDragging = true;
		swipeProgress = 0;

		// Keep original touch tracking for compatibility
		touchStartX = touch.clientX;
		touchStartY = touch.clientY;
	}

	function handleTouchMove(event: TouchEvent) {
		if (!isDragging) return;

		const touch = event.touches[0];
		currentDragX = touch.clientX;

		// Calculate movement deltas
		const deltaX = currentDragX - dragStartX;
		const deltaY = touch.clientY - touchStartY;

		// Minimum gesture threshold to prevent accidental horizontal movement
		const minGestureThreshold = 20; // pixels

		// Only start horizontal movement if horizontal movement is significantly more than vertical
		if (Math.abs(deltaX) > minGestureThreshold && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
			// Calculate swipe progress relative to tab panel width
			const viewportWidth = window.innerWidth;
			swipeProgress = Math.max(-1, Math.min(1, deltaX / viewportWidth));
		} else {
			// Reset swipe progress if gesture is too small or more vertical than horizontal
			swipeProgress = 0;
		}

		// Keep original touch tracking for compatibility
		touchEndX = touch.clientX;
		touchEndY = touch.clientY;
	}

	function handleTouchEnd(event: TouchEvent) {
		if (!isDragging) return;

		isDragging = false;

		// Determine if we should switch tabs based on swipe threshold
		const threshold = 0.3;

		if (Math.abs(swipeProgress) > threshold) {
			// Switch to next/previous tab
			if (swipeProgress > 0) {
				// Swipe right - previous tab
				if (activeTabIndex > 0) {
					onTabChange(tabs[activeTabIndex - 1].id);
				}
			} else {
				// Swipe left - next tab
				if (activeTabIndex < tabs.length - 1) {
					onTabChange(tabs[activeTabIndex + 1].id);
				}
			}
		}

		// Reset swipe progress with smooth animation
		swipeProgress = 0;
	}

	function scrollActiveTabIntoView() {
		if (tabContainer) {
			// Try multiple selectors to find the active tab
			let activeTabElement = tabContainer.querySelector(`[data-state="active"]`) as HTMLElement;

			// Fallback: find by value attribute
			if (!activeTabElement) {
				activeTabElement = tabContainer.querySelector(`[value="${activeTab}"]`) as HTMLElement;
			}

			// Fallback: find by tab ID in the trigger
			if (!activeTabElement) {
				activeTabElement = tabContainer.querySelector(`[data-value="${activeTab}"]`) as HTMLElement;
			}

			if (activeTabElement) {
				// Use requestAnimationFrame to ensure DOM is updated
				requestAnimationFrame(() => {
					activeTabElement.scrollIntoView({
						behavior: 'smooth',
						block: 'nearest',
						inline: 'center'
					});
				});
			}
		}
	}

	function measureTabHeights() {
		if (contentContainer) {
			const tabPanels = contentContainer.querySelectorAll('.tab-panel');
			tabPanels.forEach((panel, index) => {
				const tabId = tabs[index]?.id;
				if (tabId && !tabHeights[tabId]) {
					// Only measure if not already measured
					// Use requestAnimationFrame to avoid layout thrashing
					requestAnimationFrame(() => {
						const contentHeight = panel.scrollHeight;
						tabHeights[tabId] = contentHeight;
					});
				}
			});
		}
	}

	// Auto-scroll active tab into view when activeTab changes
	$effect(() => {
		// Make this reactive to activeTab changes
		void activeTab;
		setTimeout(() => {
			scrollActiveTabIntoView();
		}, 50);
	});

	// Update content height when active tab changes
	$effect(() => {
		const height = tabHeights[activeTab];
		if (height) {
			currentContentHeight = `${height}px`;
		} else {
			currentContentHeight = contentHeight;
		}
	});

	onMount(() => {
		// Measure tab heights after content is loaded
		setTimeout(() => {
			measureTabHeights();
		}, 100);
	});
</script>

<div class="flex-1 overflow-hidden {className}">
	<Tabs.Root value={activeTab} onValueChange={onTabChange} class="w-full">
		<div
			bind:this={tabContainer}
			class="scrollbar-hide border-border overflow-x-auto border-t"
			style="scrollbar-width: none; -ms-overflow-style: none;"
		>
			<Tabs.List class="h-auto w-full justify-start rounded-none bg-transparent p-0">
				{#each tabs as tab (tab.id)}
					<Tabs.Trigger
						value={tab.id}
						class="hover:bg-secondary/20 data-[state=active]:border-primary flex items-center gap-2 rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-4 py-2 whitespace-nowrap transition-all data-[state=active]:bg-transparent data-[state=active]:shadow-none"
					>
						{#if tab.icon}
							<tab.icon class="h-4 w-4" />
						{/if}
						{tab.label}
					</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</div>
	</Tabs.Root>

	<div
		bind:this={contentContainer}
		class="overflow-hidden"
		ontouchstart={handleTouchStart}
		ontouchmove={handleTouchMove}
		ontouchend={handleTouchEnd}
		style="height: {currentContentHeight}"
	>
		<!-- Swipe-aware content slider -->
		<div
			class="tab-slider flex h-full transition-transform duration-200 ease-out"
			class:transition-none={isDragging}
			style="transform: {contentTransform}; width: {tabs.length * 100}%"
		>
			{@render children()}
		</div>
	</div>
</div>

<style>
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}

	.tab-slider {
		transform: translateZ(0); /* Force GPU acceleration */
		contain: layout style paint; /* Optimize rendering */
	}

	.tab-panel {
		contain: layout style paint; /* Optimize rendering */
	}
</style>
