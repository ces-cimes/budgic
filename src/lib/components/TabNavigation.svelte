<script lang="ts">
  import { page } from '$app/stores';
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
  
  function handleTabChange(value: string) {
    const tab = tabs.find(t => t.id === value);
    if (tab) {
      goto(tab.path);
    }
  }
</script>

<Tabs value={activeTab()} onValueChange={handleTabChange} class="relative {className}">
  <div 
    class="overflow-x-auto scrollbar-hide border-b border-border"
    style="scrollbar-width: none; -ms-overflow-style: none;"
  >
    <TabsList 
      class="w-full justify-start bg-transparent p-0 h-auto rounded-none"
    >
      {#each tabs as tab (tab.id)}
        <TabsTrigger 
          value={tab.id}
          class="flex items-center gap-2 px-4 py-2 border-x-0 border-t-0 border-b-2 border-transparent rounded-none bg-transparent hover:bg-secondary/20 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none whitespace-nowrap transition-all "
        >
          {#if tab.icon}
            <tab.icon class="w-4 h-4" />
          {/if}
          {tab.label}
        </TabsTrigger>
      {/each}
    </TabsList>
  </div>
</Tabs>

<style>
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
