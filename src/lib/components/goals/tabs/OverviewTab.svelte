<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';
	import { EmptyState } from '$lib/components/ui/empty-state';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Progress } from '$lib/components/ui/progress/index.ts';
	import {
		Target,
		TrendingUp,
		Calendar,
		DollarSign,
		Plus,
		CheckCircle,
		Clock,
		AlertCircle,
		BarChart3,
		ExternalLink,
		Sparkles
	} from '@lucide/svelte';
	import { formatAmount, formatPercentage } from '$lib/utils/currency-utils';
	import { goalService, goalOpportunityService } from '$lib/core/services';
	import type { SavingsOpportunitiesResult } from '$lib/core/services/core/goal-opportunity-service';
	import type { GoalsData, Goal } from '../types';
	import GoalTradeoffPanel from '../GoalTradeoffPanel.svelte';

	interface Props {
		goalsData: GoalsData | null;
		activeGoals: Goal[];
		completedGoals: Goal[];
		userCurrency: string;
		onGoalAction: (action: string, goalId: string) => void;
	}

	let { goalsData, activeGoals, completedGoals, userCurrency, onGoalAction }: Props = $props();

	let opportunitiesResult = $state<SavingsOpportunitiesResult | null>(null);
	onMount(async () => {
		try {
			opportunitiesResult = await goalOpportunityService.getSavingsOpportunities();
		} catch (e) {
			console.error('Failed to load savings opportunities:', e);
		}
	});

	function getCategoryIcon(category: string) {
		const icons: Record<string, string> = {
			emergency_fund: '🛡️',
			vacation: '✈️',
			house_down_payment: '🏠',
			car_purchase: '🚗',
			education: '🎓',
			retirement: '💰',
			debt_payoff: '💳',
			wedding: '💍',
			home_improvement: '🔨',
			investment: '📈',
			other: '🎯'
		};
		return icons[category] || '🎯';
	}

	function getPriorityColor(priority: string) {
		const colors = {
			low: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
			medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
			high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
			critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
		};
		return colors[priority as keyof typeof colors] || colors.medium;
	}

	function getProgressColor(progress: number) {
		if (progress >= 100) return 'text-green-500';
		if (progress >= 75) return 'text-[var(--color-amber)]';
		if (progress >= 50) return 'text-yellow-500';
		return 'text-red-500';
	}

	function getProgressBgColor(progress: number) {
		if (progress >= 100) return 'bg-green-500';
		if (progress >= 75) return 'bg-[var(--color-amber)]';
		if (progress >= 50) return 'bg-yellow-500';
		return 'bg-red-500';
	}

	function getDaysUntilTarget(targetDate?: string) {
		if (!targetDate) return null;
		const target = new Date(targetDate);
		const now = new Date();
		const diffTime = target.getTime() - now.getTime();
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
		return diffDays;
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'active':
				return Clock;
			case 'completed':
				return CheckCircle;
			case 'paused':
				return AlertCircle;
			default:
				return Target;
		}
	}

	function getRequiredSavingsLabel(goal: Goal): string | null {
		const req = goalService.getRequiredSavings(goal);
		if (req.isTimeBound && req.requiredMonthly != null && req.requiredMonthly > 0) {
			return `${formatAmount(req.requiredMonthly, goal.currency)}/mo to target`;
		}
		if (req.suggestedMonthly != null && req.suggestedMonthly > 0) {
			return `${formatAmount(req.suggestedMonthly, goal.currency)}/mo suggested`;
		}
		return null;
	}
</script>

