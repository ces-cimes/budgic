import { goalService } from '$lib/core/services';
import type { Goal } from '$lib/core/db';
import type {
	GoalsData,
	GoalInsight,
	CreateGoalRequest,
	UpdateGoalRequest,
	GoalCategory,
	GoalPriority,
	GoalStatus,
	GoalAnalytics
} from '$lib/components/goals/types';

export class GoalsService {
	// Get comprehensive goals data
	async getGoalsData(): Promise<GoalsData> {
		try {
			// Get real goals from database
			const allGoals = await goalService.getAllGoals();
			const activeGoals = allGoals.filter(
				(goal) => goal.status === 'active' || goal.status === 'paused'
			);
			const completedGoals = allGoals.filter((goal) => goal.status === 'completed');

			const totalTargetValue = allGoals.reduce((sum, goal) => sum + goal.targetAmount, 0);
			const totalCurrentValue = activeGoals.reduce((sum, goal) => sum + goal.currentAmount, 0);
			const overallProgress =
				totalTargetValue > 0 ? (totalCurrentValue / totalTargetValue) * 100 : 0;
			const averageProgress =
				activeGoals.length > 0
					? activeGoals.reduce(
							(sum, goal) => sum + (goal.currentAmount / goal.targetAmount) * 100,
							0
						) / activeGoals.length
					: 0;

			// Calculate monthly contribution total (simplified - no monthlyContribution field in new schema)
			const monthlyContributionTotal = 0; // Will be calculated based on actual savings patterns

			// Category breakdown
			const categoryBreakdown: Record<GoalCategory, any> = {} as any;
			const priorityBreakdown: Record<GoalPriority, any> = {} as any;

			// Initialize breakdowns
			const categories: GoalCategory[] = [
				'emergency_fund',
				'vacation',
				'house_down_payment',
				'car_purchase',
				'education',
				'retirement',
				'debt_payoff',
				'investment',
				'wedding',
				'home_improvement',
				'other'
			];
			const priorities: GoalPriority[] = ['low', 'medium', 'high', 'critical'];

			categories.forEach((category) => {
				categoryBreakdown[category] = { count: 0, totalValue: 0, averageProgress: 0 };
			});

			priorities.forEach((priority) => {
				priorityBreakdown[priority] = { count: 0, totalValue: 0 };
			});

			// Populate breakdowns
			allGoals.forEach((goal) => {
				const category = goal.category as GoalCategory;
				const priority = goal.priority as GoalPriority;

				if (categoryBreakdown[category]) {
					categoryBreakdown[category].count++;
					categoryBreakdown[category].totalValue += goal.targetAmount;
					categoryBreakdown[category].averageProgress +=
						(goal.currentAmount / goal.targetAmount) * 100;
				}

				if (priorityBreakdown[priority]) {
					priorityBreakdown[priority].count++;
					priorityBreakdown[priority].totalValue += goal.targetAmount;
				}
			});

			// Calculate average progress for each category
			Object.keys(categoryBreakdown).forEach((category) => {
				const cat = category as GoalCategory;
				if (categoryBreakdown[cat].count > 0) {
					categoryBreakdown[cat].averageProgress /= categoryBreakdown[cat].count;
				}
			});

			// Get goal insights
			const insights = await this.getGoalInsights(allGoals);

			return {
				activeGoals,
				completedGoals,
				allGoals,
				totalTargetValue,
				totalCurrentValue,
				overallProgress,
				averageProgress,
				monthlyContributionTotal,
				categoryBreakdown,
				priorityBreakdown,
				insights,
				analytics: {
					totalGoals: allGoals.length,
					activeGoalsCount: activeGoals.length,
					completedGoalsCount: completedGoals.length,
					averageGoalValue: allGoals.length > 0 ? totalTargetValue / allGoals.length : 0,
					completionRate: allGoals.length > 0 ? (completedGoals.length / allGoals.length) * 100 : 0
				},
				totalGoals: allGoals.length
			};
		} catch (error) {
			console.error('Error getting goals data:', error);
			throw error;
		}
	}

	// Get goal insights based on real data
	async getGoalInsights(goals: Goal[]): Promise<GoalInsight[]> {
		const insights: GoalInsight[] = [];

		goals.forEach((goal) => {
			const progress = goal.currentAmount / goal.targetAmount;

			// Generate milestone insights
			if (progress >= 0.5 && progress < 0.75) {
				insights.push({
					id: crypto.randomUUID(),
					type: 'milestone',
					title: `${goal.name} - Halfway There!`,
					description: `You've saved 50% of your target for ${goal.name}. Keep up the great work!`,
					priority: 'medium',
					actionable: false,
					goalId: goal.id,
					createdAt: new Date().toISOString(),
					metadata: { progress: 0.5 }
				});
			}

			// Generate recommendation insights
			if (progress < 0.3 && goal.status === 'active') {
				insights.push({
					id: crypto.randomUUID(),
					type: 'recommendation',
					title: `Increase ${goal.name} Contributions`,
					description: `Consider increasing your contributions to reach your ${goal.name} goal faster.`,
					priority: 'high',
					actionable: true,
					goalId: goal.id,
					createdAt: new Date().toISOString(),
					metadata: { currentProgress: progress }
				});
			}
		});

		return insights;
	}

	// Create a new goal
	async createGoal(request: CreateGoalRequest): Promise<Goal> {
		try {
			return await goalService.createGoal({
				name: request.name,
				description: request.description,
				targetAmount: request.targetAmount,
				currency: request.currency,
				category: request.category,
				priority: request.priority,
				targetDate: request.targetDate,
				monthlyContribution: request.monthlyContribution,
				linkedCategoryIds: request.linkedCategoryIds
			});
		} catch (error) {
			console.error('Error creating goal:', error);
			throw error;
		}
	}

	// Update an existing goal
	async updateGoal(goalId: string, request: UpdateGoalRequest): Promise<Goal> {
		try {
			return await goalService.updateGoal(goalId, request);
		} catch (error) {
			console.error('Error updating goal:', error);
			throw error;
		}
	}

	// Delete a goal
	async deleteGoal(goalId: string): Promise<void> {
		try {
			await goalService.deleteGoal(goalId);
		} catch (error) {
			console.error('Error deleting goal:', error);
			throw error;
		}
	}

	// Get goal analytics
	async getGoalAnalytics(): Promise<GoalAnalytics> {
		try {
			const goals = await goalService.getAllGoals();
			const activeGoals = goals.filter((goal) => goal.status === 'active');
			const completedGoals = goals.filter((goal) => goal.status === 'completed');

			return {
				completionRate: goals.length > 0 ? (completedGoals.length / goals.length) * 100 : 0,
				averageTimeToComplete: 0, // Simplified for now
				mostSuccessfulCategory: 'other' as GoalCategory, // Simplified for now
				monthlyContributionTrend: [], // Simplified for now
				progressVelocity: [] // Simplified for now
			};
		} catch (error) {
			console.error('Error getting goal analytics:', error);
			throw error;
		}
	}
}

// Export singleton instance
export const goalsService = new GoalsService();
