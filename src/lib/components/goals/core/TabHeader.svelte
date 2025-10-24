<script lang="ts">
  import * as Tabs from '$lib/components/ui/tabs/index.ts';
  import type { TabConfig } from '../types.js';

  interface Props {
    tabs: TabConfig[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
    className?: string;
  }

  const { tabs, activeTab, onTabChange, className = '' }: Props = $props();

  let tabContainer: HTMLDivElement;

  function handleWheelScroll(event: WheelEvent) {
    // Prevent default vertical scrolling
    event.preventDefault();
    
    // Convert vertical scroll to horizontal scroll with reduced sensitivity
    if (tabContainer) {
      tabContainer.scrollLeft += event.deltaY * 0.5;
    }
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

  // Auto-scroll active tab into view when activeTab changes
  $effect(() => {
    // Make this reactive to activeTab changes
    activeTab; // This makes the effect reactive to activeTab
    setTimeout(() => {
      scrollActiveTabIntoView();
    }, 50);
  });
</script>

<Tabs.Root value={activeTab} onValueChange={onTabChange} class="w-full">
  <div 
    bind:this={tabContainer}
    class="overflow-x-auto scrollbar-hide border-t border-border {className}"
    style="scrollbar-width: none; -ms-overflow-style: none;"
    onwheel={handleWheelScroll}
  >
    <Tabs.List class="w-full justify-start bg-transparent p-0 h-auto rounded-none">
      {#each tabs as tab (tab.id)}
        <Tabs.Trigger 
          value={tab.id}
          class="flex items-center gap-2 px-4 py-2 border-x-0 border-t-0 border-b-2 border-transparent rounded-none bg-transparent hover:bg-secondary/20 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none whitespace-nowrap transition-all"
        >
          {#if tab.icon}
            <tab.icon class="w-4 h-4" />
          {/if}
          {tab.label}
        </Tabs.Trigger>
      {/each}
    </Tabs.List>
  </div>
</Tabs.Root>

<style>
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>