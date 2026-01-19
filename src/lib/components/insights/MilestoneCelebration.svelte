<script lang="ts">
  import { onMount } from 'svelte';
  import { Award, Sparkles, Trophy, Star } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button/index.ts';
  import type { BadgeInsight } from './types';

  interface Props {
    badge: BadgeInsight;
    onClose?: () => void;
    showAnimation?: boolean;
  }

  const { badge, onClose, showAnimation = true }: Props = $props();

  let showConfetti = $state(false);
  let isVisible = $state(false);

  onMount(() => {
    if (showAnimation) {
      // Trigger confetti animation
      showConfetti = true;
      isVisible = true;
      
      // Auto-close after 5 seconds
      setTimeout(() => {
        if (onClose) onClose();
      }, 5000);
    } else {
      isVisible = true;
    }
  });

  function getRarityColor(rarity: BadgeInsight['rarity']): string {
    switch (rarity) {
      case 'common': return 'text-gray-600 dark:text-gray-400';
      case 'uncommon': return 'text-green-600 dark:text-green-400';
      case 'rare': return 'text-blue-600 dark:text-blue-400';
      case 'epic': return 'text-purple-600 dark:text-purple-400';
      case 'legendary': return 'text-yellow-600 dark:text-yellow-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  }

  function getRarityBg(rarity: BadgeInsight['rarity']): string {
    switch (rarity) {
      case 'common': return 'bg-gray-100 dark:bg-gray-800';
      case 'uncommon': return 'bg-green-100 dark:bg-green-900/20';
      case 'rare': return 'bg-blue-100 dark:bg-blue-900/20';
      case 'epic': return 'bg-purple-100 dark:bg-purple-900/20';
      case 'legendary': return 'bg-yellow-100 dark:bg-yellow-900/20';
      default: return 'bg-gray-100 dark:bg-gray-800';
    }
  }

  function getIcon(badgeType: BadgeInsight['badgeType']) {
    switch (badgeType) {
      case 'achievement': return Award;
      case 'milestone': return Trophy;
      case 'milestone_reached': return Star;
      case 'streak': return Sparkles;
      default: return Award;
    }
  }
</script>

{#if isVisible}
  {@const Icon = getIcon(badge.badgeType)}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="celebration-title"
  >
    <div
      class="relative bg-background rounded-lg shadow-xl max-w-md w-full p-6 border-2 {getRarityBg(badge.rarity)}"
    >
      <!-- Confetti Effect -->
      {#if showConfetti}
        <div class="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
          {#each Array(20) as _, i}
            <div
              class="absolute w-2 h-2 rounded-full {getRarityBg(badge.rarity)} opacity-75"
              style="
                left: {Math.random() * 100}%;
                top: {Math.random() * 100}%;
                animation: confetti-{i} 2s ease-out forwards;
                animation-delay: {Math.random() * 0.5}s;
              "
            />
          {/each}
        </div>
      {/if}

      <!-- Content -->
      <div class="relative z-10 text-center">
        <!-- Icon -->
        <div class="flex justify-center mb-4">
          <div class="p-4 rounded-full {getRarityBg(badge.rarity)} {getRarityColor(badge.rarity)}">
            <Icon class="w-12 h-12" />
          </div>
        </div>

        <!-- Title -->
        <h2 id="celebration-title" class="text-2xl font-bold mb-2 {getRarityColor(badge.rarity)}">
          Achievement Unlocked!
        </h2>

        <!-- Badge Name -->
        <h3 class="text-xl font-semibold mb-2 text-foreground">
          {badge.title}
        </h3>

        <!-- Description -->
        <p class="text-muted-foreground mb-4">
          {badge.description}
        </p>

        <!-- Rarity Badge -->
        <div class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium mb-4 {getRarityBg(badge.rarity)} {getRarityColor(badge.rarity)}">
          <span class="capitalize">{badge.rarity}</span>
        </div>

        <!-- Close Button -->
        <Button
          onclick={() => {
            isVisible = false;
            if (onClose) onClose();
          }}
          variant="outline"
          class="mt-4"
        >
          Awesome!
        </Button>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes confetti-0 {
    0% {
      transform: translateY(0) rotate(0deg);
      opacity: 1;
    }
    100% {
      transform: translateY(-100px) rotate(360deg);
      opacity: 0;
    }
  }
  @keyframes confetti-1 {
    0% {
      transform: translateY(0) rotate(0deg);
      opacity: 1;
    }
    100% {
      transform: translateY(-100px) rotate(-360deg);
      opacity: 0;
    }
  }
  /* Add more confetti animations as needed */
</style>
