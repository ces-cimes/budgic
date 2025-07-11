import { db } from '$lib/core/db';
import { transactionService } from './transaction-service';
import { budgetService } from './budget-service';

// ============================================================================
// CORE ANALYTICS TYPES
// ============================================================================

export interface TransactionAnalysis {
	transactions: any[];
	totalSpending: number;
	totalIncome: number;
	netAmount: number;
	spendingByCategory: Record<string, number>;
	spendingByWhyTag: Record<string, number>;
	transactionCount: number;
	dateRange: {
		start: string;
		end: string;
	};
}

export interface TrendData {
	period: string;
	amount: number;
	transactionCount: number;
	percentageChange: number;
	trend: 'increasing' | 'decreasing' | 'stable';
}

export interface FinancialHealthComponents {
	budgetAdherence: number;
	emergencyFund: number;
	debtToIncome: number;
	savingsRate: number;
	spendingHabits: number;
	spendingConsistency: number;
}

export interface FinancialHealthScore {
	overallScore: number; // 0-100
	components: FinancialHealthComponents;
	grade: 'A' | 'B' | 'C' | 'D' | 'F';
	level: 'excellent' | 'good' | 'fair' | 'poor';
	title: string;
	description: string;
	trend: 'improving' | 'declining' | 'stable';
	trendValue: number;
	recommendations: string[];
}

export interface GoalProgress {
	tagId: string;
	tagName: string;
	currentAmount: number;
	targetAmount: number;
	progress: number;
	isOnTrack: boolean;
	daysRemaining: number;
	projectedCompletion: number;
	successProbability: number;
	riskFactors: string[];
	recommendations: string[];
}

export interface SpendingVelocity {
	whyTagId: string;
	whyTagName: string;
	currentPeriodSpending: number;
	previousPeriodSpending: number;
	velocityRatio: number;
	period: 'daily' | 'weekly' | 'monthly';
}

// ============================================================================
// CORE ANALYTICS SERVICE
// ============================================================================

class AnalyticsCoreService {
	public get ready() {
		return db.isOpen();
	}

	public isLoading() {
		return !this.ready;
	}

	/**
	 * Analyze transactions for a given date range
	 */
	async analyzeTransactions(
		startDate: string,
		endDate: string,
		accountId?: string
	): Promise<TransactionAnalysis> {
		const transactionGroups = await transactionService.getTransactionsByDateRange(startDate, endDate);
		
		// Flatten transaction groups and filter by account if specified
		let allTransactions: any[] = [];
		
		if (Array.isArray(transactionGroups)) {
			// Check if it's already an array of individual transactions
			if (transactionGroups.length > 0 && 'accountId' in transactionGroups[0]) {
				allTransactions = transactionGroups as any[];
			} else {
				// It's an array of TransactionOrGroup
				allTransactions = (transactionGroups as any[]).flatMap(group => group.transactions);
			}
		}
		
		// Filter by account if specified
		const filteredTransactions = accountId 
			? allTransactions.filter(tx => tx.accountId === accountId)
			: allTransactions;

		const spendingTransactions = filteredTransactions.filter(tx => tx.type === 'expense' && tx.amount > 0);
		const incomeTransactions = filteredTransactions.filter(tx => tx.type === 'income' && tx.amount > 0);

		const totalSpending = spendingTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
		const totalIncome = incomeTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
		const netAmount = totalIncome - totalSpending;

		// Calculate spending by category
		const spendingByCategory: Record<string, number> = {};
		const spendingByWhyTag: Record<string, number> = {};

		for (const tx of spendingTransactions) {
			if (tx.whyTag) {
				const category = this.mapWhyTagToCategory(tx.whyTag);
				spendingByCategory[category] = (spendingByCategory[category] || 0) + Math.abs(tx.amount);
				spendingByWhyTag[tx.whyTag] = (spendingByWhyTag[tx.whyTag] || 0) + Math.abs(tx.amount);
			}
		}

		return {
			transactions: filteredTransactions,
			totalSpending,
			totalIncome,
			netAmount,
			spendingByCategory,
			spendingByWhyTag,
			transactionCount: filteredTransactions.length,
			dateRange: { start: startDate, end: endDate }
		};
	}

