<script lang="ts">
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
  import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';

  interface Props {
    children: any;
    topBar?: any;
    bottomBar?: any;
    className?: string;
    contentClassName?: string;
  }

  const { 
    children, 
    topBar = null,
    bottomBar = null,
    className = '',
    contentClassName = ''
  }: Props = $props();

  const sidebar = Sidebar.useSidebar();
  let isMobile = new IsMobile();
  
  // Calculate dynamic heights
  let topBarHeight = $state(0);
  let bottomBarHeight = $state(0);
  
  // Derived total height for reactive calculations
  let totalBarHeight = $derived(topBarHeight + bottomBarHeight);
  
  // Measure heights using ResizeObserver for better reactivity
  $effect(() => {
    let topObserver: ResizeObserver | null = null;
    let bottomObserver: ResizeObserver | null = null;
    
    // Top bar observer
    if (topBar) {
      requestAnimationFrame(() => {
        const topBarElement = document.querySelector('[data-page-top-bar]') as HTMLElement;
        if (topBarElement) {
          topBarHeight = topBarElement.offsetHeight;
          
          topObserver = new ResizeObserver(() => {
            topBarHeight = topBarElement.offsetHeight;
          });
          topObserver.observe(topBarElement);
        }
      });
    } else {
      topBarHeight = 0;
    }
    
    // Bottom bar observer
    if (bottomBar) {
      requestAnimationFrame(() => {
        const bottomBarElement = document.querySelector('[data-page-bottom-bar]') as HTMLElement;
        if (bottomBarElement) {
          bottomBarHeight = bottomBarElement.offsetHeight;
          
          bottomObserver = new ResizeObserver(() => {
            bottomBarHeight = bottomBarElement.offsetHeight;
          });
          bottomObserver.observe(bottomBarElement);
        }
      });
    } else {
      bottomBarHeight = 0;
    }
    
    // Cleanup function
    return () => {
      topObserver?.disconnect();
      bottomObserver?.disconnect();
    };
  });
</script>

<article class="flex flex-col h-full overflow-hidden {className}">
  <!-- Top Bar (if provided) -->
  {#if topBar}
    <header 
      data-page-top-bar
      class="sticky z-40 bg-(--color-bg-secondary)
        top-0 left-0 right-0
      "
    >
      {@render topBar()}
    </header>
  {/if}

  <!-- Main Content Area -->
  <section 
    class="relative top-0 flex-1 h-full overflow-visible bg-[var(--color-bg-primary)] {contentClassName}"
    style="padding-bottom: {totalBarHeight - bottomBarHeight}px;"
  >
    <div 
      class="h-full overflow-auto"
      style="padding-bottom: {bottomBarHeight}px;"
    >
      {@render children()}
    </div>
  </section>

  <!-- Bottom Bar (if provided) -->
  {#if bottomBar}
    <footer 
      data-page-bottom-bar
      class="sticky z-40
        bottom-0 left-0 right-0 md:ml-64
        p-2 border-t border-border rounded-xl
        bg-gradient-to-b from-(--color-bg-primary)/50 to-(--color-bg-primary) backdrop-blur-sm
      "
    >
      {@render bottomBar()}
    </footer>
  {/if}
</article>
