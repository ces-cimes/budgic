import { db, generateUUID } from '$lib/core/db';
import { crossRouteSyncService } from '../analytics/cross-route-sync-service';
import { badgeService } from '../analytics/badge-service';
import type { Goal, Transaction } from '$lib/core/db';

/** Average days per month for time-bound goal calculations (calendar average) */
const AVG_DAYS_PER_MONTH = 30.44;

interface GoalProgress {
	goalId: string;
	goalName: string;
	targetAmount: number;
	currentAmount: number;
	percentageComplete: number;
	remainingAmount: number;
	estimatedCompletionDate?: string;
	isOnTrack: boolean;
	priority: Goal['priority'];
	/** Required monthly savings to hit target by targetDate (time-bound goals) */
	requiredMonthlySavings?: number;
	/** Months remaining until target date (time-bound goals) */
	monthsRemaining?: number;
	/** Days remaining until target date (time-bound goals) */
	daysRemaining?: number;
	/** Suggested monthly savings for open-ended goals (user preference or recommendation) */
	suggestedMonthlySavings?: number;
	/** True if goal has a target date */
	isTimeBound: boolean;
}

/**
 * Result of required savings calculation for a goal.
 * Used for display and for opportunity identification.
 */
export interface RequiredSavingsResult {
	/** Required monthly amount to reach target by target date (time-bound) */
	requiredMonthly: number;
	monthsRemaining?: number;
	daysRemaining?: number;
	isTimeBound: boolean;
	/** Suggested monthly for open-ended goals (user preference or algorithm) */
	suggestedMonthly?: number;
}

interface GoalInsight {
	type: 'progress_update' | 'milestone_reached' | 'behind_schedule' | 'ahead_of_schedule';
	goalId: string;
	goalName: string;
	message: string;
	severity: 'low' | 'medium' | 'high';
	actionable: boolean;
	suggestedAction?: string;
}

class GoalService {
	public get ready() {
		return Promise.resolve();
	}

	public isLoading() {
		return false;
	}

	// ============================================================================
	// GOAL MANAGEMENT
	// ============================================================================

	/**
	 * Create a new goal
	 */
	async createGoal(data: {
		name: string;
		description?: string;
		targetAmount: number;
		targetDate?: string;
		category: Goal['category'];
		priority: Goal['priority'];
		currency?: string;
		monthlyContribution?: number;
		linkedCategoryIds?: string[];
	}): Promise<Goal> {
		const goal: Goal = {
			id: generateUUID(),
			name: data.name,
			description: data.description,
			targetAmount: data.targetAmount,
			currentAmount: 0,
			currency: data.currency || 'USD',
			category: data.category,
			priority: data.priority,
			status: 'active',
			targetDate: data.targetDate,
			completedAt: undefined,
			monthlyContribution: data.monthlyContribution,
			isRecurring: false,
			tags: [],
			linkedCategoryIds: data.linkedCategoryIds?.length
				? data.linkedCategoryIds.slice(0, 8)
				: undefined,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};

		await db.goals.add(goal);

		// Emit sync event for goal creation
		await crossRouteSyncService.onGoalCreated(goal);

		return goal;
	}

	/**
	 * Get all goals (including deleted ones)
	 */
	async getAllGoals(): Promise<Goal[]> {
		return await db.getAllGoalsIncludingDeleted();
	}

	/**
	 * Get all active goals
	 */
	async getGoals(): Promise<Goal[]> {
		return await db.getActiveGoals();
	}

	/**
	 * Get goal by ID
	 */
	async getGoal(id: string): Promise<Goal | null> {
		return (await db.goals.get(id)) || null;
	}

	/**
	 * Update goal
	 */
	async updateGoal(
		id: string,
		updates: Partial<
			Pick<
				Goal,
				| 'name'
				| 'description'
				| 'targetAmount'
				| 'targetDate'
				| 'category'
				| 'priority'
				| 'status'
				| 'linkedCategoryIds'
			>
		>
	): Promise<Goal> {
		const goal = await db.goals.get(id);
		if (!goal) {
			throw new Error(`Goal ${id} not found`);
		}

		const updatedGoal = {
			...goal,
			...updates,
			updatedAt: new Date().toISOString()
		};

		// If marking as completed, set completedAt
		if (updates.status === 'completed' && !goal.completedAt) {
			updatedGoal.completedAt = new Date().toISOString();
		}

		await db.goals.update(id, updatedGoal);

		// Emit sync event for goal update
		await crossRouteSyncService.onGoalUpdated(updatedGoal, updates);

		// If goal was completed, emit completion event and check for badges
		if (updates.status === 'completed' && !goal.completedAt) {
			await crossRouteSyncService.onGoalCompleted(updatedGoal);
			// Check for goal-related badges
			badgeService.checkAllBadges(true).catch(console.error);
		}

		return updatedGoal;
	}

