<script lang="ts">
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
  import Navigation from '$lib/components/Navigation.svelte';
  import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';

  interface Props {
    children: any;
  }

  const { children }: Props = $props();
  
  let isMobile = new IsMobile();
</script>

<Sidebar.Provider>
  <!-- Desktop Sidebar is handled in Navigation component -->
  <Navigation />
  
  <!-- Main content area with inset effect -->
  <main 
    class="w-screen bg-(--color-bg-primary) rounded-2xl 
      shadow-md overflow-hidden flex flex-col
      m-1 md:m-2 
      h-[calc(100svh-2*1*var(--spacing))]
      min-h-[calc(100svh-2*1*var(--spacing))]
      mb-[calc(1*var(--spacing))]
      md:h-[calc(100svh-2*2*var(--spacing))]
      md:min-h-[calc(100svh-2*2*var(--spacing))]
      md:mb-[calc(2*var(--spacing))]"
  >
    {@render children()}
  </main>
</Sidebar.Provider>