<div class="space-y-6 p-6">
	{#if goalsData}
		<!-- Goals Overview Stats -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
			<Card.Root>
				<Card.Content class="p-6">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-muted-foreground text-sm font-medium">Total Goals</p>
							<p class="text-primary text-2xl font-bold">{goalsData.totalGoals}</p>
						</div>
						<Target class="text-primary h-8 w-8" />
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Content class="p-6">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-muted-foreground text-sm font-medium">Active Goals</p>
							<p class="text-2xl font-bold text-[var(--color-amber)]">{goalsData.activeGoals}</p>
						</div>
						<TrendingUp class="h-8 w-8 text-[var(--color-amber)]" />
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Content class="p-6">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-muted-foreground text-sm font-medium">Total Value</p>
							<p class="text-primary text-2xl font-bold">
								{formatAmount(goalsData.totalTargetValue, userCurrency)}
							</p>
						</div>
						<DollarSign class="text-primary h-8 w-8" />
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Content class="p-6">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-muted-foreground text-sm font-medium">Overall Progress</p>
							<p class="text-2xl font-bold text-green-500">
								{formatPercentage(goalsData.overallProgress)}
							</p>
						</div>
						<CheckCircle class="h-8 w-8 text-green-500" />
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Overall Progress Bar -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Overall Progress</Card.Title>
				<Card.Description>Your progress across all active goals</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					<div class="flex justify-between text-sm">
						<span class="text-muted-foreground">Progress</span>
						<span class="text-primary font-medium">{goalsData.overallProgress.toFixed(1)}%</span>
					</div>
					<Progress value={goalsData.overallProgress} class="h-3" />
				</div>

				<div class="grid grid-cols-2 gap-4 text-sm">
					<div>
						<span class="text-muted-foreground">Current Value:</span>
						<span class="text-primary ml-2 font-medium"
							>{formatAmount(goalsData.totalCurrentValue, userCurrency)}</span
						>
					</div>
					<div>
						<span class="text-muted-foreground">Target Value:</span>
						<span class="text-primary ml-2 font-medium"
							>{formatAmount(goalsData.totalTargetValue, userCurrency)}</span
						>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- Monthly Contribution Summary -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Monthly Contributions</Card.Title>
				<Card.Description>Total monthly contributions across all active goals</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="text-center">
					<div class="text-primary mb-2 text-3xl font-bold">
						{formatAmount(goalsData.monthlyContributionTotal, userCurrency)}
					</div>
					<p class="text-muted-foreground text-sm">per month</p>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- Goal trade-off analysis (Phase 2.3) -->
		<GoalTradeoffPanel {activeGoals} {userCurrency} />

		<!-- Savings opportunities (Phase 2.2) -->
		{#if opportunitiesResult}
			<Card.Root>
				<Card.Header>
					<div class="flex items-center gap-2">
						<Sparkles class="h-5 w-5 text-amber-500" />
						<div>
							<Card.Title>Savings opportunities</Card.Title>
							<Card.Description>
								{#if opportunitiesResult.surplus >= opportunitiesResult.threshold}
									You have {formatAmount(opportunitiesResult.surplus, opportunitiesResult.currency)} surplus
									this period. Contribute to goals?
								{:else if opportunitiesResult.surplus > 0}
									Surplus this period: {formatAmount(
										opportunitiesResult.surplus,
										opportunitiesResult.currency
									)} (suggestions when above {formatAmount(
										opportunitiesResult.threshold,
										opportunitiesResult.currency
									)})
								{:else}
									No surplus this period after income, essentials, buffer, allowances, and goal
									commitments.
								{/if}
							</Card.Description>
						</div>
					</div>
				</Card.Header>
				<Card.Content>
					{#if opportunitiesResult.opportunities.length > 0}
						<div class="space-y-3">
							{#each opportunitiesResult.opportunities as opp (opp.goalId)}
								<div
									class="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20"
								>
									<div class="min-w-0 flex-1">
										<p class="text-primary font-medium">{opp.goalName}</p>
										<p class="text-muted-foreground text-sm">{opp.impactMessage}</p>
									</div>
									<div class="ml-3 flex shrink-0 items-center gap-2">
										<span class="font-semibold text-amber-700 dark:text-amber-300">
											{formatAmount(opp.suggestedAmount, opp.currency)}
										</span>
										<Button.Root
											size="sm"
											variant="outline"
											onclick={() => onGoalAction('add_progress', opp.goalId)}
										>
											Add
										</Button.Root>
									</div>
								</div>
							{/each}
						</div>
					{:else if opportunitiesResult.surplus >= opportunitiesResult.threshold && activeGoals.length > 0}
						<p class="text-muted-foreground text-sm">
							All goals are funded for this period or no remaining balance needed.
						</p>
					{:else if opportunitiesResult.surplus >= opportunitiesResult.threshold}
						<p class="text-muted-foreground text-sm">
							Create a goal to see contribution suggestions.
						</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}
	{/if}

	<!-- Active Goals Preview -->
	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between">
				<div>
					<Card.Title>Active Goals</Card.Title>
					<Card.Description>Your current financial goals</Card.Description>
				</div>
				<Button.Root size="sm" onclick={() => goto('/plan?tab=goals')}>
					<Plus class="mr-2 h-4 w-4" />
					Add Goal
				</Button.Root>
			</div>
		</Card.Header>
		<Card.Content>
			{#if activeGoals.length > 0}
				<div class="space-y-4">
					{#each activeGoals.slice(0, 3) as goal (goal.id)}
						<div
							class="hover:bg-accent flex items-center justify-between rounded-lg border p-4 transition-colors"
						>
							<div class="flex items-center space-x-4">
								<div class="text-2xl">{getCategoryIcon(goal.category)}</div>
								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<h3 class="text-primary font-medium">{goal.name}</h3>
										<Badge class={getPriorityColor(goal.priority)}>
											{goal.priority}
										</Badge>
									</div>
									<div class="text-muted-foreground mb-2 text-sm">
										{formatAmount(goal.currentAmount, goal.currency)} of {formatAmount(
											goal.targetAmount,
											goal.currency
										)}
										{#if getRequiredSavingsLabel(goal)}
											<span class="text-muted-foreground"> · {getRequiredSavingsLabel(goal)}</span>
										{/if}
									</div>
									<div class="bg-muted h-2 w-full rounded-full">
										<div
											class="h-2 rounded-full transition-all duration-300 {getProgressBgColor(
												(goal.currentAmount / goal.targetAmount) * 100
											)}"
											style="width: {Math.min(
												(goal.currentAmount / goal.targetAmount) * 100,
												100
											)}%"
										></div>
									</div>
								</div>
							</div>

							<div class="text-right">
								<div
									class="text-lg font-semibold {getProgressColor(
										(goal.currentAmount / goal.targetAmount) * 100
									)}"
								>
									{formatPercentage((goal.currentAmount / goal.targetAmount) * 100)}
								</div>
								{#if goal.targetDate}
									{@const daysLeft = getDaysUntilTarget(goal.targetDate)}
									{#if daysLeft !== null}
										<div class="text-muted-foreground text-xs">
											{daysLeft > 0 ? `${daysLeft} days left` : 'Overdue'}
										</div>
									{/if}
								{/if}
							</div>
						</div>
					{/each}

					{#if activeGoals.length > 3}
						<div class="pt-2 text-center">
							<Button.Root variant="ghost" onclick={() => goto('/goals?tab=active')}>
								View All {activeGoals.length} Goals
							</Button.Root>
						</div>
					{/if}
				</div>
			{:else}
				<EmptyState
					icon={Target}
					heading="No Active Goals"
					body="Start by creating your first financial goal"
					bodyClass="text-muted-foreground mb-4"
					class="py-8"
					iconClass="mx-auto mb-4 h-12 w-12 text-muted-foreground"
				>
					{#snippet children()}
						<Button.Root onclick={() => goto('/plan?tab=goals')}>
							<Plus class="mr-2 h-4 w-4" />
							Create Goal
						</Button.Root>
					{/snippet}
				</EmptyState>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Recent Completions -->
	{#if completedGoals.length > 0}
		<Card.Root>
			<Card.Header>
				<div class="flex items-center justify-between">
					<div>
						<Card.Title>Recent Completions</Card.Title>
						<Card.Description>Goals you've recently achieved</Card.Description>
					</div>
					<Button.Root variant="ghost" size="sm" onclick={() => goto('/goals?tab=completed')}>
						View All
					</Button.Root>
				</div>
			</Card.Header>
			<Card.Content>
				<div class="space-y-3">
					{#each completedGoals.slice(0, 2) as goal (goal.id)}
						<div
							class="flex items-center justify-between rounded-lg bg-green-50 p-3 dark:bg-green-900/20"
						>
							<div class="flex items-center space-x-3">
								<div class="text-xl">{getCategoryIcon(goal.category)}</div>
								<div>
									<div class="text-primary font-medium">{goal.name}</div>
									<div class="text-muted-foreground text-sm">
										Completed {goal.completedAt
											? new Date(goal.completedAt).toLocaleDateString()
											: 'Recently'}
									</div>
								</div>
							</div>
							<div class="text-right">
								<div class="text-lg font-semibold text-green-600">
									{formatAmount(goal.targetAmount, goal.currency)}
								</div>
								<CheckCircle class="h-5 w-5 text-green-600" />
							</div>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Cross-Route Integration -->
	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between">
				<div>
					<Card.Title>Planning Integration</Card.Title>
					<Card.Description>See how your goals affect your daily budget</Card.Description>
				</div>
				<Button.Root variant="outline" size="sm" onclick={() => goto('/plan?tab=budget')}>
					<BarChart3 class="mr-2 h-4 w-4" />
					View Budget Impact
				</Button.Root>
			</div>
		</Card.Header>
		<Card.Content>
			<div class="space-y-3">
				<div
					class="flex items-center justify-between rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20"
				>
					<div class="flex items-center space-x-3">
						<BarChart3 class="h-5 w-5 text-blue-600" />
						<div>
							<div class="text-primary font-medium">Budget Impact Analysis</div>
							<div class="text-muted-foreground text-sm">
								See how your goals affect your daily spending allowance
							</div>
						</div>
					</div>
					<Button.Root variant="ghost" size="sm" onclick={() => goto('/plan?tab=budget')}>
						<ExternalLink class="h-4 w-4" />
					</Button.Root>
				</div>

				<div class="text-muted-foreground text-sm">
					Your active goals contribute to your overall financial plan.
					<Button.Root
						variant="link"
						size="sm"
						class="h-auto p-0 text-blue-600"
						onclick={() => goto('/plan?tab=budget')}
					>
						View detailed budget analysis
					</Button.Root>
				</div>
			</div>
		</Card.Content>
	</Card.Root>
</div>
