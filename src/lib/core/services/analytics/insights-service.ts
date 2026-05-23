import Dexie from 'dexie';
import { db, generateUUID } from '$lib/core/db';
import { scheduler } from '$lib/utils/scheduler';
import { serviceCache } from '../core/service-cache';
import { performanceMonitor } from '../core/performance-monitor';
import { analyticsService } from './analytics-service';
import { predictionService } from './prediction-service';
import { goalService } from '../core/goal-service';
import { budgetService } from '../core/budget-service';
import { accountService } from '../core/account-service';
import { transactionService } from '../core/transaction-service';
import { userService } from '../core/user-service';
import { merchantProfileService } from '../intelligence/merchant-profile-service';
import { normaliseMerchantKey } from '$lib/utils/transfer-utils';
import {
	recurringTransactionIntelligenceService,
	type RecurringPattern
} from './recurring-transaction-intelligence-service';
import { balanceProjectionService } from './balance-projection-service';
import { creditUtilizationService } from './credit-utilization-service';
import { emergencyFundService } from './emergency-fund-service';
import {
	getBufferStatus,
	getBufferAmount,
	getBufferDeficit
} from '$lib/utils/account-metadata-utils';
import {
	formatTransactionAmount,
	formatAmount,
	formatPercentage,
	getUserMainCurrency
} from '$lib/utils/currency-utils';
import { iqrFilter, iqrOutlierScore } from '$lib/utils/data-quality-utils';
import type { Insight, Goal, Transaction, Category, Account } from '$lib/core/db';
import { categoryIdsWithSpendShare, effectiveAmountForCategory } from '$lib/utils/category-utils';
import { devLog } from '$lib/utils/dev-log';
import {
	computeSavingsVariabilityHint,
	type SavingsVariabilityHintResult
} from '$lib/utils/category-savings-variability';
import type { SavingsVariabilityCategoryRow } from './prediction-service';
import { getSavingsHintAllowanceContext } from '../core/allowance-calculation';

interface CrossRouteInsightData {
	goals: Goal[];
	transactions: Transaction[];
	categories: Category[];
	budgetData: any;
	analyticsData: any;
	accounts: Account[];
}

interface InsightGenerationContext {
	userId?: string;
	timeRange: 'week' | 'month' | 'quarter' | 'year';
	includePredictions: boolean;
	includeBehavioral: boolean;
	onInsightsPage?: boolean; // Flag to indicate if called from insights page
}

const INSIGHTS_AUTO_UPDATE_TASK = 'insights:auto-update';
const SNAPSHOT_TTL = 5 * 60 * 1000;

class InsightsService {
	private lastUpdate = 0;
	private lastPredictionUpdate = 0;
	private updateFrequency = 15 * 60 * 1000; // 15 minutes — background idle refresh
	private predictionUpdateFrequency = 24 * 60 * 60 * 1000; // 24 hours - predictions update less frequently
	private isUpdating = false;

	public get ready() {
		return Promise.resolve();
	}

	public isLoading() {
		return this.isUpdating;
	}

	// ============================================================================
	// INSIGHT MANAGEMENT
	// ============================================================================

	/**
	 * Get all active insights
	 */
	async getInsights(): Promise<Insight[]> {
		return await db.getActiveInsights();
	}

	/**
	 * Get insights by type
	 */
	async getInsightsByType(type: Insight['type']): Promise<Insight[]> {
		return await db.getInsightsByType(type);
	}

	/**
	 * Find any insight with this type and title (including read/dismissed).
	 * Use when deciding whether to create an alert so we don't recreate after user dismissed/read.
	 */
	async getInsightsByTypeAndTitle(type: Insight['type'], title: string): Promise<Insight[]> {
		return await db.getInsightsByTypeAndTitle(type, title);
	}

	/**
	 * Get all insights of this type including dismissed/read (for existence checks in aggregation).
	 */
	async getInsightsByTypeIncludingDismissed(type: Insight['type']): Promise<Insight[]> {
		return await db.getInsightsByTypeIncludingDismissed(type);
	}

	/**
	 * Get insights by severity
	 */
	async getInsightsBySeverity(severity: Insight['severity']): Promise<Insight[]> {
		return await db.getInsightsBySeverity(severity);
	}

	/**
	 * Get insights count by severity
	 */
	async getInsightsCount(): Promise<{
		total: number;
		info: number;
		warning: number;
		alert: number;
		success: number;
	}> {
		const insights = await this.getInsights();
		return {
			total: insights.length,
			info: insights.filter((i) => i.severity === 'info').length,
			warning: insights.filter((i) => i.severity === 'warning').length,
			alert: insights.filter((i) => i.severity === 'alert').length,
			success: insights.filter((i) => i.severity === 'success').length
		};
	}

	/**
	 * Dismiss an insight
	 */
	async dismissInsight(insightId: string): Promise<void> {
		await db.softDeleteInsight(insightId);
	}

	/**
	 * Get unread insights
	 */
	async getUnreadInsights(): Promise<Insight[]> {
		return await db.getUnreadInsights();
	}

	/**
	 * Get unread count
	 */
	async getUnreadCount(): Promise<number> {
		return await db.getUnreadCount();
	}

	/**
	 * Get unread insights by severity
	 */
	async getUnreadBySeverity(severity: Insight['severity']): Promise<Insight[]> {
		return await db.getUnreadBySeverity(severity);
	}

	/**
	 * Mark an insight as read
	 */
	async markAsRead(insightId: string): Promise<void> {
		await db.markInsightAsRead(insightId);
	}

	/**
	 * Snooze insights until a future ISO time (hidden from unread/bell until then).
	 */
	async snoozeInsights(insightIds: string[], snoozedUntilIso: string): Promise<void> {
		if (insightIds.length === 0) return;
		await db.snoozeInsights(insightIds, snoozedUntilIso);
	}

	/**
	 * Mark all insights as read
	 */
	async markAllAsRead(): Promise<void> {
		await db.markAllInsightsAsRead();
	}

	/**
	 * Mark only panel-tier insights (Critical + High) as read. Used by Alerts panel "Mark all read".
	 */
	async markPanelAlertsAsRead(): Promise<void> {
		await db.markPanelInsightsAsRead();
	}

	/**
	 * Get "Earlier (read)" insights for alerts panel collapsed section
	 */
	async getEarlierInsights(limit = 30): Promise<Insight[]> {
		return await db.getEarlierInsights(limit);
	}

	/**
	 * Get low-tier (success/info) insights for inline display on Budget/Goals. Never in bell panel.
	 */
	async getLowTierInlineInsights(): Promise<Insight[]> {
		return await db.getLowTierInlineInsights();
	}

	/** Unread insights scoped to one account (inline fee risk on account detail). */
	async getAccountScopedInlineInsights(accountId: string): Promise<Insight[]> {
		return await db.getAccountScopedInlineInsights(accountId);
	}

	/**
	 * Soft-delete insights past expiresAt. Safe to call often (e.g. bell refresh).
	 */
	async expireStaleInsights(): Promise<void> {
		await this.cleanupExpiredInsights();
	}

	/**
	 * Get unread alerts count (severity === 'alert')
	 */
	async getUnreadAlertsCount(): Promise<number> {
		const alerts = await this.getUnreadBySeverity('alert');
		return alerts.length;
	}

	/**
	 * Get Critical tier alerts for Home "Needs attention" block (UX_SPEC Phase 5).
	 * @deprecated Use getPanelAlertGroupsForHome for grouped Critical + High panel tiers.
	 */
	async getCriticalAlertsForHome(limit = 3): Promise<Insight[]> {
		const critical = await this.getUnreadBySeverity('alert');
		return critical.slice(0, limit);
	}

	/**
	 * Panel-tier unread groups for Home "Needs attention" (Critical first, then High).
	 */
	async getPanelAlertGroupsForHome(limit = 3): Promise<Insight[][]> {
		const { groupPanelAlertsForDisplay, splitByTier } = await import('$lib/utils/alert-tiers');
		const unread = await this.getUnreadInsights();
		const { critical, high } = splitByTier(unread);
		const groups = [...groupPanelAlertsForDisplay(critical), ...groupPanelAlertsForDisplay(high)];
		return groups.slice(0, limit);
	}

	/**
	 * Create a new insight
	 */
	async createInsight(data: {
		type: Insight['type'];
		severity: Insight['severity'];
		title: string;
		message: string;
		categoryId?: string;
		goalId?: string;
		percentage?: number;
		amount?: number;
		remaining?: number;
		threshold?: number;
		confidence?: number;
		actionable?: boolean;
		actionText?: string;
		actionUrl?: string;
		expiresAt?: string;
		metadata?: Record<string, any>;
	}): Promise<Insight> {
		const insight: Insight = {
			id: generateUUID(),
			type: data.type,
			severity: data.severity,
			title: data.title,
			message: data.message,
			categoryId: data.categoryId,
			goalId: data.goalId,
			percentage: data.percentage,
			amount: data.amount,
			remaining: data.remaining,
			threshold: data.threshold,
			confidence: data.confidence,
			actionable: data.actionable || false,
			actionText: data.actionText,
			actionUrl: data.actionUrl,
			dismissedAt: undefined,
			expiresAt: data.expiresAt,
			isActive: true,
			metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};

		await db.insights.add(insight);
		return insight;
	}

	// ============================================================================
	// CROSS-ROUTE INSIGHT GENERATION
	// ============================================================================

