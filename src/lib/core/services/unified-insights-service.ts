import { db, generateUUID } from '$lib/core/db';
import { analyticsCoreService } from './analytics-core-service';
import { budgetService } from './budget-service';
import { transactionService } from './transaction-service';
import type { TransactionOrGroup } from './transaction-service';

// ============================================================================
// UNIFIED INSIGHTS TYPES
// ============================================================================

export interface UnifiedAlert {
	id: string;
	type: 'budget_approaching' | 'budget_exceeded' | 'budget_surplus' | 'goal_milestone' | 'spending_velocity' | 'anomaly' | 'trend' | 'achievement';
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
	isRead: boolean;
	isActive: boolean;
	expiresAt?: string;
}

export interface UnifiedInsight {
	id: string;
	type: 'spending_trend' | 'budget_overspend' | 'goal_milestone' | 'savings_opportunity' | 'habit_change' | 'behavioral' | 'prediction';
	title: string;
	message: string;
	severity: 'info' | 'warning' | 'alert' | 'success';
	confidence: number; // 0-100
	data: Record<string, any>;
	actionable: boolean;
	actionText?: string;
	actionUrl?: string;
	createdAt: string;
	expiresAt?: string;
}

export interface TodayWin {
	id: string;
	title: string;
	savings: number;
	icon: string;
	category: string;
	timestamp: Date;
	confidence: number;
}

export interface SpendingPrediction {
	date: Date;
	predictedAmount: number;
	confidence: number;
	factors: string[];
	category?: string;
}

export interface AnomalyDetection {
	date: Date;
	amount: number;
	expectedAmount: number;
	deviation: number;
	severity: 'low' | 'medium' | 'high';
	factors: string[];
	whyTagId?: string;
}

export interface BudgetForecast {
	month: string;
	predictedSpending: number;
	predictedIncome: number;
	netPrediction: number;
	confidence: number;
	recommendations: string[];
}

export interface QuickAction {
	id: string;
	label: string;
	icon: string;
	category: string;
	onClick: () => void;
	usageCount: number;
	lastUsed?: Date;
}

export interface BudgetScenario {
	id: string;
	name: string;
	description: string;
	changes: {
		category: string;
		amount: number;
		type: 'increase' | 'decrease';
	}[];
	impact: {
		totalChange: number;
		affectedCategories: string[];
		riskLevel: 'low' | 'medium' | 'high';
	};
	isActive: boolean;
	createdAt: Date;
	lastApplied?: Date;
}

// ============================================================================
// UNIFIED INSIGHTS SERVICE
// ============================================================================

class UnifiedInsightsService {
	private alertCache = new Map<string, UnifiedAlert>();
	private lastAlertTime = new Map<string, number>();

	public get ready() {
		return db.isOpen();
	}

	public isLoading() {
		return !this.ready;
	}

	/**
	 * Generate all insights and alerts in one comprehensive call
	 */
	async generateAllInsights(accountId?: string): Promise<{
		alerts: UnifiedAlert[];
		insights: UnifiedInsight[];
		wins: TodayWin[];
		healthScore: any;
		quickActions: QuickAction[];
	}> {
		const [
			alerts,
			insights,
			wins,
			healthScore,
			quickActions
		] = await Promise.all([
			this.generateAlerts(accountId),
			this.generateInsights(accountId),
			this.detectTodaysWins(accountId),
			this.calculateFinancialHealthScore(accountId),
			this.getQuickActions(accountId)
		]);

		return {
			alerts,
			insights,
			wins,
			healthScore,
			quickActions
		};
	}

	/**
	 * Generate comprehensive alerts
	 */
	async generateAlerts(accountId?: string): Promise<UnifiedAlert[]> {
		const alerts: UnifiedAlert[] = [];

		// Budget alerts
		const budgetAlerts = await this.generateBudgetAlerts(accountId);
		alerts.push(...budgetAlerts);

		// Spending velocity alerts
		const velocityAlerts = await this.generateVelocityAlerts(accountId);
		alerts.push(...velocityAlerts);

		// Goal milestone alerts
		const milestoneAlerts = await this.generateMilestoneAlerts(accountId);
		alerts.push(...milestoneAlerts);

		// Anomaly alerts
		const anomalyAlerts = await this.generateAnomalyAlerts(accountId);
		alerts.push(...anomalyAlerts);

		// Trend alerts
		const trendAlerts = await this.generateTrendAlerts(accountId);
		alerts.push(...trendAlerts);

		return alerts;
	}

