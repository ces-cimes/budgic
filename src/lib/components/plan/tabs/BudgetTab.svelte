<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
  import { Progress } from '$lib/components/ui/progress/index.ts';
  import { 
    DollarSign,
    Plus,
    TrendingUp,
    TrendingDown,
    Target,
    AlertCircle,
    CheckCircle,
    PieChart,
    BarChart3,
    ExternalLink
  } from '@lucide/svelte';
  import { formatAmount } from '$lib/utils/currency-utils';
  import { goto } from '$app/navigation';
  import type { BudgetTabProps, PlanningData } from '../types.js';

  const { 
    userCurrency, 
    selectedAccountId, 
    planningData,
    onSetGoal 
  }: BudgetTabProps = $props();

  // Mock budget categories data - in real implementation, this would come from a service
  let budgetCategories = $state([
    {
      id: 'survival',
      name: 'Survival',
      allocated: 2000,
      spent: 1450,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      icon: AlertCircle,
      description: 'Essential needs like food, housing, utilities'
    },
    {
      id: 'security',
      name: 'Security',
      allocated: 1500,
      spent: 800,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      icon: CheckCircle,
      description: 'Emergency fund, debt payments, insurance'
    },
    {
      id: 'growth',
      name: 'Growth',
      allocated: 1000,
      spent: 600,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      icon: TrendingUp,
      description: 'Investments, education, career development'
    },
    {
      id: 'lifestyle',
      name: 'Lifestyle',
      allocated: 800,
      spent: 950,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      icon: PieChart,
      description: 'Entertainment, hobbies, discretionary spending'
    }
  ]);

  // Mock goals impact data
  let goalsImpact = $state([
    {
      id: 'emergency-fund',
      name: 'Emergency Fund',
      monthlyContribution: 500,
      impactOnDailyAllowance: -16.67,
      priority: 'high',
      status: 'active'
    },
    {
      id: 'vacation-fund',
      name: 'Vacation Fund',
      monthlyContribution: 200,
      impactOnDailyAllowance: -6.67,
      priority: 'medium',
      status: 'active'
    }
  ]);

  function formatCurrency(amount: number): string {
    return formatAmount(amount, userCurrency);
  }

  function getSpendingPercentage(category: any): number {
    return Math.min(100, (category.spent / category.allocated) * 100);
  }

  function getRemainingBudget(category: any): number {
    return Math.max(0, category.allocated - category.spent);
  }

  function getStatusColor(category: any): string {
    const percentage = getSpendingPercentage(category);
    if (percentage >= 90) return 'text-destructive';
    if (percentage >= 75) return 'text-warning';
    return 'text-success';
  }

  function getStatusBadgeVariant(category: any): "default" | "destructive" | "secondary" | "outline" {
    const percentage = getSpendingPercentage(category);
    if (percentage >= 90) return 'destructive';
    if (percentage >= 75) return 'secondary';
    return 'default';
  }

  function getTotalAllocated(): number {
    return budgetCategories.reduce((sum, cat) => sum + cat.allocated, 0);
  }

  function getTotalSpent(): number {
    return budgetCategories.reduce((sum, cat) => sum + cat.spent, 0);
  }

  function getTotalRemaining(): number {
    return getTotalAllocated() - getTotalSpent();
  }

  function getTotalGoalsImpact(): number {
    return goalsImpact.reduce((sum, goal) => sum + goal.monthlyContribution, 0);
  }

  function getDailyAllowanceImpact(): number {
    return goalsImpact.reduce((sum, goal) => sum + goal.impactOnDailyAllowance, 0);
  }
</script>