	/**
	 * Generate insights from all routes (goals, budget, analytics)
	 */
	async generateCrossRouteInsights(
		context: InsightGenerationContext = {
			timeRange: 'month',
			includePredictions: true,
			includeBehavioral: true
		},
		force: boolean = false
	): Promise<void> {
		const now = Date.now();
		if (!force && now - this.lastUpdate < this.updateFrequency) {
			return; // Too soon to update
		}

		if (this.isUpdating) {
			return; // Already updating
		}

		this.isUpdating = true;
		const _start = performance.now();

		try {
			// Clean up expired insights first
			await this.cleanupExpiredInsights();

			// Gather data from all routes
			const crossRouteData = await this.gatherCrossRouteData(context);

			// Generate insights from each route
			const newInsights: Insight[] = [];

			// Goals insights
			const goalInsights = await this.generateGoalInsights(crossRouteData.goals);
			newInsights.push(...goalInsights);

			// Budget insights: per-category alerts via cross-route-sync updateBudgetAlerts (real spend).

			// Analytics insights
			const analyticsInsights = await this.generateAnalyticsInsights(
				crossRouteData.analyticsData,
				crossRouteData.transactions
			);
			newInsights.push(...analyticsInsights);

			// Buffer insights
			const bufferInsights = await this.generateBufferInsights(
				crossRouteData.accounts,
				crossRouteData.transactions
			);
			newInsights.push(...bufferInsights);

			// Credit utilization insights
			const creditUtilizationInsights = await this.generateCreditUtilizationInsights(
				crossRouteData.accounts
			);
			newInsights.push(...creditUtilizationInsights);

			// Emergency fund insights
			const emergencyFundInsights = await this.generateEmergencyFundInsights();
			newInsights.push(...emergencyFundInsights);

			// Behavioral insights (if enabled)
			if (context.includeBehavioral) {
				const behavioralInsights = await this.generateBehavioralInsights(crossRouteData);
				newInsights.push(...behavioralInsights);
			}

			// Prediction insights (if enabled)
			// Only generate if forced, on insights page, or if enough time has passed since last prediction update
			const shouldGeneratePredictions =
				context.includePredictions &&
				(force || now - this.lastPredictionUpdate >= this.predictionUpdateFrequency);

			let predictionsGenerated = false;
			let predictionCount = 0;
			if (shouldGeneratePredictions) {
				const predictionInsights = await this.generatePredictionInsights(crossRouteData);
				newInsights.push(...predictionInsights);
				predictionCount = predictionInsights.length;
				predictionsGenerated = predictionCount > 0;

				// Mark all existing prediction insights as read (they'll be replaced with new ones)
				// This prevents them from showing as notifications
				const existingPredictions = await db.insights
					.where('type')
					.equals('prediction')
					.filter((i) => i.isActive && !i.readAt)
					.toArray();

				if (existingPredictions.length > 0) {
					await Promise.all(existingPredictions.map((insight) => db.markInsightAsRead(insight.id)));
				}

				this.lastPredictionUpdate = now;

				// If predictions were generated and we're NOT on the insights page,
				// create a single summary notification (not a prediction type, so it shows in notifications)
				if (predictionsGenerated && !context.onInsightsPage) {
					newInsights.push({
						id: generateUUID(),
						type: 'behavioral', // Use 'behavioral' type so it shows in notifications (not 'prediction')
						severity: 'info',
						title: 'Predictions Updated',
						message: `${predictionCount} new financial prediction${predictionCount !== 1 ? 's' : ''} available. Check the Insights page to view them.`,
						actionable: true,
						actionText: 'View Predictions',
						actionUrl: '/insights?tab=patterns',
						isActive: true,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						deletedAt: null
					});
				}
			}

			// Balance projection insights (only if predictions are enabled - this is expensive)
			// Skip if not including predictions to avoid performance issues
			if (shouldGeneratePredictions) {
				const projectionInsights = await this.generateBalanceProjectionInsights(
					crossRouteData.accounts
				);
				newInsights.push(...projectionInsights);

				const savingsVariabilityInsights = await this.generateSavingsVariabilityInsights();
				newInsights.push(...savingsVariabilityInsights);
			}

			// Save new insights to database
			await this.saveInsights(newInsights);

			this.lastUpdate = now;
		} catch (error) {
			console.error('Error generating cross-route insights:', error);
		} finally {
			this.isUpdating = false;
			performanceMonitor.recordMetric({
				serviceName: 'InsightsService',
				methodName: 'generateCrossRouteInsights',
				executionTime: performance.now() - _start,
				timestamp: Date.now(),
				success: true
			});
		}
	}

	/**
	 * Gather data from all routes
	 */
	private async gatherCrossRouteData(
		context: InsightGenerationContext
	): Promise<CrossRouteInsightData> {
		const [goals, transactions, categories, budgetData, analyticsData, accounts] =
			await Promise.all([
				goalService.getGoals(),
				db.getActiveTransactions(),
				db.getActiveCategories(),
				budgetService.getBudgetSummary(),
				analyticsService.getSpendingAnalysis(1), // Current month
				accountService.getAccounts()
			]);

		return {
			goals,
			transactions,
			categories,
			budgetData,
			analyticsData,
			accounts
		};
	}

	// ============================================================================
	// GOAL INSIGHTS GENERATION
	// ============================================================================

	/**
	 * Generate insights from goals data
	 */
	private async generateGoalInsights(goals: Goal[]): Promise<Insight[]> {
		const insights: Insight[] = [];

		for (const goal of goals) {
			const progress = goal.currentAmount / goal.targetAmount;

			// Milestone insights
			if (progress >= 0.25 && progress < 0.5) {
				insights.push({
					id: generateUUID(),
					type: 'goal_milestone',
					severity: 'success',
					title: `${goal.name} - 25% Complete!`,
					message: `You've reached 25% of your ${goal.name} goal. Keep up the great work!`,
					goalId: goal.id,
					percentage: 25,
					confidence: 100,
					actionable: false,
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				});
			}

			if (progress >= 0.5 && progress < 0.75) {
				insights.push({
					id: generateUUID(),
					type: 'goal_milestone',
					severity: 'success',
					title: `${goal.name} - Halfway There!`,
					message: `You've reached 50% of your ${goal.name} goal. You're making excellent progress!`,
					goalId: goal.id,
					percentage: 50,
					confidence: 100,
					actionable: false,
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				});
			}

			if (progress >= 0.75 && progress < 1) {
				insights.push({
					id: generateUUID(),
					type: 'goal_milestone',
					severity: 'success',
					title: `${goal.name} - Almost There!`,
					message: `You're 75% complete with your ${goal.name} goal. The finish line is in sight!`,
					goalId: goal.id,
					percentage: 75,
					confidence: 100,
					actionable: false,
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				});
			}

			// Behind schedule insights
			if (goal.targetDate && goal.status === 'active') {
				const targetDate = new Date(goal.targetDate);
				const now = new Date();
				const timeRemaining = targetDate.getTime() - now.getTime();
				const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

				if (daysRemaining > 0) {
					const dailyRequiredAmount = (goal.targetAmount - goal.currentAmount) / daysRemaining;
					const averageDailyContribution =
						goal.currentAmount /
						Math.max(
							1,
							Math.ceil(
								(now.getTime() - new Date(goal.createdAt).getTime()) / (1000 * 60 * 60 * 24)
							)
						);

					if (averageDailyContribution < dailyRequiredAmount * 0.8) {
						insights.push({
							id: generateUUID(),
							type: 'goal_milestone',
							severity: 'warning',
							title: `${goal.name} - Behind Schedule`,
							message: `You're behind schedule on your ${goal.name} goal. Consider increasing your contributions.`,
							goalId: goal.id,
							percentage: progress * 100,
							confidence: 85,
							actionable: true,
							actionText: 'Review goal',
							actionUrl: '/plan?tab=goals',
							isActive: true,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							deletedAt: null
						});
					}
				}
			}
		}

		return insights;
	}

	// ============================================================================
	// BUDGET INSIGHTS GENERATION
	// ============================================================================

	/**
	 * Generate insights from budget data
	 */
	private async generateBudgetInsights(
		budgetData: any,
		categories: Category[]
	): Promise<Insight[]> {
		const insights: Insight[] = [];

		// Budget approaching insights
		for (const category of categories) {
			if (category.budgetAmount && category.budgetAmount > 0) {
				// This would need to be calculated based on actual spending
				// For now, we'll create a placeholder structure
				const spentAmount = 0; // Would be calculated from transactions
				const budgetPercentage = (spentAmount / category.budgetAmount) * 100;

				if (budgetPercentage >= 80 && budgetPercentage < 100) {
					insights.push({
						id: generateUUID(),
						type: 'budget_approaching',
						severity: 'warning',
						title: `${category.name} Budget - 80% Used`,
						message: `You've used 80% of your ${category.name} budget. Consider reducing spending in this category.`,
						categoryId: category.id,
						percentage: budgetPercentage,
						threshold: 80,
						confidence: 95,
						actionable: true,
						actionText: 'Review Budget',
						isActive: true,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						deletedAt: null
					});
				}

				if (budgetPercentage >= 100) {
					insights.push({
						id: generateUUID(),
						type: 'budget_exceeded',
						severity: 'alert',
						title: `${category.name} Budget Exceeded`,
						message: `You've exceeded your ${category.name} budget. Immediate action needed.`,
						categoryId: category.id,
						percentage: budgetPercentage,
						threshold: 100,
						confidence: 100,
						actionable: true,
						actionText: 'Adjust Budget',
						isActive: true,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						deletedAt: null
					});
				}
			}
		}

		return insights;
	}

	// ============================================================================
	// BUFFER INSIGHTS GENERATION
	// ============================================================================

	/**
	 * Generate insights for account buffer management
	 */
	private async generateBufferInsights(
		accounts: Account[],
		transactions: Transaction[]
	): Promise<Insight[]> {
		const insights: Insight[] = [];

		for (const account of accounts) {
			// Only check buffer for checking and savings accounts
			if (account.type !== 'checking' && account.type !== 'savings') {
				continue;
			}

			const bufferAmount = getBufferAmount(account);
			if (bufferAmount === 0) {
				continue; // No buffer set
			}

			const bufferStatus = getBufferStatus(account);
			const deficit = getBufferDeficit(account);

			// Critical buffer alert
			if (bufferStatus === 'critical') {
				insights.push({
					id: generateUUID(),
					type: 'budget_exceeded',
					severity: 'alert',
					title: `Critical: ${account.name} Below Buffer`,
					message: `${account.name} is ${formatAmount(deficit, account.currency)} below the recommended buffer of ${formatAmount(bufferAmount, account.currency)}. Consider transferring funds to maintain your safety buffer.`,
					amount: deficit,
					threshold: bufferAmount,
					confidence: 100,
					actionable: true,
					actionText: 'View Account',
					actionUrl: `/accounts/${account.id}`,
					metadata: JSON.stringify({
						accountId: account.id,
						accountName: account.name,
						bufferAmount,
						currentBalance: account.currentBalance,
						deficit
					}),
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				});
			}
			// Warning buffer alert
			else if (bufferStatus === 'warning') {
				insights.push({
					id: generateUUID(),
					type: 'budget_exceeded',
					severity: 'warning',
					title: `Warning: ${account.name} Approaching Buffer`,
					message: `${account.name} is approaching the buffer threshold. Current balance: ${formatAmount(account.currentBalance, account.currency)}, Buffer: ${formatAmount(bufferAmount, account.currency)}.`,
					amount: account.currentBalance,
					threshold: bufferAmount,
					confidence: 90,
					actionable: true,
					actionText: 'View Account',
					actionUrl: `/accounts/${account.id}`,
					metadata: JSON.stringify({
						accountId: account.id,
						accountName: account.name,
						bufferAmount,
						currentBalance: account.currentBalance
					}),
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				});
			}
			// Positive insight for optimal buffer
			else if (bufferStatus === 'optimal' && account.currentBalance >= bufferAmount * 1.5) {
				// Only create positive insights occasionally to avoid spam
				const shouldCreate = Math.random() < 0.1; // 10% chance
				if (shouldCreate) {
					insights.push({
						id: generateUUID(),
						type: 'achievement',
						severity: 'success',
						title: `${account.name} Has Healthy Buffer`,
						message: `Great job! ${account.name} has a healthy buffer above the recommended amount.`,
						amount: account.currentBalance,
						threshold: bufferAmount,
						confidence: 100,
						actionable: false,
						metadata: JSON.stringify({
							accountId: account.id,
							accountName: account.name,
							bufferAmount,
							currentBalance: account.currentBalance
						}),
						isActive: true,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						deletedAt: null
					});
				}
			}
		}

		return insights;
	}

