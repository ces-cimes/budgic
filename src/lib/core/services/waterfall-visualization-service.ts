import { db } from '$lib/core/db';
import { budgetService } from './budget-service';
import { transactionService } from './transaction-service';
import { currencyService } from './currency-service';

// ============================================================================
// WATERFALL VISUALIZATION TYPES
// ============================================================================

export interface WaterfallTier {
	category: 'survival' | 'security' | 'growth' | 'lifestyle';
	name: string;
	description: string;
	color: string;
	priority: number;
	allocatedAmount: number;
	targetAmount: number;
	spent: number;
	remaining: number;
	completionPercentage: number;
	isComplete: boolean;
	isOverBudget: boolean;
	progressBarWidth: number; // 0-100
	status: 'under_budget' | 'on_track' | 'approaching' | 'over_budget' | 'critical';
	tagBudgets: WaterfallTagBudget[];
}

export interface WaterfallTagBudget {
	tagId: string;
	tagName: string;
	allocatedAmount: number;
	targetAmount?: number;
	spent: number;
	remaining: number;
	completionPercentage: number;
	isComplete: boolean;
	isGoalBased: boolean;
	goalType?: 'monthly' | 'target' | 'recurring';
	goalProgress?: number;
	priority: number;
	status: 'under_budget' | 'on_track' | 'approaching' | 'over_budget' | 'critical';
}

export interface WaterfallProgressData {
	tiers: WaterfallTier[];
	totalAllocated: number;
	totalSpent: number;
	totalRemaining: number;
	overallCompletion: number;
	monthlyComparison: {
		previousMonth: number;
		currentMonth: number;
		percentageChange: number;
		trend: 'improving' | 'declining' | 'stable';
	};
	priorityBreakdown: {
		survival: { allocated: number; spent: number; percentage: number };
		security: { allocated: number; spent: number; percentage: number };
		growth: { allocated: number; spent: number; percentage: number };
		lifestyle: { allocated: number; spent: number; percentage: number };
	};
	insights: WaterfallInsight[];
}

export interface WaterfallInsight {
	type: 'priority_misalignment' | 'surplus_opportunity' | 'overspending_risk' | 'goal_progress' | 'trend_analysis';
	title: string;
	message: string;
	severity: 'info' | 'warning' | 'alert' | 'success';
	data: Record<string, any>;
}

export interface WaterfallComparisonData {
	currentMonth: WaterfallProgressData;
	previousMonth: WaterfallProgressData;
	changes: {
		tier: string;
		allocatedChange: number;
		spentChange: number;
		percentageChange: number;
		trend: 'improving' | 'declining' | 'stable';
	}[];
}

// ============================================================================
// WATERFALL VISUALIZATION SERVICE
// ============================================================================

class WaterfallVisualizationService {
	private readonly TIER_CONFIG = {
		survival: {
			name: 'Survival',
			description: 'Essential needs for basic living',
			color: '#ef4444', // Red
			priority: 1
		},
		security: {
			name: 'Security',
			description: 'Emergency fund, insurance, debt payments',
			color: '#f59e0b', // Amber
			priority: 2
		},
		growth: {
			name: 'Growth',
			description: 'Investments, education, skill development',
			color: '#10b981', // Emerald
			priority: 3
		},
		lifestyle: {
			name: 'Lifestyle',
			description: 'Entertainment, hobbies, discretionary spending',
			color: '#8b5cf6', // Violet
			priority: 4
		}
	};

	public get ready() {
		return db.isOpen();
	}

	public isLoading() {
		return !this.ready;
	}

	/**
	 * Get complete waterfall progress data
	 */
	async getWaterfallProgress(): Promise<WaterfallProgressData> {
		const categoryBudgets = await budgetService.calculateCategoryBudgets();
		const tiers = await this.buildWaterfallTiers(categoryBudgets);
		
		const totalAllocated = tiers.reduce((sum, tier) => sum + tier.allocatedAmount, 0);
		const totalSpent = tiers.reduce((sum, tier) => sum + tier.spent, 0);
		const totalRemaining = totalAllocated - totalSpent;
		const overallCompletion = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;

		const monthlyComparison = await this.calculateMonthlyComparison();
		const priorityBreakdown = this.calculatePriorityBreakdown(tiers);
		const insights = await this.generateInsights(tiers, monthlyComparison);

		return {
			tiers,
			totalAllocated,
			totalSpent,
			totalRemaining,
			overallCompletion,
			monthlyComparison,
			priorityBreakdown,
			insights
		};
	}

