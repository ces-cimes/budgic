import { db, generateUUID } from '$lib/core/db';
import { analyticsCoreService } from './analytics-core-service';
import { budgetService } from './budget-service';
import { transactionService } from './transaction-service';
import { userActionsService } from './user-actions-service';
import type { TransactionOrGroup } from './transaction-service';

// ============================================================================
// SIMPLIFIED INSIGHT TYPES
// ============================================================================

export interface Insight {
	id: string;
	type: 'budget_approaching' | 'budget_exceeded' | 'budget_surplus' | 'goal_milestone' | 'spending_velocity' | 'anomaly' | 'trend' | 'achievement' | 'savings_opportunity' | 'behavioral' | 'prediction';
	severity: 'info' | 'warning' | 'alert' | 'success';
	title: string;
	message: string;
	category?: 'survival' | 'security' | 'growth' | 'lifestyle';
	whyTagId?: string;
	percentage?: number;
	amount?: number;
	remaining?: number;
	threshold?: number;
	confidence?: number;
	actionable: boolean;
	actionText?: string;
	actionUrl?: string;
	createdAt: string;
	dismissedAt?: string;
	isActive: boolean;
	expiresAt?: string;
}

// ============================================================================
// INSIGHTS SERVICE
// ============================================================================

class InsightsService {
	private insights: Insight[] = [];
	private updateInterval: ReturnType<typeof setInterval> | null = null;
	private lastUpdate = 0;
	private updateFrequency = 5 * 60 * 1000; // 5 minutes
	private isUpdating = false;

	public get ready() {
		return db.isOpen();
	}

	public isLoading() {
		return !this.ready;
	}

	/**
	 * Get all active insights
	 */
	getInsights(): Insight[] {
		return this.insights.filter(insight => insight.isActive && !insight.dismissedAt);
	}

	/**
	 * Get insights by type
	 */
	getInsightsByType(type: Insight['type']): Insight[] {
		return this.getInsights().filter(insight => insight.type === type);
	}

	/**
	 * Get insights by severity
	 */
	getInsightsBySeverity(severity: Insight['severity']): Insight[] {
		return this.getInsights().filter(insight => insight.severity === severity);
	}

	/**
	 * Start automatic updates
	 */
	startAutoUpdates(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
		}

		// Initial update
		this.updateInsights();