	/**
	 * Generate credit utilization insights
	 */
	private async generateCreditUtilizationInsights(accounts: Account[]): Promise<Insight[]> {
		const insights: Insight[] = [];

		try {
			// Get aggregate credit utilization analysis
			const aggregate = await creditUtilizationService.analyzeAggregate();
			if (!aggregate) {
				return insights; // No credit accounts
			}

			// Generate aggregate insights
			if (aggregate.status === 'critical' || aggregate.status === 'poor') {
				const severity = aggregate.status === 'critical' ? 'alert' : 'warning';
				insights.push({
					id: generateUUID(),
					type: 'credit_utilization',
					severity,
					title: `High Credit Utilization: ${formatPercentage(aggregate.totalUtilization)}`,
					message: `Your overall credit utilization is ${formatPercentage(aggregate.totalUtilization)}, which ${aggregate.status === 'critical' ? 'significantly' : 'may'} negatively impact your credit score. Consider paying down balances to reach optimal utilization (below 30%).`,
					percentage: aggregate.totalUtilization,
					threshold: 30,
					confidence: 95,
					actionable: true,
					actionText: 'View Recommendations',
					actionUrl: '/insights?tab=optimize',
					metadata: JSON.stringify({
						totalUtilization: aggregate.totalUtilization,
						totalDebt: aggregate.totalDebt,
						totalCreditLimit: aggregate.totalCreditLimit,
						accountCount: aggregate.accountCount,
						status: aggregate.status
					}),
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				});
			}

			// Generate per-account insights for high utilization
			for (const accountAnalysis of aggregate.accounts) {
				if (accountAnalysis.status === 'critical') {
					insights.push({
						id: generateUUID(),
						type: 'credit_utilization',
						severity: 'alert',
						title: `Critical: ${accountAnalysis.accountName} at ${formatPercentage(accountAnalysis.utilization)} Utilization`,
						message: `${accountAnalysis.accountName} has ${formatPercentage(accountAnalysis.utilization)} credit utilization. This significantly impacts your credit score. ${accountAnalysis.recommendedPaymentForTarget ? `Pay ${formatAmount(accountAnalysis.recommendedPaymentForTarget, accountAnalysis.currency)} to reach optimal utilization.` : 'Consider paying down the balance.'}`,
						percentage: accountAnalysis.utilization,
						threshold: 30,
						amount: accountAnalysis.recommendedPaymentForTarget,
						confidence: 100,
						actionable: true,
						actionText: 'View Account',
						actionUrl: `/accounts/${accountAnalysis.accountId}`,
						metadata: JSON.stringify({
							accountId: accountAnalysis.accountId,
							accountName: accountAnalysis.accountName,
							utilization: accountAnalysis.utilization,
							currentDebt: accountAnalysis.currentDebt,
							creditLimit: accountAnalysis.creditLimit,
							recommendedPayment: accountAnalysis.recommendedPaymentForTarget
						}),
						isActive: true,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						deletedAt: null
					});
				} else if (accountAnalysis.status === 'poor' && accountAnalysis.utilization > 50) {
					// Statement timing alert for high utilization accounts
					if (
						accountAnalysis.daysUntilStatementClose !== undefined &&
						accountAnalysis.daysUntilStatementClose <= 7
					) {
						insights.push({
							id: generateUUID(),
							type: 'credit_utilization',
							severity: 'warning',
							title: `Pay Before Statement Closes: ${accountAnalysis.accountName}`,
							message: `Statement closes in ${accountAnalysis.daysUntilStatementClose} day(s). Paying down ${accountAnalysis.accountName} now will improve the utilization reported to credit bureaus.`,
							percentage: accountAnalysis.utilization,
							threshold: 30,
							confidence: 90,
							actionable: true,
							actionText: 'View Account',
							actionUrl: `/accounts/${accountAnalysis.accountId}`,
							metadata: JSON.stringify({
								accountId: accountAnalysis.accountId,
								accountName: accountAnalysis.accountName,
								utilization: accountAnalysis.utilization,
								daysUntilStatementClose: accountAnalysis.daysUntilStatementClose
							}),
							isActive: true,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							deletedAt: null
						});
					}
				}
			}

			// Positive insight for excellent utilization (occasionally)
			if (aggregate.status === 'excellent' && Math.random() < 0.1) {
				insights.push({
					id: generateUUID(),
					type: 'credit_utilization',
					severity: 'success',
					title: 'Excellent Credit Utilization',
					message: `Great job! Your overall credit utilization is ${formatPercentage(aggregate.totalUtilization)}, which is optimal for maintaining a good credit score.`,
					percentage: aggregate.totalUtilization,
					threshold: 30,
					confidence: 100,
					actionable: false,
					metadata: JSON.stringify({
						totalUtilization: aggregate.totalUtilization,
						status: aggregate.status
					}),
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				});
			}
		} catch (error) {
			console.error('[InsightsService] Error generating credit utilization insights:', error);
		}

		return insights;
	}

	// ============================================================================
	// EMERGENCY FUND INSIGHTS GENERATION
	// ============================================================================

	/**
	 * Generate insights from emergency fund analysis
	 */
	private async generateEmergencyFundInsights(): Promise<Insight[]> {
		const insights: Insight[] = [];

		try {
			const prefs = await userService.getUserPreferences();
			const userCurrency = prefs?.currency ?? 'USD';
			const analysis = await emergencyFundService.analyzeEmergencyFund();
			if (!analysis) {
				return insights; // No emergency fund designated
			}

			// Critical or depleted status
			if (analysis.status === 'critical' || analysis.status === 'depleted') {
				const severity = analysis.status === 'depleted' ? 'alert' : 'alert';

				insights.push({
					id: generateUUID(),
					type: 'emergency_fund',
					severity,
					title: `Emergency Fund ${analysis.status === 'depleted' ? 'Depleted' : 'Critically Low'}`,
					message: `Your emergency fund is ${analysis.status === 'depleted' ? 'depleted' : 'critically low'} with only ${analysis.monthsCovered.toFixed(1)} months of expenses covered. Target: ${analysis.factors.targetMonths} months (${formatTransactionAmount(analysis.targetAmount, userCurrency)}). ${analysis.recommendedMonthlyContribution > 0 ? `Contribute ${formatTransactionAmount(analysis.recommendedMonthlyContribution, userCurrency)} monthly to reach target in ${analysis.monthsToTarget} months.` : ''}`,
					percentage: analysis.percentageAchieved,
					threshold: 100,
					amount: analysis.recommendedMonthlyContribution,
					confidence: 100,
					actionable: true,
					actionText: 'View Emergency Fund',
					actionUrl: '/insights?tab=optimize',
					metadata: JSON.stringify({
						currentBalance: analysis.currentBalance,
						targetAmount: analysis.targetAmount,
						monthsCovered: analysis.monthsCovered,
						status: analysis.status,
						recommendedContribution: analysis.recommendedMonthlyContribution,
						monthsToTarget: analysis.monthsToTarget
					}),
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				});
			}
			// Low status
			else if (analysis.status === 'low') {
				insights.push({
					id: generateUUID(),
					type: 'emergency_fund',
					severity: 'warning',
					title: 'Emergency Fund Below Target',
					message: `Your emergency fund has ${analysis.monthsCovered.toFixed(1)} months covered, but should aim for ${analysis.factors.targetMonths} months. You're ${formatPercentage(analysis.percentageAchieved, { maxDecimals: 0 })} of the way to your target. ${analysis.recommendedMonthlyContribution > 0 ? `Contribute ${formatTransactionAmount(analysis.recommendedMonthlyContribution, userCurrency)} monthly to reach target.` : ''}`,
					percentage: analysis.percentageAchieved,
					threshold: 100,
					amount: analysis.recommendedMonthlyContribution,
					confidence: 90,
					actionable: true,
					actionText: 'View Recommendations',
					actionUrl: '/insights?tab=optimize',
					metadata: JSON.stringify({
						currentBalance: analysis.currentBalance,
						targetAmount: analysis.targetAmount,
						monthsCovered: analysis.monthsCovered,
						status: analysis.status,
						recommendedContribution: analysis.recommendedMonthlyContribution
					}),
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				});
			}
			// Partial usage warning
			else if (analysis.partialUsage && analysis.partialUsage.percentageUsed > 0) {
				insights.push({
					id: generateUUID(),
					type: 'emergency_fund',
					severity: 'warning',
					title: 'Emergency Fund Partially Used',
					message: `Your emergency fund has been used (${formatPercentage(analysis.partialUsage.percentageUsed, { maxDecimals: 0 })} depleted - ${formatTransactionAmount(analysis.partialUsage.amountUsed, userCurrency)}). Prioritize rebuilding to restore your financial safety net. Estimated recovery: ${analysis.partialUsage.recoveryTimeline} months.`,
					percentage: 100 - analysis.partialUsage.percentageUsed,
					threshold: 100,
					amount: analysis.partialUsage.amountUsed,
					confidence: 95,
					actionable: true,
					actionText: 'View Recovery Plan',
					actionUrl: '/insights?tab=optimize',
					metadata: JSON.stringify({
						amountUsed: analysis.partialUsage.amountUsed,
						percentageUsed: analysis.partialUsage.percentageUsed,
						recoveryTimeline: analysis.partialUsage.recoveryTimeline
					}),
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				});
			}
			// Positive insight for optimal status (occasionally)
			else if (analysis.status === 'optimal' && Math.random() < 0.1) {
				insights.push({
					id: generateUUID(),
					type: 'emergency_fund',
					severity: 'success',
					title: 'Emergency Fund Fully Funded',
					message: `Excellent! Your emergency fund is fully funded with ${analysis.monthsCovered.toFixed(1)} months of expenses covered. You're well protected against unexpected financial emergencies.`,
					percentage: analysis.percentageAchieved,
					threshold: 100,
					confidence: 100,
					actionable: false,
					metadata: JSON.stringify({
						currentBalance: analysis.currentBalance,
						targetAmount: analysis.targetAmount,
						monthsCovered: analysis.monthsCovered,
						status: analysis.status
					}),
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				});
			}
		} catch (error) {
			console.error('[InsightsService] Error generating emergency fund insights:', error);
		}

		return insights;
	}

	// ============================================================================
	// ANALYTICS INSIGHTS GENERATION
	// ============================================================================