<div class="space-y-6 p-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-primary text-lg font-semibold">Budget Allocation</h2>
      <div class="text-muted-foreground text-sm">
        Manage your budget categories and track goal impact
      </div>
    </div>
    <Button onclick={onSetGoal} size="sm">
      <Plus class="mr-2" size={14} />
      Set Goal
    </Button>
  </div>

  <!-- Budget Summary -->
  <Card class="border-border">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <BarChart3 size={18} />
        Budget Overview
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="grid grid-cols-3 gap-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-primary">{formatCurrency(getTotalAllocated())}</div>
          <div class="text-muted-foreground text-sm">Total Allocated</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-warning">{formatCurrency(getTotalSpent())}</div>
          <div class="text-muted-foreground text-sm">Total Spent</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-success">{formatCurrency(getTotalRemaining())}</div>
          <div class="text-muted-foreground text-sm">Remaining</div>
        </div>
      </div>
      
      <!-- Overall Progress -->
      <div class="space-y-2">
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">Overall Budget Usage</span>
          <span class="font-medium">{((getTotalSpent() / getTotalAllocated()) * 100).toFixed(1)}%</span>
        </div>
        <Progress value={(getTotalSpent() / getTotalAllocated()) * 100} class="h-2" />
      </div>
    </CardContent>
  </Card>

  <!-- Budget Categories -->
  <div class="space-y-4">
    <h3 class="text-lg font-semibold">Budget Categories</h3>
    {#each budgetCategories as category (category.id)}
      {@const CategoryIcon = category.icon}
      {@const spendingPercentage = getSpendingPercentage(category)}
      {@const remainingBudget = getRemainingBudget(category)}

      <Card class="border-border {category.borderColor}">
        <CardHeader class="pb-3">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-2">
              <CategoryIcon size={16} class={category.color} />
              <CardTitle class="text-lg">{category.name}</CardTitle>
            </div>
            <Badge variant={getStatusBadgeVariant(category)} class="text-xs">
              {spendingPercentage.toFixed(0)}% used
            </Badge>
          </div>
          <p class="text-muted-foreground text-sm">{category.description}</p>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- Progress Bar -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">Spending Progress</span>
              <span class="font-medium {getStatusColor(category)}">{spendingPercentage.toFixed(1)}%</span>
            </div>
            <Progress value={spendingPercentage} class="h-2" />
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">
                {formatCurrency(category.spent)} of {formatCurrency(category.allocated)}
              </span>
              <span class="text-success font-medium">
                {formatCurrency(remainingBudget)} remaining
              </span>
            </div>
          </div>

          <!-- Budget Details -->
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div class="text-muted-foreground">Allocated</div>
              <div class="font-medium">{formatCurrency(category.allocated)}</div>
            </div>
            <div>
              <div class="text-muted-foreground">Spent</div>
              <div class="font-medium {getStatusColor(category)}">{formatCurrency(category.spent)}</div>
            </div>
          </div>

          <!-- Warning if over budget -->
          {#if category.spent > category.allocated}
            <div class="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <div class="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle size={14} />
                <span class="font-medium">Over Budget</span>
              </div>
              <div class="text-destructive text-xs mt-1">
                You've exceeded your {category.name.toLowerCase()} budget by {formatCurrency(category.spent - category.allocated)}
              </div>
            </div>
          {/if}
        </CardContent>
      </Card>
    {/each}
  </div>

  <!-- Goal Impact Analysis -->
  <Card class="border-border">
    <CardHeader>
      <div class="flex items-center justify-between">
        <CardTitle class="flex items-center gap-2">
          <Target size={18} />
          Goal Impact on Daily Allowance
        </CardTitle>
        <Button 
          variant="outline" 
          size="sm" 
          onclick={() => goto('/goals')}
          class="text-xs"
        >
          <ExternalLink size={12} class="mr-1" />
          Manage Goals
        </Button>
      </div>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="text-sm text-muted-foreground mb-4">
        See how your financial goals affect your daily spending allowance
      </div>
      
      {#each goalsImpact as goal (goal.id)}
        <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div class="flex items-center gap-3">
            <Target size={16} class="text-primary" />
            <div>
              <div class="font-medium">{goal.name}</div>
              <div class="text-muted-foreground text-sm">
                Monthly contribution: {formatCurrency(goal.monthlyContribution)}
              </div>
            </div>
          </div>
          <div class="text-right">
            <div class="font-medium text-warning">
              {goal.impactOnDailyAllowance < 0 ? '' : '+'}{formatCurrency(Math.abs(goal.impactOnDailyAllowance))}
            </div>
            <div class="text-muted-foreground text-sm">per day</div>
          </div>
        </div>
      {/each}

      <!-- Total Impact Summary -->
      <div class="border-t pt-4">
        <div class="flex items-center justify-between">
          <div class="font-semibold">Total Daily Impact</div>
          <div class="font-bold text-warning">
            {getDailyAllowanceImpact() < 0 ? '' : '+'}{formatCurrency(Math.abs(getDailyAllowanceImpact()))}
          </div>
        </div>
        <div class="text-muted-foreground text-sm">
          Total monthly goal contributions: {formatCurrency(getTotalGoalsImpact())}
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- Quick Actions -->
  <Card class="border-border">
    <CardHeader>
      <CardTitle>Quick Actions</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid grid-cols-2 gap-3">
        <Button variant="outline" onclick={onSetGoal} class="h-auto p-4">
          <div class="text-center">
            <Target class="mx-auto mb-2" size={20} />
            <div class="font-medium">Set New Goal</div>
            <div class="text-muted-foreground text-xs">Create financial milestone</div>
          </div>
        </Button>
        <Button variant="outline" onclick={() => console.log('Adjust budget')} class="h-auto p-4">
          <div class="text-center">
            <DollarSign class="mx-auto mb-2" size={20} />
            <div class="font-medium">Adjust Budget</div>
            <div class="text-muted-foreground text-xs">Modify allocations</div>
          </div>
        </Button>
      </div>
    </CardContent>
  </Card>
</div>
