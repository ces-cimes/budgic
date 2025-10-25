<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button/index.ts';
  import { Badge } from '$lib/components/ui/badge/index.ts';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
  import { 
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    AlertTriangle,
    CheckCircle,
    Clock,
    TrendingUp,
    TrendingDown
  } from '@lucide/svelte';
  import { formatAmount, formatTransactionAmount } from '$lib/utils/currency-utils';
  import { planService } from '../plan-service';
  import type { ProjectionsTabProps, WeeklyProjection } from '../types.js';

  const { 
    weeklyProjections, 
    userCurrency, 
    selectedAccountId, 
    onRefresh 
  }: ProjectionsTabProps = $props();

  // Week navigation state
  let currentStartWeek = $state<Date>(new Date());
  let visibleWeeks = $state<WeeklyProjection[]>([]);
  let loadingWeeks = $state<Set<string>>(new Set());
  let weekErrors = $state<Map<string, string>>(new Map());
  let firstDayOfWeek = $state<number>(1); // Default to Monday

  // Interactive features state
  let selectedWeekId = $state<string | null>(null);
  let expandedTransactions = $state<Set<string>>(new Set());

  onMount(async () => {
    try {
      // Get user's preferred first day of week (default to Monday)
      firstDayOfWeek = 1; // Default to Monday for now

      // Set current start week to the current week
      currentStartWeek = planService.getWeekStart(new Date(), firstDayOfWeek);

      await loadVisibleWeeks();
    } catch (error) {
      console.error('Error loading projections:', error);
    }
  });

  async function loadVisibleWeeks() {
    if (!selectedAccountId) return;

    const weekKeys = getWeekKeysForRange(currentStartWeek, 5);
    const newVisibleWeeks: WeeklyProjection[] = [];

    // Load each week individually
    for (const weekKey of weekKeys) {
      loadingWeeks.add(weekKey);
      weekErrors.delete(weekKey);

      try {
        const projection = await planService.getWeekProjection(selectedAccountId, weekKey);
        newVisibleWeeks.push(projection);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load week';
        weekErrors.set(weekKey, errorMessage);
      } finally {
        loadingWeeks.delete(weekKey);
      }
    }

    visibleWeeks = newVisibleWeeks;
  }

  function getWeekKeysForRange(startWeek: Date, count: number): string[] {
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
      const weekDate = planService.addWeeks(startWeek, i);
      keys.push(planService.getWeekKey(weekDate, firstDayOfWeek));
    }
    return keys;
  }

  function getRiskColor(riskLevel?: string) {
    switch (riskLevel) {
      case 'safe':
        return 'text-success';
      case 'caution':
        return 'text-warning';
      case 'danger':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  }

  function getRiskIcon(riskLevel?: string) {
    switch (riskLevel) {
      case 'safe':
        return CheckCircle;
      case 'caution':
        return AlertTriangle;
      case 'danger':
        return AlertTriangle;
      default:
        return Clock;
    }
  }

  function formatCurrency(amount: number): string {
    return formatAmount(amount, userCurrency);
  }

  function formatTransactionAmountLocal(amount: number): string {
    return formatTransactionAmount(amount, userCurrency);
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  function getWeekRange(weekStart: string, weekEnd: string): string {
    const start = new Date(weekStart);
    const end = new Date(weekEnd);
    const currentYear = new Date().getFullYear();

    // If both dates are in the same month
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      const monthName = start.toLocaleDateString('en-US', { month: 'short' });
      const yearSuffix = start.getFullYear() !== currentYear ? ` ${start.getFullYear()}` : '';
      return `${start.getDate()}-${end.getDate()} ${monthName}${yearSuffix}`;
    } else {
      // If dates span across months but same year
      if (start.getFullYear() === end.getFullYear()) {
        const yearSuffix = start.getFullYear() !== currentYear ? ` ${start.getFullYear()}` : '';
        return `${start.getDate()} ${start.toLocaleDateString('en-US', { month: 'short' })} - ${end.getDate()} ${end.toLocaleDateString('en-US', { month: 'short' })}${yearSuffix}`;
      } else {
        // If dates span across years
        const startYearSuffix =
          start.getFullYear() !== currentYear ? ` ${start.getFullYear()}` : '';
        const endYearSuffix = end.getFullYear() !== currentYear ? ` ${end.getFullYear()}` : '';
        return `${start.getDate()} ${start.toLocaleDateString('en-US', { month: 'short' })}${startYearSuffix} - ${end.getDate()} ${end.toLocaleDateString('en-US', { month: 'short' })}${endYearSuffix}`;
      }
    }
  }

  // Week navigation functions
  async function goToPreviousWeek() {
    currentStartWeek = planService.subtractWeeks(currentStartWeek, 1);
    await loadVisibleWeeks();
  }

  async function goToNextWeek() {
    currentStartWeek = planService.addWeeks(currentStartWeek, 1);
    await loadVisibleWeeks();
  }

  async function goToCurrentWeek() {
    currentStartWeek = planService.getWeekStart(new Date(), firstDayOfWeek);
    await loadVisibleWeeks();
  }

  function getVisibleWeekRange(): string {
    if (visibleWeeks.length === 0) return '';

    const firstWeek = visibleWeeks[0];
    const lastWeek = visibleWeeks[visibleWeeks.length - 1];

    const startDate = new Date(firstWeek.weekStart);
    const endDate = new Date(lastWeek.weekEnd);

    // Format the range
    if (startDate.getMonth() === endDate.getMonth()) {
      return `${startDate.getDate()}-${endDate.getDate()} ${startDate.toLocaleDateString('en-US', { month: 'short' })}`;
    } else {
      return `${startDate.getDate()} ${startDate.toLocaleDateString('en-US', { month: 'short' })} - ${endDate.getDate()} ${endDate.toLocaleDateString('en-US', { month: 'short' })}`;
    }
  }

  // Interactive functions
  function selectWeek(weekId: string) {
    selectedWeekId = selectedWeekId === weekId ? null : weekId;
  }

  function toggleTransactionExpansion(weekId: string) {
    const newSet = new Set(expandedTransactions);
    if (newSet.has(weekId)) {
      newSet.delete(weekId);
    } else {
      newSet.add(weekId);
    }
    expandedTransactions = newSet;
  }

  function getWeekId(week: WeeklyProjection): string {
    return `week-${week.weekNumber}-${week.weekStart}`;
  }

  function isCurrentWeek(week: WeeklyProjection): boolean {
    const today = new Date();
    const weekStart = new Date(week.weekStart);
    const weekEnd = new Date(week.weekEnd);

    return today >= weekStart && today <= weekEnd;
  }
</script>

<div class="space-y-6 p-4">
  <!-- Header with Week Navigation -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-primary text-lg font-semibold">Weekly Projections</h2>
      <div class="text-muted-foreground text-sm">
        {getVisibleWeekRange()}
      </div>
    </div>
    <Button
      onclick={onRefresh}
      size="sm"
      variant="outline"
      class="h-8 w-8 p-0"
    >
      <RefreshCw size={14} />
    </Button>
  </div>

  <!-- Week Navigation -->
  <div class="flex items-center gap-2">
    <Button
      variant="outline"
      size="square"
      onclick={goToPreviousWeek}
      class="h-10 w-10 touch-manipulation"
      title="Earlier weeks"
    >
      <ChevronLeft size={16} />
    </Button>
    <Button
      variant="ghost"
      size="sm"
      onclick={goToCurrentWeek}
      class="h-10 flex-1 touch-manipulation px-4"
      title="Go to current week"
    >
      <span class="hidden sm:inline">Current Week</span>
      <span class="sm:hidden">Current</span>
    </Button>
    <Button
      variant="outline"
      size="square"
      onclick={goToNextWeek}
      class="h-10 w-10 touch-manipulation"
      title="Later weeks"
    >
      <ChevronRight size={16} />
    </Button>
  </div>

  <!-- Weekly Projections -->
  <div class="space-y-3">
    {#each visibleWeeks as week, index}
      {@const RiskIcon = getRiskIcon(week.riskLevel)}
      {@const isCurrentWeekFlag = isCurrentWeek(week)}
      {@const netChange = week.plannedIncome - week.plannedExpenses}
      {@const weekId = getWeekId(week)}
      {@const isSelected = selectedWeekId === weekId}
      {@const isExpanded = expandedTransactions.has(weekId)}

      <Card 
        class="border-border hover:border-primary/30 cursor-pointer touch-manipulation transition-colors {isSelected
          ? 'border-primary/50 bg-primary/5'
          : ''}"
        onclick={() => selectWeek(weekId)}
        role="button"
        tabindex={0}
        onkeydown={(e) => e.key === 'Enter' && selectWeek(weekId)}
        title="Click to select week"
      >
        <CardContent class="p-4">
          <!-- Week Header -->
          <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <RiskIcon size={14} class={getRiskColor(week.riskLevel)} />
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-primary font-medium">
                    {getWeekRange(week.weekStart, week.weekEnd)}
                  </span>
                  {#if isCurrentWeekFlag}
                    <Badge variant="secondary" class="px-2 py-0.5 text-xs">Current</Badge>
                  {/if}
                </div>
              </div>
            </div>

            <!-- Risk Level Badge -->
            <Badge
              variant={week.riskLevel === 'safe'
                ? 'default'
                : week.riskLevel === 'caution'
                  ? 'secondary'
                  : 'destructive'}
              class="text-xs"
            >
              {week.riskLevel ? week.riskLevel.charAt(0).toUpperCase() + week.riskLevel.slice(1) : 'Safe'}
            </Badge>
          </div>

          <!-- Financial Summary -->
          <div class="mb-3 grid grid-cols-3 gap-2 text-sm">
            <div class="text-left">
              <div class="text-muted-foreground">Start</div>
              <div class="font-medium">
                {formatTransactionAmountLocal(week.startingBalance || 0)}
              </div>
            </div>
            <div class="text-center">
              <div class="text-muted-foreground">Change</div>
              <div class="font-medium {netChange >= 0 ? 'text-success' : 'text-destructive'}">
                {netChange >= 0 ? '+' : ''}{formatTransactionAmountLocal(netChange)}
              </div>
            </div>
            <div class="text-right">
              <div class="text-muted-foreground">End</div>
              <div class="font-medium {getRiskColor(week.riskLevel)}">
                {formatTransactionAmountLocal(week.endingBalance || 0)}
              </div>
            </div>
          </div>

          <!-- Transactions Preview -->
          {#if week.transactions && week.transactions.length > 0}
            <div
              class="border-border mt-2 border-t {(week.transactions?.length || 0) > 3
                ? 'hover:bg-muted/50 cursor-pointer'
                : ''} -m-1 rounded-md p-1 transition-colors"
              onclick={(week.transactions?.length || 0) > 3
                ? (e) => {
                    e.stopPropagation();
                    toggleTransactionExpansion(weekId);
                  }
                : undefined}
              role={(week.transactions?.length || 0) > 3 ? 'button' : undefined}
              {...(week.transactions?.length || 0) > 3
                ? {
                    tabindex: 0,
                    onkeydown: (e) => e.key === 'Enter' && toggleTransactionExpansion(weekId)
                  }
                : {}}
            >
              <div class="mb-1 flex items-center justify-between">
                <div class="text-muted-foreground text-xs">Transactions:</div>
                <div class="flex items-center gap-1">
                  <div class="text-muted-foreground text-xs">
                    {week.transactions?.length || 0}
                  </div>
                  {#if (week.transactions?.length || 0) > 3}
                    <div
                      class="text-muted-foreground text-xs transition-transform duration-200 {isExpanded
                        ? 'rotate-180'
                        : ''}"
                    >
                      ▼
                    </div>
                  {/if}
                </div>
              </div>

              <div class="space-y-1">
                {#each (week.transactions || []).slice(0, isExpanded ? (week.transactions?.length || 0) : (week.transactions?.length || 0) <= 3 ? (week.transactions?.length || 0) : 2) as transaction}
                  <div class="flex items-center justify-between text-xs">
                    <span class="truncate">{transaction.description || 'Transaction'}</span>
                    <span
                      class="font-medium {transaction.type === 'income'
                        ? 'text-success'
                        : 'text-destructive'}"
                    >
                      {formatTransactionAmountLocal(transaction.amount || 0)}
                    </span>
                  </div>
                {/each}
                {#if (week.transactions?.length || 0) > 3 && !isExpanded}
                  <div class="text-muted-foreground py-0.5 text-center text-xs">
                    +{(week.transactions?.length || 0) - 2} more
                  </div>
                {/if}
              </div>
            </div>
          {:else}
            <div class="border-border mt-2 border-t pt-2 text-center">
              <div class="text-muted-foreground text-xs">No planned transactions</div>
            </div>
          {/if}
        </CardContent>
      </Card>
    {/each}
  </div>
</div>