	/**
	 * Generate insights from analytics data
	 */
	private async generateAnalyticsInsights(
		analyticsData: any,
		transactions: Transaction[]
	): Promise<Insight[]> {
		const insights: Insight[] = [];
		const userCurrency = await getUserMainCurrency();

		// Spending pattern insights
		if (analyticsData.topCategories && analyticsData.topCategories.length > 0) {
			const topCategory = analyticsData.topCategories[0];
			insights.push({
				id: generateUUID(),
				type: 'spending_velocity',
				severity: 'info',
				title: 'Top Spending Category',
				message: `Your highest spending category is ${topCategory.categoryName} with ${formatAmount(topCategory.amount, userCurrency)}`,
				amount: topCategory.amount,
				percentage: topCategory.percentage,
				confidence: 85,
				actionable: false,
				metadata: JSON.stringify({
					categoryName: topCategory.categoryName,
					amount: topCategory.amount,
					percentage: topCategory.percentage
				}),
				isActive: true,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			});
		}

		// Trend insights
		if (analyticsData.totalSpent > 0) {
			// This would need historical data for comparison
			// For now, we'll create a basic structure
			insights.push({
				id: generateUUID(),
				type: 'trend',
				severity: 'info',
				title: 'Monthly Spending Summary',
				message: `You spent ${formatAmount(analyticsData.totalSpent, userCurrency)} this month across ${analyticsData.topCategories?.length || 0} categories`,
				amount: analyticsData.totalSpent,
				confidence: 90,
				actionable: false,
				isActive: true,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			});
		}

		return insights;
	}

	// ============================================================================
	// BEHAVIORAL INSIGHTS GENERATION
	// ============================================================================

	/**
	 * Generate behavioral pattern insights
	 */
	private async generateBehavioralInsights(data: CrossRouteInsightData): Promise<Insight[]> {
		const insights: Insight[] = [];

		// Analyze spending patterns
		const spendingPatterns = this.analyzeSpendingPatterns(data.transactions);

		if (spendingPatterns.hasUnusualSpending) {
			insights.push({
				id: generateUUID(),
				type: 'behavioral',
				severity: 'info',
				title: 'Unusual Spending Pattern Detected',
				message: spendingPatterns.message,
				confidence: spendingPatterns.confidence,
				actionable: true,
				actionText: 'Review transactions',
				actionUrl: '/transactions',
				metadata: JSON.stringify(spendingPatterns.metadata),
				isActive: true,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			});
		}

		return insights;
	}

	// ============================================================================
	// SAVINGS VARIABILITY (CV + headroom) — CHECKLIST ~108
	// ============================================================================

	private async pruneStaleSavingsOpportunityInsights(
		keepCategoryIds: Set<string>,
		keepOverview: boolean
	): Promise<void> {
		const iso = new Date().toISOString();
		const existing = await db.insights
			.where('type')
			.equals('savings_opportunity')
			.filter((i) => i.isActive && !i.dismissedAt)
			.toArray();

		for (const ex of existing) {
			const isOverview = ex.title === 'Savings headroom — overview';
			if (isOverview) {
				if (!keepOverview) {
					await db.insights.update(ex.id, {
						isActive: false,
						dismissedAt: iso,
						deletedAt: iso,
						updatedAt: iso
					});
				}
				continue;
			}
			if (ex.categoryId && !keepCategoryIds.has(ex.categoryId)) {
				await db.insights.update(ex.id, {
					isActive: false,
					dismissedAt: iso,
					deletedAt: iso,
					updatedAt: iso
				});
			}
		}
	}

	private tierRankForSavingsHint(tier: string): number {
		switch (tier) {
			case 'lifestyle':
				return 0;
			case 'growth':
				return 1;
			case 'security':
				return 2;
			default:
				return 3;
		}
	}

	private async generateSavingsVariabilityInsights(): Promise<Insight[]> {
		const rows: SavingsVariabilityCategoryRow[] =
			await predictionService.getSavingsVariabilityCategoryRows();
		const prefs = await userService.getUserPreferences();
		const minSurplus = prefs?.savingsOpportunityMinSurplus;
		const mainCurrency = await getUserMainCurrency();
		const allowanceContext = await getSavingsHintAllowanceContext();

		type Scored = { row: SavingsVariabilityCategoryRow; hint: SavingsVariabilityHintResult };
		const scored: Scored[] = [];

		for (const row of rows) {
			const hint = computeSavingsVariabilityHint({
				months: row.monthlySpendByMonth,
				budgetAmount: row.budgetAmount,
				predictedMonthlySpend: row.predictedMonthlySpend,
				minSurplusFromPreferences: minSurplus ?? undefined
			});
			if (hint) scored.push({ row, hint });
		}

		const rankedSource = allowanceContext.suppressLifestyleHints
			? scored.filter((s) => String(s.row.waterfallTier) !== 'lifestyle')
			: scored;

		rankedSource.sort((a, b) => {
			const td =
				this.tierRankForSavingsHint(String(a.row.waterfallTier)) -
				this.tierRankForSavingsHint(String(b.row.waterfallTier));
			if (td !== 0) return td;
			return b.hint.rankingScore - a.hint.rankingScore;
		});

		const top = rankedSource.slice(0, 5);
		const keepIds = new Set(top.map((t) => t.row.categoryId));
		await this.pruneStaleSavingsOpportunityInsights(keepIds, top.length > 0);

		const nowIso = new Date().toISOString();
		const insights: Insight[] = [];

		for (const { row, hint } of top) {
			const cvPct = Math.round(hint.coefficientOfVariation * 100);
			const headroomLabel = formatAmount(hint.headroom, mainCurrency);
			insights.push({
				id: generateUUID(),
				type: 'savings_opportunity',
				severity: hint.coefficientOfVariation < 0.35 ? 'success' : 'info',
				title: `Savings headroom: ${row.categoryName}`,
				message: `Typical spend is under budget with about ${headroomLabel} headroom (vs rolling average and predicted pace). Variability ~${cvPct}% CV over ${hint.monthCount} months — surplus could go to goals.`,
				categoryId: row.categoryId,
				confidence: Math.min(100, Math.round(55 + hint.monthCount * 8)),
				actionable: true,
				actionText: 'Review budget',
				actionUrl: '/plan?tab=budget',
				metadata: JSON.stringify({
					algorithm: 'Savings variability',
					cv: hint.coefficientOfVariation,
					headroom: hint.headroom,
					rollingAverage: hint.rollingAverage,
					predictedSpend: row.predictedMonthlySpend,
					budgetAmount: row.budgetAmount,
					monthCount: hint.monthCount,
					waterfallTier: row.waterfallTier,
					allowanceBinding: allowanceContext.discretionaryBinding,
					suppressLifestyleHints: allowanceContext.suppressLifestyleHints
				}),
				isActive: true,
				createdAt: nowIso,
				updatedAt: nowIso,
				deletedAt: null
			});
		}

		if (top.length > 0) {
			const names = top
				.slice(0, 3)
				.map((s) => s.row.categoryName)
				.join(', ');
			const suffix = top.length > 3 ? ', …' : '';
			insights.push({
				id: generateUUID(),
				type: 'savings_opportunity',
				severity: 'info',
				title: 'Savings headroom — overview',
				message: `Recurring slack may be available in: ${names}${suffix}. See Plan → Budget for per-category badges.`,
				confidence: 70,
				actionable: true,
				actionText: 'Open budget',
				actionUrl: '/plan?tab=budget',
				metadata: JSON.stringify({
					algorithm: 'Savings variability summary',
					categoryIds: top.map((t) => t.row.categoryId),
					allowanceBinding: allowanceContext.discretionaryBinding,
					suppressLifestyleHints: allowanceContext.suppressLifestyleHints
				}),
				isActive: true,
				createdAt: nowIso,
				updatedAt: nowIso,
				deletedAt: null
			});
		}

		return insights;
	}

	// ============================================================================
	// PREDICTION INSIGHTS GENERATION
	// ============================================================================

	/**
	 * Generate prediction-based insights using real prediction algorithms
	 */
	private async generatePredictionInsights(data: CrossRouteInsightData): Promise<Insight[]> {
		const insights: Insight[] = [];

		try {
			devLog('[InsightsService] Generating prediction insights...');
			// 1. Predict budget outcomes (budget risk analysis)
			const budgetPredictions = await this.predictBudgetOutcomes(data);

			// Ensure budgetPredictions is an array
			if (!Array.isArray(budgetPredictions)) {
				console.error('predictBudgetOutcomes did not return an array:', budgetPredictions);
				// Continue with empty array
			} else {
				for (const prediction of budgetPredictions) {
					insights.push({
						id: generateUUID(),
						type: 'prediction',
						severity: prediction.severity,
						title: prediction.title,
						message: prediction.message,
						categoryId: prediction.categoryId,
						percentage: prediction.percentage,
						confidence: prediction.confidence,
						actionable: prediction.actionable,
						actionText: prediction.actionText,
						metadata: JSON.stringify(prediction.metadata),
						isActive: true,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						deletedAt: null
					});
				}
			}

			// 2. Goal completion forecasting
			const goalForecasts = await predictionService.forecastGoalCompletion();

			for (const forecast of goalForecasts) {
				if (!forecast.isOnTrack || forecast.riskFactors.length > 0) {
					const severity: Insight['severity'] =
						forecast.riskFactors.length > 2
							? 'alert'
							: forecast.riskFactors.length > 0
								? 'warning'
								: 'info';

					const riskMessage =
						forecast.riskFactors.length > 0
							? ` Risk factors: ${forecast.riskFactors.join(', ')}.`
							: '';

					insights.push({
						id: generateUUID(),
						type: 'prediction',
						severity,
						title: `${forecast.goalName} Completion Forecast`,
						message: `Goal is ${forecast.isOnTrack ? 'on track' : 'behind schedule'}. Estimated completion: ${forecast.estimatedCompletionDate.toLocaleDateString()}. Required monthly contribution: ${Math.round(forecast.requiredMonthlyContribution)}.${riskMessage}`,
						goalId: forecast.goalId,
						confidence: forecast.confidence,
						actionable: !forecast.isOnTrack,
						actionText: !forecast.isOnTrack ? 'Increase Contributions' : undefined,
						metadata: JSON.stringify({
							estimatedCompletionDate: forecast.estimatedCompletionDate.toISOString(),
							currentProgress: forecast.currentProgress,
							requiredMonthlyContribution: forecast.requiredMonthlyContribution,
							isOnTrack: forecast.isOnTrack,
							riskFactors: forecast.riskFactors,
							algorithm: 'Goal Completion Forecasting'
						}),
						isActive: true,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						deletedAt: null
					});
				}
			}

			// 3. Spending forecasts - show all predictions for debugging, but prioritize high-risk/high-value
			const spendingForecasts = await predictionService.predictSpending(undefined, 1);

			devLog(`[InsightsService] Generated ${spendingForecasts.length} spending forecasts`);

			// Sort by risk and confidence, then take top 25 (increased to see more predictions)
			const sortedForecasts = spendingForecasts
				// Removed filter to show all predictions for debugging
				.sort((a, b) => {
					// Prioritize high risk
					if (a.riskLevel === 'high' && b.riskLevel !== 'high') return -1;
					if (b.riskLevel === 'high' && a.riskLevel !== 'high') return 1;
					// Then by confidence
					return b.confidence - a.confidence;
				})
				.slice(0, 25); // Increased limit to see more predictions

			for (const forecast of sortedForecasts) {
				devLog(
					`[InsightsService] Creating insight for ${forecast.categoryName}: predictedAmount=${forecast.predictedAmount}, currency should be main currency`
				);
				insights.push({
					id: generateUUID(),
					type: 'prediction',
					severity: forecast.riskLevel === 'high' ? 'warning' : 'info',
					title: `${forecast.categoryName || 'Spending'} Forecast`,
					message: `Predicted spending for next month: ${Math.round(forecast.predictedAmount)}. Confidence: ${forecast.confidence}%. Factors: ${forecast.factors.join(', ')}.`,
					categoryId: forecast.categoryId,
					amount: forecast.predictedAmount, // Also store in amount field for easier retrieval
					confidence: forecast.confidence,
					actionable: forecast.riskLevel === 'high',
					actionText: forecast.riskLevel === 'high' ? 'Review Budget' : undefined,
					metadata: JSON.stringify({
						predictedAmount: forecast.predictedAmount,
						algorithm: forecast.algorithm,
						factors: forecast.factors,
						historicalData: forecast.historicalData,
						riskLevel: forecast.riskLevel,
						timeframe: forecast.timeframe
					}),
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				});
			}

			devLog(`[InsightsService] Created ${insights.length} total prediction insights`);

			// 4. Seasonal pattern detection - only high-confidence, significant patterns
			const seasonalPatterns = await predictionService.detectSeasonalPatterns();

			// Filter and limit seasonal patterns
			const significantPatterns = seasonalPatterns
				.filter((p) => p.confidence >= 0.8 && p.averageIncrease > 15) // High confidence, significant increase
				.slice(0, 3); // Limit to top 3 seasonal patterns

			for (const pattern of significantPatterns) {
				insights.push({
					id: generateUUID(),
					type: 'prediction',
					severity: 'info',
					title: `Seasonal Pattern: ${pattern.categoryId ? 'Category' : 'Overall'} Spending`,
					message: `${pattern.pattern}. Average increase: ${pattern.averageIncrease}%. Confidence: ${Math.round(pattern.confidence * 100)}%.`,
					categoryId: pattern.categoryId,
					confidence: Math.round(pattern.confidence * 100),
					actionable: false,
					metadata: JSON.stringify({
						type: pattern.type,
						pattern: pattern.pattern,
						averageIncrease: pattern.averageIncrease,
						months: pattern.months,
						historicalData: pattern.historicalData,
						algorithm: 'Seasonal Pattern Detection'
					}),
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				});
			}
		} catch (error) {
			console.error('Error generating prediction insights:', error);
			// Continue with basic predictions if advanced ones fail
		}

		// Prioritize and limit insights to prevent notification overload
		// Sort by: severity (alert > warning > info), then confidence, then actionable
		const severityOrder: Record<string, number> = { alert: 0, warning: 1, info: 2, success: 3 };
		const prioritizedInsights = insights.sort((a, b) => {
			// First by severity
			const severityDiff = (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99);
			if (severityDiff !== 0) return severityDiff;

			// Then by actionable
			if (a.actionable && !b.actionable) return -1;
			if (!a.actionable && b.actionable) return 1;

			// Then by confidence
			const confA = a.confidence || 0;
			const confB = b.confidence || 0;
			return confB - confA;
		});

		// Limit total insights to prevent overwhelming the user
		// Keep all alerts and warnings, but limit info insights
		const criticalInsights = prioritizedInsights.filter(
			(i) => i.severity === 'alert' || i.severity === 'warning'
		);
		const infoInsights = prioritizedInsights.filter(
			(i) => i.severity === 'info' || i.severity === 'success'
		);

		// Return all critical + up to 5 info insights
		return [...criticalInsights, ...infoInsights.slice(0, 5)];
	}