	/**
	 * Calculate spending trends over multiple periods
	 */
	async calculateTrends(
		periods: number = 6,
		periodType: 'monthly' | 'weekly' | 'daily' = 'monthly',
		accountId?: string
	): Promise<TrendData[]> {
		const trends: TrendData[] = [];
		const now = new Date();

		for (let i = periods - 1; i >= 0; i--) {
			let startDate: Date;
			let endDate: Date;
			let period: string;

			switch (periodType) {
				case 'monthly':
					startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
					endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
					period = startDate.toISOString().slice(0, 7); // YYYY-MM
					break;
				case 'weekly':
					startDate = new Date(now.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
					endDate = new Date(startDate.getTime() + (6 * 24 * 60 * 60 * 1000));
					period = `W${Math.ceil((startDate.getDate() + startDate.getDay()) / 7)}`;
					break;
				default:
					startDate = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
					endDate = new Date(startDate.getTime() + (23 * 60 * 60 * 1000));
					period = startDate.toISOString().split('T')[0];
			}

			const analysis = await this.analyzeTransactions(
				startDate.toISOString(),
				endDate.toISOString(),
				accountId
			);

			// Calculate percentage change from previous period
			let percentageChange = 0;
			if (i < periods - 1) {
				const previousTrend = trends[trends.length - 1];
				if (previousTrend && previousTrend.amount > 0) {
					percentageChange = ((analysis.totalSpending - previousTrend.amount) / previousTrend.amount) * 100;
				}
			}

			const trend: 'increasing' | 'decreasing' | 'stable' = 
				percentageChange > 5 ? 'increasing' : 
				percentageChange < -5 ? 'decreasing' : 'stable';

			trends.push({
				period,
				amount: analysis.totalSpending,
				transactionCount: analysis.transactionCount,
				percentageChange,
				trend
			});
		}

		return trends;
	}

	/**
	 * Calculate comprehensive financial health score
	 */
	async calculateFinancialHealthScore(accountId?: string): Promise<FinancialHealthScore> {
		const now = new Date();
		const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

		// Get current and previous month data
		const currentAnalysis = await this.analyzeTransactions(
			currentMonth.toISOString(),
			now.toISOString(),
			accountId
		);

		const previousAnalysis = await this.analyzeTransactions(
			previousMonth.toISOString(),
			new Date(now.getFullYear(), now.getMonth(), 0).toISOString(),
			accountId
		);

		// Get budget data
		const categoryBudgets = await budgetService.calculateCategoryBudgets();
		// Note: getWaterfallProgress is not available in budgetService, using categoryBudgets instead
		const waterfallData = categoryBudgets;

		// Calculate component scores
		const components: FinancialHealthComponents = {
			budgetAdherence: this.calculateBudgetAdherenceScore(categoryBudgets),
			emergencyFund: this.calculateEmergencyFundScore(waterfallData),
			debtToIncome: this.calculateDebtToIncomeScore(currentAnalysis),
			savingsRate: this.calculateSavingsRateScore(currentAnalysis),
			spendingHabits: this.calculateSpendingHabitsScore(currentAnalysis),
			spendingConsistency: this.calculateSpendingConsistencyScore(currentAnalysis, previousAnalysis)
		};

		const overallScore = Math.round(
			Object.values(components).reduce((sum, score) => sum + score, 0) / Object.keys(components).length
		);

		const grade = this.calculateGrade(overallScore);
		const level = this.calculateLevel(overallScore);
		const trend = this.calculateHealthTrend(currentAnalysis, previousAnalysis);

		return {
			overallScore,
			components,
			grade,
			level,
			title: this.generateHealthTitle(level, overallScore),
			description: this.generateHealthDescription(level, components),
			trend,
			trendValue: this.calculateTrendValue(currentAnalysis, previousAnalysis),
			recommendations: this.generateHealthRecommendations(components, level)
		};
	}

	/**
	 * Calculate goal progress and predictions
	 */
	async calculateGoalProgress(accountId?: string): Promise<GoalProgress[]> {
		const tagBudgets = await budgetService.getTagBudgets();
		const goals: GoalProgress[] = [];

		for (const tagBudget of tagBudgets) {
			if (tagBudget.isGoalBased && tagBudget.goalTarget) {
				const currentProgress = tagBudget.goalProgress || 0;
				// Use a default of 365 days since TagBudget doesn't have goalTargetDate
				const daysRemaining = this.calculateDaysRemaining();
				const dailyRequired = this.calculateDailyRequired(
					tagBudget.goalTarget,
					tagBudget.spent,
					daysRemaining
				);

				const successProbability = this.calculateGoalSuccessProbability(dailyRequired, daysRemaining);
				const isOnTrack = currentProgress >= (1 - (daysRemaining / 365)) * 100;

				goals.push({
					tagId: tagBudget.tagId,
					tagName: tagBudget.tagName,
					currentAmount: tagBudget.spent,
					targetAmount: tagBudget.goalTarget,
					progress: currentProgress,
					isOnTrack,
					daysRemaining,
					projectedCompletion: this.calculateProjectedCompletion(tagBudget, dailyRequired),
					successProbability,
					riskFactors: this.identifyGoalRiskFactors(tagBudget, dailyRequired),
					recommendations: this.generateGoalRecommendations(tagBudget, dailyRequired, successProbability)
				});
			}
		}

		return goals;
	}

	/**
	 * Calculate spending velocity for all why tags
	 */
	async calculateSpendingVelocity(
		period: 'daily' | 'weekly' | 'monthly' = 'monthly',
		accountId?: string
	): Promise<SpendingVelocity[]> {
		const velocityData: SpendingVelocity[] = [];
		const whyTags = await budgetService.getWhyTagsWithCategories();

		const now = new Date();
		let currentStart: Date, currentEnd: Date, previousStart: Date, previousEnd: Date;

		switch (period) {
			case 'monthly':
				currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
				currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
				previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
				previousEnd = new Date(now.getFullYear(), now.getMonth(), 0);
				break;
			case 'weekly':
				currentStart = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
				currentEnd = now;
				previousStart = new Date(currentStart.getTime() - (7 * 24 * 60 * 60 * 1000));
				previousEnd = new Date(currentStart.getTime() - (24 * 60 * 60 * 1000));
				break;
			default:
				currentStart = new Date(now.getTime() - (24 * 60 * 60 * 1000));
				currentEnd = now;
				previousStart = new Date(currentStart.getTime() - (24 * 60 * 60 * 1000));
				previousEnd = new Date(currentStart.getTime() - (24 * 60 * 60 * 1000));
		}

		for (const whyTag of whyTags) {
			const currentAnalysis = await this.analyzeTransactions(
				currentStart.toISOString(),
				currentEnd.toISOString(),
				accountId
			);

			const previousAnalysis = await this.analyzeTransactions(
				previousStart.toISOString(),
				previousEnd.toISOString(),
				accountId
			);

			const currentSpending = currentAnalysis.spendingByWhyTag[whyTag.name] || 0;
			const previousSpending = previousAnalysis.spendingByWhyTag[whyTag.name] || 0;
			const velocityRatio = previousSpending > 0 ? currentSpending / previousSpending : 0;

			if (currentSpending > 0) {
				velocityData.push({
					whyTagId: whyTag.id,
					whyTagName: whyTag.name,
					currentPeriodSpending: currentSpending,
					previousPeriodSpending: previousSpending,
					velocityRatio,
					period
				});
			}
		}

		return velocityData;
	}

	// Helper methods

	private mapWhyTagToCategory(whyTag: string): string {
		// This would need to be enhanced with proper mapping logic
		// For now, using a simple approach
		const categoryMap: Record<string, string> = {
			'groceries': 'survival',
			'rent': 'survival',
			'utilities': 'survival',
			'healthcare': 'survival',
			'emergency': 'security',
			'insurance': 'security',
			'savings': 'security',
			'education': 'growth',
			'investment': 'growth',
			'entertainment': 'lifestyle',
			'dining': 'lifestyle',
			'shopping': 'lifestyle'
		};

		return categoryMap[whyTag.toLowerCase()] || 'lifestyle';
	}

	private calculateBudgetAdherenceScore(categoryBudgets: any[]): number {
		if (categoryBudgets.length === 0) return 0;
		
		const adherenceScores = categoryBudgets.map(budget => {
			if (budget.targetAmount === 0) return 100;
			const percentage = budget.spent / budget.targetAmount;
			return percentage <= 1 ? 100 - (percentage * 20) : Math.max(0, 100 - (percentage - 1) * 50);
		});

		return Math.round(adherenceScores.reduce((sum, score) => sum + score, 0) / adherenceScores.length);
	}

	private calculateEmergencyFundScore(waterfallData: any): number {
		// This would need to be enhanced with actual emergency fund logic
		return 85; // Mock score
	}

	private calculateDebtToIncomeScore(analysis: TransactionAnalysis): number {
		if (analysis.totalIncome === 0) return 0;
		const debtToIncomeRatio = Math.abs(analysis.netAmount) / analysis.totalIncome;
		return Math.max(0, 100 - (debtToIncomeRatio * 100));
	}

	private calculateSavingsRateScore(analysis: TransactionAnalysis): number {
		if (analysis.totalIncome === 0) return 0;
		const savingsRate = analysis.netAmount / analysis.totalIncome;
		return Math.min(100, Math.max(0, savingsRate * 100));
	}

	private calculateSpendingHabitsScore(analysis: TransactionAnalysis): number {
		const prioritySpending = (analysis.spendingByCategory.survival || 0) + (analysis.spendingByCategory.security || 0);
		const totalSpending = analysis.totalSpending;
		
		if (totalSpending === 0) return 100;
		return Math.min(100, (prioritySpending / totalSpending) * 100);
	}

	private calculateSpendingConsistencyScore(current: TransactionAnalysis, previous: TransactionAnalysis): number {
		if (previous.totalSpending === 0) return 100;
		const variance = Math.abs(current.totalSpending - previous.totalSpending) / previous.totalSpending;
		return Math.max(0, 100 - (variance * 50));
	}

	private calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
		if (score >= 90) return 'A';
		if (score >= 80) return 'B';
		if (score >= 70) return 'C';
		if (score >= 60) return 'D';
		return 'F';
	}

