<script lang="ts">
  import { onMount } from 'svelte';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import TabNavigation from '$lib/components/TabNavigation.svelte';
  import * as Card from '$lib/components/ui/card/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { Lightbulb, Target, TrendingUp, AlertCircle, CheckCircle, ArrowRight, ChartBar, Bell, Award } from '@lucide/svelte';

  // State
  let recommendations = $state<any[]>([]);
  let isLoading = $state(true);

  // Tab navigation configuration
  const insightsTabs = [
    { id: 'overview', label: 'Overview', path: '/insights', icon: ChartBar },
    { id: 'notifications', label: 'Notifications', path: '/insights/notifications', icon: Bell },
    { id: 'achievements', label: 'Achievements', path: '/insights/achievements', icon: Award },
    { id: 'trends', label: 'Trends', path: '/insights/trends', icon: TrendingUp },
    { id: 'recommendations', label: 'Recommendations', path: '/insights/recommendations', icon: Lightbulb }
  ];

  // Mock recommendations data
  const mockRecommendations = [
    {
      id: 1,
      title: 'Optimize Your Food Budget',
      type: 'budget',
      priority: 'high',
      confidence: 85,
      description: 'Your food spending is 15% above average. Consider meal planning to reduce costs.',
      impact: 'Save $120/month',
      effort: 'Medium',
      icon: Target,
      actionable: true,
      steps: [
        'Plan meals for the week',
        'Buy groceries in bulk',
        'Limit dining out to weekends'
      ]
    },
    {
      id: 2,
      title: 'Increase Emergency Fund',
      type: 'savings',
      priority: 'high',
      confidence: 92,
      description: 'Your emergency fund covers only 2 months of expenses. Aim for 3-6 months.',
      impact: 'Better financial security',
      effort: 'Low',
      icon: TrendingUp,
      actionable: true,
      steps: [
        'Set up automatic transfers',
        'Reduce discretionary spending by 10%',
        'Consider high-yield savings account'
      ]
    },
    {
      id: 3,
      title: 'Review Subscription Services',
      type: 'expense',
      priority: 'medium',
      confidence: 78,
      description: 'You have 8 active subscriptions totaling $89/month. Some may be unused.',
      impact: 'Save $45/month',
      effort: 'Low',
      icon: AlertCircle,
      actionable: true,
      steps: [
        'Audit all subscriptions',
        'Cancel unused services',
        'Consider annual plans for savings'
      ]
    },
    {
      id: 4,
      title: 'Diversify Investment Portfolio',
      type: 'investment',
      priority: 'low',
      confidence: 65,
      description: 'Your portfolio is heavily weighted in tech stocks. Consider diversification.',
      impact: 'Reduce risk',
      effort: 'High',
      icon: CheckCircle,
      actionable: false,
      steps: [
        'Research index funds',
        'Consider bonds or REITs',
        'Consult with financial advisor'
      ]
    }
  ];

  onMount(() => {
    // Simulate loading
    setTimeout(() => {
      recommendations = mockRecommendations;
      isLoading = false;
    }, 1000);
  });

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'high': return 'text-red-500';
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-green-500';
      default: return 'text-gray-500';
    }
  }

  function getPriorityBadgeVariant(priority: string) {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  }

  function getEffortColor(effort: string) {
    switch (effort) {
      case 'Low': return 'text-green-500';
      case 'Medium': return 'text-yellow-500';
      case 'High': return 'text-red-500';
      default: return 'text-gray-500';
    }
  }

  function getConfidenceColor(confidence: number) {
    if (confidence >= 80) return 'text-green-500';
    if (confidence >= 60) return 'text-yellow-500';
    return 'text-red-500';
  }

  const highPriorityCount = $derived(recommendations.filter(r => r.priority === 'high').length);
  const actionableCount = $derived(recommendations.filter(r => r.actionable).length);
</script>

