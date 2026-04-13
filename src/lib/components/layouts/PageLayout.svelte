<script lang="ts">
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

  let bottomBarHeight = $state(0);

  $effect(() => {
    let bottomObserver: ResizeObserver | null = null;

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

    return () => {
      bottomObserver?.disconnect();
    };
  });
</script>

<article class="flex min-h-0 flex-col h-full overflow-hidden {className}">
  <!-- Top Bar (if provided) -->
  {#if topBar}
    <header 
      data-page-top-bar
      class="sticky z-40
        top-0 left-0 right-0
      "
    >
      {@render topBar()}
    </header>
  {/if}

  <!-- Main Content Area -->
  <section 
    class="relative top-0 min-h-0 flex-1 h-full overflow-visible bg-[var(--color-bg-primary)] {contentClassName}"
  >
    <div 
      class="h-full min-h-0 w-full overflow-auto"
      style="padding-bottom: {bottomBarHeight}px;"
    >
      {@render children()}
    </div>
  </section>

  <!-- Bottom Bar (if provided) -->
  {#if bottomBar}
    <footer 
      data-page-bottom-bar
      class="sticky mx-auto w-full z-40
        bottom-0 left-0 right-0
        p-2 border-t border-border squircle-2xl
        bg-gradient-to-b from-(--color-bg-primary)/50 to-(--color-bg-primary) backdrop-blur-sm
      "
    >
      {@render bottomBar()}
    </footer>
  {/if}
</article>
