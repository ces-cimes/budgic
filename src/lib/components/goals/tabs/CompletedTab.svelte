<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import {
		CheckCircle,
		Calendar,
		DollarSign,
		TrendingUp,
		Award,
		Clock,
		Filter
	} from '@lucide/svelte';
	import { formatAmount } from '$lib/utils/currency-utils';
	import type { Goal } from '../types';

	interface Props {
		completedGoals: Goal[];
		userCurrency: string;
		onGoalAction: (action: string, goalId: string) => void;
	}

	let { completedGoals, userCurrency, onGoalAction }: Props = $props();

	let sortBy = $state<'date' | 'amount' | 'category'>('date');
	let filterBy = $state<string>('all');

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

	function getCategoryName(category: string) {
		const names: Record<string, string> = {
			emergency_fund: 'Emergency Fund',
			vacation: 'Vacation',
			house_down_payment: 'House Down Payment',
			car_purchase: 'Car Purchase',
			education: 'Education',
			retirement: 'Retirement',
			debt_payoff: 'Debt Payoff',
			wedding: 'Wedding',
			home_improvement: 'Home Improvement',
			investment: 'Investment',
			other: 'Other'
		};
		return names[category] || category;
	}

	function getDaysToComplete(goal: Goal) {
		if (!goal.completedAt || !goal.createdAt) return null;
		const completedDate = new Date(goal.completedAt);
		const createdDate = new Date(goal.createdAt);
		const timeDiff = completedDate.getTime() - createdDate.getTime();
		return Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
	}

	function getCompletionRate(goal: Goal) {
		if (!goal.completedAt || !goal.createdAt) return null;
		const daysToComplete = getDaysToComplete(goal);
		if (!daysToComplete) return null;

		// Calculate expected completion based on monthly contribution
		if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return null;

		const expectedDays = Math.ceil((goal.targetAmount / goal.monthlyContribution) * 30);
		return Math.round((expectedDays / daysToComplete) * 100);
	}

	function getSortedAndFilteredGoals() {
		let filtered = completedGoals;

		// Apply filter
		if (filterBy !== 'all') {
			filtered = filtered.filter((goal) => goal.category === filterBy);
		}

		// Apply sort
		return filtered.sort((a, b) => {
			switch (sortBy) {
				case 'date':
					const aDate = a.completedAt ? new Date(a.completedAt).getTime() : 0;
					const bDate = b.completedAt ? new Date(b.completedAt).getTime() : 0;
					return bDate - aDate;
				case 'amount':
					return b.targetAmount - a.targetAmount;
				case 'category':
					return a.category.localeCompare(b.category);
				default:
					return 0;
			}
		});
	}

	function getTotalCompletedValue() {
		return completedGoals.reduce((sum, goal) => sum + goal.targetAmount, 0);
	}

	function getAverageCompletionTime() {
		const completionTimes = completedGoals
			.map((goal) => getDaysToComplete(goal))
			.filter((time) => time !== null) as number[];

		if (completionTimes.length === 0) return null;
		return Math.round(
			completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length
		);
	}

	function getCategories() {
		const categories = [...new Set(completedGoals.map((goal) => goal.category))];
		return categories.map((category) => ({
			value: category,
			label: getCategoryName(category)
		}));
	}
</script>