	private calculateLevel(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
		if (score >= 85) return 'excellent';
		if (score >= 70) return 'good';
		if (score >= 50) return 'fair';
		return 'poor';
	}

	private calculateHealthTrend(current: TransactionAnalysis, previous: TransactionAnalysis): 'improving' | 'declining' | 'stable' {
		const currentSavingsRate = current.totalIncome > 0 ? current.netAmount / current.totalIncome : 0;
		const previousSavingsRate = previous.totalIncome > 0 ? previous.netAmount / previous.totalIncome : 0;
		
		const change = currentSavingsRate - previousSavingsRate;
		return change > 0.05 ? 'improving' : change < -0.05 ? 'declining' : 'stable';
	}

	private calculateTrendValue(current: TransactionAnalysis, previous: TransactionAnalysis): number {
		const currentSavingsRate = current.totalIncome > 0 ? current.netAmount / current.totalIncome : 0;
		const previousSavingsRate = previous.totalIncome > 0 ? previous.netAmount / previous.totalIncome : 0;
		return Math.round((currentSavingsRate - previousSavingsRate) * 100);
	}

	private generateHealthTitle(level: string, score: number): string {
		const titles = {
			excellent: 'Excellent Financial Health',
			good: 'Good Financial Health',
			fair: 'Fair Financial Health',
			poor: 'Needs Improvement'
		};
		return titles[level as keyof typeof titles] || 'Financial Health';
	}