	// ============================================================================
	// HELPER METHODS
	// ============================================================================

	/**
	 * Save insights to database
	 */
	private async saveInsights(insights: Insight[]): Promise<void> {
		if (insights.length === 0) return;

		await db.transaction('rw', [db.insights], async () => {
			for (const insight of insights) {
				// Check if similar insight already exists based on type, goalId/categoryId, and title
				let existingInsight = null;

				// For insights with goalId, check using the composite index [type+goalId]
				if (insight.goalId) {
					existingInsight = await db.insights
						.where('[type+goalId]')
						.equals([insight.type, insight.goalId])
						.filter((i) => i.isActive && !i.dismissedAt && i.title === insight.title)
						.first();
				}

				// For insights with categoryId, check using type index and filter by categoryId
				if (!existingInsight && insight.categoryId) {
					existingInsight = await db.insights
						.where('type')
						.equals(insight.type)
						.filter(
							(i) =>
								i.isActive &&
								!i.dismissedAt &&
								i.title === insight.title &&
								i.categoryId === insight.categoryId
						)
						.first();
				}

				// For prediction insights, check by accountId in metadata to prevent duplicates
				if (!existingInsight && insight.type === 'prediction' && insight.metadata) {
					try {
						const metadata =
							typeof insight.metadata === 'string'
								? JSON.parse(insight.metadata)
								: insight.metadata;
						if (metadata.accountId) {
							const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
							const allPredictions = await db.insights
								.where('type')
								.equals('prediction')
								.filter((i) => i.isActive && !i.dismissedAt && i.createdAt > oneDayAgo)
								.toArray();

							existingInsight =
								allPredictions.find((i) => {
									if (!i.metadata) return false;
									try {
										const iMetadata =
											typeof i.metadata === 'string' ? JSON.parse(i.metadata) : i.metadata;
										return iMetadata.accountId === metadata.accountId && i.title === insight.title;
									} catch {
										return false;
									}
								}) || null;
						}
					} catch {
						// If metadata parsing fails, fall through to default check
					}
				}

				// For insights without specific identifiers, check by type and title within last 24 hours
				if (!existingInsight) {
					const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
					existingInsight = await db.insights
						.where('type')
						.equals(insight.type)
						.filter(
							(i) =>
								i.isActive && !i.dismissedAt && i.title === insight.title && i.createdAt > oneDayAgo
						)
						.first();
				}

				if (existingInsight) {
					// Update existing insight with new data (especially important for predictions when currency changes)
					await db.insights.update(existingInsight.id, {
						...insight,
						id: existingInsight.id, // Keep the same ID
						createdAt: existingInsight.createdAt, // Keep original creation date
						updatedAt: new Date().toISOString()
					});
				} else {
					await db.insights.add(insight);
				}
			}
		});
	}

	/**
	 * Clean up expired insights
	 */
	private async cleanupExpiredInsights(): Promise<void> {
		const now = new Date().toISOString();
		const expiredInsights = await db.insights
			.filter((insight) => insight.expiresAt !== undefined && insight.expiresAt < now)
			.toArray();

		for (const insight of expiredInsights) {
			await db.softDeleteInsight(insight.id);
		}
	}

	/**
	 * Analyze spending patterns for behavioral insights
	 */
	private analyzeSpendingPatterns(transactions: Transaction[]): {
		hasUnusualSpending: boolean;
		message: string;
		confidence: number;
		metadata: Record<string, any>;
	} {
		// Ensure transactions is an array and filter out null/undefined values
		if (!Array.isArray(transactions) || transactions.length === 0) {
			return {
				hasUnusualSpending: false,
				message: '',
				confidence: 0,
				metadata: {}
			};
		}

		// Filter out null/undefined transactions
		const validTransactions = transactions.filter((tx) => tx != null);

		if (validTransactions.length === 0) {
			return {
				hasUnusualSpending: false,
				message: '',
				confidence: 0,
				metadata: {}
			};
		}

		// Get transactions from the last 7 and 30 days
		const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

		const recentTransactions = validTransactions.filter(
			(tx) =>
				tx.status === 'cleared' && new Date(tx.clearedDate || tx.createdAt).getTime() > sevenDaysAgo
		);

		const historicalTransactions = validTransactions.filter(
			(tx) =>
				tx.status === 'cleared' &&
				new Date(tx.clearedDate || tx.createdAt).getTime() > thirtyDaysAgo &&
				new Date(tx.clearedDate || tx.createdAt).getTime() <= sevenDaysAgo
		);

		const totalSpent = recentTransactions
			.filter((tx) => tx.type === 'expense')
			.reduce((sum, tx) => sum + (tx.amount || 0), 0);

		const historicalTotal = historicalTransactions
			.filter((tx) => tx.type === 'expense')
			.reduce((sum, tx) => sum + (tx.amount || 0), 0);

		// Calculate average weekly spending over the last 30 days (excluding this week)
		const averageWeeklySpending = historicalTotal / 3; // Approximately 3 weeks in 30 days

		// Only flag as unusual if spending is significantly higher than historical average
		// and if we have enough historical data to make a comparison
		if (averageWeeklySpending > 0 && recentTransactions.length > 3) {
			const spendingRatio = totalSpent / averageWeeklySpending;

			// Flag if spending is 50% higher than average
			if (spendingRatio > 1.5) {
				return {
					hasUnusualSpending: true,
					message: `Your spending this week is ${Math.round((spendingRatio - 1) * 100)}% higher than your average. Consider reviewing your expenses.`,
					confidence: 75,
					metadata: {
						totalSpent,
						averageWeeklySpending,
						spendingRatio,
						transactionCount: recentTransactions.length,
						averageTransaction: totalSpent / recentTransactions.length
					}
				};
			}
		}

		return {
			hasUnusualSpending: false,
			message: '',
			confidence: 0,
			metadata: {}
		};
	}

