<script lang="ts">
  import { onMount } from 'svelte';
  import { badgeService } from '$lib/core/services';
  import BadgeProgress from '../BadgeProgress.svelte';
  import { Award, Filter, Loader2 } from '@lucide/svelte';
  import * as Select from '$lib/components/ui/select/index.ts';
  import { Checkbox } from '$lib/components/ui/checkbox/index.ts';
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Label } from '$lib/components/ui/label/index.ts';
  import type { BadgesTabProps, BadgeInsight } from '../types';

  interface Props {
    isLoading: boolean;
    onViewDetails?: (badgeId: string) => void;
    className?: string;
  }

  const { isLoading, onViewDetails, className = '' }: Props = $props();

  let badges = $state<BadgeInsight[]>([]);
  let localLoading = $state(false);
  let filterType = $state<BadgeInsight['type'] | 'all'>('all');
  let filterRarity = $state<BadgeInsight['rarity'] | 'all'>('all');
  let showUnlockedOnly = $state(false);

  onMount(() => {
    loadBadges();
    // Check for new badges periodically
    const interval = setInterval(async () => {
      await badgeService.checkAllBadges(true);
      await loadBadges();
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(interval);
  });

  async function loadBadges() {
    localLoading = true;
    try {
      // Check for new badges first
      await badgeService.checkAllBadges(true);
      // Then load all badges
      badges = await badgeService.getBadges();
    } catch (error) {
      console.error('Error loading badges:', error);
      badges = [];
    } finally {
      localLoading = false;
    }
  }

  const filteredBadges = $derived(
    badges.filter(badge => {
      if (filterType !== 'all' && badge.type !== filterType) return false;
      if (filterRarity !== 'all' && badge.rarity !== filterRarity) return false;
      if (showUnlockedOnly && !badge.unlockedAt) return false;
      return true;
    })
  );

  const unlockedCount = $derived(badges.filter(b => b.unlockedAt).length);
  const totalCount = $derived(badges.length);
  const unlockedPercentage = $derived(totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0);
</script>

<div class="badges-tab h-full overflow-y-auto {className}">
  <div class="p-2 sm:p-4 max-w-4xl mx-auto space-y-4 sm:space-y-6">
    <!-- Loading State -->
    {#if isLoading || localLoading}
      <div class="text-center py-12">
        <div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-muted rounded-full flex items-center justify-center">
          <Loader2 class="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground animate-spin" />
        </div>
        <p class="text-sm text-muted-foreground">Loading achievements...</p>
      </div>
    {:else if badges.length === 0}
      <div class="text-center py-12">
        <div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-muted rounded-full flex items-center justify-center">
          <Award class="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" />
        </div>
        <h3 class="text-lg sm:text-xl font-semibold text-foreground mb-2">No achievements yet</h3>
        <p class="text-sm text-muted-foreground mb-6 max-w-md mx-auto px-4">
          Start using Budgic to unlock achievements! Complete goals, stay within budget, and build good financial habits.
        </p>
      </div>
    {:else}
      <div class="space-y-3 sm:space-y-4">
        <!-- Summary Stats -->
        <div class="bg-card border border-border rounded-lg p-3 sm:p-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="text-[10px] sm:text-xs text-muted-foreground">Achievements</p>
              <p class="text-lg sm:text-2xl font-bold text-foreground">
                {unlockedCount} <span class="text-muted-foreground text-sm sm:text-lg">/ {totalCount}</span>
              </p>
            </div>
            <div class="text-right">
              <p class="text-[10px] sm:text-xs text-muted-foreground">Progress</p>
              <p class="text-lg sm:text-2xl font-bold text-foreground">{unlockedPercentage}%</p>
            </div>
          </div>
          <div class="w-full bg-muted rounded-full h-2">
            <div
              class="bg-primary h-2 rounded-full transition-all duration-500"
              style="width: {unlockedPercentage}%"
            />
          </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap gap-2 sm:gap-3 items-center">
          <Select.Root type="single" value={filterType} onValueChange={(value) => filterType = (value || 'all') as BadgeInsight['type'] | 'all'}>
            <Select.Trigger class="h-auto px-2 sm:px-3 py-1.5 text-xs sm:text-sm w-auto min-w-[120px]">
              <span class="truncate">
                {filterType === 'all' ? 'All Types' : filterType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </span>
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">All Types</Select.Item>
              <Select.Item value="budget_badge">Budget</Select.Item>
              <Select.Item value="goal_milestone">Goals</Select.Item>
              <Select.Item value="behavioral_badge">Behavioral</Select.Item>
              <Select.Item value="financial_milestone">Financial</Select.Item>
              <Select.Item value="app_usage_badge">App Usage</Select.Item>
            </Select.Content>
          </Select.Root>

          <Select.Root type="single" value={filterRarity} onValueChange={(value) => filterRarity = (value || 'all') as BadgeInsight['rarity'] | 'all'}>
            <Select.Trigger class="h-auto px-2 sm:px-3 py-1.5 text-xs sm:text-sm w-auto min-w-[120px]">
              <span class="truncate">
                {filterRarity === 'all' ? 'All Rarities' : filterRarity.charAt(0).toUpperCase() + filterRarity.slice(1)}
              </span>
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">All Rarities</Select.Item>
              <Select.Item value="common">Common</Select.Item>
              <Select.Item value="uncommon">Uncommon</Select.Item>
              <Select.Item value="rare">Rare</Select.Item>
              <Select.Item value="epic">Epic</Select.Item>
              <Select.Item value="legendary">Legendary</Select.Item>
            </Select.Content>
          </Select.Root>

          <div class="flex items-center gap-1.5 sm:gap-2">
            <Checkbox
              bind:checked={showUnlockedOnly}
              id="unlocked-only"
            />
            <Label for="unlocked-only" class="text-xs sm:text-sm cursor-pointer">
              Unlocked Only
            </Label>
          </div>
        </div>

        <!-- Badges Grid — 2 col mobile, 3 col tablet+ -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          {#each filteredBadges as badge (badge.id)}
            {#if onViewDetails}
              <Button
                variant="ghost"
                onclick={() => onViewDetails(badge.id)}
                class="h-auto p-0 text-left justify-start hover:bg-transparent"
              >
                <BadgeProgress
                  {badge}
                  showDetails={true}
                />
              </Button>
            {:else}
              <BadgeProgress
                {badge}
                showDetails={true}
              />
            {/if}
          {/each}
        </div>

        {#if filteredBadges.length === 0}
          <div class="flex flex-col items-center py-12 text-center">
            <Filter class="size-8 mb-4 text-[var(--color-text-disabled)]" />
            <p class="text-sm text-[var(--color-text-secondary)]">No badges match your filters.</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>