	/**
	 * Delete goal (soft delete)
	 */
	async deleteGoal(id: string): Promise<void> {
		await db.softDeleteGoal(id);

		// Emit sync event for goal deletion
		await crossRouteSyncService.onGoalDeleted(id);
	}

	/**
	 * Get goals by status
	 */
	async getGoalsByStatus(status: Goal['status']): Promise<Goal[]> {
		return await db.getGoalsByStatus(status);
	}

	/**
	 * Get goals by category
	 */
	async getGoalsByCategory(category: Goal['category']): Promise<Goal[]> {
		return await db.getGoalsByCategory(category);
	}

	// ============================================================================
	// GOAL PROGRESS TRACKING
	// ============================================================================

	/**
	 * Get progress for all goals
	 */
	async getGoalsProgress(): Promise<GoalProgress[]> {
		const goals = await this.getGoals();
		const transactions = await db.transactions.toArray();
		const progress: GoalProgress[] = [];

		for (const goal of goals) {
			const goalProgress = await this.calculateGoalProgress(goal, transactions);
			progress.push(goalProgress);
		}

		return progress.sort((a, b) => {
			const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
			return priorityOrder[b.priority] - priorityOrder[a.priority];
		});
	}

	/**
	 * Get progress for a specific goal
	 */
	async getGoalProgress(goalId: string): Promise<GoalProgress | null> {
		const goal = await db.goals.get(goalId);
		if (!goal) {
			return null;
		}

		const transactions = await db.transactions.toArray();
		return await this.calculateGoalProgress(goal, transactions);
	}

	/**
	 * Update goal progress based on transactions
	 */
	async updateGoalProgress(goalId: string): Promise<GoalProgress | null> {
		const goal = await db.goals.get(goalId);
		if (!goal) {
			return null;
		}

		const transactions = await db.transactions.toArray();
		const progress = await this.calculateGoalProgress(goal, transactions);

		// Check if goal is completed
		if (progress.currentAmount >= goal.targetAmount && goal.status === 'active') {
			await this.updateGoal(goalId, { status: 'completed' });
		}

		return progress;
	}

	/**
	 * Get goal insights
	 */
	async getGoalInsights(): Promise<GoalInsight[]> {
		const goalsProgress = await this.getGoalsProgress();
		const insights: GoalInsight[] = [];

		for (const progress of goalsProgress) {
			const goal = await db.goals.get(progress.goalId);
			if (!goal) continue;

			// Check for milestone reached
			if (progress.percentageComplete >= 25 && progress.percentageComplete < 50) {
				insights.push({
					type: 'milestone_reached',
					goalId: progress.goalId,
					goalName: progress.goalName,
					message: `You've reached 25% of your ${progress.goalName} goal!`,
					severity: 'low',
					actionable: false
				});
			}

			// Check for behind schedule
			if (goal.targetDate && !progress.isOnTrack) {
				insights.push({
					type: 'behind_schedule',
					goalId: progress.goalId,
					goalName: progress.goalName,
					message: `You're behind schedule on your ${progress.goalName} goal`,
					severity: 'medium',
					actionable: true,
					suggestedAction:
						'Consider increasing your monthly contribution or adjusting your target date'
				});
			}

			// Check for ahead of schedule
			if (goal.targetDate && progress.isOnTrack && progress.percentageComplete > 75) {
				insights.push({
					type: 'ahead_of_schedule',
					goalId: progress.goalId,
					goalName: progress.goalName,
					message: `You're ahead of schedule on your ${progress.goalName} goal!`,
					severity: 'low',
					actionable: false
				});
			}
		}

		return insights;
	}

	// ============================================================================
	// GOAL ANALYTICS
	// ============================================================================

	/**
	 * Get goal completion statistics
	 */
	async getGoalStatistics(): Promise<{
		totalGoals: number;
		activeGoals: number;
		completedGoals: number;
		totalTargetAmount: number;
		totalCurrentAmount: number;
		averageCompletionRate: number;
	}> {
		const goals = await db.getAllGoalsIncludingDeleted();
		const goalsProgress = await this.getGoalsProgress();

		const stats = {
			totalGoals: goals.length,
			activeGoals: goals.filter((g) => g.status === 'active').length,
			completedGoals: goals.filter((g) => g.status === 'completed').length,
			totalTargetAmount: 0,
			totalCurrentAmount: 0,
			averageCompletionRate: 0
		};

		let totalCompletionRate = 0;

		goalsProgress.forEach((progress) => {
			stats.totalTargetAmount += progress.targetAmount;
			stats.totalCurrentAmount += progress.currentAmount;
			totalCompletionRate += progress.percentageComplete;
		});

		stats.averageCompletionRate =
			goalsProgress.length > 0 ? totalCompletionRate / goalsProgress.length : 0;

		return stats;
	}