	/**
	 * Predict budget outcomes using real prediction algorithms
	 */
	private async predictBudgetOutcomes(data: CrossRouteInsightData): Promise<
		Array<{
			severity: Insight['severity'];
			title: string;
			message: string;
			categoryId?: string;
			percentage?: number;
			confidence: number;
			actionable: boolean;
			actionText?: string;
			metadata: Record<string, any>;
		}>
	> {
		const predictions: Array<{
			severity: Insight['severity'];
			title: string;
			message: string;
			categoryId?: string;
			percentage?: number;
			confidence: number;
			actionable: boolean;
			actionText?: string;
			metadata: Record<string, any>;
		}> = [];

		// Use real prediction service for budget risk analysis
		try {
			const riskAnalyses = await predictionService.analyzeBudgetRisk();

			// Ensure riskAnalyses is an array
			if (!Array.isArray(riskAnalyses)) {
				console.error('analyzeBudgetRisk did not return an array:', riskAnalyses);
				throw new Error('analyzeBudgetRisk returned non-array value');
			}

			// Filter and sort budget risks - prioritize high risk, high confidence
			const significantRisks = riskAnalyses
				.filter(
					(analysis) =>
						analysis.riskProbability > 50 ||
						(analysis.riskProbability > 30 &&
							analysis.confidence > 85 &&
							analysis.riskLevel === 'high')
				)
				.sort((a, b) => {
					// Sort by risk probability (highest first)
					if (b.riskProbability !== a.riskProbability) {
						return b.riskProbability - a.riskProbability;
					}
					// Then by confidence
					return b.confidence - a.confidence;
				})
				.slice(0, 15); // Limit to top 15 budget risks

			for (const analysis of significantRisks) {
				const percentage = Math.round((analysis.predictedSpending / analysis.budgetAmount) * 100);

				let severity: Insight['severity'] = 'info';
				if (analysis.riskProbability > 70) severity = 'alert';
				else if (analysis.riskProbability > 40) severity = 'warning';

				predictions.push({
					severity,
					title: `${analysis.categoryName} Budget Risk`,
					message: `Based on current spending patterns, you have a ${analysis.riskProbability}% chance of exceeding your ${analysis.categoryName} budget. Predicted spending: ${Math.round(analysis.predictedSpending)} vs budget: ${Math.round(analysis.budgetAmount)}.`,
					categoryId: analysis.categoryId,
					percentage,
					confidence: analysis.confidence,
					actionable: true,
					actionText: analysis.recommendedAction || 'Review Spending',
					metadata: {
						predictedAmount: analysis.predictedSpending,
						budgetAmount: analysis.budgetAmount,
						variance: analysis.predictedSpending - analysis.budgetAmount,
						riskProbability: analysis.riskProbability,
						riskLevel: analysis.riskLevel,
						factors: analysis.factors,
						algorithm: 'Budget Risk Analysis'
					}
				});
			}
		} catch (error) {
			console.error('Error in budget prediction:', error);
			// Fallback to simple logic if prediction service fails
			try {
				for (const category of data.categories) {
					if (category.budgetAmount && category.budgetAmount > 0) {
						const predictedSpending = category.budgetAmount * 1.1;
						if (predictedSpending > category.budgetAmount) {
							predictions.push({
								severity: 'warning',
								title: `${category.name} Budget Prediction`,
								message: `Based on current trends, you may exceed your ${category.name} budget this month.`,
								categoryId: category.id,
								percentage: 110,
								confidence: 70,
								actionable: true,
								actionText: 'Adjust Spending',
								metadata: {
									predictedAmount: predictedSpending,
									budgetAmount: category.budgetAmount,
									variance: predictedSpending - category.budgetAmount
								}
							});
						}
					}
				}
			} catch (fallbackError) {
				console.error('Error in fallback budget prediction:', fallbackError);
				// Return empty array if even fallback fails
			}
		}

		// Always return an array, even if empty
		return Array.isArray(predictions) ? predictions : [];
	}

	// ============================================================================
	// AUTO-UPDATE MANAGEMENT
	// ============================================================================

	/**
	 * Start automatic insight updates
	 */
	startAutoUpdates(): void {
		const run = () =>
			this.generateCrossRouteInsights({
				timeRange: 'month',
				includePredictions: false,
				includeBehavioral: true
			});

		// Use idle scheduling so the refresh yields to UI frames and pauses
		// automatically when the document is hidden (battery-friendly).
		scheduler.scheduleIdle(INSIGHTS_AUTO_UPDATE_TASK, run, this.updateFrequency);
	}

	/**
	 * Stop automatic updates
	 */
	stopAutoUpdates(): void {
		scheduler.cancel(INSIGHTS_AUTO_UPDATE_TASK);
	}

	/**
	 * Force update insights
	 */
	async forceUpdate(): Promise<void> {
		this.lastUpdate = 0; // Reset update timer
		await this.generateCrossRouteInsights();
	}

	/**
	 * Invalidate prediction insights (soft delete them)
	 * Used when currency changes to force regeneration with new currency
	 */
	async invalidatePredictionInsights(): Promise<void> {
		// Get all prediction insights including already inactive ones to ensure complete cleanup
		const allPredictionInsights = await db.insights.where('type').equals('prediction').toArray();

		const activePredictions = allPredictionInsights.filter((i) => i.isActive && !i.dismissedAt);
		devLog(
			`[InsightsService] Found ${allPredictionInsights.length} total prediction insights, ${activePredictions.length} active`
		);
		devLog(
			`[InsightsService] Invalidating ${activePredictions.length} active prediction insights due to currency change`
		);

		// Delete all prediction insights (both active and inactive) to ensure clean slate
		for (const insight of allPredictionInsights) {
			await db.insights.update(insight.id, {
				dismissedAt: new Date().toISOString(),
				isActive: false,
				deletedAt: new Date().toISOString(), // Permanent deletion for currency change
				updatedAt: new Date().toISOString()
			});
		}

		devLog(
			`[InsightsService] Successfully invalidated ${allPredictionInsights.length} prediction insights (marked as deleted)`
		);

		const allSavings = await db.insights.where('type').equals('savings_opportunity').toArray();
		for (const insight of allSavings) {
			await db.insights.update(insight.id, {
				dismissedAt: new Date().toISOString(),
				isActive: false,
				deletedAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			});
		}

		devLog(
			`[InsightsService] Successfully invalidated ${allSavings.length} savings_opportunity insights (marked as deleted)`
		);
	}

	// ============================================================================
	// PREDICTION AND PATTERN RETRIEVAL
	// ============================================================================

	/**
	 * Get prediction insights for the PredictionsTab
	 */
	async getPredictionInsights(): Promise<
		Array<{
			id: string;
			type:
				| 'spending_forecast'
				| 'goal_completion'
				| 'budget_risk'
				| 'income_timing'
				| 'seasonal_pattern'
				| 'anomaly_detection';
			title: string;
			description: string;
			confidence: number;
			timeframe: string;
			predictedValue?: number;
			currentValue?: number;
			variance?: number;
			riskLevel: 'low' | 'medium' | 'high';
			actionable: boolean;
			actionText?: string;
			actionUrl?: string;
			metadata: {
				algorithm?: string;
				factors?: string[];
				historicalData?: number[];
				category?: 'survival' | 'security' | 'growth' | 'lifestyle' | 'system';
			};
			createdAt: string;
			expiresAt: string;
		}>
	> {
		const predictionInsights = await this.getInsightsByType('prediction');

		// Transform insights to PredictionInsight format
		return predictionInsights.map((insight) => {
			const metadata = insight.metadata ? JSON.parse(insight.metadata) : {};

			// Determine risk level based on severity
			let riskLevel: 'low' | 'medium' | 'high' = 'medium';
			if (insight.severity === 'alert') riskLevel = 'high';
			else if (insight.severity === 'success' || insight.severity === 'info') riskLevel = 'low';

			// Parse metadata for values
			const predictedValue = metadata.predictedAmount || metadata.predictedValue || insight.amount;
			const currentValue = metadata.currentAmount || metadata.currentValue;
			const variance =
				predictedValue && currentValue ? predictedValue - currentValue : metadata.variance;

			// Debug logging to track value retrieval
			if (insight.title && insight.title.includes('Forecast')) {
				devLog(`[InsightsService] Retrieving prediction for ${insight.title}:`, {
					metadataPredictedAmount: metadata.predictedAmount,
					metadataPredictedValue: metadata.predictedValue,
					insightAmount: insight.amount,
					finalPredictedValue: predictedValue,
					rawMetadata: insight.metadata
				});
			}

			return {
				id: insight.id,
				type: this.determinePredictionType(insight) as any,
				title: insight.title,
				description: insight.message,
				confidence: insight.confidence || 70,
				timeframe: this.extractTimeframe(insight) || 'This month',
				predictedValue,
				currentValue,
				variance,
				riskLevel,
				actionable: insight.actionable || false,
				actionText: insight.actionText,
				actionUrl: insight.actionUrl,
				metadata: {
					algorithm: metadata.algorithm || 'Pattern Analysis',
					factors: metadata.factors || [],
					historicalData: metadata.historicalData || [],
					category: metadata.category as
						| 'survival'
						| 'security'
						| 'growth'
						| 'lifestyle'
						| 'system'
						| undefined
				},
				createdAt: insight.createdAt,
				expiresAt: insight.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
			};
		});
	}

