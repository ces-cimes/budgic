import { db } from '$lib/core/db';
import type { Transaction, Category, Goal } from '$lib/core/db';
import { behavioralAnalysisService, type BehaviorPattern } from './behavioral-analysis-service';
import { appUsageAnalyticsService, type AppUsageMetrics } from './app-usage-analytics-service';
import { insightsService } from './insights-service';
import { creditUtilizationService } from './credit-utilization-service';
import { budgetService } from '../core/budget-service';
import { goalService } from '../core/goal-service';
import { analyticsService } from './analytics-service';
import { userService } from '../core/user-service';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Recommendation {
	id: string;
	type: 'budget' | 'spending' | 'goal' | 'behavior' | 'feature' | 'timing' | 'category' | 'credit';
	priority: 'low' | 'medium' | 'high' | 'urgent';
	title: string;
	description: string;
	actionable: boolean;
	actionText?: string;
	actionUrl?: string;
	confidence: number; // 0-100
	estimatedImpact: 'low' | 'medium' | 'high';
	metadata: Record<string, any>;
	createdAt: string;
	expiresAt?: string;
}

export interface RecommendationContext {
	userProfile: {
		maturityLevel: 'beginner' | 'intermediate' | 'advanced';
		engagementScore: number;
	};
	spendingPatterns: {
		categoryPatterns: any[];
		timingPatterns: any;
		velocityPatterns: any;
	};
	behaviorPatterns: BehaviorPattern[];
	usageMetrics: AppUsageMetrics;
	budgetStatus: {
		categories: Array<{
			categoryId: string;
			budgeted: number;
			spent: number;
			remaining: number;
		}>;
	};
	goals: Goal[];
}

// ============================================================================
// RECOMMENDATION SERVICE
// ============================================================================

class RecommendationService {
	public get ready() {
		return Promise.resolve();
	}

	public isLoading() {
		return false;
	}

	// ============================================================================
	// RECOMMENDATION GENERATION
	// ============================================================================

	/**
	 * Generate personalized recommendations based on user behavior and spending
	 */
	async generateRecommendations(days: number = 90): Promise<Recommendation[]> {
		const recommendations: Recommendation[] = [];

		// Gather context data
		const context = await this.gatherContext(days);

		// Generate different types of recommendations
		recommendations.push(...await this.generateBudgetRecommendations(context));
		recommendations.push(...await this.generateSpendingRecommendations(context));
		recommendations.push(...await this.generateGoalRecommendations(context));
		recommendations.push(...await this.generateBehaviorRecommendations(context));
		recommendations.push(...await this.generateFeatureRecommendations(context));
		recommendations.push(...await this.generateTimingRecommendations(context));
		recommendations.push(...await this.generateCategoryRecommendations(context));
		recommendations.push(...await this.generateCreditUtilizationRecommendations());

		// Sort by priority and confidence
		return recommendations.sort((a, b) => {
			const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
			const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
			if (priorityDiff !== 0) return priorityDiff;
			return b.confidence - a.confidence;
		});
	}

	/**
	 * Generate budget-related recommendations
	 */
	private async generateBudgetRecommendations(context: RecommendationContext): Promise<Recommendation[]> {
		const recommendations: Recommendation[] = [];

		// Check for categories over budget
		context.budgetStatus.categories.forEach(cat => {
			if (cat.spent > cat.budgeted) {
				const overage = cat.spent - cat.budgeted;
				const percentage = (overage / cat.budgeted) * 100;

				recommendations.push({
					id: `budget-over-${cat.categoryId}`,
					type: 'budget',
					priority: percentage > 20 ? 'urgent' : percentage > 10 ? 'high' : 'medium',
					title: 'Budget Exceeded',
					description: `You've exceeded your budget by ${this.formatCurrency(overage)} (${Math.round(percentage)}%)`,
					actionable: true,
					actionText: 'Review Budget',
					actionUrl: '/plan',
					confidence: 95,
					estimatedImpact: 'high',
					metadata: { categoryId: cat.categoryId, overage, percentage },
					createdAt: new Date().toISOString()
				});
			} else if (cat.remaining > cat.budgeted * 0.3) {
				// Significant surplus
				recommendations.push({
					id: `budget-surplus-${cat.categoryId}`,
					type: 'budget',
					priority: 'low',
					title: 'Budget Surplus Available',
					description: `You have ${this.formatCurrency(cat.remaining)} remaining in this category`,
					actionable: true,
					actionText: 'Adjust Budget',
					actionUrl: '/plan',
					confidence: 80,
					estimatedImpact: 'medium',
					metadata: { categoryId: cat.categoryId, remaining: cat.remaining },
					createdAt: new Date().toISOString()
				});
			}
		});

		return recommendations;
	}