		// Set up periodic updates
		this.updateInterval = setInterval(() => {
			this.updateInsights();
		}, this.updateFrequency);
	}

	/**
	 * Stop automatic updates
	 */
	stopAutoUpdates(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	/**
	 * Force an immediate update
	 */
	async forceUpdate(): Promise<void> {
		await this.updateInsights();
	}

	/**
	 * Dismiss an insight
	 */
	async dismissInsight(insightId: string): Promise<void> {
		const insight = this.insights.find(i => i.id === insightId);
		if (insight) {
			insight.dismissedAt = new Date().toISOString();
			insight.isActive = false;

			// Track dismissal in user actions service
			await userActionsService.track('insight_dismissed', {
				insightId,
				insightType: insight.type,
				insightTitle: insight.title,
				dismissedAt: insight.dismissedAt
			});
		}
	}

	/**
	 * Check if similar insight exists
	 */
	private isSimilarInsightExists(newInsight: Omit<Insight, 'id' | 'createdAt' | 'isActive'>): boolean {
		const now = new Date();
		const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

		return this.insights.some(existing => {
			// Check if it's the same type and has similar content
			if (existing.type !== newInsight.type) return false;
			
			// Check if it was created recently and not dismissed
			const createdAt = new Date(existing.createdAt);
			if (createdAt < oneDayAgo || existing.dismissedAt) return false;

			// Check for similar content (title similarity)
			const titleSimilarity = this.calculateSimilarity(existing.title, newInsight.title);
			if (titleSimilarity > 0.8) return true;

			// Check for similar context (same category, tag, etc.)
			if (existing.category === newInsight.category && 
				existing.whyTagId === newInsight.whyTagId) {
				return true;
			}

			return false;
		});
	}

	/**
	 * Calculate string similarity (simple implementation)
	 */
	private calculateSimilarity(str1: string, str2: string): number {
		const words1 = str1.toLowerCase().split(/\s+/);
		const words2 = str2.toLowerCase().split(/\s+/);
		
		const commonWords = words1.filter(word => words2.includes(word));
		const totalWords = Math.max(words1.length, words2.length);
		
		return totalWords > 0 ? commonWords.length / totalWords : 0;
	}

	/**
	 * Check if user has dismissed similar insights recently
	 */
	private async shouldSkipInsightType(insightType: Insight['type']): Promise<boolean> {
		const now = new Date();
		const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

		// Get recent dismissals from user actions
		const recentActions = await userActionsService.getActionsByDateRange(
			oneWeekAgo.toISOString(),
			now.toISOString()
		);

		const dismissals = recentActions.filter(action => 
			action.action === 'insight_dismissed' && 
			JSON.parse(action.metadata).insightType === insightType
		);

		// If user dismissed 3+ similar insights in a week, skip this type
		return dismissals.length >= 3;
	}

	/**
	 * Main update method
	 */
	private async updateInsights(): Promise<void> {
		if (this.isUpdating || !this.ready) return;

		this.isUpdating = true;
		const startTime = Date.now();

		try {
			const newInsights: Insight[] = [];

			// Generate budget insights
			const budgetInsights = await this.generateBudgetInsights();
			newInsights.push(...budgetInsights);

			// Generate spending insights
			const spendingInsights = await this.generateSpendingInsights();
			newInsights.push(...spendingInsights);

			// Generate goal insights
			const goalInsights = await this.generateGoalInsights();
			newInsights.push(...goalInsights);

			// Generate anomaly insights
			const anomalyInsights = await this.generateAnomalyInsights();
			newInsights.push(...anomalyInsights);

			// Generate behavioral insights
			const behavioralInsights = await this.generateBehavioralInsights();
			newInsights.push(...behavioralInsights);

			// Filter out similar insights and update the main array
			const filteredInsights = newInsights.filter(insight => 
				!this.isSimilarInsightExists(insight)
			);

			// Add new insights to the array
			this.insights.push(...filteredInsights);

			// Clean up old insights (older than 30 days)
			const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
			this.insights = this.insights.filter(insight => {
				const createdAt = new Date(insight.createdAt);
				return createdAt > thirtyDaysAgo || insight.isActive;
			});

			this.lastUpdate = Date.now();

			// Log performance
			const duration = Date.now() - startTime;
			if (duration > 1000) {
				console.warn(`Insights update took ${duration}ms`);
			}

		} catch (error) {
			console.error('Error updating insights:', error);
		} finally {
			this.isUpdating = false;
		}
	}

	/**
	 * Generate budget-related insights
	 */
	private async generateBudgetInsights(): Promise<Insight[]> {
		const insights: Insight[] = [];
		
		try {
			const categoryBudgets = await budgetService.calculateCategoryBudgets();

			for (const categoryBudget of categoryBudgets) {
				const category = categoryBudget.waterfallCategory;
				const percentageSpent = categoryBudget.totalAllocated > 0 
					? categoryBudget.spent / categoryBudget.totalAllocated 
					: 0;

				// Skip if user has dismissed similar insights recently
				if (await this.shouldSkipInsightType('budget_approaching')) continue;

				// Approaching threshold (80%)
				if (percentageSpent >= 0.8 && percentageSpent < 1.0) {
					insights.push(this.createInsight({
						type: 'budget_approaching',
						severity: 'warning',
						title: `${category.charAt(0).toUpperCase() + category.slice(1)} Budget Approaching Limit`,
						message: `You've used ${Math.round(percentageSpent * 100)}% of your ${category} budget.`,
						category: category as 'survival' | 'security' | 'growth' | 'lifestyle',
						percentage: percentageSpent,
						amount: categoryBudget.spent,
						remaining: categoryBudget.remaining,
						threshold: 0.8,
						actionable: true,
						actionText: 'Review Budget',
						actionUrl: '/settings/budget'
					}));
				}

				// Exceeded threshold (100%)
				if (percentageSpent >= 1.0 && percentageSpent < 1.1) {
					insights.push(this.createInsight({
						type: 'budget_exceeded',
						severity: 'alert',
						title: `${category.charAt(0).toUpperCase() + category.slice(1)} Budget Exceeded`,
						message: `You've exceeded your ${category} budget by ${Math.round((percentageSpent - 1) * 100)}%.`,
						category: category as 'survival' | 'security' | 'growth' | 'lifestyle',
						percentage: percentageSpent,
						amount: categoryBudget.spent,
						remaining: categoryBudget.remaining,
						threshold: 1.0,
						actionable: true,
						actionText: 'Adjust Budget',
						actionUrl: '/settings/budget'
					}));
				}

				// Surplus threshold (20% remaining)
				if (categoryBudget.remaining > 0) {
					const remainingPercentage = categoryBudget.remaining / categoryBudget.totalAllocated;
					if (remainingPercentage >= 0.2) {
						insights.push(this.createInsight({
							type: 'budget_surplus',
							severity: 'success',
							title: `${category.charAt(0).toUpperCase() + category.slice(1)} Budget Surplus`,
							message: `Great job! You have ${Math.round(remainingPercentage * 100)}% remaining in your ${category} budget.`,
							category: category as 'survival' | 'security' | 'growth' | 'lifestyle',
							percentage: 1 - remainingPercentage,
							amount: categoryBudget.spent,
							remaining: categoryBudget.remaining,
							threshold: 0.2,
							actionable: true,
							actionText: 'Reallocate Funds',
							actionUrl: '/settings/budget'
						}));
					}
				}
			}
		} catch (error) {
			console.error('Error generating budget insights:', error);
		}

		return insights;
	}

	/**
	 * Generate spending-related insights
	 */
	private async generateSpendingInsights(): Promise<Insight[]> {
		const insights: Insight[] = [];

		try {
			// Spending velocity insights
			const velocityData = await analyticsCoreService.calculateSpendingVelocity('monthly');
			for (const data of velocityData) {
				if (data.velocityRatio >= 2.0) {
					insights.push(this.createInsight({
						type: 'spending_velocity',
						severity: 'warning',
						title: `High Spending Velocity: ${data.whyTagName}`,
						message: `Your spending on ${data.whyTagName} is ${data.velocityRatio.toFixed(1)}x higher than usual.`,
						whyTagId: data.whyTagId,
						amount: data.currentPeriodSpending,
						threshold: 2.0,
						confidence: Math.min(100, data.velocityRatio * 25),
						actionable: true,
						actionText: 'Review Transactions',
						actionUrl: '/transactions'
					}));
				}
			}

			// Trend insights
			const trends = await analyticsCoreService.calculateTrends(3, 'monthly');
			if (trends.length >= 2) {
				const recentTrend = trends[trends.length - 1];
				const previousTrend = trends[trends.length - 2];

				if (recentTrend.trend === 'increasing' && recentTrend.percentageChange > 20) {
					insights.push(this.createInsight({
						type: 'trend',
						severity: 'warning',
						title: 'Spending Trend Increasing',
						message: `Your spending has increased by ${Math.round(recentTrend.percentageChange)}% this month.`,
						amount: recentTrend.amount,
						percentage: recentTrend.percentageChange,
						threshold: 20,
						confidence: 75,
						actionable: true,
						actionText: 'Analyze Trends',
						actionUrl: '/insights/alerts'
					}));
				}
			}

			// Savings opportunity insights
			const now = new Date();
			const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
			const analysis = await analyticsCoreService.analyzeTransactions(
				currentMonth.toISOString(),
				now.toISOString()
			);

			const savingsRate = analysis.totalIncome > 0 ? analysis.netAmount / analysis.totalIncome : 0;
			if (savingsRate < 0.1) {
				insights.push(this.createInsight({
					type: 'savings_opportunity',
					severity: 'warning',
					title: 'Low Savings Rate',
					message: `You're saving ${Math.round(savingsRate * 100)}% of your income. Consider increasing this to 20%.`,
					percentage: savingsRate,
					threshold: 0.1,
					confidence: 85,
					actionable: true,
					actionText: 'Set Savings Goal',
					actionUrl: '/settings/budget'
				}));
			}

		} catch (error) {
			console.error('Error generating spending insights:', error);
		}

		return insights;
	}

	/**
	 * Generate goal-related insights
	 */
	private async generateGoalInsights(): Promise<Insight[]> {
		const insights: Insight[] = [];

		try {
			const goalProgress = await analyticsCoreService.calculateGoalProgress();

			for (const goal of goalProgress) {
				const milestones = [0.25, 0.5, 0.75, 1.0];
				
				for (const milestone of milestones) {
					if (goal.progress >= milestone && goal.progress < milestone + 0.01) {
						insights.push(this.createInsight({
							type: 'goal_milestone',
							severity: 'success',
							title: `Goal Milestone: ${goal.tagName}`,
							message: `Congratulations! You've reached ${Math.round(milestone * 100)}% of your ${goal.tagName} goal.`,
							whyTagId: goal.tagId,
							percentage: goal.progress,
							amount: goal.currentAmount,
							threshold: milestone,
							confidence: goal.successProbability,
							actionable: false
						}));
						break;
					}
				}
			}
		} catch (error) {
			console.error('Error generating goal insights:', error);
		}

		return insights;
	}

	/**
	 * Generate anomaly insights
	 */
	private async generateAnomalyInsights(): Promise<Insight[]> {
		const insights: Insight[] = [];

		try {
			const anomalies = await this.detectAnomalies();

			for (const anomaly of anomalies) {
				if (anomaly.severity === 'high') {
					insights.push(this.createInsight({
						type: 'anomaly',
						severity: 'alert',
						title: 'Unusual Spending Detected',
						message: `Spending of $${anomaly.amount.toFixed(2)} is significantly higher than expected.`,
						amount: anomaly.amount,
						threshold: anomaly.expectedAmount,
						confidence: 85,
						actionable: true,
						actionText: 'Review Transaction',
						actionUrl: '/transactions'
					}));
				}
			}
		} catch (error) {
			console.error('Error generating anomaly insights:', error);
		}

		return insights;
	}

	/**
	 * Generate behavioral insights
	 */
	private async generateBehavioralInsights(): Promise<Insight[]> {
		const insights: Insight[] = [];

		try {
			// Simple behavioral insight for now
			insights.push(this.createInsight({
				type: 'behavioral',
				title: 'Weekend Spending Pattern',
				message: 'You tend to spend 30% more on weekends. Consider planning your purchases.',
				severity: 'info',
				confidence: 70,
				percentage: 30,
				actionable: true,
				actionText: 'Plan Purchases',
				actionUrl: '/forecast'
			}));
		} catch (error) {
			console.error('Error generating behavioral insights:', error);
		}

		return insights;
	}

	/**
	 * Detect spending anomalies
	 */
	async detectAnomalies(threshold: number = 2.0): Promise<Array<{
		date: Date;
		amount: number;
		expectedAmount: number;
		deviation: number;
		severity: 'low' | 'medium' | 'high';
		factors: string[];
		whyTagId?: string;
	}>> {
		const anomalies: Array<{
			date: Date;
			amount: number;
			expectedAmount: number;
			deviation: number;
			severity: 'low' | 'medium' | 'high';
			factors: string[];
			whyTagId?: string;
		}> = [];

		try {
			const transactionGroups = await transactionService.getTransactionsByDateRange(
				new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
				new Date().toISOString()
			) as TransactionOrGroup[];

			// Flatten transaction groups into individual transactions
			const transactions: any[] = [];
			for (const group of transactionGroups) {
				if (group.type === 'single') {
					transactions.push(group.representative);
				} else {
					transactions.push(...group.transactions);
				}
			}

			const expenseTransactions = transactions.filter(t => t.type === 'expense');

			if (expenseTransactions.length < 10) return anomalies;

			// Calculate statistical measures
			const amounts = expenseTransactions.map(t => Math.abs(t.amount));
			const mean = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
			const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - mean, 2), 0) / amounts.length;
			const stdDev = Math.sqrt(variance);

			// Detect anomalies
			for (const transaction of expenseTransactions) {
				const zScore = Math.abs((Math.abs(transaction.amount) - mean) / stdDev);
				
				if (zScore > threshold) {
					const deviation = Math.abs(transaction.amount) - mean;
					const severity = zScore > 3 ? 'high' : zScore > 2 ? 'medium' : 'low';
					
					anomalies.push({
						date: new Date(transaction.clearedDate || transaction.createdAt),
						amount: Math.abs(transaction.amount),
						expectedAmount: mean,
						deviation,
						severity,
						factors: ['Statistical outlier', 'Unusual amount'],
						whyTagId: transaction.whyTagId
					});
				}
			}
		} catch (error) {
			console.error('Error detecting anomalies:', error);
		}

		return anomalies.sort((a, b) => b.date.getTime() - a.date.getTime());
	}

	/**
	 * Create a new insight
	 */
	private createInsight(insightData: Omit<Insight, 'id' | 'createdAt' | 'isActive'>): Insight {
		const insight: Insight = {
			id: generateUUID(),
			...insightData,
			createdAt: new Date().toISOString(),
			isActive: true
		};

		return insight;
	}

	/**
	 * Get insights count by severity
	 */
	getInsightsCount(): { total: number; info: number; warning: number; alert: number; success: number } {
		const activeInsights = this.getInsights();
		return {
			total: activeInsights.length,
			info: activeInsights.filter(i => i.severity === 'info').length,
			warning: activeInsights.filter(i => i.severity === 'warning').length,
			alert: activeInsights.filter(i => i.severity === 'alert').length,
			success: activeInsights.filter(i => i.severity === 'success').length
		};
	}

	/**
	 * Clear all insights
	 */
	clearAllInsights(): void {
		this.insights = [];
	}

	/**
	 * Get last update time
	 */
	getLastUpdateTime(): number {
		return this.lastUpdate;
	}

	/**
	 * Set update frequency
	 */
	setUpdateFrequency(frequencyMs: number): void {
		this.updateFrequency = frequencyMs;
		if (this.updateInterval) {
			this.stopAutoUpdates();
			this.startAutoUpdates();
		}
	}
}

export const insightsService = new InsightsService(); 