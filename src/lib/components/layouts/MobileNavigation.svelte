<script lang="ts">
  import { page } from '$app/stores';
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
  
  // Lucide icons
  import { BarChart3Icon, HomeIcon, ReceiptIcon, CalendarIcon, BellIcon, TargetIcon } from '@lucide/svelte';

  const navItems = [
    { path: '/', label: 'Dashboard', icon: HomeIcon, hasSubRoutes: false },
    { path: '/transactions', label: 'Transactions', icon: ReceiptIcon, hasSubRoutes: false },
    { path: '/categories', label: 'Categories', icon: TargetIcon, hasSubRoutes: true },
    { path: '/forecast', label: 'Forecast', icon: CalendarIcon, hasSubRoutes: true },
    { path: '/analyze', label: 'Analyze', icon: BarChart3Icon, hasSubRoutes: true }
  ];

  function isActive(path: string) {
    const currentPath = $page.url.pathname;
    
    // Exact match
    if (currentPath === path) return true;
    
    // Sub-route match (e.g., /insights/alerts should highlight /insights)
    if (currentPath.startsWith(path + '/')) return true;
    
    return false;
  }
</script>

<nav class="p-1 flex justify-between sm:justify-center bg-transparent backdrop-blur-xs border-t border-border rounded-t-2xl">
  <div class="flex w-full justify-between gap-1">
    {#each navItems as item (item.label)}
      <a
        href={item.path} 
        class="flex flex-col items-center justify-center p-2 flex-1 min-h-[60px] min-w-[60px] border-1 border-transparent rounded-xl hover:bg-(--color-bg-tertiary)/50 hover:border-border transition-all duration-150 {isActive(item.path) ? 'text-(--color-golden-amber) font-semibold' : 'text-(--color-text-secondary) tracking-tight'} relative"
      >
        <div class="relative">
          <item.icon class="size-6 drop-shadow-lg"/>
          {#if item.hasSubRoutes && isActive(item.path)}
            <div class="absolute -top-1 -right-1 w-2 h-2 bg-(--color-golden-amber) rounded-full"></div>
          {/if}
        </div>
        <p class="text-xs whitespace-nowrap text-shadow-lg">{item.label}</p>
      </a>
    {/each}
  </div>
</nav>
