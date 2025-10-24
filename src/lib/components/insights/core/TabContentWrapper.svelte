<script lang="ts">
  import { onMount } from 'svelte';
  import type { TabConfig } from '../types.js';

  interface Props {
    tabs: TabConfig[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
    className?: string;
    class?: string;
    children: any;
  }

  const { tabs, activeTab, onTabChange, className = '', class: classProp = '', children }: Props = $props();

  // Enhanced swipe-aware state
  let swipeProgress = $state(0); // -1 to 1 (left/right progress)
  let isDragging = $state(false);
  let dragStartX = $state(0);
  let currentDragX = $state(0);
  let activeTabIndex = $derived(tabs.findIndex(tab => tab.id === activeTab));

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

  // Reference for content container
  let contentContainer: HTMLDivElement;

  // Enhanced swipe gesture functions

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
    const minGestureThreshold = 70; // pixels
    
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
</script>

<div 
  bind:this={contentContainer}
  class="overflow-hidden h-full {className} {classProp}"
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
>
  <!-- Swipe-aware content slider -->
  <div 
    class="tab-slider flex transition-transform duration-200 ease-out h-full"
    class:transition-none={isDragging}
    style="transform: {contentTransform}; width: {tabs.length * 100}%"
  >
    {@render children()}
  </div>
</div>

<style>
  .tab-slider {
    transform: translateZ(0); /* Force GPU acceleration */
    contain: layout style paint; /* Optimize rendering */
  }
</style>