<div class="space-y-6 p-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-primary text-2xl font-bold">Completed Goals</h2>
			<p class="text-muted-foreground">Celebrate your achievements</p>
		</div>

		{#if completedGoals.length > 0}
			<div class="flex items-center gap-2">
				<Button.Root variant="outline" size="sm">
					<Filter class="mr-2 h-4 w-4" />
					Filter
				</Button.Root>
			</div>
		{/if}
	</div>

	{#if completedGoals.length > 0}
		<!-- Stats Summary -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<Card.Root>
				<Card.Content class="p-6">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-muted-foreground text-sm font-medium">Total Completed</p>
							<p class="text-2xl font-bold text-green-500">{completedGoals.length}</p>
						</div>
						<CheckCircle class="h-8 w-8 text-green-500" />
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Content class="p-6">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-muted-foreground text-sm font-medium">Total Value</p>
							<p class="text-primary text-2xl font-bold">
								{formatAmount(getTotalCompletedValue(), userCurrency)}
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
							<p class="text-muted-foreground text-sm font-medium">Avg. Time</p>
							<p class="text-2xl font-bold text-[var(--color-amber)]">
								{getAverageCompletionTime() ? `${getAverageCompletionTime()} days` : 'N/A'}
							</p>
						</div>
						<Clock class="h-8 w-8 text-[var(--color-amber)]" />
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Filters and Sort -->
		<Card.Root>
			<Card.Content class="p-4">
				<div class="flex flex-wrap items-center gap-4">
					<div class="flex items-center gap-2">
						<span class="text-primary text-sm font-medium">Sort by:</span>
						<select
							bind:value={sortBy}
							class="border-input bg-background rounded-md border px-3 py-1 text-sm"
						>
							<option value="date">Completion Date</option>
							<option value="amount">Amount</option>
							<option value="category">Category</option>
						</select>
					</div>

					<div class="flex items-center gap-2">
						<span class="text-primary text-sm font-medium">Filter by:</span>
						<select
							bind:value={filterBy}
							class="border-input bg-background rounded-md border px-3 py-1 text-sm"
						>
							<option value="all">All Categories</option>
							{#each getCategories() as category}
								<option value={category.value}>{category.label}</option>
							{/each}
						</select>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- Completed Goals List -->
		<div class="space-y-4">
			{#each getSortedAndFilteredGoals() as goal (goal.id)}
				<Card.Root class="border-green-200 dark:border-green-800">
					<Card.Content class="p-6">
						<div class="space-y-4">
							<!-- Goal Header -->
							<div class="flex items-start justify-between">
								<div class="flex items-center space-x-4">
									<div class="text-3xl">{getCategoryIcon(goal.category)}</div>
									<div>
										<div class="mb-1 flex items-center gap-2">
											<h3 class="text-primary text-lg font-semibold">{goal.name}</h3>
											<Badge
												class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
											>
												Completed
											</Badge>
										</div>
										{#if goal.description}
											<p class="text-muted-foreground text-sm">{goal.description}</p>
										{/if}
										<div class="text-muted-foreground mt-2 flex items-center gap-4 text-xs">
											<span>{getCategoryName(goal.category)}</span>
											{#if goal.completedAt}
												<span>Completed {new Date(goal.completedAt).toLocaleDateString()}</span>
											{/if}
										</div>
									</div>
								</div>

								<div class="text-right">
									<div class="text-2xl font-bold text-green-600">
										{formatAmount(goal.targetAmount, goal.currency)}
									</div>
									<div class="flex items-center justify-end gap-1 text-green-600">
										<Award class="h-4 w-4" />
										<span class="text-sm font-medium">Achieved!</span>
									</div>
								</div>
							</div>

							<!-- Completion Details -->
							<div
								class="grid grid-cols-1 gap-4 border-t border-green-200 pt-4 md:grid-cols-3 dark:border-green-800"
							>
								<div class="flex items-center space-x-2">
									<Calendar class="text-muted-foreground h-4 w-4" />
									<div>
										<div class="text-muted-foreground text-sm">Time to Complete</div>
										<div class="text-primary font-medium">
											{#if getDaysToComplete(goal)}
												{getDaysToComplete(goal)} days
											{:else}
												Unknown
											{/if}
										</div>
									</div>
								</div>

								<div class="flex items-center space-x-2">
									<TrendingUp class="text-muted-foreground h-4 w-4" />
									<div>
										<div class="text-muted-foreground text-sm">Completion Rate</div>
										<div class="text-primary font-medium">
											{#if getCompletionRate(goal)}
												{getCompletionRate(goal)}% of expected
											{:else}
												N/A
											{/if}
										</div>
									</div>
								</div>

								<div class="flex items-center space-x-2">
									<DollarSign class="text-muted-foreground h-4 w-4" />
									<div>
										<div class="text-muted-foreground text-sm">Monthly Contribution</div>
										<div class="text-primary font-medium">
											{goal.monthlyContribution
												? formatAmount(goal.monthlyContribution, goal.currency)
												: 'Not tracked'}
										</div>
									</div>
								</div>
							</div>

							<!-- Achievement Badge -->
							<div class="flex justify-center pt-4">
								<div
									class="flex items-center gap-2 rounded-full px-4 py-2"
									style="background: color-mix(in oklch, var(--color-sage-green) 12%, transparent);"
								>
									<Award class="h-5 w-5 text-[var(--color-sage-green)]" />
									<span class="text-sm font-medium text-[var(--color-sage-green)]">
										Goal achieved
									</span>
								</div>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else}
		<!-- Empty State -->
		<div class="squircle-4xl squircle-border bg-card p-12 text-center">
			<p class="text-muted-foreground text-sm">No completed goals yet.</p>
			<p class="mt-1 text-xs text-[var(--color-text-tertiary)]">
				Finish your first goal to see it here.
			</p>
			<a
				href="/plan?tab=goals"
				class="mt-4 inline-block text-sm text-[var(--color-amber)] hover:underline"
			>
				View goals
			</a>
		</div>
	{/if}
</div>