	/**
	 * Generate comprehensive insights
	 */
	async generateInsights(accountId?: string): Promise<UnifiedInsight[]> {
		const insights: UnifiedInsight[] = [];

		// Spending pattern insights
		const patternInsights = await this.generateSpendingPatternInsights(accountId);
		insights.push(...patternInsights);

		// Behavioral insights
		const behavioralInsights = await this.generateBehavioralInsights(accountId);
		insights.push(...behavioralInsights);

		// Prediction insights
		const predictionInsights = await this.generatePredictionInsights(accountId);
		insights.push(...predictionInsights);

		// Savings opportunity insights
		const savingsInsights = await this.generateSavingsOpportunityInsights(accountId);
		insights.push(...savingsInsights);

		return insights;
	}

	/**
	 * Generate budget-related alerts
	 */
	private async generateBudgetAlerts(accountId?: string): Promise<UnifiedAlert[]> {
		const alerts: UnifiedAlert[] = [];
		const categoryBudgets = await budgetService.calculateCategoryBudgets();

		for (const categoryBudget of categoryBudgets) {
			const category = categoryBudget.waterfallCategory;
			const percentageSpent = categoryBudget.targetAmount > 0 
				? categoryBudget.spent / categoryBudget.targetAmount 
				: 0;

			// Approaching threshold (80%)
			if (percentageSpent >= 0.8 && percentageSpent < 1.0) {
				alerts.push(await this.createAlert({
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
				alerts.push(await this.createAlert({
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
				const remainingPercentage = categoryBudget.remaining / categoryBudget.targetAmount;
				if (remainingPercentage >= 0.2) {
					alerts.push(await this.createAlert({
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

		return alerts;
	}

	/**
	 * Generate spending velocity alerts
	 */
	private async generateVelocityAlerts(accountId?: string): Promise<UnifiedAlert[]> {
		const alerts: UnifiedAlert[] = [];
		const velocityData = await analyticsCoreService.calculateSpendingVelocity('monthly', accountId);

		for (const data of velocityData) {
			if (data.velocityRatio >= 2.0) {
				alerts.push(await this.createAlert({
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

		return alerts;
	}

	/**
	 * Generate goal milestone alerts
	 */
	private async generateMilestoneAlerts(accountId?: string): Promise<UnifiedAlert[]> {
		const alerts: UnifiedAlert[] = [];
		const goalProgress = await analyticsCoreService.calculateGoalProgress(accountId);

		for (const goal of goalProgress) {
			const milestones = [0.25, 0.5, 0.75, 1.0];
			
			for (const milestone of milestones) {
				if (goal.progress >= milestone && goal.progress < milestone + 0.01) {
					alerts.push(await this.createAlert({
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

		return alerts;
	}

	/**
	 * Generate anomaly detection alerts
	 */
	private async generateAnomalyAlerts(accountId?: string): Promise<UnifiedAlert[]> {
		const alerts: UnifiedAlert[] = [];
		const anomalies = await this.detectAnomalies(accountId);

		for (const anomaly of anomalies) {
			if (anomaly.severity === 'high') {
				alerts.push(await this.createAlert({
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

		return alerts;
	}

	/**
	 * Generate trend-based alerts
	 */
	private async generateTrendAlerts(accountId?: string): Promise<UnifiedAlert[]> {
		const alerts: UnifiedAlert[] = [];
		const trends = await analyticsCoreService.calculateTrends(3, 'monthly', accountId);

		if (trends.length >= 2) {
			const recentTrend = trends[trends.length - 1];
			const previousTrend = trends[trends.length - 2];

			if (recentTrend.trend === 'increasing' && recentTrend.percentageChange > 20) {
				alerts.push(await this.createAlert({
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
					actionUrl: '/insights'
				}));
			}
		}

		return alerts;
	}

	/**
	 * Generate spending pattern insights
	 */
	private async generateSpendingPatternInsights(accountId?: string): Promise<UnifiedInsight[]> {
		const insights: UnifiedInsight[] = [];
		const now = new Date();
		const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

		const analysis = await analyticsCoreService.analyzeTransactions(
			currentMonth.toISOString(),
			now.toISOString(),
			accountId
		);

		// Top spending category insight
		const topCategory = Object.entries(analysis.spendingByCategory)
			.sort(([, a], [, b]) => b - a)[0];

		if (topCategory && topCategory[1] > analysis.totalSpending * 0.4) {
			insights.push(await this.createInsight({
				type: 'spending_trend',
				title: 'High Concentration in One Category',
				message: `${topCategory[0]} accounts for ${Math.round((topCategory[1] / analysis.totalSpending) * 100)}% of your spending.`,
				severity: 'info',
				confidence: 90,
				data: {
					category: topCategory[0],
					amount: topCategory[1],
					percentage: (topCategory[1] / analysis.totalSpending) * 100
				},
				actionable: true,
				actionText: 'Diversify Spending',
				actionUrl: '/insights'
			}));
		}

		// Savings rate insight
		const savingsRate = analysis.totalIncome > 0 ? analysis.netAmount / analysis.totalIncome : 0;
		if (savingsRate < 0.1) {
			insights.push(await this.createInsight({
				type: 'savings_opportunity',
				title: 'Low Savings Rate',
				message: `You're saving ${Math.round(savingsRate * 100)}% of your income. Consider increasing this to 20%.`,
				severity: 'warning',
				confidence: 85,
				data: {
					savingsRate,
					recommendedRate: 0.2
				},
				actionable: true,
				actionText: 'Set Savings Goal',
				actionUrl: '/settings/budget'
			}));
		}

		return insights;
	}

	/**
	 * Generate behavioral insights
	 */
	private async generateBehavioralInsights(accountId?: string): Promise<UnifiedInsight[]> {
		const insights: UnifiedInsight[] = [];

		// This would analyze spending patterns vs. activities, mood correlations, etc.
		// For now, we'll create a simple behavioral insight
		insights.push(await this.createInsight({
			type: 'behavioral',
			title: 'Weekend Spending Pattern',
			message: 'You tend to spend 30% more on weekends. Consider planning your purchases.',
			severity: 'info',
			confidence: 70,
			data: {
				pattern: 'weekend_increase',
				percentage: 30
			},
			actionable: true,
			actionText: 'Plan Purchases',
			actionUrl: '/plan'
		}));

		return insights;
	}

	/**
	 * Generate prediction-based insights
	 */
	private async generatePredictionInsights(accountId?: string): Promise<UnifiedInsight[]> {
		const insights: UnifiedInsight[] = [];
		const predictions = await this.predictSpending(accountId);

		if (predictions.length > 0) {
			const avgPrediction = predictions.reduce((sum, p) => sum + p.predictedAmount, 0) / predictions.length;
			const currentAnalysis = await analyticsCoreService.analyzeTransactions(
				new Date().toISOString().slice(0, 7) + '-01',
				new Date().toISOString(),
				accountId
			);

			if (avgPrediction > currentAnalysis.totalSpending * 1.2) {
				insights.push(await this.createInsight({
					type: 'prediction',
					title: 'Higher Spending Expected',
					message: 'Based on your patterns, spending is expected to increase by 20% next month.',
					severity: 'warning',
					confidence: 75,
					data: {
						predictedAmount: avgPrediction,
						currentAmount: currentAnalysis.totalSpending,
						increase: ((avgPrediction - currentAnalysis.totalSpending) / currentAnalysis.totalSpending) * 100
					},
					actionable: true,
					actionText: 'Review Budget',
					actionUrl: '/settings/budget'
				}));
			}
		}

		return insights;
	}

	/**
	 * Generate savings opportunity insights
	 */
	private async generateSavingsOpportunityInsights(accountId?: string): Promise<UnifiedInsight[]> {
		const insights: UnifiedInsight[] = [];
		const anomalies = await this.detectAnomalies(accountId);

		// Find potential savings opportunities
		const highSpendingAnomalies = anomalies.filter(a => a.amount > 100);
		if (highSpendingAnomalies.length > 0) {
			const totalPotentialSavings = highSpendingAnomalies.reduce((sum, a) => sum + (a.amount - a.expectedAmount), 0);
			
			insights.push(await this.createInsight({
				type: 'savings_opportunity',
				title: 'Potential Savings Opportunity',
				message: `You could save $${totalPotentialSavings.toFixed(2)} by avoiding unusual spending patterns.`,
				severity: 'info',
				confidence: 80,
				data: {
					potentialSavings: totalPotentialSavings,
					anomalyCount: highSpendingAnomalies.length
				},
				actionable: true,
				actionText: 'Review Anomalies',
				actionUrl: '/insights'
			}));
		}

		return insights;
	}

	/**
	 * Detect today's wins
	 */
	async detectTodaysWins(accountId?: string): Promise<TodayWin[]> {
		const wins: TodayWin[] = [];
		const today = new Date();
		const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

		const analysis = await analyticsCoreService.analyzeTransactions(
			startOfDay.toISOString(),
			today.toISOString(),
			accountId
		);

		// Check for under-budget spending
		const categoryBudgets = await budgetService.calculateCategoryBudgets();
		for (const budget of categoryBudgets) {
			if (budget.spent < budget.targetAmount * 0.5) {
				wins.push({
					id: generateUUID(),
					title: `Under Budget: ${budget.waterfallCategory}`,
					savings: budget.targetAmount - budget.spent,
					icon: '💰',
					category: budget.waterfallCategory,
					timestamp: today,
					confidence: 90
				});
			}
		}

		// Check for no impulse purchases (no transactions over $50)
		const largeTransactions = analysis.transactions.filter(tx => 
			tx.type === 'expense' && Math.abs(tx.amount) > 50
		);
		if (largeTransactions.length === 0) {
			wins.push({
				id: generateUUID(),
				title: 'No Impulse Purchases',
				savings: 0,
				icon: '🎯',
				category: 'discipline',
				timestamp: today,
				confidence: 85
			});
		}

		return wins;
	}

	/**
	 * Calculate financial health score
	 */
	async calculateFinancialHealthScore(accountId?: string): Promise<any> {
		return await analyticsCoreService.calculateFinancialHealthScore(accountId);
	}

	/**
	 * Get quick actions
	 */
	async getQuickActions(accountId?: string): Promise<QuickAction[]> {
		// This would analyze user behavior to suggest quick actions
		// For now, return default actions
		return [
			{
				id: 'add-transaction',
				label: 'Add Transaction',
				icon: '➕',
				category: 'transaction',
				onClick: () => console.log('Add transaction'),
				usageCount: 0
			},
			{
				id: 'view-insights',
				label: 'View Insights',
				icon: '📊',
				category: 'insights',
				onClick: () => console.log('View insights'),
				usageCount: 0
			}
		];
	}

	/**
	 * Predict future spending
	 */
	async predictSpending(accountId?: string, daysAhead: number = 30): Promise<SpendingPrediction[]> {
		// This would use the predictive analytics logic
		// For now, return simple predictions
		const predictions: SpendingPrediction[] = [];
		const today = new Date();

		for (let i = 1; i <= daysAhead; i++) {
			const predictionDate = new Date(today);
			predictionDate.setDate(today.getDate() + i);

			predictions.push({
				date: predictionDate,
				predictedAmount: Math.random() * 100 + 50, // Mock prediction
				confidence: Math.max(0.5, 1 - (i / 30)),
				factors: ['Historical pattern', 'Seasonal adjustment']
			});
		}

		return predictions;
	}

	/**
	 * Detect spending anomalies
	 */
	async detectAnomalies(accountId?: string, threshold: number = 2.0): Promise<AnomalyDetection[]> {
		const anomalies: AnomalyDetection[] = [];
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
				// For splits, add all transactions in the group
				transactions.push(...group.transactions);
			}
		}

		const accountTransactions = accountId 
			? transactions.filter(t => t.accountId === accountId && t.type === 'expense')
			: transactions.filter(t => t.type === 'expense');

		if (accountTransactions.length < 10) return anomalies;

		// Calculate statistical measures
		const amounts = accountTransactions.map(t => Math.abs(t.amount));
		const mean = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
		const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - mean, 2), 0) / amounts.length;
		const stdDev = Math.sqrt(variance);

		// Detect anomalies
		for (const transaction of accountTransactions) {
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

		return anomalies.sort((a, b) => b.date.getTime() - a.date.getTime());
	}

	/**
	 * Create a new alert
	 */
	private async createAlert(alertData: Omit<UnifiedAlert, 'id' | 'createdAt' | 'isRead' | 'isActive'>): Promise<UnifiedAlert> {
		const alert: UnifiedAlert = {
			id: generateUUID(),
			...alertData,
			createdAt: new Date().toISOString(),
			isRead: false,
			isActive: true
		};

		return alert;
	}

	/**
	 * Create a new insight
	 */
	private async createInsight(insightData: Omit<UnifiedInsight, 'id' | 'createdAt'>): Promise<UnifiedInsight> {
		const insight: UnifiedInsight = {
			id: generateUUID(),
			...insightData,
			createdAt: new Date().toISOString()
		};

		return insight;
	}

	/**
	 * Get active alerts
	 */
	async getActiveAlerts(): Promise<UnifiedAlert[]> {
		return Array.from(this.alertCache.values()).filter(alert => alert.isActive);
	}

	/**
	 * Mark alert as read
	 */
	async markAlertAsRead(alertId: string): Promise<void> {
		const alert = this.alertCache.get(alertId);
		if (alert) {
			alert.isRead = true;
			this.alertCache.set(alertId, alert);
		}
	}

	/**
	 * Dismiss alert
	 */
	async dismissAlert(alertId: string): Promise<void> {
		const alert = this.alertCache.get(alertId);
		if (alert) {
			alert.isActive = false;
			this.alertCache.set(alertId, alert);
		}
	}

	/**
	 * Clear all alerts
	 */
	async clearAllAlerts(): Promise<void> {
		this.alertCache.clear();
		this.lastAlertTime.clear();
	}
}

export const unifiedInsightsService = new UnifiedInsightsService(); 