	/**
	 * Get goals by priority
	 */
	async getGoalsByPriority(): Promise<{
		high: Goal[];
		medium: Goal[];
		low: Goal[];
	}> {
		const goals = await this.getGoals();

		return {
			high: goals.filter((g) => g.priority === 'high'),
			medium: goals.filter((g) => g.priority === 'medium'),
			low: goals.filter((g) => g.priority === 'low')
		};
	}

	// ============================================================================
	// REQUIRED SAVINGS CALCULATION (Phase 2.1)
	// ============================================================================

	/**
	 * Calculate required monthly savings for a goal.
	 * - Time-bound: required monthly = (target - current progress) / months remaining (months = days/30.44).
	 * - Open-ended: suggested monthly = user's monthlyContribution preference (algorithm recommendation can be added later).
	 */
	getRequiredSavings(goal: Goal): RequiredSavingsResult {
		const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
		const now = new Date();

		if (goal.targetDate) {
			const targetDate = new Date(goal.targetDate);
			const timeRemaining = targetDate.getTime() - now.getTime();
			const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

			if (daysRemaining <= 0) {
				return {
					requiredMonthly: remainingAmount,
					monthsRemaining: 0,
					daysRemaining: 0,
					isTimeBound: true
				};
			}

			const monthsRemaining = daysRemaining / AVG_DAYS_PER_MONTH;
			const requiredMonthly =
				monthsRemaining > 0 ? remainingAmount / monthsRemaining : remainingAmount;

			return {
				requiredMonthly,
				monthsRemaining,
				daysRemaining,
				isTimeBound: true
			};
		}

		// Open-ended goal: use user's monthly contribution as suggested
		const suggestedMonthly = goal.monthlyContribution;
		return {
			requiredMonthly: suggestedMonthly ?? 0,
			isTimeBound: false,
			suggestedMonthly
		};
	}

	// ============================================================================
	// PRIVATE METHODS
	// ============================================================================

	/**
	 * Calculate progress for a goal based on transactions
	 */
	private async calculateGoalProgress(
		goal: Goal,
		transactions: Transaction[]
	): Promise<GoalProgress> {
		// Filter transactions that contribute to this goal
		const contributingTransactions = goal.linkedAccountId
			? transactions.filter(
					(tx) =>
						tx.type === 'transfer' &&
						tx.status === 'cleared' &&
						(tx.transferDetails?.toAccountId ?? tx.toAccountId) === goal.linkedAccountId
				)
			: transactions.filter(
					(tx) => tx.categoryId === goal.category && tx.type === 'income' && tx.status === 'cleared'
				);

		const currentAmount = contributingTransactions.reduce((sum, tx) => {
			if (tx.type === 'transfer') {
				return sum + Math.abs(tx.transferDetails?.transferAmount ?? tx.amount ?? 0);
			}
			return sum + (tx.amount || 0);
		}, 0);
		const percentageComplete =
			goal.targetAmount > 0 ? (currentAmount / goal.targetAmount) * 100 : 0;
		const remainingAmount = Math.max(0, goal.targetAmount - currentAmount);

		// Calculate if on track (if target date is set)
		let isOnTrack = true;
		let estimatedCompletionDate: string | undefined;

		let requiredMonthlySavings: number | undefined;
		let monthsRemaining: number | undefined;
		let daysRemaining: number | undefined;
		let suggestedMonthlySavings: number | undefined;
		const isTimeBound = Boolean(goal.targetDate);

		if (goal.targetDate) {
			const targetDate = new Date(goal.targetDate);
			const now = new Date();
			const timeRemaining = targetDate.getTime() - now.getTime();
			const daysRemainingCalc = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

			if (daysRemainingCalc > 0) {
				const dailyRequiredAmount = remainingAmount / daysRemainingCalc;
				const averageDailyContribution =
					currentAmount /
					Math.max(
						1,
						Math.ceil((now.getTime() - new Date(goal.createdAt).getTime()) / (1000 * 60 * 60 * 24))
					);

				isOnTrack = averageDailyContribution >= dailyRequiredAmount;

				if (!isOnTrack) {
					const estimatedDays = Math.ceil(remainingAmount / averageDailyContribution);
					estimatedCompletionDate = new Date(
						now.getTime() + estimatedDays * 24 * 60 * 60 * 1000
					).toISOString();
				}

				daysRemaining = daysRemainingCalc;
				monthsRemaining = daysRemainingCalc / AVG_DAYS_PER_MONTH;
				requiredMonthlySavings =
					monthsRemaining > 0 ? remainingAmount / monthsRemaining : remainingAmount;
			}
		} else {
			suggestedMonthlySavings = goal.monthlyContribution;
		}

		return {
			goalId: goal.id,
			goalName: goal.name,
			targetAmount: goal.targetAmount,
			currentAmount,
			percentageComplete,
			remainingAmount,
			estimatedCompletionDate,
			isOnTrack,
			priority: goal.priority,
			requiredMonthlySavings,
			monthsRemaining,
			daysRemaining,
			suggestedMonthlySavings,
			isTimeBound
		};
	}
}

export const goalService = new GoalService();