	/**
	 * Get behavioral pattern insights for the PatternsTab
	 */
	async getBehavioralPatternInsights(): Promise<
		Array<{
			id: string;
			type:
				| 'transaction_timing'
				| 'budget_adherence'
				| 'engagement'
				| 'spending_timing'
				| 'app_usage'
				| 'category_usage'
				| 'alert_response';
			title: string;
			description: string;
			confidence: number;
			frequency: 'daily' | 'weekly' | 'monthly' | 'irregular';
			impact: 'low' | 'medium' | 'high';
			actionable: boolean;
			recommendation?: string;
			metadata: {
				pattern?: string;
				percentage?: number;
				timeframe?: string;
				category?: 'survival' | 'security' | 'growth' | 'lifestyle' | 'system';
			};
			createdAt: string;
			lastObserved: string;
		}>
	> {
		const behavioralInsights = await this.getInsightsByType('behavioral');

		return behavioralInsights.map((insight) => {
			const metadata = insight.metadata ? JSON.parse(insight.metadata) : {};

			// Determine impact based on severity
			let impact: 'low' | 'medium' | 'high' = 'medium';
			if (insight.severity === 'alert' || insight.severity === 'warning') impact = 'high';
			else if (insight.severity === 'success' || insight.severity === 'info') impact = 'low';

			// Extract recommendation from actionText or message
			const recommendation = insight.actionText || this._extractRecommendation(insight.message);

			return {
				id: insight.id,
				type: this.determinePatternType(insight) as any,
				title: insight.title,
				description: insight.message,
				confidence: insight.confidence || 70,
				frequency: this.determineFrequency(metadata) as any,
				impact,
				actionable: insight.actionable || false,
				recommendation,
				metadata: {
					pattern: metadata.pattern || 'User behavior',
					percentage: metadata.percentage,
					timeframe: metadata.timeframe,
					category: metadata.category as
						| 'survival'
						| 'security'
						| 'growth'
						| 'lifestyle'
						| 'system'
						| undefined
				},
				createdAt: insight.createdAt,
				lastObserved: insight.updatedAt || insight.createdAt
			};
		});
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	private _extractRecommendation(message: string): string | undefined {
		// Try to extract actionable recommendation from message
		if (message.includes('consider')) {
			return message.substring(message.indexOf('consider'));
		}
		if (message.includes('recommend')) {
			return message.substring(message.indexOf('recommend'));
		}
		return undefined;
	}

	private determinePredictionType(insight: Insight): string {
		const title = insight.title.toLowerCase();
		if (title.includes('budget') || title.includes('spending')) return 'spending_forecast';
		if (title.includes('goal')) return 'goal_completion';
		if (title.includes('risk') || title.includes('exceed')) return 'budget_risk';
		if (title.includes('income')) return 'income_timing';
		if (title.includes('seasonal') || title.includes('trend')) return 'seasonal_pattern';
		if (title.includes('unusual') || title.includes('anomaly')) return 'anomaly_detection';
		return 'spending_forecast';
	}

	private determinePatternType(insight: Insight): string {
		const title = insight.title.toLowerCase();
		if (title.includes('transaction') || title.includes('timing')) return 'transaction_timing';
		if (title.includes('budget') || title.includes('adherence')) return 'budget_adherence';
		if (title.includes('engagement') || title.includes('usage')) return 'engagement';
		if (title.includes('spending')) return 'spending_timing';
		if (title.includes('app')) return 'app_usage';
		if (title.includes('category')) return 'category_usage';
		if (title.includes('alert') || title.includes('response')) return 'alert_response';
		return 'engagement';
	}

	private determineFrequency(metadata: Record<string, any>): string {
		const pattern = metadata.pattern?.toLowerCase() || '';
		if (pattern.includes('daily') || pattern.includes('day')) return 'daily';
		if (pattern.includes('weekly') || pattern.includes('week')) return 'weekly';
		if (pattern.includes('monthly') || pattern.includes('month')) return 'monthly';
		return 'irregular';
	}

	private extractTimeframe(insight: Insight): string | undefined {
		const metadata = insight.metadata ? JSON.parse(insight.metadata) : {};
		return metadata.timeframe || metadata.period;
	}

	// ============================================================================
	// COMPREHENSIVE SPENDING PATTERN ANALYSIS
	// ============================================================================

	/**
	 * Phase 9.8 — aggregate-only: derive virtual per-category slices from stable merchant profiles
	 * for pattern stats. Does not persist; only used for category pattern aggregation.
	 */
	private async applyShadowCategoryRedistribution(
		transactions: Transaction[]
	): Promise<Transaction[]> {
		const prefs = await userService.getUserPreferences();
		if (!prefs.insightsShadowCategoryBreakdown) return transactions;

		const cache = new Map<string, Awaited<ReturnType<typeof merchantProfileService.getProfile>>>();
		const profileFor = async (mk: string, accountId?: string) => {
			const k = `${mk}|||${accountId ?? ''}`;
			let p = cache.get(k);
			if (p === undefined) {
				p = await merchantProfileService.getProfile(mk, accountId);
				cache.set(k, p);
			}
			return p;
		};

		const out: Transaction[] = [];
		for (const tx of transactions) {
			if (tx.categoryWeights && tx.categoryWeights.length >= 2) {
				out.push(tx);
				continue;
			}
			const mk = normaliseMerchantKey(tx.description ?? '');
			if (!mk) {
				out.push(tx);
				continue;
			}
			const profile = await profileFor(mk, tx.accountId);
			if (!profile || profile.stability < 0.85 || profile.totalObservations < 8) {
				out.push(tx);
				continue;
			}
			const raw = profile.weights.filter((w) => w.meanWeight > 0 && w.observationCount > 0);
			if (raw.length < 2) {
				out.push(tx);
				continue;
			}
			const sum = raw.reduce((s, w) => s + w.meanWeight, 0);
			if (sum < 1e-9) {
				out.push(tx);
				continue;
			}
			const normalized = raw.map((w) => ({
				categoryId: w.categoryId,
				weight: w.meanWeight / sum
			}));
			const primary = normalized.reduce((a, b) => (b.weight > a.weight ? b : a), normalized[0]!);
			out.push({
				...tx,
				categoryId: primary.categoryId,
				categoryWeights: normalized,
				categoryConfidence: 'profile-inferred'
			});
		}
		return out;
	}

	/**
	 * Analyze comprehensive spending patterns (async version)
	 */
	async analyzeSpendingPatternsAsync(days: number = 90): Promise<{
		categoryPatterns: Array<{
			categoryId: string;
			categoryName: string;
			averageAmount: number;
			frequency: number;
			trend: 'increasing' | 'decreasing' | 'stable';
			trendSuppressed: boolean;
			percentageOfTotal: number;
		}>;
		timingPatterns: {
			mostActiveDay: string;
			mostActiveHour: number;
			weekendVsWeekday: { weekend: number; weekday: number };
		};
		velocityPatterns: {
			averageTransactionAmount: number;
			transactionFrequency: number;
			spendingVelocity: 'low' | 'medium' | 'high';
		};
		anomalyPatterns: Array<{
			type: 'unusual_amount' | 'unusual_timing' | 'unusual_category';
			description: string;
			transactionId: string;
			confidence: number;
		}>;
	}> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - days);
		const lowerIso = cutoffDate.toISOString();

		const transactions = await db.transactions
			.where('clearedDate')
			.between(lowerIso, Dexie.maxKey, true, true)
			.and(
				(tx) =>
					tx.type === 'expense' &&
					tx.status === 'cleared' &&
					typeof tx.clearedDate === 'string' &&
					new Date(tx.clearedDate) >= cutoffDate &&
					!tx.deletedAt
			)
			.toArray();

		const categories = await db.getActiveCategories();
		const categoryMap = new Map(categories.map((cat) => [cat.id, cat]));

		// Category patterns
		const categoryPatternSource = await this.applyShadowCategoryRedistribution(transactions);
		const categoryPatterns = this.analyzeCategoryPatterns(categoryPatternSource, categoryMap, days);

		// Timing patterns
		const timingPatterns = this.analyzeTimingPatterns(transactions);

		// Velocity patterns
		const velocityPatterns = this.analyzeVelocityPatterns(transactions, days);

		// Anomaly detection
		const anomalyPatterns = this.detectAnomalies(transactions, categoryMap);

