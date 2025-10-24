import { db } from '$lib/core/db';
import type { 
  FinancialGoal, 
  GoalsData, 
  GoalInsight, 
  CreateGoalRequest, 
  UpdateGoalRequest,
  GoalCategory,
  GoalPriority,
  GoalStatus,
  GoalAnalytics
} from './types';

// Mock data for development
const mockGoals: FinancialGoal[] = [
  {
    id: 'goal-1',
    name: 'Emergency Fund',
    description: 'Build a safety net for unexpected expenses',
    targetAmount: 5000,
    currentAmount: 3200,
    currency: 'USD',
    category: 'emergency_fund',
    priority: 'high',
    status: 'active',
    targetDate: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString(),
    monthlyContribution: 300,
    isRecurring: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['savings', 'safety']
  },
  {
    id: 'goal-2',
    name: 'Vacation to Hawaii',
    description: 'Save for a dream trip to Hawaii',
    targetAmount: 3000,
    currentAmount: 1500,
    currency: 'USD',
    category: 'vacation',
    priority: 'medium',
    status: 'active',
    targetDate: new Date(Date.now() + 12 * 30 * 24 * 60 * 60 * 1000).toISOString(),
    monthlyContribution: 125,
    isRecurring: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['travel', 'leisure']
  },
  {
    id: 'goal-3',
    name: 'New Laptop',
    description: 'Save for a new high-performance laptop',
    targetAmount: 1500,
    currentAmount: 1500,
    currency: 'USD',
    category: 'other',
    priority: 'low',
    status: 'completed',
    targetDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    monthlyContribution: 100,
    isRecurring: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['tech', 'gadget']
  }
];

const mockGoalInsights: GoalInsight[] = [
  {
    id: 'insight-1',
    type: 'milestone',
    title: 'Halfway to Emergency Fund!',
    description: 'You\'ve saved 50% of your target for the Emergency Fund. Keep up the great work!',
    priority: 'high',
    actionable: false,
    goalId: 'goal-1',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: { progress: 0.5 }
  },
  {
    id: 'insight-2',
    type: 'recommendation',
    title: 'Increase Vacation Savings',
    description: 'Consider increasing your monthly contribution to reach your Hawaii vacation goal 2 months earlier.',
    priority: 'medium',
    actionable: true,
    goalId: 'goal-2',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: { currentContribution: 125, recommendedContribution: 180 }
  }
];

export class GoalsService {
  // Get comprehensive goals data
  async getGoalsData(): Promise<GoalsData> {
    try {
      // Use mock data for now
      const activeGoals = mockGoals.filter(goal => goal.status === 'active' || goal.status === 'paused');
      const completedGoals = mockGoals.filter(goal => goal.status === 'completed');
      const allGoals = [...activeGoals, ...completedGoals];
      
      const totalTargetValue = allGoals.reduce((sum, goal) => sum + goal.targetAmount, 0);
      const totalCurrentValue = activeGoals.reduce((sum, goal) => sum + goal.currentAmount, 0);
      const overallProgress = totalTargetValue > 0 ? (totalCurrentValue / totalTargetValue) * 100 : 0;
      const averageProgress = activeGoals.length > 0 
        ? activeGoals.reduce((sum, goal) => sum + (goal.currentAmount / goal.targetAmount) * 100, 0) / activeGoals.length 
        : 0;

      // Calculate monthly contribution total
      const monthlyContributionTotal = activeGoals.reduce((sum, goal) => 
        sum + (goal.monthlyContribution || 0), 0
      );

      // Category breakdown
      const categoryBreakdown: Record<GoalCategory, any> = {} as any;
      const priorityBreakdown: Record<GoalPriority, any> = {} as any;

      // Initialize breakdowns
      const categories: GoalCategory[] = [
        'emergency_fund', 'vacation', 'house_down_payment', 'car_purchase', 
        'education', 'retirement', 'debt_payoff', 'investment', 'wedding', 
        'home_improvement', 'other'
      ];
      const priorities: GoalPriority[] = ['low', 'medium', 'high', 'critical'];

      categories.forEach(category => {
        categoryBreakdown[category] = { count: 0, totalValue: 0, averageProgress: 0 };
      });

      priorities.forEach(priority => {
        priorityBreakdown[priority] = { count: 0, totalValue: 0 };
      });

      // Populate breakdowns
      allGoals.forEach(goal => {
        // Category breakdown
        const categoryData = categoryBreakdown[goal.category];
        categoryData.count++;
        categoryData.totalValue += goal.targetAmount;
        if (goal.status === 'active') {
          categoryData.averageProgress += (goal.currentAmount / goal.targetAmount) * 100;
        }

        // Priority breakdown
        const priorityData = priorityBreakdown[goal.priority];
        priorityData.count++;
        priorityData.totalValue += goal.targetAmount;
      });

      // Calculate average progress for categories
      Object.keys(categoryBreakdown).forEach(category => {
        const data = categoryBreakdown[category as GoalCategory];
        if (data.count > 0) {
          data.averageProgress = data.averageProgress / data.count;
        }
      });

      return {
        totalGoals: allGoals.length,
        activeGoals: activeGoals.length,
        completedGoals: completedGoals.length,
        totalTargetValue,
        totalCurrentValue,
        overallProgress,
        averageProgress,
        monthlyContributionTotal,
        categoryBreakdown,
        priorityBreakdown
      };
    } catch (error) {
      console.error('Error getting goals data:', error);
      throw error;
    }
  }

