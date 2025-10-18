<script lang="ts">
  import type { TimeRangeSelectorProps } from '../types.js';
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Filter } from '@lucide/svelte';

  interface Props extends TimeRangeSelectorProps {
    children?: any;
  }

  const { 
    value, 
    options, 
    onChange, 
    label = 'Time range:', 
    className = '',
    children 
  }: Props = $props();
</script>

<div class="flex items-center gap-2 {className}">
  <Filter size={16} class="text-muted-foreground" />
  <span class="text-sm text-muted-foreground">{label}</span>
  <div class="flex gap-1">
    {#each options as option}
      <Button 
        variant={value === option ? 'default' : 'outline'}
        size="sm"
        onclick={() => onChange(option)}
      >
        {option.charAt(0).toUpperCase() + option.slice(1)}
      </Button>
    {/each}
  </div>
  
  {#if children}
    {@render children()}
  {/if}
</div>

