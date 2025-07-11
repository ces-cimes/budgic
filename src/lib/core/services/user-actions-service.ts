import { db, generateUUID } from '$lib/core/db';
import { dateUtils } from '$lib/utils/date-utils';
import type { Transaction, WhatTagType, WhyTagType, UserPreferences, UserAction } from '$lib/core/db';
import { z } from 'zod';
import { unifiedInsightsService } from './unified-insights-service';
import { analyticsCoreService } from './analytics-core-service';
import { settingsService } from './settings-service';
import { budgetService } from './budget-service';

// ============================================================================
// USER ACTION TRACKING SCHEMAS
// ============================================================================

// Transaction Entry Behavior Schema
const TransactionEntryActionSchema = z.object({
	entryMethod: z.enum(['manual', 'quick-add', 'duplicate', 'import', 'split']),
	timeToComplete: z.number().optional(),
	splitCount: z.number().optional(),
	hasCustomTags: z.boolean().optional(),
	categoryChangeCount: z.number().optional(),
	timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'night']).optional(),
	dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']).optional(),
	budgetStatusWhenSpent: z.enum(['over_budget', 'under_budget', 'at_limit']).optional(),
	daysSinceLastTransaction: z.number().optional(),
	categoryBudgetRemaining: z.number().optional(),
	transactionAmount: z.number().optional(),
	transactionType: z.enum(['income', 'expense', 'transfer', 'adjustment']).optional(),
	whatTag: z.string().optional(),
	whyTag: z.string().optional()
});

// Budget Interaction Patterns Schema
const BudgetInteractionActionSchema = z.object({
	triggeredBy: z.enum(['user', 'alert', 'scheduled', 'after_transaction']),
	timeSpent: z.number().optional(),
	categoriesViewed: z.array(z.string()).optional(),
	adjustmentsMade: z.boolean().optional(),
	waterfallTier: z.enum(['survival', 'security', 'growth', 'lifestyle']).optional(),
	budgetStatus: z.enum(['on_track', 'over_budget', 'under_budget']).optional(),
	actionTaken: z.enum(['none', 'budget_adjusted', 'transaction_added', 'goal_modified']).optional()
});

// Progress Checking Patterns Schema
const ProgressCheckingActionSchema = z.object({
	triggeredBy: z.enum(['user_initiated', 'after_transaction', 'alert_notification', 'scheduled']),
	timeSpent: z.number().optional(),
	categoriesViewed: z.array(z.string()).optional(),
	actionTaken: z.enum(['none', 'budget_adjusted', 'transaction_added', 'goal_modified']).optional(),
	waterfallTier: z.enum(['survival', 'security', 'growth', 'lifestyle']).optional(),
	progressPercentage: z.number().optional(),
	goalStatus: z.enum(['on_track', 'ahead', 'behind', 'completed']).optional()
});

// Budget Modification Schema
const BudgetModificationActionSchema = z.object({
	changedCategory: z.string(),
	changeAmount: z.number(),
	movedTo: z.string().optional(),
	triggerReason: z.enum(['overspent', 'planning', 'income_change', 'goal_adjustment']),
	timeSinceLastAdjustment: z.number().optional(),
	modificationType: z.enum(['increase', 'decrease', 'reallocation']).optional(),
	waterfallTier: z.enum(['survival', 'security', 'growth', 'lifestyle']).optional()
});

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type TransactionEntryAction = z.infer<typeof TransactionEntryActionSchema>;
export type BudgetInteractionAction = z.infer<typeof BudgetInteractionActionSchema>;
export type ProgressCheckingAction = z.infer<typeof ProgressCheckingActionSchema>;
export type BudgetModificationAction = z.infer<typeof BudgetModificationActionSchema>;

// Behavioral pattern types (simplified)
export interface BehaviorPattern {
	patternType: 'transaction_timing' | 'budget_adherence' | 'engagement_frequency';
	confidence: number;
	description: string;
	metadata: Record<string, any>;
	firstObserved: string;
	lastObserved: string;
	frequency: number;
}

