<script lang="ts">
  import type { TabContentProps } from '../types.js';

  interface Props {
    tabId: string;
    isActive: boolean;
    className?: string;
    children: any;
    tabs: any[]; // Array of tabs to infer count from
  }

  const { tabId, isActive, className = '', children, tabs }: Props = $props();

  // Calculate width based on number of tabs
  const tabWidth = $derived(`${100 / tabs.length}%`);
</script>

<div 
  class="tab-content flex-shrink-0 h-full {className}"
  style="width: {tabWidth}"
  role="tabpanel"
  aria-labelledby="tab-{tabId}"
  data-tab-id={tabId}
>
  {#if isActive}
    {@render children()}
  {/if}
</div>
