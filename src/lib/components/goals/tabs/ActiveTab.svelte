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
		Plus,
		Edit,
		MoreHorizontal,
		Calendar,
		DollarSign,
		TrendingUp,
		Clock,
		AlertCircle,
		CheckCircle
	} from '@lucide/svelte';
	import { formatAmount, formatPercentage } from '$lib/utils/currency-utils';
	import { goalService, insightsService, budgetService } from '$lib/core/services';
	import type { Goal } from '../types';
	import InlineAlertBadge from '$lib/components/InlineAlertBadge.svelte';
	import type { Insight } from '$lib/core/db';

	interface Props {
		activeGoals: Goal[];
		userCurrency: string;
		onGoalAction: (action: string, goalId: string) => void;
	}

	let { activeGoals, userCurrency, onGoalAction }: Props = $props();

	/** Low-tier (success/info) insights for inline badges on goal cards. Key = goalId. */
	let inlineInsightsByGoal = $state<Map<string, Insight[]>>(new Map());

	let expenseCategoryOptions = $state<{ value: string; label: string }[]>([]);

	onMount(async () => {
		try {
			const cats = await budgetService.getBudgetCategories();
			expenseCategoryOptions = cats
				.filter((c) => c.type === 'expense' && c.isActive && c.waterfallTier)
				.sort((a, b) => a.priority - b.priority)
				.map((c) => ({ value: c.id, label: c.name }));
		} catch {
			expenseCategoryOptions = [];
		}
		try {
			const lowTier = await insightsService.getLowTierInlineInsights();
			const byGoal = new Map<string, Insight[]>();
			for (const i of lowTier) {
				if (i.goalId) {
					const list = byGoal.get(i.goalId) ?? [];
					list.push(i);
					byGoal.set(i.goalId, list);
				}
			}
			inlineInsightsByGoal = byGoal;
		} catch {
			// Non-blocking
		}
	});

	async function dismissInlineAlert(insightId: string) {
		await insightsService.dismissInsight(insightId);
		const next = await insightsService.getLowTierInlineInsights();
		const byGoal = new Map<string, Insight[]>();
		for (const i of next) {
			if (i.goalId) {
				const list = byGoal.get(i.goalId) ?? [];
				list.push(i);
				byGoal.set(i.goalId, list);
			}
		}
		inlineInsightsByGoal = byGoal;
	}

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

	function getStatusIcon(status: string) {
		switch (status) {
			case 'active':
				return Clock;
			case 'paused':
				return AlertCircle;
			default:
				return Target;
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'active':
				return 'text-green-500';
			case 'paused':
				return 'text-yellow-500';
			default:
				return 'text-muted-foreground';
		}
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

	function getEstimatedCompletionDate(goal: Goal) {
		if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return null;

		const remainingAmount = goal.targetAmount - goal.currentAmount;
		const monthsRemaining = Math.ceil(remainingAmount / goal.monthlyContribution);

		const completionDate = new Date();
		completionDate.setMonth(completionDate.getMonth() + monthsRemaining);

		return completionDate;
	}

	/** Required/suggested monthly savings display for goal UI (Phase 2.1) */
	function getRequiredSavingsDisplay(
		goal: Goal
	):
		| { kind: 'time-bound'; amount: number; monthsRemaining?: number }
		| { kind: 'suggested'; amount: number }
		| null {
		const req = goalService.getRequiredSavings(goal);
		if (req.isTimeBound && req.requiredMonthly != null && req.requiredMonthly > 0) {
			return {
				kind: 'time-bound',
				amount: req.requiredMonthly,
				monthsRemaining: req.monthsRemaining
			};
		}
		if (req.suggestedMonthly != null && req.suggestedMonthly > 0) {
			return { kind: 'suggested', amount: req.suggestedMonthly };
		}
		return null;
	}

	function handleAddProgress(goalId: string) {
		onGoalAction('add_progress', goalId);
	}

	function handleEditGoal(goalId: string) {
		onGoalAction('edit', goalId);
	}

	function handleCompleteGoal(goalId: string) {
		onGoalAction('complete', goalId);
	}

	function handlePauseGoal(goalId: string) {
		onGoalAction('pause', goalId);
	}

	function handleResumeGoal(goalId: string) {
		onGoalAction('resume', goalId);
	}

	function handleDeleteGoal(goalId: string) {
		onGoalAction('delete', goalId);
	}

	function categoryLabel(categoryId: string): string {
		return expenseCategoryOptions.find((o) => o.value === categoryId)?.label ?? categoryId;
	}

	async function persistLinkedIds(goalId: string, ids: string[]) {
		const trimmed = ids.slice(0, 8);
		await goalService.updateGoal(goalId, {
			linkedCategoryIds: trimmed.length ? trimmed : undefined
		});
		onGoalAction('refresh', goalId);
	}

	async function removeLinkedCategory(goalId: string, categoryId: string) {
		const goal = activeGoals.find((g) => g.id === goalId);
		if (!goal) return;
		const next = (goal.linkedCategoryIds ?? []).filter((id) => id !== categoryId);
		await persistLinkedIds(goalId, next);
	}

	async function addLinkedCategory(goalId: string, categoryId: string) {
		if (!categoryId) return;
		const goal = activeGoals.find((g) => g.id === goalId);
		if (!goal) return;
		const cur = goal.linkedCategoryIds ?? [];
		if (cur.includes(categoryId) || cur.length >= 8) return;
		await persistLinkedIds(goalId, [...cur, categoryId]);
	}
</script>

<div class="space-y-6 p-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-primary text-2xl font-bold">Active Goals</h2>
			<p class="text-muted-foreground">Manage your current financial goals</p>
		</div>
		<Button.Root onclick={() => goto('/plan?tab=goals')}>
			<Plus class="mr-2 h-4 w-4" />
			Add Goal
		</Button.Root>
	</div>

	{#if activeGoals.length > 0}
		<!-- Goals List -->
		<div class="space-y-4">
			{#each activeGoals as goal (goal.id)}
				{@const reqDisplay = getRequiredSavingsDisplay(goal)}
				<Card.Root>
					<Card.Content class="p-6">
						<div class="space-y-4">
							<!-- Goal Header -->
							<div class="flex items-start justify-between">
								<div class="flex items-center space-x-4">
									<div class="text-3xl">{getCategoryIcon(goal.category)}</div>
									<div>
										<div class="mb-1 flex flex-wrap items-center gap-2">
											<h3 class="text-primary text-lg font-semibold">{goal.name}</h3>
											<Badge class={getPriorityColor(goal.priority)}>
												{goal.priority}
											</Badge>
											{#if (inlineInsightsByGoal.get(goal.id)?.length ?? 0) > 0}
												<InlineAlertBadge
													insights={inlineInsightsByGoal.get(goal.id)!}
													onDismiss={dismissInlineAlert}
													label="at risk"
												/>
											{/if}
										</div>
										{#if goal.description}
											<p class="text-muted-foreground text-sm">{goal.description}</p>
										{/if}
									</div>
								</div>

								<div class="flex items-center gap-2">
									{#if goal.status === 'active'}
										<Button.Root
											variant="outline"
											size="sm"
											onclick={() => handleAddProgress(goal.id)}
										>
											<Plus class="mr-1 h-4 w-4" />
											Add Progress
										</Button.Root>
									{/if}

									<Button.Root variant="ghost" size="sm">
										<MoreHorizontal class="h-4 w-4" />
									</Button.Root>
								</div>
							</div>

							<!-- Progress Section -->
							<div class="space-y-3">
								<div class="flex justify-between text-sm">
									<span class="text-muted-foreground">Progress</span>
									<span class="text-primary font-medium">
										{formatAmount(goal.currentAmount, goal.currency)} / {formatAmount(
											goal.targetAmount,
											goal.currency
										)}
									</span>
								</div>

								<div class="space-y-2">
									<Progress value={(goal.currentAmount / goal.targetAmount) * 100} class="h-3" />
									<div class="flex justify-between text-sm">
										<span class="text-muted-foreground">0%</span>
										<span
											class="font-semibold {getProgressColor(
												(goal.currentAmount / goal.targetAmount) * 100
											)}"
										>
											{formatPercentage((goal.currentAmount / goal.targetAmount) * 100)}
										</span>
										<span class="text-muted-foreground">100%</span>
									</div>
								</div>
							</div>

							<!-- Goal Details -->
							<div class="grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-2 lg:grid-cols-4">
								<div class="flex items-center space-x-2">
									<DollarSign class="text-muted-foreground h-4 w-4" />
									<div>
										<div class="text-muted-foreground text-sm">Monthly Contribution</div>
										<div class="text-primary font-medium">
											{goal.monthlyContribution
												? formatAmount(goal.monthlyContribution, goal.currency)
												: 'Not set'}
										</div>
									</div>
								</div>

								<div class="flex items-center space-x-2">
									<Calendar class="text-muted-foreground h-4 w-4" />
									<div>
										<div class="text-muted-foreground text-sm">Target Date</div>
										<div class="text-primary font-medium">
											{goal.targetDate ? new Date(goal.targetDate).toLocaleDateString() : 'Not set'}
										</div>
									</div>
								</div>

								<div class="flex items-center space-x-2">
									<TrendingUp class="text-muted-foreground h-4 w-4" />
									<div>
										<div class="text-muted-foreground text-sm">Est. Completion</div>
										<div class="text-primary font-medium">
											{#if goal.monthlyContribution && goal.monthlyContribution > 0}
												{@const estCompletion = getEstimatedCompletionDate(goal)}
												{estCompletion ? estCompletion.toLocaleDateString() : 'Calculating...'}
											{:else}
												Not available
											{/if}
										</div>
									</div>
								</div>

								<div class="flex items-center space-x-2">
									<Target class="text-muted-foreground h-4 w-4" />
									<div>
										<div class="text-muted-foreground text-sm">Required Monthly</div>
										<div class="text-primary font-medium">
											{#if reqDisplay}
												{#if reqDisplay.kind === 'time-bound'}
													{formatAmount(reqDisplay.amount, goal.currency)}
													{#if reqDisplay.monthsRemaining != null}
														<span class="text-muted-foreground block text-xs"
															>to hit target in {Math.ceil(reqDisplay.monthsRemaining)} mo.</span
														>
													{/if}
												{:else}
													{formatAmount(reqDisplay.amount, goal.currency)}
													<span class="text-muted-foreground block text-xs"
														>suggested (open-ended)</span
													>
												{/if}
											{:else}
												—
											{/if}
										</div>
									</div>
								</div>
							</div>

							<div class="space-y-2 border-t pt-4">
								<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
									Split nudge categories
								</p>
								<p class="text-muted-foreground text-xs">
									Optional expense categories for post-save split prompts (merchant profile must
									suggest them).
								</p>
								<div class="flex flex-wrap gap-2">
									{#each goal.linkedCategoryIds ?? [] as cid (cid)}
										<button
											type="button"
											class="bg-secondary text-secondary-foreground hover:bg-secondary/80 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
											onclick={() => removeLinkedCategory(goal.id, cid)}
										>
											{categoryLabel(cid)}
											<span class="opacity-70" aria-hidden="true">×</span>
										</button>
									{/each}
								</div>
								<select
									class="border-input bg-background mt-1 max-w-md rounded-md border px-2 py-2 text-sm"
									aria-label="Add linked expense category"
									value=""
									onchange={async (e) => {
										const el = e.currentTarget;
										const v = el.value;
										el.value = '';
										if (v) await addLinkedCategory(goal.id, v);
									}}
								>
									<option value="">Add category…</option>
									{#each expenseCategoryOptions as o (o.value)}
										{#if !(goal.linkedCategoryIds ?? []).includes(o.value)}
											<option value={o.value}>{o.label}</option>
										{/if}
									{/each}
								</select>
							</div>

							<!-- Status and Actions -->
							<div class="flex items-center justify-between border-t pt-4">
								<div class="flex items-center space-x-2">
									{#if goal.status === 'active'}
										{@const StatusIcon = Clock}
										<StatusIcon class="h-4 w-4 text-green-500" />
										<span class="text-sm font-medium text-green-600">Active</span>
									{:else if goal.status === 'paused'}
										{@const StatusIcon = AlertCircle}
										<StatusIcon class="h-4 w-4 text-yellow-500" />
										<span class="text-sm font-medium text-yellow-600">Paused</span>
									{/if}

									{#if goal.targetDate}
										{@const daysLeft = getDaysUntilTarget(goal.targetDate)}
										{#if daysLeft !== null}
											<span class="text-muted-foreground text-xs">
												{daysLeft > 0 ? `${daysLeft} days left` : 'Overdue'}
											</span>
										{/if}
									{/if}
								</div>

								<div class="flex items-center gap-2">
									<Button.Root variant="outline" size="sm" onclick={() => handleEditGoal(goal.id)}>
										<Edit class="mr-1 h-4 w-4" />
										Edit
									</Button.Root>

									{#if goal.status === 'active'}
										<Button.Root
											variant="outline"
											size="sm"
											onclick={() => handlePauseGoal(goal.id)}
										>
											Pause
										</Button.Root>
									{:else if goal.status === 'paused'}
										<Button.Root
											variant="outline"
											size="sm"
											onclick={() => handleResumeGoal(goal.id)}
										>
											Resume
										</Button.Root>
									{/if}

									<Button.Root
										variant="outline"
										size="sm"
										onclick={() => handleCompleteGoal(goal.id)}
									>
										<CheckCircle class="mr-1 h-4 w-4" />
										Complete
									</Button.Root>
								</div>
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else}
		<!-- Empty State -->
		<EmptyState variant="card" body="No active goals.">
			{#snippet children()}
				<p class="mt-1 text-xs text-[var(--color-text-tertiary)]">
					Set a goal to start tracking progress.
				</p>
				<a
					href="/plan?tab=goals"
					class="mt-4 inline-block text-sm text-[var(--color-amber)] hover:underline"
				>
					Add a goal
				</a>
			{/snippet}
		</EmptyState>
	{/if}
</div>
