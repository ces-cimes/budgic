<script lang="ts">
  import type { ActionButtonProps } from '../types.js';
  import { Button } from '$lib/components/ui/button/index.ts';

  interface Props extends ActionButtonProps {
    children?: any;
  }

  const { 
    icon: Icon, 
    label, 
    subtitle, 
    onClick, 
    variant = 'outline',
    className = '',
    children 
  }: Props = $props();
</script>

<Button 
  variant={variant} 
  class="h-auto p-4 flex flex-col items-center gap-2 {className}"
  onclick={onClick}
>
  <Icon class="w-5 h-5" />
  <span class="text-sm font-medium">{label}</span>
  {#if subtitle}
    <span class="text-xs text-muted-foreground">{subtitle}</span>
  {/if}
  
  {#if children}
    {@render children()}
  {/if}
</Button>
