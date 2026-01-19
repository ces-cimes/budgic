<script lang="ts">
  import { onMount } from 'svelte';
  import { badgeService } from '$lib/core/services';
  import BadgeProgress from '../BadgeProgress.svelte';
  import { Card } from '$lib/components/ui/card';
  import { Award, Filter } from '@lucide/svelte';
  import type { BadgesTabProps, BadgeInsight } from '../types';

  interface Props {
    userCurrency: string;
    isLoading: boolean;
    onViewDetails?: (badgeId: string) => void;
    className?: string;
  }

  const { userCurrency, isLoading: externalLoading, onViewDetails, className = '' }: Props = $props();

  let badges = $state<BadgeInsight[]>([]);
  let isLoading = $state(true);
  let filterType = $state<BadgeInsight['type'] | 'all'>('all');
  let filterRarity = $state<BadgeInsight['rarity'] | 'all'>('all');
  let showUnlockedOnly = $state(false);

  onMount(async () => {
    await loadBadges();
    // Check for new badges periodically
    const interval = setInterval(async () => {
      await badgeService.checkAllBadges(true);
      await loadBadges();
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(interval);
  });

  async function loadBadges() {
    try {
      isLoading = true;
      // Check for new badges first
      await badgeService.checkAllBadges(true);
      // Then load all badges
      badges = await badgeService.getBadges();
    } catch (error) {
      console.error('Error loading badges:', error);
    } finally {
      isLoading = false;
    }
  }

  const filteredBadges = $derived(() => {
    return badges.filter(badge => {
      if (filterType !== 'all' && badge.type !== filterType) return false;
      if (filterRarity !== 'all' && badge.rarity !== filterRarity) return false;
      if (showUnlockedOnly && !badge.unlockedAt) return false;
      return true;
    });
  });

  const unlockedCount = $derived(badges.filter(b => b.unlockedAt).length);
  const totalCount = $derived(badges.length);
  const unlockedPercentage = $derived(totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0);

  const badgesByType = $derived(() => {
    const groups = new Map<BadgeInsight['type'], BadgeInsight[]>();
    badges.forEach(badge => {
      const existing = groups.get(badge.type) || [];
      groups.set(badge.type, [...existing, badge]);
    });
    return groups;
  });
</script>

<div class="space-y-4 {className}">
  {#if isLoading || externalLoading}
    <div class="flex items-center justify-center py-12">
      <div class="text-center">
        <Award class="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
        <p class="text-muted-foreground">Loading achievements...</p>
      </div>
    </div>
  {:else if badges.length === 0}
    <Card.Root>
      <Card.Content class="p-12 text-center">
        <Award class="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h3 class="text-xl font-semibold text-primary mb-2">No Achievements Yet</h3>
        <p class="text-muted-foreground mb-6 max-w-md mx-auto">
          Start using Budgic to unlock achievements! Complete goals, stay within budget, and build good financial habits.
        </p>
      </Card.Content>
    </Card.Root>
  {:else}
    <!-- Summary Stats -->
    <Card.Root>
      <Card.Content class="p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-muted-foreground">Achievements</p>
            <p class="text-2xl font-bold">
              {unlockedCount} <span class="text-muted-foreground text-lg">/ {totalCount}</span>
            </p>
          </div>
          <div class="text-right">
            <p class="text-sm text-muted-foreground">Progress</p>
            <p class="text-2xl font-bold">{unlockedPercentage}%</p>
          </div>
        </div>
        <div class="mt-3 w-full bg-muted rounded-full h-2">
          <div
            class="bg-primary h-2 rounded-full transition-all duration-500"
            style="width: {unlockedPercentage}%"
          />
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Filters -->
    <div class="flex flex-wrap gap-2 items-center">
      <select
        bind:value={filterType}
        class="px-3 py-1.5 text-sm border rounded-md bg-background"
      >
        <option value="all">All Types</option>
        <option value="budget_badge">Budget</option>
        <option value="goal_milestone">Goals</option>
        <option value="behavioral_badge">Behavioral</option>
        <option value="financial_milestone">Financial</option>
        <option value="app_usage_badge">App Usage</option>
      </select>

      <select
        bind:value={filterRarity}
        class="px-3 py-1.5 text-sm border rounded-md bg-background"
      >
        <option value="all">All Rarities</option>
        <option value="common">Common</option>
        <option value="uncommon">Uncommon</option>
        <option value="rare">Rare</option>
        <option value="epic">Epic</option>
        <option value="legendary">Legendary</option>
      </select>

      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          bind:checked={showUnlockedOnly}
          class="rounded"
        />
        <span>Unlocked Only</span>
      </label>
    </div>

    <!-- Badges Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each filteredBadges as badge (badge.id)}
        <BadgeProgress
          {badge}
          showDetails={true}
          onViewDetails={onViewDetails ? () => onViewDetails(badge.id) : undefined}
        />
      {/each}
    </div>

    {#if filteredBadges.length === 0}
      <Card.Root>
        <Card.Content class="p-8 text-center">
          <Filter class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p class="text-muted-foreground">No badges match your filters</p>
        </Card.Content>
      </Card.Root>
    {/if}
  {/if}
</div>