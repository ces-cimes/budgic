<script lang="ts">
  import { onMount } from 'svelte';
  import { X } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Badge } from '$lib/components/ui/badge';
  import type { BadgeInsight } from './types';

  interface Props {
    badge: BadgeInsight;
    onDismiss?: () => void;
    onView?: () => void;
    autoDismiss?: boolean;
    dismissDelay?: number;
  }

  const { 
    badge, 
    onDismiss, 
    onView,
    autoDismiss = true,
    dismissDelay = 5000 
  }: Props = $props();

  let isVisible = $state(true);

  onMount(() => {
    if (autoDismiss) {
      setTimeout(() => {
        dismiss();
      }, dismissDelay);
    }
  });

  function dismiss() {
    isVisible = false;
    if (onDismiss) {
      setTimeout(() => onDismiss(), 300); // Wait for animation
    }
  }

  function getRarityColor(rarity: BadgeInsight['rarity']): string {
    switch (rarity) {
      case 'common': return 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900';
      case 'uncommon': return 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20';
      case 'rare': return 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20';
      case 'epic': return 'border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20';
      case 'legendary': return 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20';
      default: return 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900';
    }
  }

  function getRarityTextColor(rarity: BadgeInsight['rarity']): string {
    switch (rarity) {
      case 'common': return 'text-gray-700 dark:text-gray-300';
      case 'uncommon': return 'text-green-700 dark:text-green-300';
      case 'rare': return 'text-blue-700 dark:text-blue-300';
      case 'epic': return 'text-purple-700 dark:text-purple-300';
      case 'legendary': return 'text-yellow-700 dark:text-yellow-300';
      default: return 'text-gray-700 dark:text-gray-300';
    }
  }
</script>

{#if isVisible}
  <div
    class="fixed top-4 right-4 z-50 max-w-sm w-full"
    role="alert"
  >
    <div class="rounded-lg border-2 shadow-lg p-4 {getRarityColor(badge.rarity)}">
      <div class="flex items-start gap-3">
        <!-- Badge Icon Area -->
        <div class="flex-shrink-0">
          <div class="w-10 h-10 rounded-full {getRarityColor(badge.rarity)} flex items-center justify-center">
            <span class="text-lg">🏆</span>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2 mb-1">
            <h3 class="font-semibold text-sm {getRarityTextColor(badge.rarity)}">
              Achievement Unlocked!
            </h3>
            <Button
              onclick={dismiss}
              variant="ghost"
              size="sm"
              class="h-6 w-6 p-0 flex-shrink-0"
            >
              <X class="w-4 h-4" />
            </Button>
          </div>

          <p class="text-sm font-medium text-foreground mb-1">
            {badge.title}
          </p>

          <p class="text-xs text-muted-foreground mb-2 line-clamp-2">
            {badge.description}
          </p>

          <div class="flex items-center gap-2">
            <Badge variant="outline" class="text-xs capitalize">
              {badge.rarity}
            </Badge>
            {#if onView}
              <Button
                onclick={() => {
                  if (onView) onView();
                  dismiss();
                }}
                variant="ghost"
                size="sm"
                class="text-xs h-6"
              >
                View
              </Button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