// ============================================================================
// BUDGET SERVICE INTEGRATION
// ============================================================================

// ============================================================================
// USER ACTIONS SERVICE
// ============================================================================

class UserActionsService {
	public get ready() {
		return db.isOpen();
	}

	public isLoading() {
		return !this.ready;
	}

	// ============================================================================
	// CORE TRACKING METHODS
	// ============================================================================

	/**
	 * Track a user action with metadata and context
	 */
	async track(
		action: 'transaction_created' | 'budget_checked' | 'progress_viewed' | 'budget_modified',
		metadata: Record<string, any>,
		context?: Record<string, any>
	): Promise<string> {
		// Check if tracking is enabled
		if (!(await this.isTrackingEnabled())) {
			return '';
		}

		const actionId = generateUUID();
		const sessionId = this.getCurrentSessionId();
		
		const userAction: UserAction = {
			id: actionId,
			action,
			metadata: JSON.stringify(this.sanitizeMetadata(metadata)),
			context: context ? JSON.stringify(context) : undefined,
			timestamp: dateUtils.formatDate(new Date(), 'yyyy-MM-ddTHH:mm:ss.SSSZ'),
			sessionId,
			createdAt: dateUtils.formatDate(new Date(), 'yyyy-MM-ddTHH:mm:ss.SSSZ'),
			updatedAt: dateUtils.formatDate(new Date(), 'yyyy-MM-ddTHH:mm:ss.SSSZ'),
			deletedAt: null
		};

		await db.userActions.add(userAction);
		return actionId;
	}

	/**
	 * Track transaction creation with enhanced context
	 */
	async trackTransactionCreated(
		transaction: Transaction,
		entryMethod: 'manual' | 'quick-add' | 'duplicate' | 'import' | 'split',
		timeToComplete: number | undefined = undefined,
		categoryChangeCount: number | undefined = undefined
	): Promise<string> {
		const now = new Date();
		const timeOfDay = this.getTimeOfDay(now);
		const dayOfWeek = this.getDayOfWeek(now);

		// Get budget status from budget service
		let budgetStatus: 'over_budget' | 'under_budget' | 'at_limit' | undefined;
		let categoryBudgetRemaining: number | undefined;
		
		try {
			if (transaction.whyTag) {
				const tagBudgets = await budgetService.getTagBudgets();
				const tagBudget = tagBudgets.find(tb => tb.tagName === transaction.whyTag);
				if (tagBudget) {
					categoryBudgetRemaining = tagBudget.remaining;
					if (tagBudget.spent > tagBudget.allocatedAmount) {
						budgetStatus = 'over_budget';
					} else if (tagBudget.remaining <= 0) {
						budgetStatus = 'at_limit';
					} else {
						budgetStatus = 'under_budget';
					}
				}
			}
		} catch (error) {
			console.warn('Failed to get budget status:', error);
		}

		const metadata = {
			entryMethod,
			timeToComplete,
			splitCount: transaction.splitId ? await this.getSplitCount(transaction.splitId) : undefined,
			hasCustomTags: !!(transaction.whatTag || transaction.whyTag),
			categoryChangeCount,
			timeOfDay,
			dayOfWeek,
			budgetStatusWhenSpent: budgetStatus,
			daysSinceLastTransaction: await this.getDaysSinceLastTransaction(transaction.accountId),
			categoryBudgetRemaining,
			transactionAmount: Math.abs(transaction.amount),
			transactionType: transaction.type,
			whatTag: transaction.whatTag,
			whyTag: transaction.whyTag
		};

		return this.track('transaction_created', metadata);
	}