	/**
	 * Build waterfall tiers from category budgets
	 */
	private async buildWaterfallTiers(categoryBudgets: any[]): Promise<WaterfallTier[]> {
		const tiers: WaterfallTier[] = [];

		for (const categoryBudget of categoryBudgets) {
			const category = categoryBudget.waterfallCategory;
			const config = this.TIER_CONFIG[category as keyof typeof this.TIER_CONFIG];
			
			if (!config) continue;

			const completionPercentage = categoryBudget.targetAmount > 0 
				? (categoryBudget.spent / categoryBudget.targetAmount) * 100 
				: 0;

			const isComplete = categoryBudget.isComplete;
			const isOverBudget = categoryBudget.spent > categoryBudget.targetAmount;
			const progressBarWidth = Math.min(completionPercentage, 100);

			const status = this.calculateTierStatus(completionPercentage, isOverBudget);

			// Build tag budgets for this tier
			const tagBudgets = await this.buildTagBudgets(categoryBudget.tagBudgets);

			const tier: WaterfallTier = {
				category,
				name: config.name,
				description: config.description,
				color: config.color,
				priority: config.priority,
				allocatedAmount: categoryBudget.totalAllocated,
				targetAmount: categoryBudget.targetAmount,
				spent: categoryBudget.spent,
				remaining: categoryBudget.remaining,
				completionPercentage,
				isComplete,
				isOverBudget,
				progressBarWidth,
				status,
				tagBudgets
			};

			tiers.push(tier);
		}

		// Sort by priority
		return tiers.sort((a, b) => a.priority - b.priority);
	}

	/**
	 * Build tag budgets for a tier
	 */
	private async buildTagBudgets(tagBudgets: any[]): Promise<WaterfallTagBudget[]> {
		return tagBudgets.map(tagBudget => {
			const completionPercentage = tagBudget.targetAmount && tagBudget.targetAmount > 0
				? (tagBudget.spent / tagBudget.targetAmount) * 100
				: 0;

			const isComplete = tagBudget.isComplete;
			const status = this.calculateTagStatus(completionPercentage, tagBudget.spent > (tagBudget.targetAmount || 0));

			return {
				tagId: tagBudget.tagId,
				tagName: tagBudget.tagName,
				allocatedAmount: tagBudget.allocatedAmount,
				targetAmount: tagBudget.targetAmount,
				spent: tagBudget.spent,
				remaining: tagBudget.remaining,
				completionPercentage,
				isComplete,
				isGoalBased: tagBudget.isGoalBased,
				goalType: tagBudget.goalType,
				goalProgress: tagBudget.goalProgress,
				priority: tagBudget.priority,
				status
			};
		}).sort((a, b) => a.priority - b.priority);
	}

	/**
	 * Calculate tier status based on completion percentage
	 */
	private calculateTierStatus(completionPercentage: number, isOverBudget: boolean): WaterfallTier['status'] {
		if (isOverBudget) {
			return completionPercentage > 110 ? 'critical' : 'over_budget';
		}
		if (completionPercentage >= 80) {
			return 'approaching';
		}
		if (completionPercentage >= 60) {
			return 'on_track';
		}
		return 'under_budget';
	}

	/**
	 * Calculate tag status based on completion percentage
	 */
	private calculateTagStatus(completionPercentage: number, isOverBudget: boolean): WaterfallTagBudget['status'] {
		if (isOverBudget) {
			return completionPercentage > 110 ? 'critical' : 'over_budget';
		}
		if (completionPercentage >= 80) {
			return 'approaching';
		}
		if (completionPercentage >= 60) {
			return 'on_track';
		}
		return 'under_budget';
	}

	/**
	 * Calculate monthly comparison data
	 */
	private async calculateMonthlyComparison(): Promise<WaterfallProgressData['monthlyComparison']> {
		const now = new Date();
		const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

		// Get current month spending
		const currentMonthTransactions = await transactionService.getTransactionsByDateRange(
			currentMonth.toISOString(),
			now.toISOString()
		);
		const currentMonthSpending = this.calculateTotalSpending(currentMonthTransactions);

		// Get previous month spending
		const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
		const previousMonthTransactions = await transactionService.getTransactionsByDateRange(
			previousMonth.toISOString(),
			previousMonthEnd.toISOString()
		);
		const previousMonthSpending = this.calculateTotalSpending(previousMonthTransactions);

		const percentageChange = previousMonthSpending > 0 
			? ((currentMonthSpending - previousMonthSpending) / previousMonthSpending) * 100
			: 0;

		let trend: 'improving' | 'declining' | 'stable' = 'stable';
		if (percentageChange < -5) trend = 'improving';
		else if (percentageChange > 5) trend = 'declining';

		return {
			previousMonth: previousMonthSpending,
			currentMonth: currentMonthSpending,
			percentageChange,
			trend
		};
	}