  // Get active goals
  async getActiveGoals(): Promise<FinancialGoal[]> {
    try {
      // Use mock data for now
      return mockGoals.filter(goal => goal.status === 'active' || goal.status === 'paused');
    } catch (error) {
      console.error('Error getting active goals:', error);
      throw error;
    }
  }

  // Get completed goals
  async getCompletedGoals(): Promise<FinancialGoal[]> {
    try {
      // Use mock data for now
      return mockGoals.filter(goal => goal.status === 'completed');
    } catch (error) {
      console.error('Error getting completed goals:', error);
      throw error;
    }
  }

  // Get goal insights
  async getGoalInsights(): Promise<GoalInsight[]> {
    try {
      // Use mock data for now
      return mockGoalInsights.filter(insight => !insight.dismissedAt);
    } catch (error) {
      console.error('Error getting goal insights:', error);
      throw error;
    }
  }

  // Create a new goal
  async createGoal(goalData: CreateGoalRequest): Promise<FinancialGoal> {
    try {
      const now = new Date();
      const goal = {
        id: crypto.randomUUID(),
        ...goalData,
        currentAmount: 0,
        status: 'active' as GoalStatus,
        createdAt: now,
        updatedAt: now
      };

      await db.goals.add(goal);
      return this.mapDbGoalToFinancialGoal(goal);
    } catch (error) {
      console.error('Error creating goal:', error);
      throw error;
    }
  }

  // Update a goal
  async updateGoal(goalId: string, updates: UpdateGoalRequest): Promise<FinancialGoal> {
    try {
      const goal = await db.goals.get(goalId);
      if (!goal) {
        throw new Error('Goal not found');
      }

      const updatedGoal = {
        ...goal,
        ...updates,
        updatedAt: new Date()
      };

      await db.goals.put(updatedGoal);
      return this.mapDbGoalToFinancialGoal(updatedGoal);
    } catch (error) {
      console.error('Error updating goal:', error);
      throw error;
    }
  }

  // Delete a goal
  async deleteGoal(goalId: string): Promise<void> {
    try {
      await db.goals.delete(goalId);
    } catch (error) {
      console.error('Error deleting goal:', error);
      throw error;
    }
  }

  // Add progress to a goal
  async addGoalProgress(goalId: string, amount: number, note?: string): Promise<void> {
    try {
      const goal = await db.goals.get(goalId);
      if (!goal) {
        throw new Error('Goal not found');
      }

      const updatedGoal = {
        ...goal,
        currentAmount: goal.currentAmount + amount,
        updatedAt: new Date()
      };

      await db.goals.put(updatedGoal);

      // Add progress record
      await db.goalProgress.add({
        id: crypto.randomUUID(),
        goalId,
        date: new Date(),
        amount,
        note,
        source: 'manual'
      });
    } catch (error) {
      console.error('Error adding goal progress:', error);
      throw error;
    }
  }