	/**
	 * Track budget checking behavior
	 */
	async trackBudgetChecked(
		triggeredBy: 'user' | 'alert' | 'scheduled' | 'after_transaction',
		timeSpent?: number,
		categoriesViewed?: string[],
		adjustmentsMade?: boolean,
		waterfallTier?: 'survival' | 'security' | 'growth' | 'lifestyle'
	): Promise<string> {
		// Get current budget status from budget service
		let budgetStatus: 'on_track' | 'over_budget' | 'under_budget' | undefined;
		
		try {
			const categoryBudgets = await budgetService.calculateCategoryBudgets();
			let hasOverBudget = false;
			let hasAtLimit = false;
			
			for (const category of categoryBudgets) {
				if (category.spent > category.totalAllocated) {
					hasOverBudget = true;
					break;
				} else if (category.spent >= category.totalAllocated * 0.9) {
					hasAtLimit = true;
				}
			}
			
			if (hasOverBudget) {
				budgetStatus = 'over_budget';
			} else if (hasAtLimit) {
				budgetStatus = 'on_track';
			} else {
				budgetStatus = 'under_budget';
			}
		} catch (error) {
			console.warn('Failed to get budget status:', error);
		}

		const metadata = {
			triggeredBy,
			timeSpent,
			categoriesViewed,
			adjustmentsMade,
			waterfallTier,
			budgetStatus,
			actionTaken: adjustmentsMade ? 'budget_adjusted' : 'none'
		};

		return this.track('budget_checked', metadata);
	}

	/**
	 * Track progress checking patterns
	 */
	async trackProgressViewed(
		triggeredBy: 'user_initiated' | 'after_transaction' | 'alert_notification' | 'scheduled',
		timeSpent?: number,
		categoriesViewed?: string[],
		actionTaken?: 'none' | 'budget_adjusted' | 'transaction_added' | 'goal_modified'
	): Promise<string> {
		const metadata = {
			triggeredBy,
			timeSpent,
			categoriesViewed,
			actionTaken: actionTaken || 'none',
			waterfallTier: categoriesViewed?.[0] as any
		};

		return this.track('progress_viewed', metadata);
	}

	/**
	 * Track budget modification behavior
	 */
	async trackBudgetModified(
		changedCategory: string,
		changeAmount: number,
		triggerReason: 'overspent' | 'planning' | 'income_change' | 'goal_adjustment',
		movedTo?: string
	): Promise<string> {
		const timeSinceLastAdjustment = await this.getDaysSinceLastBudgetAdjustment();
		
		const metadata = {
			changedCategory,
			changeAmount,
			movedTo,
			triggerReason,
			timeSinceLastAdjustment,
			modificationType: changeAmount > 0 ? 'increase' : 'decrease'
		};

		return this.track('budget_modified', metadata);
	}

	// ============================================================================
	// BEHAVIORAL ANALYSIS METHODS
	// ============================================================================

	/**
	 * Analyze behavioral patterns over time
	 */
	async analyzeBehavioralPatterns(
		timeframe: 'week' | 'month' | 'quarter' | 'year'
	): Promise<BehaviorPattern[]> {
		const endDate = new Date();
		const startDate = this.getStartDateForTimeframe(timeframe);
		
		const actions = await this.getActionsByDateRange(startDate.toISOString(), endDate.toISOString());
		
		const patterns: BehaviorPattern[] = [];

		// Analyze transaction timing patterns
		const transactionPatterns = this.analyzeTransactionTiming(actions);
		patterns.push(...transactionPatterns);

		// Analyze budget adherence patterns
		const budgetPatterns = this.analyzeBudgetAdherence(actions);
		patterns.push(...budgetPatterns);

		// Analyze engagement frequency
		const engagementPatterns = this.analyzeEngagementFrequency(actions);
		patterns.push(...engagementPatterns);

		return patterns;
	}

	/**
	 * Get purgeable data for privacy compliance
	 */
	async getPurgeableData(retentionDays: number): Promise<UserAction[]> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
		
		return await db.userActions
			.where('timestamp')
			.below(cutoffDate.toISOString())
			.toArray();
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	private getCurrentSessionId(): string {
		let sessionId = localStorage.getItem('budgic_session_id');
		if (!sessionId) {
			sessionId = generateUUID();
			localStorage.setItem('budgic_session_id', sessionId);
		}
		return sessionId;
	}

