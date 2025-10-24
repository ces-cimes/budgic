<script lang="ts">
  interface Props {
    tabId: string;
    isActive: boolean;
    className?: string;
    children: any;
  }

  const { tabId, isActive, className = '', children }: Props = $props();
</script>

<div 
  class="tab-panel flex-shrink-0 h-full {isActive ? 'overflow-y-auto' : 'overflow-hidden'} {className}"
  style="width: {100 / 4}%"
>
  {@render children()}
</div>

<style>
  .tab-panel {
    contain: layout style paint; /* Optimize rendering */
  }
</style>