  // Complete a goal
  async completeGoal(goalId: string): Promise<FinancialGoal> {
    try {
      const goal = await db.goals.get(goalId);
      if (!goal) {
        throw new Error('Goal not found');
      }

      const updatedGoal = {
        ...goal,
        status: 'completed' as GoalStatus,
        completedAt: new Date(),
        updatedAt: new Date()
      };

      await db.goals.put(updatedGoal);
      return this.mapDbGoalToFinancialGoal(updatedGoal);
    } catch (error) {
      console.error('Error completing goal:', error);
      throw error;
    }
  }

  // Dismiss an insight
  async dismissInsight(insightId: string): Promise<void> {
    try {
      await db.goalInsights.update(insightId, {
        dismissedAt: new Date()
      });
    } catch (error) {
      console.error('Error dismissing insight:', error);
      throw error;
    }
  }

  // Get goal analytics
  async getGoalAnalytics(): Promise<GoalAnalytics> {
    try {
      const completedGoals = await this.getCompletedGoals();
      const activeGoals = await this.getActiveGoals();

      const completionRate = completedGoals.length / (completedGoals.length + activeGoals.length) * 100;

      // Calculate average time to complete
      const completionTimes = completedGoals
        .filter(goal => goal.completedAt && goal.createdAt)
        .map(goal => {
          const timeDiff = goal.completedAt!.getTime() - goal.createdAt.getTime();
          return timeDiff / (1000 * 60 * 60 * 24 * 30); // Convert to months
        });

      const averageTimeToComplete = completionTimes.length > 0
        ? completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length
        : 0;

      // Find most successful category
      const categorySuccess = completedGoals.reduce((acc, goal) => {
        acc[goal.category] = (acc[goal.category] || 0) + 1;
        return acc;
      }, {} as Record<GoalCategory, number>);

      const mostSuccessfulCategory = Object.keys(categorySuccess).reduce((a, b) => 
        categorySuccess[a as GoalCategory] > categorySuccess[b as GoalCategory] ? a : b
      ) as GoalCategory;

      return {
        completionRate,
        averageTimeToComplete,
        mostSuccessfulCategory,
        monthlyContributionTrend: [], // TODO: Implement trend calculation
        progressVelocity: activeGoals.map(goal => ({
          goalId: goal.id,
          velocity: goal.monthlyContribution || 0
        }))
      };
    } catch (error) {
      console.error('Error getting goal analytics:', error);
      throw error;
    }
  }

  // Helper methods
  private mapDbGoalToFinancialGoal(dbGoal: any): FinancialGoal {
    return {
      id: dbGoal.id,
      name: dbGoal.name,
      description: dbGoal.description,
      targetAmount: dbGoal.targetAmount,
      currentAmount: dbGoal.currentAmount,
      currency: dbGoal.currency,
      category: dbGoal.category,
      priority: dbGoal.priority,
      status: dbGoal.status,
      targetDate: dbGoal.targetDate ? new Date(dbGoal.targetDate) : undefined,
      createdAt: new Date(dbGoal.createdAt),
      updatedAt: new Date(dbGoal.updatedAt),
      completedAt: dbGoal.completedAt ? new Date(dbGoal.completedAt) : undefined,
      monthlyContribution: dbGoal.monthlyContribution,
      isRecurring: dbGoal.isRecurring,
      parentGoalId: dbGoal.parentGoalId,
      tags: dbGoal.tags
    };
  }

  private mapDbInsightToGoalInsight(dbInsight: any): GoalInsight {
    return {
      id: dbInsight.id,
      type: dbInsight.type,
      title: dbInsight.title,
      description: dbInsight.description,
      priority: dbInsight.priority,
      actionable: dbInsight.actionable,
      goalId: dbInsight.goalId,
      createdAt: new Date(dbInsight.createdAt),
      dismissedAt: dbInsight.dismissedAt ? new Date(dbInsight.dismissedAt) : undefined,
      metadata: dbInsight.metadata
    };
  }
}

export const goalsService = new GoalsService();