	/**
	 * Generate spending-related recommendations
	 */
	private async generateSpendingRecommendations(context: RecommendationContext): Promise<Recommendation[]> {
		const recommendations: Recommendation[] = [];

		// High spending velocity recommendation
		if (context.spendingPatterns.velocityPatterns.spendingVelocity === 'high') {
			recommendations.push({
				id: 'spending-velocity-high',
				type: 'spending',
				priority: 'medium',
				title: 'High Spending Velocity Detected',
				description: `You're making transactions frequently. Consider reviewing your spending habits.`,
				actionable: true,
				actionText: 'View Spending Analysis',
				actionUrl: '/analyze',
				confidence: 75,
				estimatedImpact: 'medium',
				metadata: {
					frequency: context.spendingPatterns.velocityPatterns.transactionFrequency,
					averageAmount: context.spendingPatterns.velocityPatterns.averageTransactionAmount
				},
				createdAt: new Date().toISOString()
			});
		}

		// Weekend vs weekday spending
		const weekendRatio = context.spendingPatterns.timingPatterns.weekendVsWeekday.weekend /
			(context.spendingPatterns.timingPatterns.weekendVsWeekday.weekday || 1);

		if (weekendRatio > 0.5) {
			recommendations.push({
				id: 'spending-weekend-heavy',
				type: 'spending',
				priority: 'low',
				title: 'Weekend Spending Pattern',
				description: `You spend more on weekends. Consider planning weekend activities within your budget.`,
				actionable: true,
				actionText: 'Plan Weekend Budget',
				actionUrl: '/plan',
				confidence: 70,
				estimatedImpact: 'low',
				metadata: { weekendRatio },
				createdAt: new Date().toISOString()
			});
		}

		return recommendations;
	}

