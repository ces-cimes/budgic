<script lang="ts">
  import { page } from '$app/stores';
  import { ChevronLeft, ChevronRight } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { Tabs, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
  
  interface TabItem {
    id: string;
    label: string;
    path: string;
    icon?: any;
  }
  
  interface Props {
    tabs: TabItem[];
    className?: string;
  }
  
  let { tabs, className = '' }: Props = $props();
  
  let activeTab = $derived(() => {
    const currentPath = $page.url.pathname;
    return tabs.find(tab => currentPath === tab.path)?.id || tabs[0]?.id;
  });
  
  let scrollContainer: HTMLElement;
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  
  function checkScrollability() {
    if (!scrollContainer) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
    canScrollLeft = scrollLeft > 0;
    canScrollRight = scrollLeft < scrollWidth - clientWidth - 1;
  }
  
  function scrollLeft() {
    if (scrollContainer) {
      scrollContainer.scrollBy({ left: -200, behavior: 'smooth' });
    }
  }
  
  function scrollRight() {
    if (scrollContainer) {
      scrollContainer.scrollBy({ left: 200, behavior: 'smooth' });
    }
  }
  
  function handleTabChange(value: string) {
    const tab = tabs.find(t => t.id === value);
    if (tab) {
      goto(tab.path);
    }
  }
  
  $effect(() => {
    if (scrollContainer) {
      checkScrollability();
      scrollContainer.addEventListener('scroll', checkScrollability);
      return () => scrollContainer.removeEventListener('scroll', checkScrollability);
    }
  });
</script>

<div class="relative {className}">
  <!-- Scroll buttons for mobile -->
  <div class="flex items-center justify-between mb-2 md:hidden">
    <button
      onclick={scrollLeft}
      disabled={!canScrollLeft}
      class="p-2 rounded-lg bg-accent/50 hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <ChevronLeft class="w-4 h-4" />
    </button>
    
    <button
      onclick={scrollRight}
      disabled={!canScrollRight}
      class="p-2 rounded-lg bg-accent/50 hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <ChevronRight class="w-4 h-4" />
    </button>
  </div>
  
  <!-- Tab navigation using shadcn tabs -->
  <Tabs value={activeTab()} onValueChange={handleTabChange}>
    <TabsList 
      bind:this={scrollContainer}
      class="w-full justify-start overflow-x-auto scrollbar-hide bg-transparent p-0 h-auto border-b border-border rounded-none"
      style="scrollbar-width: none; -ms-overflow-style: none;"
    >
      {#each tabs as tab (tab.id)}
        <TabsTrigger 
          value={tab.id}
          class="flex items-center gap-2 px-4 py-4 border-b-2 border-transparent rounded-none bg-transparent hover:bg-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none whitespace-nowrap"
        >
          {#if tab.icon}
            <tab.icon class="w-4 h-4" />
          {/if}
          {tab.label}
        </TabsTrigger>
      {/each}
    </TabsList>
  </Tabs>
</div>

<style>
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