	private generateHealthDescription(level: string, components: FinancialHealthComponents): string {
		const descriptions = {
			excellent: 'You\'re managing your money exceptionally well!',
			good: 'You\'re on the right track with your finances.',
			fair: 'There\'s room for improvement in your financial habits.',
			poor: 'Consider reviewing your spending and saving patterns.'
		};
		return descriptions[level as keyof typeof descriptions] || 'Review your financial health.';
	}

	private generateHealthRecommendations(components: FinancialHealthComponents, level: string): string[] {
		const recommendations: string[] = [];

		if (components.budgetAdherence < 70) {
			recommendations.push('Work on staying within your budget categories');
		}
		if (components.savingsRate < 20) {
			recommendations.push('Aim to save at least 20% of your income');
		}
		if (components.spendingHabits < 70) {
			recommendations.push('Prioritize spending on survival and security categories');
		}
		if (components.debtToIncome < 70) {
			recommendations.push('Focus on reducing debt relative to your income');
		}

		return recommendations;
	}

	private calculateDaysRemaining(targetDate?: string): number {
		if (!targetDate) return 365; // Default to 1 year
		const target = new Date(targetDate);
		const now = new Date();
		return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
	}

	private calculateDailyRequired(target: number, current: number, daysRemaining: number): number {
		if (daysRemaining <= 0) return 0;
		return Math.max(0, (target - current) / daysRemaining);
	}