		return {
			categoryPatterns,
			timingPatterns,
			velocityPatterns,
			anomalyPatterns
		};
	}

	/**
	 * Analyze category spending patterns
	 */
	private analyzeCategoryPatterns(
		transactions: Transaction[],
		categoryMap: Map<string, Category>,
		days: number
	): Array<{
		categoryId: string;
		categoryName: string;
		averageAmount: number;
		frequency: number;
		trend: 'increasing' | 'decreasing' | 'stable';
		trendSuppressed: boolean;
		percentageOfTotal: number;
	}> {
		const categoryData = new Map<
			string,
			{
				amounts: number[];
				dates: string[];
				total: number;
			}
		>();

		transactions.forEach((tx) => {
			for (const cid of categoryIdsWithSpendShare(tx)) {
				const amount = Math.abs(effectiveAmountForCategory(tx, cid));
				if (amount < 1e-9) continue;
				const data = categoryData.get(cid) || { amounts: [], dates: [], total: 0 };
				data.amounts.push(amount);
				data.dates.push(tx.clearedDate || tx.createdAt);
				data.total += amount;
				categoryData.set(cid, data);
			}
		});

		const totalSpending = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);

		const patterns: Array<{
			categoryId: string;
			categoryName: string;
			averageAmount: number;
			frequency: number;
			trend: 'increasing' | 'decreasing' | 'stable';
			trendSuppressed: boolean;
			percentageOfTotal: number;
		}> = [];

		categoryData.forEach((data, categoryId) => {
			const category = categoryMap.get(categoryId);
			if (!category) return;

			const averageAmount =
				data.amounts.length > 0
					? data.amounts.reduce((sum, amt) => sum + amt, 0) / data.amounts.length
					: 0;

			// Calculate trend by comparing first half vs second half (amounts must follow chronological dates)
			const pairs = data.dates.map((date, index) => ({
				date,
				amount: data.amounts[index],
				index
			}));
			pairs.sort((a, b) => {
				const ta = new Date(a.date).getTime();
				const tb = new Date(b.date).getTime();
				const da = Number.isFinite(ta) ? ta : 0;
				const db = Number.isFinite(tb) ? tb : 0;
				if (da !== db) return da - db;
				return a.index - b.index;
			});
			const chronologicAmounts = pairs.map((p) => p.amount);
			const midpoint = Math.floor(chronologicAmounts.length / 2);
			const firstHalf = chronologicAmounts.slice(0, midpoint);
			const secondHalf = chronologicAmounts.slice(midpoint);

			const firstHalfAvg =
				firstHalf.length > 0 ? firstHalf.reduce((sum, amt) => sum + amt, 0) / firstHalf.length : 0;
			const secondHalfAvg =
				secondHalf.length > 0
					? secondHalf.reduce((sum, amt) => sum + amt, 0) / secondHalf.length
					: 0;

			let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
			const changePercent =
				firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;

			if (changePercent > 10) {
				trend = 'increasing';
			} else if (changePercent < -10) {
				trend = 'decreasing';
			}

			const trendSuppressed = chronologicAmounts.length < 8 || firstHalfAvg <= 0;

			patterns.push({
				categoryId,
				categoryName: category.name,
				averageAmount: Math.round(averageAmount * 100) / 100,
				frequency: data.amounts.length,
				trend,
				trendSuppressed,
				percentageOfTotal:
					totalSpending > 0 ? Math.round((data.total / totalSpending) * 10000) / 100 : 0
			});
		});

		return patterns.sort((a, b) => b.percentageOfTotal - a.percentageOfTotal);
	}

	/**
	 * Analyze timing patterns
	 */
	private analyzeTimingPatterns(transactions: Transaction[]): {
		mostActiveDay: string;
		mostActiveHour: number;
		weekendVsWeekday: { weekend: number; weekday: number };
	} {
		const dayCounts = new Map<string, number>();
		const hourCounts = new Map<number, number>();
		let weekendTotal = 0;
		let weekdayTotal = 0;

		const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

		transactions.forEach((tx) => {
			const date = new Date(tx.clearedDate || tx.createdAt);
			const dayName = dayNames[date.getDay()];
			const hour = date.getHours();
			const dayOfWeek = date.getDay();

			dayCounts.set(dayName, (dayCounts.get(dayName) || 0) + 1);
			hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);

			if (dayOfWeek === 0 || dayOfWeek === 6) {
				weekendTotal += Math.abs(tx.amount || 0);
			} else {
				weekdayTotal += Math.abs(tx.amount || 0);
			}
		});

		const mostActiveDay =
			Array.from(dayCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

		const mostActiveHour =
			Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 12;

		return {
			mostActiveDay,
			mostActiveHour,
			weekendVsWeekday: {
				weekend: Math.round(weekendTotal * 100) / 100,
				weekday: Math.round(weekdayTotal * 100) / 100
			}
		};
	}

	/**
	 * Analyze spending velocity patterns
	 */
	private analyzeVelocityPatterns(
		transactions: Transaction[],
		days: number
	): {
		averageTransactionAmount: number;
		transactionFrequency: number;
		spendingVelocity: 'low' | 'medium' | 'high';
	} {
		if (transactions.length === 0) {
			return {
				averageTransactionAmount: 0,
				transactionFrequency: 0,
				spendingVelocity: 'low'
			};
		}

		const totalAmount = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
		const averageTransactionAmount = totalAmount / transactions.length;
		const transactionFrequency = transactions.length / days;

		// Determine velocity based on frequency and average amount
		let spendingVelocity: 'low' | 'medium' | 'high' = 'low';
		if (transactionFrequency > 0.5 && averageTransactionAmount > 50) {
			spendingVelocity = 'high';
		} else if (transactionFrequency > 0.2 || averageTransactionAmount > 30) {
			spendingVelocity = 'medium';
		}

		return {
			averageTransactionAmount: Math.round(averageTransactionAmount * 100) / 100,
			transactionFrequency: Math.round(transactionFrequency * 100) / 100,
			spendingVelocity
		};
	}

	/**
	 * Detect spending anomalies
	 */
	private detectAnomalies(
		transactions: Transaction[],
		categoryMap: Map<string, Category>
	): Array<{
		type: 'unusual_amount' | 'unusual_timing' | 'unusual_category';
		description: string;
		transactionId: string;
		confidence: number;
	}> {
		if (transactions.length < 5) {
			return [];
		}

		const anomalies: Array<{
			type: 'unusual_amount' | 'unusual_timing' | 'unusual_category';
			description: string;
			transactionId: string;
			confidence: number;
		}> = [];

		const globalAmounts = transactions.map((tx) => Math.abs(tx.amount || 0));
		const globalOutliers = new Set(iqrFilter(globalAmounts, 1.5).outliers);

		// Compare within category pools to avoid cross-category false positives.
		const categoryTransactions = new Map<string, Transaction[]>();
		transactions.forEach((tx) => {
			if (!tx.categoryId) return;
			const existing = categoryTransactions.get(tx.categoryId) ?? [];
			existing.push(tx);
			categoryTransactions.set(tx.categoryId, existing);
		});

		for (const [categoryId, txs] of categoryTransactions.entries()) {
			if (txs.length < 4) {
				continue;
			}

			const amounts = txs.map((tx) => Math.abs(tx.amount || 0));
			const outliers = new Set(iqrFilter(amounts, 1.5).outliers);
			const category = categoryMap.get(categoryId);

			txs.forEach((tx) => {
				const amount = Math.abs(tx.amount || 0);
				if (!outliers.has(amount)) return;

				const categoryScore = iqrOutlierScore(amount, amounts, 1.5);
				const globalScore = globalOutliers.has(amount)
					? iqrOutlierScore(amount, globalAmounts, 1.5)
					: 0;

				anomalies.push({
					type: 'unusual_amount',
					description: `Unusually large transaction: ${formatAmount(amount, tx.currency || 'USD')} in ${category?.name || 'Unknown'}`,
					transactionId: tx.id,
					confidence: Math.min(
						100,
						Math.round((0.55 + Math.max(categoryScore, globalScore) * 0.45) * 100)
					)
				});
			});
		}

		// Detect unusual timing (transactions at odd hours)
		const hourCounts = new Map<number, number>();
		transactions.forEach((tx) => {
			const date = new Date(tx.clearedDate || tx.createdAt);
			const hour = date.getHours();
			hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
		});

		const avgHourCount =
			Array.from(hourCounts.values()).reduce((sum, count) => sum + count, 0) / hourCounts.size;
		transactions.forEach((tx) => {
			const date = new Date(tx.clearedDate || tx.createdAt);
			const hour = date.getHours();
			const hourCount = hourCounts.get(hour) || 0;

			// Flag transactions at hours with very low activity (less than 10% of average)
			if (hourCount < avgHourCount * 0.1 && (hour < 6 || hour > 22)) {
				anomalies.push({
					type: 'unusual_timing',
					description: `Transaction at unusual time: ${hour}:00`,
					transactionId: tx.id,
					confidence: 60
				});
			}
		});

		return anomalies.slice(0, 10); // Limit to top 10 anomalies
	}

	// ============================================================================
	// BALANCE PROJECTION INSIGHTS GENERATION
	// ============================================================================

	/**
	 * Generate insights from balance projections
	 * This is expensive, so we limit it to checking/savings accounts only
	 * and use cached projections when possible
	 * Only creates insights for accounts with meaningful buffers (> 0)
	 */
	private async generateBalanceProjectionInsights(accounts: Account[]): Promise<Insight[]> {
		const insights: Insight[] = [];

		try {
			// Only check checking and savings accounts (most relevant for balance projections)
			// AND only accounts that have a buffer set (bufferAmount > 0)
			const relevantAccounts = accounts.filter((a) => {
				if (!a.isActive || (a.type !== 'checking' && a.type !== 'savings')) {
					return false;
				}
				// Only include accounts with a meaningful buffer
				const buffer = getBufferAmount(a);
				return buffer > 0;
			});

			if (relevantAccounts.length === 0) {
				return insights;
			}

			// Get low balance alerts from projections (uses cache)
			// This now returns only one alert per account (the earliest)
			const alerts = await balanceProjectionService.generateLowBalanceAlerts({
				accountIds: relevantAccounts.map((a) => a.id),
				daysAhead: 90
			});

			if (alerts.length === 0) {
				return insights;
			}

			// Create insights for each alert (already deduplicated - one per account)
			for (const alert of alerts) {
				const account = accounts.find((a) => a.id === alert.accountId);
				if (!account) continue;

				const formatAccountCurrency = (amount: number) => formatAmount(amount, account.currency);

				insights.push(
					await this.createInsight({
						type: 'prediction',
						severity: alert.severity === 'critical' ? 'alert' : 'warning',
						title:
							alert.severity === 'critical'
								? `Low Balance Alert: ${account.name}`
								: `Balance Warning: ${account.name}`,
						message: alert.message,
						actionable: true,
						actionText: 'View Projections',
						actionUrl: `/accounts/${account.id}`,
						expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
						metadata: {
							accountId: alert.accountId,
							accountName: account.name,
							projectedBalance: alert.projectedBalance,
							bufferAmount: alert.bufferAmount,
							alertDate: alert.date.toISOString()
						}
					})
				);
			}

			// Only create summary insight if we have multiple critical alerts
			const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
			if (criticalAlerts.length > 1) {
				insights.push(
					await this.createInsight({
						type: 'prediction',
						severity: 'alert',
						title: 'Multiple Accounts at Risk',
						message: `${criticalAlerts.length} accounts are projected to go below their buffer in the next 90 days. Review your balance projections.`,
						actionable: true,
						actionText: 'View All Projections',
						actionUrl: '/accounts',
						expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
						metadata: {
							affectedAccounts: criticalAlerts.length,
							totalAlerts: alerts.length
						}
					})
				);
			}
		} catch (error) {
			console.error('Error generating balance projection insights:', error);
		}

		return insights;
	}

	/**
	 * Phase 8 — Patterns / Insights surface: rolling comparison and fee drift hint.
	 */
	async getPhase8PatternsSurfaceMetrics(
		mainCurrency: string,
		precomputedFeeDriftPatterns?: RecurringPattern[]
	): Promise<{
		spendComparativeLine: string | null;
		incomeComparativeLine: string | null;
		savingsTrendSymbol: string | null;
		feeDriftLine: string | null;
		shadowCategoryViewEnabled: boolean;
		shadowEstimatedNote: string | null;
	}> {
		return performanceMonitor.monitor('InsightsService', 'getPhase8PatternsSurfaceMetrics', () =>
			this._getPhase8PatternsSurfaceMetrics(mainCurrency, precomputedFeeDriftPatterns)
		);
	}

	private async _getPhase8PatternsSurfaceMetrics(
		mainCurrency: string,
		precomputedFeeDriftPatterns?: RecurringPattern[]
	): Promise<{
		spendComparativeLine: string | null;
		incomeComparativeLine: string | null;
		savingsTrendSymbol: string | null;
		feeDriftLine: string | null;
		shadowCategoryViewEnabled: boolean;
		shadowEstimatedNote: string | null;
	}> {
		const now = new Date();
		const windowStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
		const lowerIso = windowStart.toISOString();

		const txs = await db.transactions
			.where('clearedDate')
			.between(lowerIso, Dexie.maxKey, true, true)
			.and(
				(t) =>
					Boolean(t) && !t.deletedAt && t.status === 'cleared' && typeof t.clearedDate === 'string'
			)
			.toArray();

		const savingsIds = new Set(
			(await db.accounts.filter((a) => !a.deletedAt && a.type === 'savings').toArray()).map(
				(a) => a.id
			)
		);

		const buckets = [0, 1, 2, 3].map((i) => {
			const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
			return { y: d.getFullYear(), m: d.getMonth(), expense: 0, income: 0, savingsTransfer: 0 };
		});

		for (const t of txs) {
			const cd = new Date(t.clearedDate!);
			const b = buckets.find((x) => x.y === cd.getFullYear() && x.m === cd.getMonth());
			if (!b) continue;
			if (t.type === 'expense') b.expense += Math.abs(t.amount || 0);
			if (t.type === 'income') b.income += Math.abs(t.amount || 0);
			if (t.type === 'transfer' && t.transferDetails?.toAccountId && t.accountId) {
				const toId = t.transferDetails.toAccountId;
				if (savingsIds.has(toId) && !savingsIds.has(t.accountId)) {
					b.savingsTransfer += Math.abs(
						t.transferDetails.transferAmount ?? t.accountAmount ?? t.amount ?? 0
					);
				}
			}
		}

		const prev = buckets.slice(1, 4);
		const cur = buckets[0];
		const avgExp = prev.reduce((s, x) => s + x.expense, 0) / Math.max(prev.length, 1);
		const avgInc = prev.reduce((s, x) => s + x.income, 0) / Math.max(prev.length, 1);
		const spendPct = avgExp > 0 ? (cur.expense / avgExp - 1) * 100 : null;
		const incPct = avgInc > 0 ? (cur.income / avgInc - 1) * 100 : null;
		const spendComparativeLine =
			spendPct == null || !Number.isFinite(spendPct)
				? null
				: `vs 3-month average spend: ${spendPct >= 0 ? '+' : ''}${spendPct.toFixed(0)}%`;
		const incomeComparativeLine =
			incPct == null || !Number.isFinite(incPct)
				? null
				: `vs 3-month average income: ${incPct >= 0 ? '+' : ''}${incPct.toFixed(0)}%`;

		const sv = buckets.slice(0, 3).map((x) => x.savingsTransfer);
		let savingsTrendSymbol: string | null = null;
		if (sv[0] + sv[1] + sv[2] > 0) {
			if (sv[0] > sv[1] * 1.05 && sv[1] >= sv[2]) savingsTrendSymbol = '↑';
			else if (sv[0] < sv[1] * 0.95 && sv[1] <= sv[2]) savingsTrendSymbol = '↓';
			else savingsTrendSymbol = '→';
		}

		let feeDriftLine: string | null = null;
		try {
			const patterns =
				precomputedFeeDriftPatterns !== undefined
					? precomputedFeeDriftPatterns
					: await recurringTransactionIntelligenceService.detectPatterns(120, 3);
			for (const p of patterns) {
				if (p.metadata?.type !== 'expense') continue;
				const amts = [...p.historicalAmounts].slice(-3).map((x) => Math.abs(x));
				if (amts.length >= 3 && amts[1] >= amts[0] && amts[2] >= amts[1] && amts[2] > amts[0]) {
					const label = p.metadata?.notes || p.descriptionPattern || 'Bill';
					const delta = amts[2] - amts[0];
					feeDriftLine = `Your ${label} has increased ${formatTransactionAmount(delta, mainCurrency, true)} over recent charges`;
					break;
				}
			}
		} catch {
			// ignore
		}

		const prefs = await userService.getUserPreferences();
		const shadowCategoryViewEnabled = prefs.insightsShadowCategoryBreakdown ?? false;

		return {
			spendComparativeLine,
			incomeComparativeLine,
			savingsTrendSymbol,
			feeDriftLine,
			shadowCategoryViewEnabled,
			shadowEstimatedNote: shadowCategoryViewEnabled
				? '~estimated: category breakdown can use stable merchant profiles where available (stored transactions are not changed).'
				: null
		};
	}
}

export const insightsService = new InsightsService();
