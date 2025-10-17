<script lang="ts">
  import { onMount } from 'svelte';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import TabNavigation from '$lib/components/TabNavigation.svelte';
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Trophy, Target, Star, Award, Zap, TrendingUp, ChartBar, Bell, Lightbulb } from '@lucide/svelte';

  // State
  let achievements = $state<any[]>([]);
  let isLoading = $state(true);

  // Sidebar context for mobile detection
  const sidebar = Sidebar.useSidebar();

  // Tab navigation configuration
  const insightsTabs = [
    { id: 'alerts', label: 'Alerts', path: '/insights/alerts', icon: Bell },
    { id: 'badges', label: 'Badges', path: '/insights/badges', icon: Award },
    { id: 'trends', label: 'Trends', path: '/insights/trends', icon: TrendingUp },
    { id: 'tips', label: 'Tips', path: '/insights/tips', icon: Lightbulb }
  ];

  // Mock achievements data
  const mockAchievements = [
    {
      id: 1,
      title: 'Budget Master',
      description: 'Stayed within budget for 30 consecutive days',
      icon: Target,
      earned: true,
      earnedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      rarity: 'common',
      points: 100
    },
    {
      id: 2,
      title: 'Saving Streak',
      description: 'Saved money for 7 days in a row',
      icon: TrendingUp,
      earned: true,
      earnedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      rarity: 'rare',
      points: 250
    },
    {
      id: 3,
      title: 'Transaction Tracker',
      description: 'Logged 100 transactions',
      icon: Zap,
      earned: false,
      earnedDate: null,
      rarity: 'epic',
      points: 500,
      progress: 67
    },
    {
      id: 4,
      title: 'Financial Wizard',
      description: 'Achieved all monthly goals',
      icon: Star,
      earned: false,
      earnedDate: null,
      rarity: 'legendary',
      points: 1000,
      progress: 0
    }
  ];

  onMount(() => {
    // Simulate loading
    setTimeout(() => {
      achievements = mockAchievements;
      isLoading = false;
    }, 1000);
  });

  function getRarityColor(rarity: string) {
    switch (rarity) {
      case 'common': return 'text-gray-500';
      case 'rare': return 'text-blue-500';
      case 'epic': return 'text-purple-500';
      case 'legendary': return 'text-yellow-500';
      default: return 'text-gray-500';
    }
  }

  function getRarityBadgeVariant(rarity: string) {
    switch (rarity) {
      case 'common': return 'secondary';
      case 'rare': return 'default';
      case 'epic': return 'destructive';
      case 'legendary': return 'outline';
      default: return 'secondary';
    }
  }

  function formatDate(date: Date) {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  }

  const earnedAchievements = $derived(achievements.filter(a => a.earned));
  const totalPoints = $derived(earnedAchievements.reduce((sum, a) => sum + a.points, 0));
</script>

<PageLayout>
  {#snippet topBar()}
    <Header title="Badges" variant="with-tabs">
      <TabNavigation tabs={insightsTabs} />
    </Header>
  {/snippet}

  {#snippet bottomBar()}
    <!-- Mobile Navigation -->
    {#if sidebar.isMobile}
      <MobileNavigation />
    {/if}
  {/snippet}

  <div class="p-4 space-y-6">
    <!-- Stats Overview -->
    <Card.Root class="p-6">
      <div class="flex items-center gap-4 mb-4">
        <Trophy class="w-8 h-8 text-yellow-500" />
        <div>
          <h2 class="text-xl font-semibold text-primary">Badge Progress</h2>
          <p class="text-sm text-muted-foreground">Track your financial milestones</p>
        </div>
      </div>
      
      <div class="grid grid-cols-2 gap-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-primary">{earnedAchievements.length}</div>
          <div class="text-sm text-muted-foreground">Badges</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-primary">{totalPoints}</div>
          <div class="text-sm text-muted-foreground">Total Points</div>
        </div>
      </div>
    </Card.Root>

    {#if isLoading}
      <div class="space-y-4">
        {#each Array(4) as _}
          <Card.Root class="p-4">
            <div class="animate-pulse">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-8 h-8 bg-muted rounded"></div>
                <div class="h-4 bg-muted rounded w-1/3"></div>
              </div>
              <div class="h-3 bg-muted rounded w-2/3 mb-2"></div>
              <div class="h-3 bg-muted rounded w-1/4"></div>
            </div>
          </Card.Root>
        {/each}
      </div>
    {:else}
      <div class="space-y-4">
        {#each achievements as achievement (achievement.id)}
          {@const AchievementIcon = achievement.icon}
          <Card.Root class="p-4 {achievement.earned ? '' : 'opacity-60'}">
            <div class="flex items-start gap-4">
              <div class="flex-shrink-0">
                <div class="w-12 h-12 rounded-lg bg-accent flex items-center justify-center">
                  <AchievementIcon class="w-6 h-6 {getRarityColor(achievement.rarity)}" />
                </div>
              </div>
              
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="font-semibold text-primary">{achievement.title}</h3>
                  <div class="flex items-center gap-2">
                    <Badge variant={getRarityBadgeVariant(achievement.rarity)} class="text-xs">
                      {achievement.rarity}
                    </Badge>
                    <Badge variant="outline" class="text-xs">
                      {achievement.points} pts
                    </Badge>
                  </div>
                </div>
                
                <p class="text-sm text-muted-foreground mb-3">{achievement.description}</p>
                
                {#if achievement.earned}
                  <div class="flex items-center gap-2 text-sm text-green-600">
                    <Award class="w-4 h-4" />
                    <span>Earned on {formatDate(achievement.earnedDate!)}</span>
                  </div>
                {:else if achievement.progress !== undefined}
                  <div class="space-y-2">
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">Progress</span>
                      <span class="text-primary">{achievement.progress}%</span>
                    </div>
                    <div class="w-full bg-muted rounded-full h-2">
                      <div 
                        class="bg-primary h-2 rounded-full transition-all duration-300" 
                        style="width: {achievement.progress}%"
                      ></div>
                    </div>
                  </div>
                {:else}
                  <div class="text-sm text-muted-foreground">Not started</div>
                {/if}
              </div>
            </div>
          </Card.Root>
        {/each}
      </div>
    {/if}
  </div>
</PageLayout>