	/**
	 * Calculate total spending from transactions
	 */
	private calculateTotalSpending(transactions: any[]): number {
		return transactions
			.filter(tx => tx.type === 'expense' && tx.amount > 0)
			.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
	}

	/**
	 * Calculate priority breakdown
	 */
	private calculatePriorityBreakdown(tiers: WaterfallTier[]): WaterfallProgressData['priorityBreakdown'] {
		const breakdown: WaterfallProgressData['priorityBreakdown'] = {
			survival: { allocated: 0, spent: 0, percentage: 0 },
			security: { allocated: 0, spent: 0, percentage: 0 },
			growth: { allocated: 0, spent: 0, percentage: 0 },
			lifestyle: { allocated: 0, spent: 0, percentage: 0 }
		};

		for (const tier of tiers) {
			const category = tier.category as keyof typeof breakdown;
			breakdown[category] = {
				allocated: tier.allocatedAmount,
				spent: tier.spent,
				percentage: tier.completionPercentage
			};
		}

		return breakdown;
	}

	/**
	 * Generate insights based on waterfall data
	 */
	private async generateInsights(
		tiers: WaterfallTier[], 
		monthlyComparison: WaterfallProgressData['monthlyComparison']
	): Promise<WaterfallInsight[]> {
		const insights: WaterfallInsight[] = [];

		// Check for priority misalignment
		const survivalTier = tiers.find(t => t.category === 'survival');
		if (survivalTier && survivalTier.completionPercentage < 50) {
			insights.push({
				type: 'priority_misalignment',
				title: 'Survival Budget Underutilized',
				message: 'Your survival budget is only ${Math.round(survivalTier.completionPercentage)}% used. Consider if you need to reallocate funds to higher priorities.',
				severity: 'warning',
				data: { tier: 'survival', percentage: survivalTier.completionPercentage }
			});
		}

		// Check for overspending risks
		const overBudgetTiers = tiers.filter(t => t.isOverBudget);
		if (overBudgetTiers.length > 0) {
			insights.push({
				type: 'overspending_risk',
				title: 'Budget Exceeded in Multiple Categories',
				message: `You've exceeded your budget in ${overBudgetTiers.length} category(ies). This may impact your financial priorities.`,
				severity: 'alert',
				data: { overBudgetCount: overBudgetTiers.length, categories: overBudgetTiers.map(t => t.category) }
			});
		}

		// Check for surplus opportunities
		const underBudgetTiers = tiers.filter(t => t.completionPercentage < 60);
		if (underBudgetTiers.length > 0) {
			insights.push({
				type: 'surplus_opportunity',
				title: 'Surplus Funds Available',
				message: `You have surplus funds in ${underBudgetTiers.length} category(ies). Consider reallocating to higher priority areas.`,
				severity: 'info',
				data: { underBudgetCount: underBudgetTiers.length, categories: underBudgetTiers.map(t => t.category) }
			});
		}

		// Check goal progress
		const goalBasedTags = tiers.flatMap(t => t.tagBudgets.filter(tb => tb.isGoalBased));
		const completedGoals = goalBasedTags.filter(tb => tb.isComplete);
		if (completedGoals.length > 0) {
			insights.push({
				type: 'goal_progress',
				title: 'Financial Goals Achieved',
				message: `Congratulations! You've completed ${completedGoals.length} financial goal(s).`,
				severity: 'success',
				data: { completedGoals: completedGoals.length, goals: completedGoals.map(g => g.tagName) }
			});
		}

		// Check spending trends
		if (monthlyComparison.trend === 'improving') {
			insights.push({
				type: 'trend_analysis',
				title: 'Spending Trend Improving',
				message: `Your spending is ${Math.abs(monthlyComparison.percentageChange).toFixed(1)}% lower than last month. Great progress!`,
				severity: 'success',
				data: { percentageChange: monthlyComparison.percentageChange }
			});
		} else if (monthlyComparison.trend === 'declining') {
			insights.push({
				type: 'trend_analysis',
				title: 'Spending Trend Concerning',
				message: `Your spending is ${Math.abs(monthlyComparison.percentageChange).toFixed(1)}% higher than last month. Consider reviewing your budget.`,
				severity: 'warning',
				data: { percentageChange: monthlyComparison.percentageChange }
			});
		}

		return insights;
	}

