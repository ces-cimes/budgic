<script lang="ts">
  import { page } from '$app/stores';
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
  
  // Lucide icons
  import SunIcon from '@lucide/svelte/icons/sun';
  import SquarePenIcon from '@lucide/svelte/icons/square-pen';
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
  import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
  import SlidersIcon from '@lucide/svelte/icons/sliders';
  import TagIcon from '@lucide/svelte/icons/tag';

  const navItems = [
    { path: '/', label: 'Today', icon: SunIcon },
    { path: '/transactions', label: 'Trans.', icon: SquarePenIcon },
    { path: '/categories', label: 'Categories', icon: TagIcon },
    { path: '/plan', label: 'Plan', icon: CalendarDaysIcon },
    { path: '/insights', label: 'Insights', icon: ChartPieIcon },
    { path: '/settings', label: 'Settings', icon: SlidersIcon }
  ];

  function isActive(path: string) {
    return $page.url.pathname === path;
  }
</script>

<nav class="p-1 flex justify-between sm:justify-center bg-linear-to-b from-(--color-bg-primary)/50 to-(--color-bg-primary)  backdrop-blur-xs border-t border-border rounded-t-2xl">
  <div class="flex w-full justify-between md:gap-8">
    {#each navItems as item (item.label)}
      <a
        href={item.path} 
        class="flex flex-col items-center p-2 flex-1 max-w-[16%] border-1 border-transparent rounded-xl hover:bg-(--color-bg-tertiary)/50 hover:border-border transition-all duration-150 {isActive(item.path) ? 'text-(--color-golden-amber) font-semibold' : 'text-(--color-text-secondary) tracking-tight'}"
      >
        <item.icon class="size-6 drop-shadow-lg"/>
        <p class="text-xs whitespace-nowrap text-shadow-lg">{item.label}</p>
      </a>
    {/each}
  </div>
</nav>