	private calculateGoalSuccessProbability(dailyRequired: number, daysRemaining: number): number {
		// Simplified probability calculation
		if (dailyRequired <= 0) return 100;
		if (daysRemaining <= 0) return 0;
		
		// Base probability on daily required amount (lower is better)
		const baseProbability = Math.max(0, 100 - (dailyRequired / 100));
		const timeFactor = Math.min(1, daysRemaining / 365);
		
		return Math.round(baseProbability * timeFactor);
	}

	private calculateProjectedCompletion(tagBudget: any, dailyRequired: number): number {
		if (dailyRequired <= 0) return tagBudget.goalTarget;
		const daysToComplete = (tagBudget.goalTarget - tagBudget.spent) / dailyRequired;
		return Math.min(tagBudget.goalTarget, tagBudget.spent + (dailyRequired * Math.min(daysToComplete, 365)));
	}

	private identifyGoalRiskFactors(tagBudget: any, dailyRequired: number): string[] {
		const riskFactors: string[] = [];
		
		if (dailyRequired > 100) {
			riskFactors.push('High daily savings requirement');
		}
		if (tagBudget.goalProgress && tagBudget.goalProgress < 25) {
			riskFactors.push('Low progress toward goal');
		}
		// Note: TagBudget doesn't have goalTargetDate, so we skip time-based risk assessment

		return riskFactors;
	}

	private generateGoalRecommendations(tagBudget: any, dailyRequired: number, successProbability: number): string[] {
		const recommendations: string[] = [];

		if (successProbability < 50) {
			recommendations.push('Consider extending your goal timeline');
		}
		if (dailyRequired > 50) {
			recommendations.push('Increase your daily contribution to this goal');
		}
		if (tagBudget.goalProgress && tagBudget.goalProgress > 75) {
			recommendations.push('You\'re close to your goal! Stay consistent');
		}

		return recommendations;
	}
}

export const analyticsCoreService = new AnalyticsCoreService(); 