	private getTimeOfDay(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
		const hour = date.getHours();
		if (hour >= 5 && hour < 12) return 'morning';
		if (hour >= 12 && hour < 17) return 'afternoon';
		if (hour >= 17 && hour < 22) return 'evening';
		return 'night';
	}

	private getDayOfWeek(date: Date): 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' {
		const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
		return days[date.getDay()] as any;
	}

	private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
		const sanitized = { ...metadata };
		delete sanitized.password;
		delete sanitized.token;
		delete sanitized.secret;
		return sanitized;
	}

	private async getDaysSinceLastTransaction(accountId: string): Promise<number | undefined> {
		try {
			const lastTransaction = await db.transactions
				.where('accountId')
				.equals(accountId)
				.reverse()
				.sortBy('createdAt');
			
			if (lastTransaction.length === 0) return undefined;
			
			const lastDate = new Date(lastTransaction[0].createdAt);
			const now = new Date();
			return Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
		} catch {
			return undefined;
		}
	}

	private async getSplitCount(splitId: string): Promise<number | undefined> {
		try {
			const splitTransactions = await db.transactions
				.where('splitId')
				.equals(splitId)
				.toArray();
			return splitTransactions.length;
		} catch {
			return undefined;
		}
	}

	private async getDaysSinceLastBudgetAdjustment(): Promise<number | undefined> {
		try {
			const lastAdjustment = await db.userActions
				.where('action')
				.equals('budget_modified')
				.reverse()
				.sortBy('timestamp');
			
			if (lastAdjustment.length === 0) return undefined;
			
			const lastDate = new Date(lastAdjustment[0].timestamp);
			const now = new Date();
			return Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
		} catch {
			return undefined;
		}
	}

	private getStartDateForTimeframe(timeframe: 'week' | 'month' | 'quarter' | 'year'): Date {
		const now = new Date();
		switch (timeframe) {
			case 'week':
				return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			case 'month':
				return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			case 'quarter':
				return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
			case 'year':
				return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
		}
	}

	private async getActionsByDateRange(startDate: string, endDate: string): Promise<UserAction[]> {
		return await db.userActions
			.where('timestamp')
			.between(startDate, endDate)
			.toArray();
	}

	private analyzeTransactionTiming(actions: UserAction[]): BehaviorPattern[] {
		const transactionActions = actions.filter(a => a.action === 'transaction_created');
		const patterns: BehaviorPattern[] = [];

		if (transactionActions.length === 0) return patterns;

		// Analyze time of day patterns
		const timeOfDayCounts = new Map<string, number>();
		transactionActions.forEach(action => {
			try {
				const metadata = JSON.parse(action.metadata);
				const timeOfDay = metadata.timeOfDay;
				if (timeOfDay) {
					timeOfDayCounts.set(timeOfDay, (timeOfDayCounts.get(timeOfDay) || 0) + 1);
				}
			} catch (error) {
				console.warn('Failed to parse action metadata:', error);
			}
		});

		if (timeOfDayCounts.size > 0) {
			const mostCommonTime = Array.from(timeOfDayCounts.entries())
				.sort(([,a], [,b]) => b - a)[0];
			
			patterns.push({
				patternType: 'transaction_timing',
				confidence: 0.8,
				description: `Most transactions are created during ${mostCommonTime[0]}`,
				metadata: { timeOfDay: mostCommonTime[0], count: mostCommonTime[1] },
				firstObserved: actions[0]?.timestamp || '',
				lastObserved: actions[actions.length - 1]?.timestamp || '',
				frequency: mostCommonTime[1] / 30
			});
		}

		return patterns;
	}

	private analyzeBudgetAdherence(actions: UserAction[]): BehaviorPattern[] {
		const budgetActions = actions.filter(a => a.action === 'budget_checked');
		const patterns: BehaviorPattern[] = [];

		if (budgetActions.length === 0) return patterns;

		// Analyze budget checking frequency
		const dailyCounts = new Map<string, number>();
		budgetActions.forEach(action => {
			const date = action.timestamp.split('T')[0];
			dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
		});

		const averageChecksPerDay = Array.from(dailyCounts.values()).reduce((a, b) => a + b, 0) / dailyCounts.size;
		
		patterns.push({
			patternType: 'budget_adherence',
			confidence: 0.7,
			description: `Checks budget ${averageChecksPerDay.toFixed(1)} times per day on average`,
			metadata: { averageChecksPerDay, totalDays: dailyCounts.size },
			firstObserved: actions[0]?.timestamp || '',
			lastObserved: actions[actions.length - 1]?.timestamp || '',
			frequency: averageChecksPerDay * 30
		});

		return patterns;
	}

	private analyzeEngagementFrequency(actions: UserAction[]): BehaviorPattern[] {
		const patterns: BehaviorPattern[] = [];

		// Analyze overall engagement
		const dailyCounts = new Map<string, number>();
		actions.forEach(action => {
			const date = action.timestamp.split('T')[0];
			dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
		});

		const averageActionsPerDay = Array.from(dailyCounts.values()).reduce((a, b) => a + b, 0) / dailyCounts.size;
		
		patterns.push({
			patternType: 'engagement_frequency',
			confidence: 0.8,
			description: `Average of ${averageActionsPerDay.toFixed(1)} actions per day`,
			metadata: { averageActionsPerDay, totalDays: dailyCounts.size },
			firstObserved: actions[0]?.timestamp || '',
			lastObserved: actions[actions.length - 1]?.timestamp || '',
			frequency: averageActionsPerDay * 30
		});

		return patterns;
	}

	/**
	 * Get user preferences for tracking
	 */
	private async getUserPreferences(): Promise<UserPreferences | null> {
		try {
			const preferences = await settingsService.getUserPreferences();
			return preferences;
		} catch (error) {
			console.warn('Failed to get user preferences:', error);
			return null;
		}
	}

	/**
	 * Check if tracking is enabled based on user preferences
	 */
	private async isTrackingEnabled(): Promise<boolean> {
		const preferences = await this.getUserPreferences();
		return preferences?.userActionsTrackingEnabled ?? true;
	}

	/**
	 * Get tracking preferences
	 */
	private async getTrackingPreferences(): Promise<Record<string, boolean>> {
		const preferences = await this.getUserPreferences();
		return preferences?.userActionsTrackingPreferences ?? {
			transaction_timing: true,
			budget_adherence: true,
			spending_patterns: true,
			habit_formation: true
		};
	}
}

