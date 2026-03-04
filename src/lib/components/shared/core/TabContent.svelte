<script lang="ts">
  import type { TabContentProps } from '../types.js';

  interface Props extends TabContentProps {
    tabs: any[]; // Array of tabs to infer count from
  }

  const { tabId, isActive, className = '', children, tabs }: Props = $props();
  
  // Automatically infer tab count from tabs array
  const tabCount = $derived(tabs.length);
</script>

<div 
  class="tab-panel flex-shrink-0 h-full {isActive ? 'tab-panel--active overflow-y-auto' : 'overflow-hidden'} {className}"
  style="width: {100 / tabCount}%"
>
  {@render children()}
</div>

<style>
  .tab-panel {
    contain: layout style paint; /* Optimize rendering */
    transition: opacity 120ms ease-out;
  }
  .tab-panel:not(.tab-panel--active) {
    opacity: 0;
    pointer-events: none;
  }
</style>