	/**
	 * Generate goal-related recommendations
	 */
	private async generateGoalRecommendations(context: RecommendationContext): Promise<Recommendation[]> {
		const recommendations: Recommendation[] = [];

		// Check for goals that need attention
		context.goals.forEach(goal => {
			if (goal.status === 'active') {
				const progress = goal.currentAmount / goal.targetAmount;
				const timeRemaining = goal.targetDate
					? (new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
					: null;

				// Goal behind schedule
				if (timeRemaining !== null && timeRemaining > 0 && progress < 0.5 && timeRemaining < 90) {
					recommendations.push({
						id: `goal-behind-${goal.id}`,
						type: 'goal',
						priority: 'high',
						title: 'Goal Behind Schedule',
						description: `Your goal "${goal.name}" is ${Math.round((1 - progress) * 100)}% complete with ${Math.round(timeRemaining)} days remaining`,
						actionable: true,
						actionText: 'Review Goal',
						actionUrl: '/goals',
						confidence: 85,
						estimatedImpact: 'high',
						metadata: { goalId: goal.id, progress, timeRemaining },
						createdAt: new Date().toISOString()
					});
				}

				// Goal on track
				if (progress >= 0.5 && progress < 0.9) {
					recommendations.push({
						id: `goal-progress-${goal.id}`,
						type: 'goal',
						priority: 'low',
						title: 'Goal Progress Update',
						description: `Great progress on "${goal.name}"! You're ${Math.round(progress * 100)}% of the way there.`,
						actionable: false,
						confidence: 90,
						estimatedImpact: 'low',
						metadata: { goalId: goal.id, progress },
						createdAt: new Date().toISOString()
					});
				}
			}
		});

		// Suggest creating a goal if none exist
		if (context.goals.length === 0 && context.userProfile.maturityLevel !== 'beginner') {
			recommendations.push({
				id: 'goal-create-first',
				type: 'goal',
				priority: 'medium',
				title: 'Create Your First Goal',
				description: 'Setting financial goals helps you stay focused and track your progress.',
				actionable: true,
				actionText: 'Create Goal',
				actionUrl: '/goals',
				confidence: 80,
				estimatedImpact: 'high',
				metadata: {},
				createdAt: new Date().toISOString()
			});
		}

		return recommendations;
	}

	/**
	 * Generate behavior-related recommendations
	 */
	private async generateBehaviorRecommendations(context: RecommendationContext): Promise<Recommendation[]> {
		const recommendations: Recommendation[] = [];

		// Low engagement
		if (context.userProfile.engagementScore < 30) {
			recommendations.push({
				id: 'behavior-low-engagement',
				type: 'behavior',
				priority: 'medium',
				title: 'Increase App Engagement',
				description: 'Regular use of the app helps you stay on top of your finances. Try checking your budget daily.',
				actionable: true,
				actionText: 'View Dashboard',
				actionUrl: '/',
				confidence: 70,
				estimatedImpact: 'medium',
				metadata: { engagementScore: context.userProfile.engagementScore },
				createdAt: new Date().toISOString()
			});
		}

		// Behavior patterns
		context.behaviorPatterns.forEach(pattern => {
			if (pattern.actionable && pattern.recommendation) {
				recommendations.push({
					id: `behavior-${pattern.id}`,
					type: 'behavior',
					priority: pattern.confidence > 80 ? 'high' : 'medium',
					title: pattern.title,
					description: pattern.description,
					actionable: true,
					confidence: pattern.confidence,
					estimatedImpact: 'medium',
					metadata: { patternId: pattern.id, patternType: pattern.type },
					createdAt: new Date().toISOString()
				});
			}
		});

		return recommendations;
	}

	/**
	 * Generate feature-related recommendations
	 */
	private async generateFeatureRecommendations(context: RecommendationContext): Promise<Recommendation[]> {
		const recommendations: Recommendation[] = [];

		// Underutilized features
		const featureAdoption = await appUsageAnalyticsService.getFeatureAdoptionMetrics();
		
		if (featureAdoption.underutilizedFeatures.length > 0) {
			const topFeature = featureAdoption.underutilizedFeatures[0];
			recommendations.push({
				id: 'feature-underutilized',
				type: 'feature',
				priority: 'low',
				title: 'Explore New Features',
				description: `You haven't used ${topFeature} much. It might help you manage your finances better.`,
				actionable: true,
				confidence: 60,
				estimatedImpact: 'low',
				metadata: { feature: topFeature },
				createdAt: new Date().toISOString()
			});
		}

		// Beginner features
		if (context.userProfile.maturityLevel === 'beginner') {
			recommendations.push({
				id: 'feature-beginner-budget',
				type: 'feature',
				priority: 'medium',
				title: 'Set Up Your Budget',
				description: 'Creating a budget is the first step to financial control. Start with your essential expenses.',
				actionable: true,
				actionText: 'Create Budget',
				actionUrl: '/plan',
				confidence: 85,
				estimatedImpact: 'high',
				metadata: {},
				createdAt: new Date().toISOString()
			});
		}

		return recommendations;
	}

	/**
	 * Generate timing-related recommendations
	 */
	private async generateTimingRecommendations(context: RecommendationContext): Promise<Recommendation[]> {
		const recommendations: Recommendation[] = [];

		// Most active time recommendations
		const mostActiveHour = context.spendingPatterns.timingPatterns.mostActiveHour;
		if (mostActiveHour >= 20 || mostActiveHour <= 6) {
			recommendations.push({
				id: 'timing-late-night',
				type: 'timing',
				priority: 'low',
				title: 'Late Night Spending',
				description: `You tend to make transactions late at night. Consider reviewing these purchases in the morning.`,
				actionable: false,
				confidence: 65,
				estimatedImpact: 'low',
				metadata: { hour: mostActiveHour },
				createdAt: new Date().toISOString()
			});
		}

		return recommendations;
	}

	/**
	 * Generate category-related recommendations
	 */
	private async generateCategoryRecommendations(context: RecommendationContext): Promise<Recommendation[]> {
		const recommendations: Recommendation[] = [];

		// Top spending categories
		const topCategories = context.spendingPatterns.categoryPatterns.slice(0, 3);
		topCategories.forEach(cat => {
			if (cat.trend === 'increasing' && cat.percentageOfTotal > 20) {
				recommendations.push({
					id: `category-increasing-${cat.categoryId}`,
					type: 'category',
					priority: 'medium',
					title: `Increasing Spending in ${cat.categoryName}`,
					description: `Your spending in ${cat.categoryName} is increasing and represents ${Math.round(cat.percentageOfTotal)}% of your total spending.`,
					actionable: true,
					actionText: 'Review Category',
					actionUrl: '/analyze',
					confidence: 75,
					estimatedImpact: 'medium',
					metadata: { categoryId: cat.categoryId, categoryName: cat.categoryName },
					createdAt: new Date().toISOString()
				});
			}
		});

		return recommendations;
	}

	/**
	 * Generate credit utilization recommendations
	 */
	private async generateCreditUtilizationRecommendations(): Promise<Recommendation[]> {
		const recommendations: Recommendation[] = [];

		try {
			// Get credit utilization recommendations from the service
			const creditRecommendations = await creditUtilizationService.generateRecommendations();

			// Convert to general recommendation format
			for (const creditRec of creditRecommendations) {
				recommendations.push({
					id: creditRec.id,
					type: 'credit',
					priority: creditRec.priority,
					title: creditRec.title,
					description: creditRec.description,
					actionable: creditRec.actionable,
					actionText: creditRec.recommendedAction,
					actionUrl: creditRec.accountId ? `/accounts/${creditRec.accountId}` : '/insights?tab=optimize',
					confidence: creditRec.estimatedImpact.estimatedScorePoints
						? Math.min(100, 60 + creditRec.estimatedImpact.estimatedScorePoints)
						: 75,
					estimatedImpact:
						creditRec.estimatedImpact.utilizationImprovement > 30
							? 'high'
							: creditRec.estimatedImpact.utilizationImprovement > 15
								? 'medium'
								: 'low',
					metadata: {
						...creditRec.metadata,
						utilizationImprovement: creditRec.estimatedImpact.utilizationImprovement,
						creditScoreImpact: creditRec.estimatedImpact.creditScoreImpact,
						estimatedScorePoints: creditRec.estimatedImpact.estimatedScorePoints
					},
					createdAt: new Date().toISOString()
				});
			}
		} catch (error) {
			console.error('[RecommendationService] Error generating credit utilization recommendations:', error);
		}

		return recommendations;
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	/**
	 * Gather all context data needed for recommendations
	 */
	private async gatherContext(days: number): Promise<RecommendationContext> {
		const [userProfile, spendingPatterns, behaviorPatterns, usageMetrics, budgetData, goals] = await Promise.all([
			this.getUserProfile(),
			insightsService.analyzeSpendingPatternsAsync(days),
			behavioralAnalysisService.detectAllPatterns(days),
			appUsageAnalyticsService.getUsageMetrics(days),
			this.getBudgetStatus(),
			goalService.getAllGoals()
		]);

		return {
			userProfile,
			spendingPatterns,
			behaviorPatterns,
			usageMetrics,
			budgetStatus: budgetData,
			goals: goals.filter(g => !g.deletedAt)
		};
	}

	/**
	 * Get user profile data
	 */
	private async getUserProfile(): Promise<{
		maturityLevel: 'beginner' | 'intermediate' | 'advanced';
		engagementScore: number;
	}> {
		const profile = await userService.getUserProfile();
		const metrics = await appUsageAnalyticsService.getUsageMetrics(30);

		return {
			maturityLevel: profile.maturityLevel,
			engagementScore: metrics.engagementScore
		};
	}

	/**
	 * Get current budget status
	 */
	private async getBudgetStatus(): Promise<{
		categories: Array<{
			categoryId: string;
			budgeted: number;
			spent: number;
			remaining: number;
		}>;
	}> {
		try {
			const budgetSummary = await budgetService.getBudgetSummary();
			
			// BudgetSummary has 'allocations' not 'categories'
			if (!budgetSummary || !budgetSummary.allocations) {
				return { categories: [] };
			}

			const categories = budgetSummary.allocations.map(allocation => ({
				categoryId: allocation.categoryId,
				budgeted: allocation.allocatedAmount || 0,
				spent: Math.abs(allocation.spentAmount || 0),
				remaining: allocation.remainingAmount || 0
			}));

			return { categories };
		} catch (error) {
			console.warn('Failed to get budget status:', error);
			return { categories: [] };
		}
	}

	private formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}
}

export const recommendationService = new RecommendationService();
