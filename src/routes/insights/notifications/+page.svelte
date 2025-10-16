<script lang="ts">
  import { onMount } from 'svelte';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import TabNavigation from '$lib/components/TabNavigation.svelte';
  import * as Card from '$lib/components/ui/card/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Bell, AlertTriangle, CheckCircle, Info, ChartBar, Award, TrendingUp, Lightbulb } from '@lucide/svelte';

  // State
  let notifications = $state<any[]>([]);
  let isLoading = $state(true);

  // Tab navigation configuration
  const insightsTabs = [
    { id: 'overview', label: 'Overview', path: '/insights', icon: ChartBar },
    { id: 'notifications', label: 'Notifications', path: '/insights/notifications', icon: Bell },
    { id: 'achievements', label: 'Achievements', path: '/insights/achievements', icon: Award },
    { id: 'trends', label: 'Trends', path: '/insights/trends', icon: TrendingUp },
    { id: 'recommendations', label: 'Recommendations', path: '/insights/recommendations', icon: Lightbulb }
  ];

  // Mock notifications data
  const mockNotifications = [
    {
      id: 1,
      type: 'warning',
      title: 'Budget Alert',
      message: 'You\'ve spent 80% of your monthly food budget',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      read: false,
      actionable: true
    },
    {
      id: 2,
      type: 'success',
      title: 'Goal Achieved',
      message: 'You\'ve successfully saved $500 this month!',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      read: true,
      actionable: false
    },
    {
      id: 3,
      type: 'info',
      title: 'Spending Pattern',
      message: 'Your weekend spending is 25% higher than weekdays',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      read: true,
      actionable: true
    }
  ];

  onMount(() => {
    // Simulate loading
    setTimeout(() => {
      notifications = mockNotifications;
      isLoading = false;
    }, 1000);
  });

  function getNotificationIcon(type: string) {
    switch (type) {
      case 'warning': return AlertTriangle;
      case 'success': return CheckCircle;
      case 'info': return Info;
      default: return Bell;
    }
  }

  function formatTimestamp(timestamp: Date) {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  }

  function markAsRead(notificationId: number) {
    notifications = notifications.map(n => 
      n.id === notificationId ? { ...n, read: true } : n
    );
  }
</script>

<PageLayout>
  {#snippet topBar()}
    <Header title="Notifications" />
  {/snippet}

  <!-- Tab Navigation -->
  <div class="px-4">
    <TabNavigation tabs={insightsTabs} />
  </div>

  <div class="p-4 space-y-4">
    {#if isLoading}
      <div class="space-y-3">
        {#each Array(3) as _}
          <Card.Root class="p-4">
            <div class="animate-pulse">
              <div class="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div class="h-3 bg-muted rounded w-1/2"></div>
            </div>
          </Card.Root>
        {/each}
      </div>
    {:else if notifications.length === 0}
      <Card.Root class="p-8 text-center">
        <Bell class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 class="text-lg font-semibold text-primary mb-2">No notifications</h3>
        <p class="text-muted-foreground">You're all caught up! Check back later for updates.</p>
      </Card.Root>
    {:else}
      <div class="space-y-3">
        {#each notifications as notification (notification.id)}
          <Card.Root 
            class="p-4 cursor-pointer hover:bg-accent/50 transition-colors {notification.read ? 'opacity-60' : ''}"
            onclick={() => markAsRead(notification.id)}
          >
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 mt-1">
                <svelte:component this={getNotificationIcon(notification.type)} 
                  class="w-5 h-5 {notification.type === 'warning' ? 'text-orange-500' : notification.type === 'success' ? 'text-green-500' : 'text-blue-500'}"
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-1">
                  <h3 class="font-semibold text-primary">{notification.title}</h3>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-muted-foreground">{formatTimestamp(notification.timestamp)}</span>
                    {#if !notification.read}
                    <Badge variant="secondary" class="text-xs">New</Badge>
                    {/if}
                  </div>
                </div>
                <p class="text-sm text-muted-foreground mb-2">{notification.message}</p>
                {#if notification.actionable}
                  <div class="flex gap-2">
                    <Badge variant="outline" class="text-xs">Actionable</Badge>
                  </div>
                {/if}
              </div>
            </div>
          </Card.Root>
        {/each}
      </div>
    {/if}
  </div>
</PageLayout>