	/**
	 * Get waterfall comparison data (current vs previous month)
	 */
	async getWaterfallComparison(): Promise<WaterfallComparisonData> {
		const currentMonth = await this.getWaterfallProgress();
		
		// For now, we'll use the same data for previous month
		// In a real implementation, you'd fetch historical data
		const previousMonth = { ...currentMonth };
		
		const changes = currentMonth.tiers.map(tier => {
			const previousTier = previousMonth.tiers.find(pt => pt.category === tier.category);
			if (!previousTier) {
				return {
					tier: tier.name,
					allocatedChange: 0,
					spentChange: 0,
					percentageChange: 0,
					trend: 'stable' as const
				};
			}

			const allocatedChange = tier.allocatedAmount - previousTier.allocatedAmount;
			const spentChange = tier.spent - previousTier.spent;
			const percentageChange = previousTier.completionPercentage > 0
				? ((tier.completionPercentage - previousTier.completionPercentage) / previousTier.completionPercentage) * 100
				: 0;

			let trend: 'improving' | 'declining' | 'stable' = 'stable';
			if (percentageChange < -5) trend = 'improving';
			else if (percentageChange > 5) trend = 'declining';

			return {
				tier: tier.name,
				allocatedChange,
				spentChange,
				percentageChange,
				trend
			};
		});

		return {
			currentMonth,
			previousMonth,
			changes
		};
	}

	/**
	 * Get progress bar data for a specific tier
	 */
	getProgressBarData(tier: WaterfallTier): {
		width: number;
		color: string;
		backgroundColor: string;
		status: string;
	} {
		const width = Math.min(tier.progressBarWidth, 100);
		let color = tier.color;
		let backgroundColor = '#e5e7eb'; // Gray background
		let status = '';

		switch (tier.status) {
			case 'critical':
				color = '#dc2626'; // Red
				status = 'Critical - Immediate action needed';
				break;
			case 'over_budget':
				color = '#ea580c'; // Orange
				status = 'Over budget - Review spending';
				break;
			case 'approaching':
				color = '#d97706'; // Amber
				status = 'Approaching limit - Monitor closely';
				break;
			case 'on_track':
				color = '#059669'; // Green
				status = 'On track - Good progress';
				break;
			case 'under_budget':
				color = '#0891b2'; // Blue
				status = 'Under budget - Consider reallocation';
				break;
		}

		return { width, color, backgroundColor, status };
	}

	/**
	 * Get "money going to what matters" percentage
	 */
	async getMoneyToWhatMattersPercentage(): Promise<{
		percentage: number;
		amount: number;
		totalSpent: number;
		breakdown: Record<string, number>;
	}> {
		const waterfallData = await this.getWaterfallProgress();
		const priorityTiers = waterfallData.tiers.filter(t => t.category === 'survival' || t.category === 'security');
		
		const prioritySpending = priorityTiers.reduce((sum, tier) => sum + tier.spent, 0);
		const totalSpent = waterfallData.tiers.reduce((sum, tier) => sum + tier.spent, 0);
		
		const percentage = totalSpent > 0 ? (prioritySpending / totalSpent) * 100 : 0;
		
		const breakdown: Record<string, number> = {};
		for (const tier of priorityTiers) {
			breakdown[tier.name] = tier.spent;
		}

		return {
			percentage,
			amount: prioritySpending,
			totalSpent,
			breakdown
		};
	}

	/**
	 * Get goal achievement indicators
	 */
	async getGoalAchievementIndicators(): Promise<{
		totalGoals: number;
		completedGoals: number;
		completionRate: number;
		goals: Array<{
			tagName: string;
			progress: number;
			isComplete: boolean;
			remaining: number;
		}>;
	}> {
		const waterfallData = await this.getWaterfallProgress();
		const goalBasedTags = waterfallData.tiers.flatMap(t => t.tagBudgets.filter(tb => tb.isGoalBased));
		
		const totalGoals = goalBasedTags.length;
		const completedGoals = goalBasedTags.filter(tb => tb.isComplete).length;
		const completionRate = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0;

		const goals = goalBasedTags.map(tb => ({
			tagName: tb.tagName,
			progress: tb.goalProgress || 0,
			isComplete: tb.isComplete,
			remaining: tb.remaining
		}));

		return {
			totalGoals,
			completedGoals,
			completionRate,
			goals
		};
	}
}

export const waterfallVisualizationService = new WaterfallVisualizationService(); 