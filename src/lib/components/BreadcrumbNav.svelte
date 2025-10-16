<script lang="ts">
  import { page } from '$app/stores';
  import { ChevronRight, Home } from '@lucide/svelte';
  
  interface BreadcrumbItem {
    label: string;
    path: string;
    icon?: any;
  }
  
  let breadcrumbs = $derived(() => {
    const path = $page.url.pathname;
    const segments = path.split('/').filter(Boolean);
    
    const crumbs: BreadcrumbItem[] = [
      { label: 'Dashboard', path: '/', icon: Home }
    ];
    
    if (segments.length > 0) {
      const mainRoute = segments[0];
      const routeLabels: Record<string, string> = {
        'insights': 'Insights',
        'forecast': 'Forecast', 
        'budget': 'Budget',
        'transactions': 'Transactions',
        'accounts': 'Accounts',
        'settings': 'Settings'
      };
      
      crumbs.push({
        label: routeLabels[mainRoute] || mainRoute,
        path: `/${mainRoute}`,
        icon: null
      });
      
      if (segments.length > 1) {
        const subRoute = segments[1];
        const subRouteLabels: Record<string, string> = {
          'notifications': 'Notifications',
          'achievements': 'Achievements',
          'trends': 'Trends',
          'recommendations': 'Recommendations',
          'daily': 'Daily',
          'weekly': 'Weekly',
          'monthly': 'Monthly',
          'transfers': 'Transfers',
          'add': 'Add',
          'profile': 'Profile',
          'display': 'Display',
          'notifications': 'Notifications',
          'data': 'Data',
          'security': 'Security'
        };
        
        crumbs.push({
          label: subRouteLabels[subRoute] || subRoute,
          path: path,
          icon: null
        });
      }
    }
    
    return crumbs;
  });
</script>

{#if breadcrumbs.length > 1}
  <nav class="flex items-center space-x-2 text-sm text-muted-foreground mb-4 px-4">
    {#each breadcrumbs as crumb, index (crumb.path)}
      {#if index > 0}
        <ChevronRight class="w-4 h-4 flex-shrink-0" />
      {/if}
      
      <a
        href={crumb.path}
        class="flex items-center gap-1 hover:text-primary transition-colors
               {index === breadcrumbs.length - 1 ? 'text-primary font-medium' : ''}"
      >
        {#if crumb.icon}
          <crumb.icon class="w-4 h-4" />
        {/if}
        <span class="truncate">{crumb.label}</span>
      </a>
    {/each}
  </nav>
{/if}
