<script lang="ts">
  import type { BadgesTabProps, BadgeInsight } from '../types';

  interface Props {
    userCurrency: string;
    isLoading: boolean;
    onViewDetails?: (badgeId: string) => void;
    className?: string;
  }

  const { userCurrency, isLoading, onViewDetails, className = '' }: Props = $props();

  // Mock badges for demonstration
  const mockBadges = $derived(() => {
    return [
      {
        id: '1',
        type: 'budget_badge',
        title: 'Budget Master',
        description: 'You\'ve stayed within budget for 30 days straight!',
        badgeType: 'streak',
        rarity: 'rare',
        category: 'security',
        progress: {
          current: 30,
          target: 30,
          percentage: 100
        },
        unlockedAt: new Date().toISOString(),
        metadata: {
          streakDays: 30,
          category: 'security'
        }
      },
      {
        id: '2',
        type: 'goal_milestone',
        title: 'Emergency Fund Hero',
        description: 'Emergency fund is 50% complete!',
        badgeType: 'milestone',
        rarity: 'uncommon',
        category: 'security',
        progress: {
          current: 5000,
          target: 10000,
          percentage: 50
        },
        unlockedAt: new Date().toISOString(),
        metadata: {
          amount: 5000,
          category: 'security'
        }
      },
      {
        id: '3',
        type: 'behavioral_badge',
        title: 'Transaction Logger',
        description: 'You\'ve logged transactions daily for a week',
        badgeType: 'streak',
        rarity: 'common',
        category: 'system',
        progress: {
          current: 7,
          target: 7,
          percentage: 100
        },
        unlockedAt: new Date().toISOString(),
        metadata: {
          streakDays: 7,
          category: 'system'
        }
      },
      {
        id: '4',
        type: 'financial_milestone',
        title: 'Saver',
        description: 'You\'ve saved $1,000 this year',
        badgeType: 'milestone',
        rarity: 'uncommon',
        category: 'growth',
        progress: {
          current: 1000,
          target: 1000,
          percentage: 100
        },
        unlockedAt: new Date().toISOString(),
        metadata: {
          amount: 1000,
          timeframe: 'year',
          category: 'growth'
        }
      },
      {
        id: '5',
        type: 'app_usage_badge',
        title: 'Feature Explorer',
        description: 'You\'ve used all major features',
        badgeType: 'achievement',
        rarity: 'rare',
        category: 'system',
        unlockedAt: new Date().toISOString(),
        metadata: {
          category: 'system'
        }
      }
    ] as BadgeInsight[];
  });

  function handleViewDetails(badgeId: string) {
    if (onViewDetails) {
      onViewDetails(badgeId);
    }
  }

  function getBadgeIcon(type: string) {
    switch (type) {
      case 'budget_badge':
        return '💰';
      case 'goal_milestone':
        return '🎯';
      case 'behavioral_badge':
        return '📊';
      case 'financial_milestone':
        return '🏆';
      case 'app_usage_badge':
        return '⭐';
      default:
        return '🏅';
    }
  }

  function getRarityColor(rarity: string) {
    switch (rarity) {
      case 'legendary':
        return 'text-purple-600 dark:text-purple-400';
      case 'epic':
        return 'text-purple-500 dark:text-purple-300';
      case 'rare':
        return 'text-blue-600 dark:text-blue-400';
      case 'uncommon':
        return 'text-green-600 dark:text-green-400';
      case 'common':
        return 'text-gray-600 dark:text-gray-400';
      default:
        return 'text-muted-foreground';
    }
  }

  function getRarityBadgeColor(rarity: string) {
    switch (rarity) {
      case 'legendary':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'epic':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'rare':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'uncommon':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'common':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  }

  function getCategoryColor(category: string) {
    switch (category) {
      case 'survival':
        return 'text-red-600 dark:text-red-400';
      case 'security':
        return 'text-blue-600 dark:text-blue-400';
      case 'growth':
        return 'text-green-600 dark:text-green-400';
      case 'lifestyle':
        return 'text-purple-600 dark:text-purple-400';
      case 'system':
        return 'text-gray-600 dark:text-gray-400';
      default:
        return 'text-muted-foreground';
    }
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  function formatTimeAgo(dateString: string) {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  }

  // Group badges by type
  const badgesByType = $derived(() => {
    const groups: Record<string, BadgeInsight[]> = {
      unlocked: [],
      progress: []
    };

    mockBadges().forEach(badge => {
      if (badge.progress && badge.progress.percentage === 100) {
        groups.unlocked.push(badge);
      } else {
        groups.progress.push(badge);
      }
    });

    return groups;
  });
</script>

<div class="badges-tab h-full overflow-y-auto {className}">
  <div class="p-4 space-y-6">
    <!-- Header -->
    <div>
      <h2 class="text-lg font-semibold text-foreground mb-2">Achievements & Badges</h2>
      <p class="text-sm text-muted-foreground">
        Celebrate your financial milestones and behavioral achievements
      </p>
    </div>

    <!-- Stats Summary -->
    <div class="grid grid-cols-3 gap-4">
      <div class="bg-card border border-border rounded-lg p-4 text-center">
        <div class="text-2xl font-bold text-foreground">
          {badgesByType().unlocked.length}
        </div>
        <div class="text-xs text-muted-foreground">Unlocked</div>
      </div>
      <div class="bg-card border border-border rounded-lg p-4 text-center">
        <div class="text-2xl font-bold text-foreground">
          {badgesByType().progress.length}
        </div>
        <div class="text-xs text-muted-foreground">In Progress</div>
      </div>
      <div class="bg-card border border-border rounded-lg p-4 text-center">
        <div class="text-2xl font-bold text-foreground">
          {mockBadges().length}
        </div>
        <div class="text-xs text-muted-foreground">Total</div>
      </div>
    </div>

    <!-- Unlocked Badges -->
    {#if badgesByType().unlocked.length > 0}
      <div>
        <h3 class="text-md font-semibold text-foreground mb-3">🏆 Unlocked Badges</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {#each badgesByType().unlocked as badge (badge.id)}
            <div class="bg-card border border-border rounded-lg p-4 hover:bg-secondary/50 transition-colors">
              <div class="flex items-start gap-3">
                <!-- Badge Icon -->
                <div class="flex-shrink-0">
                  <div class="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-2xl shadow-lg">
                    {getBadgeIcon(badge.type)}
                  </div>
                </div>

                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex-1">
                      <h4 class="font-semibold text-foreground text-sm leading-tight">
                        {badge.title}
                      </h4>
                      <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {badge.description}
                      </p>
                    </div>

                    <!-- Rarity Badge -->
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getRarityBadgeColor(badge.rarity)}">
                      {badge.rarity}
                    </span>
                  </div>

                  <!-- Metadata -->
                  <div class="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span class="capitalize {getCategoryColor(badge.category)}">
                      {badge.category}
                    </span>
                    <span>•</span>
                    <span>{formatTimeAgo(badge.unlockedAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- In Progress Badges -->
    {#if badgesByType().progress.length > 0}
      <div>
        <h3 class="text-md font-semibold text-foreground mb-3">🎯 In Progress</h3>
        <div class="space-y-3">
          {#each badgesByType().progress as badge (badge.id)}
            <div class="bg-card border border-border rounded-lg p-4">
              <div class="flex items-start gap-3">
                <!-- Badge Icon -->
                <div class="flex-shrink-0">
                  <div class="w-10 h-10 bg-secondary rounded-full flex items-center justify-center text-lg">
                    {getBadgeIcon(badge.type)}
                  </div>
                </div>

                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex-1">
                      <h4 class="font-semibold text-foreground text-sm leading-tight">
                        {badge.title}
                      </h4>
                      <p class="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {badge.description}
                      </p>
                    </div>

                    <!-- Rarity Badge -->
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getRarityBadgeColor(badge.rarity)}">
                      {badge.rarity}
                    </span>
                  </div>

                  <!-- Progress Bar -->
                  {#if badge.progress}
                    <div class="mt-3">
                      <div class="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>Progress</span>
                        <span>{badge.progress.percentage}%</span>
                      </div>
                      <div class="w-full bg-secondary rounded-full h-2">
                        <div 
                          class="bg-primary h-2 rounded-full transition-all duration-300"
                          style="width: {badge.progress.percentage}%"
                        ></div>
                      </div>
                      <div class="flex items-center justify-between text-xs text-muted-foreground mt-1">
                        <span>
                          {#if badge.metadata.amount}
                            {formatCurrency(badge.progress.current)} / {formatCurrency(badge.progress.target)}
                          {:else}
                            {badge.progress.current} / {badge.progress.target}
                          {/if}
                        </span>
                        <span class="capitalize {getCategoryColor(badge.category)}">
                          {badge.category}
                        </span>
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Empty State -->
    {#if mockBadges().length === 0}
      <div class="text-center py-12">
        <div class="w-20 h-20 mx-auto mb-6 bg-muted rounded-full flex items-center justify-center">
          <svg class="w-10 h-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-foreground mb-2">No badges yet</h3>
        <p class="text-muted-foreground mb-6 max-w-md mx-auto">
          Start using the app regularly to unlock your first achievements and badges.
        </p>
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onclick={() => onViewDetails?.('add-transaction')}
            class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Transaction
          </button>
          <button
            onclick={() => onViewDetails?.('set-goal')}
            class="inline-flex items-center gap-2 px-4 py-2 border border-border text-foreground rounded-lg hover:bg-secondary transition-colors"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            Set Goal
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