// ============================================================================
// SERVICE INSTANCE
// ============================================================================

export const userActionsService = new UserActionsService();

// ============================================================================
// PRIVACY UTILITIES (Simplified)
// ============================================================================

/**
 * Privacy utilities for data minimization and user control
 */
export const PrivacyUtils = {
	/**
	 * Check if tracking is enabled (legacy support)
	 */
	isTrackingEnabled(): boolean {
		return localStorage.getItem('budgic_tracking_enabled') !== 'false';
	},

	/**
	 * Enable or disable tracking (legacy support)
	 */
	setTrackingEnabled(enabled: boolean): void {
		localStorage.setItem('budgic_tracking_enabled', enabled.toString());
	},

	/**
	 * Get user's tracking preferences (legacy support)
	 */
	getTrackingPreferences(): Record<string, boolean> {
		const preferences = localStorage.getItem('budgic_tracking_preferences');
		return preferences ? JSON.parse(preferences) : {
			transaction_timing: true,
			budget_adherence: true,
			spending_patterns: true,
			habit_formation: true
		};
	},

	/**
	 * Set user's tracking preferences (legacy support)
	 */
	setTrackingPreferences(preferences: Record<string, boolean>): void {
		localStorage.setItem('budgic_tracking_preferences', JSON.stringify(preferences));
	}
}; 