<PageLayout>
  {#snippet topBar()}
    <Header title="Recommendations" />
  {/snippet}

  <!-- Tab Navigation -->
  <div class="px-4">
    <TabNavigation tabs={insightsTabs} />
  </div>

  <div class="p-4 space-y-6">
    <!-- Summary Stats -->
    <Card.Root class="p-6">
      <div class="flex items-center gap-4 mb-4">
        <Lightbulb class="w-8 h-8 text-yellow-500" />
        <div>
          <h2 class="text-xl font-semibold text-primary">AI-Powered Insights</h2>
          <p class="text-sm text-muted-foreground">Personalized recommendations based on your spending patterns</p>
        </div>
      </div>
      
      <div class="grid grid-cols-3 gap-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-primary">{recommendations.length}</div>
          <div class="text-sm text-muted-foreground">Total</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-red-500">{highPriorityCount}</div>
          <div class="text-sm text-muted-foreground">High Priority</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-green-500">{actionableCount}</div>
          <div class="text-sm text-muted-foreground">Actionable</div>
        </div>
      </div>
    </Card.Root>

    {#if isLoading}
      <div class="space-y-4">
        {#each Array(4) as _}
          <Card.Root class="p-6">
            <div class="animate-pulse">
              <div class="flex items-start gap-4 mb-4">
                <div class="w-10 h-10 bg-muted rounded"></div>
                <div class="flex-1">
                  <div class="h-5 bg-muted rounded w-1/2 mb-2"></div>
                  <div class="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div class="h-3 bg-muted rounded w-1/4"></div>
                </div>
              </div>
            </div>
          </Card.Root>
        {/each}
      </div>
    {:else}
      {#each recommendations as recommendation (recommendation.id)}
        <Card.Root class="p-6">
          <div class="flex items-start gap-4 mb-4">
            <div class="flex-shrink-0">
              <div class="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <svelte:component 
                  this={recommendation.icon} 
                  class="w-5 h-5 text-primary"
                />
              </div>
            </div>
            
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between mb-2">
                <h3 class="text-lg font-semibold text-primary">{recommendation.title}</h3>
                <div class="flex items-center gap-2">
                  <Badge variant={getPriorityBadgeVariant(recommendation.priority)} class="text-xs">
                    {recommendation.priority}
                  </Badge>
                  <Badge variant="outline" class="text-xs">
                    {recommendation.confidence}% confidence
                  </Badge>
                </div>
              </div>
              
              <p class="text-sm text-muted-foreground mb-3">{recommendation.description}</p>
              
              <div class="flex items-center gap-4 mb-4">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-muted-foreground">Impact:</span>
                  <span class="text-sm font-medium text-primary">{recommendation.impact}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-sm text-muted-foreground">Effort:</span>
                  <span class="text-sm font-medium {getEffortColor(recommendation.effort)}">{recommendation.effort}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Action Steps -->
          {#if recommendation.actionable && recommendation.steps}
            <div class="space-y-2 mb-4">
              <h4 class="text-sm font-semibold text-primary">Action Steps:</h4>
              <ul class="space-y-1">
                {#each recommendation.steps as step, index (index)}
                  <li class="flex items-center gap-2 text-sm text-muted-foreground">
                    <div class="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                      {index + 1}
                    </div>
                    {step}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          <!-- Action Buttons -->
          <div class="flex items-center justify-between pt-4 border-t border-border">
            <div class="flex items-center gap-2">
                <Badge variant="outline" class="text-xs">
                  {recommendation.type}
                </Badge>
                {#if recommendation.actionable}
                  <Badge variant="secondary" class="text-xs">
                    Actionable
                  </Badge>
                {/if}
            </div>
            
            {#if recommendation.actionable}
              <Button.Root size="sm" variant="outline">
                Get Started
                <ArrowRight class="w-4 h-4 ml-1" />
              </Button.Root>
            {:else}
              <Button.Root size="sm" variant="ghost" disabled>
                Learn More
              </Button.Root>
            {/if}
          </div>
        </Card.Root>
      {/each}
    {/if}

    <!-- Additional Resources -->
    <Card.Root class="p-6">
      <div class="flex items-center gap-3 mb-4">
        <Lightbulb class="w-6 h-6 text-primary" />
        <h3 class="text-lg font-semibold text-primary">Need More Help?</h3>
      </div>
      
      <div class="space-y-3">
        <button class="w-full text-left p-3 hover:bg-accent/50 rounded-lg transition-colors">
          <div class="font-medium text-primary">Financial Planning Guide</div>
          <div class="text-sm text-muted-foreground">Learn about budgeting best practices</div>
        </button>
        <button class="w-full text-left p-3 hover:bg-accent/50 rounded-lg transition-colors">
          <div class="font-medium text-primary">Investment Basics</div>
          <div class="text-sm text-muted-foreground">Start your investment journey</div>
        </button>
        <button class="w-full text-left p-3 hover:bg-accent/50 rounded-lg transition-colors">
          <div class="font-medium text-primary">Debt Management</div>
          <div class="text-sm text-muted-foreground">Strategies to reduce debt</div>
        </button>
      </div>
    </Card.Root>
  </div>
</PageLayout>
