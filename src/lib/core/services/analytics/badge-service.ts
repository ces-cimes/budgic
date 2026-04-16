import { db, generateUUID } from '$lib/core/db';
import { goalService } from '../core/goal-service';
import { budgetService } from '../core/budget-service';
import { transactionService } from '../core/transaction-service';
import { accountService } from '../core/account-service';
import { userService } from '../core/user-service';
import type { Badge, Goal, Transaction, Category, UserAction } from '$lib/core/db';
import type { BadgeInsight } from '$lib/components/insights/types';

/**
 * Badge Service - Achievement tracking system
 *
 * Tracks and unlocks achievements based on:
 * - Budget adherence (streaks, staying within budget)
 * - Goal milestones (completions, progress)
 * - Behavioral patterns (daily logging, consistency)
 * - Financial milestones (savings, net worth)
 * - App usage (feature exploration, engagement)
 */
class BadgeService {
	private lastCheckTime = 0;
	private checkFrequency = 5 * 60 * 1000; // 5 minutes
	private isChecking = false;

	public get ready() {
		return Promise.resolve();
	}

	/**
	 * Get all badges (unlocked and locked)
	 */
	async getBadges(): Promise<BadgeInsight[]> {
		const unlockedBadges = await db.getUnlockedBadges();
		const allBadgeDefinitions = this.getAllBadgeDefinitions();

		// Map unlocked badges to BadgeInsight format
		const badgeMap = new Map<string, BadgeInsight>();

		// Add unlocked badges
		for (const badge of unlockedBadges) {
			const progress = badge.progress ? JSON.parse(badge.progress) : undefined;
			const metadata = badge.metadata ? JSON.parse(badge.metadata) : {};

			badgeMap.set(badge.badgeId, {
				id: badge.id,
				type: badge.type,
				title: badge.title,
				description: badge.description,
				badgeType: badge.badgeType,
				rarity: badge.rarity,
				category: badge.category,
				progress,
				unlockedAt: badge.unlockedAt || '',
				metadata
			});
		}

		// Add locked badges (not yet unlocked)
		for (const definition of allBadgeDefinitions) {
			if (!badgeMap.has(definition.badgeId)) {
				// Check progress for locked badges
				const progress = await this.checkBadgeProgress(definition.badgeId);
				badgeMap.set(definition.badgeId, {
					id: definition.badgeId,
					type: definition.type,
					title: definition.title,
					description: definition.description,
					badgeType: definition.badgeType,
					rarity: definition.rarity,
					category: definition.category,
					progress,
					unlockedAt: '',
					metadata: definition.metadata || {}
				});
			}
		}

		return Array.from(badgeMap.values());
	}

	/**
	 * Check all badge types and unlock any that are achieved
	 */
	async checkAllBadges(force: boolean = false): Promise<Badge[]> {
		const now = Date.now();
		if (!force && now - this.lastCheckTime < this.checkFrequency) {
			return [];
		}

		if (this.isChecking) {
			return [];
		}

		this.isChecking = true;
		this.lastCheckTime = now;

		try {
			const unlockedBadges: Badge[] = [];

			// Check each badge category
			const budgetBadges = await this.checkBudgetBadges();
			unlockedBadges.push(...budgetBadges);

			const goalBadges = await this.checkGoalBadges();
			unlockedBadges.push(...goalBadges);

			const behavioralBadges = await this.checkBehavioralBadges();
			unlockedBadges.push(...behavioralBadges);

			const financialBadges = await this.checkFinancialMilestones();
			unlockedBadges.push(...financialBadges);

			const appUsageBadges = await this.checkAppUsageBadges();
			unlockedBadges.push(...appUsageBadges);

			return unlockedBadges;
		} catch (error) {
			console.error('Error checking badges:', error);
			return [];
		} finally {
			this.isChecking = false;
		}
	}

	/**
	 * Check budget-related badges
	 */
	async checkBudgetBadges(): Promise<Badge[]> {
		const unlocked: Badge[] = [];
		const categories = await db.getActiveCategories();
		const transactions = await db.getActiveTransactions();
		const now = new Date();

		// Check budget adherence streaks
		const budgetStreaks = await this.calculateBudgetStreaks(categories, transactions);

		// Budget streak badges
		const streakBadges = [
			{ days: 7, badgeId: 'budget_streak_7', rarity: 'common' as const },
			{ days: 30, badgeId: 'budget_streak_30', rarity: 'uncommon' as const },
			{ days: 90, badgeId: 'budget_streak_90', rarity: 'rare' as const },
			{ days: 180, badgeId: 'budget_streak_180', rarity: 'epic' as const },
			{ days: 365, badgeId: 'budget_streak_365', rarity: 'legendary' as const }
		];

		for (const streakBadge of streakBadges) {
			if (budgetStreaks.maxStreak >= streakBadge.days) {
				const badge = await this.unlockBadgeIfNew({
					badgeId: streakBadge.badgeId,
					type: 'budget_badge',
					title: `${streakBadge.days} Day Budget Streak`,
					description: `Stayed within budget for ${streakBadge.days} consecutive days`,
					badgeType: 'streak',
					rarity: streakBadge.rarity,
					category: 'survival',
					metadata: JSON.stringify({ streakDays: budgetStreaks.maxStreak })
				});
				if (badge) unlocked.push(badge);
			}
		}

		// Perfect month badge
		const perfectMonth = await this.checkPerfectMonth(categories, transactions);
		if (perfectMonth) {
			const badge = await this.unlockBadgeIfNew({
				badgeId: 'budget_perfect_month',
				type: 'budget_badge',
				title: 'Perfect Month',
				description: 'Stayed within budget for all categories in a month',
				badgeType: 'achievement',
				rarity: 'rare',
				category: 'survival',
				metadata: JSON.stringify({ timeframe: 'month' })
			});
			if (badge) unlocked.push(badge);
		}

		return unlocked;
	}

	/**
	 * Check goal-related badges
	 */
	async checkGoalBadges(): Promise<Badge[]> {
		const unlocked: Badge[] = [];
		const goals = await goalService.getGoals();

		// First goal completed
		const completedGoals = goals.filter((g) => g.status === 'completed');
		if (completedGoals.length === 1) {
			const badge = await this.unlockBadgeIfNew({
				badgeId: 'goal_first_completion',
				type: 'goal_milestone',
				title: 'First Goal Achieved',
				description: 'Completed your first financial goal',
				badgeType: 'milestone_reached',
				rarity: 'common',
				category: 'growth',
				metadata: JSON.stringify({ goalCount: 1 })
			});
			if (badge) unlocked.push(badge);
		}

		// Multiple goal completions
		const goalCountBadges = [
			{ count: 5, badgeId: 'goal_completion_5', rarity: 'uncommon' as const },
			{ count: 10, badgeId: 'goal_completion_10', rarity: 'rare' as const },
			{ count: 25, badgeId: 'goal_completion_25', rarity: 'epic' as const }
		];

		for (const goalBadge of goalCountBadges) {
			if (completedGoals.length >= goalBadge.count) {
				const badge = await this.unlockBadgeIfNew({
					badgeId: goalBadge.badgeId,
					type: 'goal_milestone',
					title: `${goalBadge.count} Goals Completed`,
					description: `Completed ${goalBadge.count} goals`,
					badgeType: 'milestone_reached',
					rarity: goalBadge.rarity,
					category: 'growth',
					metadata: JSON.stringify({ goalCount: completedGoals.length })
				});
				if (badge) unlocked.push(badge);
			}
		}

		// Emergency fund goal
		const emergencyFundGoal = goals.find(
			(g) => g.category === 'emergency_fund' && g.status === 'completed'
		);
		if (emergencyFundGoal) {
			const badge = await this.unlockBadgeIfNew({
				badgeId: 'goal_emergency_fund',
				type: 'goal_milestone',
				title: 'Emergency Fund Complete',
				description: 'Built your emergency fund',
				badgeType: 'milestone_reached',
				rarity: 'rare',
				category: 'security',
				metadata: JSON.stringify({
					amount: emergencyFundGoal.targetAmount,
					category: 'emergency_fund'
				})
			});
			if (badge) unlocked.push(badge);
		}

		return unlocked;
	}

	/**
	 * Check behavioral badges
	 */
	async checkBehavioralBadges(): Promise<Badge[]> {
		const unlocked: Badge[] = [];
		const userActions = await userService.getUserActions(90); // Last 90 days
		const transactions = await db.getActiveTransactions();

		// Daily logging streak
		const loggingStreak = this.calculateLoggingStreak(userActions, transactions);
		const streakBadges = [
			{ days: 7, badgeId: 'behavioral_logging_streak_7', rarity: 'common' as const },
			{ days: 30, badgeId: 'behavioral_logging_streak_30', rarity: 'uncommon' as const },
			{ days: 90, badgeId: 'behavioral_logging_streak_90', rarity: 'rare' as const }
		];

		for (const streakBadge of streakBadges) {
			if (loggingStreak >= streakBadge.days) {
				const badge = await this.unlockBadgeIfNew({
					badgeId: streakBadge.badgeId,
					type: 'behavioral_badge',
					title: `${streakBadge.days} Day Logging Streak`,
					description: `Logged transactions for ${streakBadge.days} consecutive days`,
					badgeType: 'streak',
					rarity: streakBadge.rarity,
					category: 'system',
					metadata: JSON.stringify({ streakDays: loggingStreak })
				});
				if (badge) unlocked.push(badge);
			}
		}

		// Transaction count milestones
		const transactionCount = transactions.length;
		const transactionBadges = [
			{ count: 10, badgeId: 'behavioral_transactions_10', rarity: 'common' as const },
			{ count: 50, badgeId: 'behavioral_transactions_50', rarity: 'uncommon' as const },
			{ count: 100, badgeId: 'behavioral_transactions_100', rarity: 'rare' as const },
			{ count: 500, badgeId: 'behavioral_transactions_500', rarity: 'epic' as const }
		];

		for (const transactionBadge of transactionBadges) {
			if (transactionCount >= transactionBadge.count) {
				const badge = await this.unlockBadgeIfNew({
					badgeId: transactionBadge.badgeId,
					type: 'behavioral_badge',
					title: `${transactionBadge.count} Transactions`,
					description: `Logged ${transactionBadge.count} transactions`,
					badgeType: 'achievement',
					rarity: transactionBadge.rarity,
					category: 'system',
					metadata: JSON.stringify({ transactionCount })
				});
				if (badge) unlocked.push(badge);
			}
		}

		return unlocked;
	}

	/**
	 * Check financial milestone badges
	 */
	async checkFinancialMilestones(): Promise<Badge[]> {
		const unlocked: Badge[] = [];
		const accounts = await accountService.getAccounts();
		const goals = await goalService.getGoals();

		// Calculate total savings
		const totalSavings = accounts
			.filter((a) => a.type === 'savings')
			.reduce((sum, a) => sum + (a.currentBalance || 0), 0);

		// Savings milestones
		const savingsBadges = [
			{ amount: 1000, badgeId: 'financial_savings_1k', rarity: 'common' as const },
			{ amount: 5000, badgeId: 'financial_savings_5k', rarity: 'uncommon' as const },
			{ amount: 10000, badgeId: 'financial_savings_10k', rarity: 'rare' as const },
			{ amount: 25000, badgeId: 'financial_savings_25k', rarity: 'epic' as const },
			{ amount: 50000, badgeId: 'financial_savings_50k', rarity: 'legendary' as const }
		];

		for (const savingsBadge of savingsBadges) {
			if (totalSavings >= savingsBadge.amount) {
				const badge = await this.unlockBadgeIfNew({
					badgeId: savingsBadge.badgeId,
					type: 'financial_milestone',
					title: `$${savingsBadge.amount.toLocaleString()} Saved`,
					description: `Accumulated $${savingsBadge.amount.toLocaleString()} in savings`,
					badgeType: 'milestone',
					rarity: savingsBadge.rarity,
					category: 'security',
					metadata: JSON.stringify({ amount: totalSavings })
				});
				if (badge) unlocked.push(badge);
			}
		}

		// Net worth milestones (simplified - sum of all account balances)
		const netWorth = accounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0);
		if (netWorth > 0) {
			const netWorthBadges = [
				{ amount: 10000, badgeId: 'financial_networth_10k', rarity: 'uncommon' as const },
				{ amount: 50000, badgeId: 'financial_networth_50k', rarity: 'rare' as const },
				{ amount: 100000, badgeId: 'financial_networth_100k', rarity: 'epic' as const }
			];

			for (const netWorthBadge of netWorthBadges) {
				if (netWorth >= netWorthBadge.amount) {
					const badge = await this.unlockBadgeIfNew({
						badgeId: netWorthBadge.badgeId,
						type: 'financial_milestone',
						title: `$${netWorthBadge.amount.toLocaleString()} Net Worth`,
						description: `Reached $${netWorthBadge.amount.toLocaleString()} net worth`,
						badgeType: 'milestone',
						rarity: netWorthBadge.rarity,
						category: 'growth',
						metadata: JSON.stringify({ amount: netWorth })
					});
					if (badge) unlocked.push(badge);
				}
			}
		}

		return unlocked;
	}

	/**
	 * Check app usage badges
	 */
	async checkAppUsageBadges(): Promise<Badge[]> {
		const unlocked: Badge[] = [];
		const userActions = await userService.getUserActions(90);

		// Feature exploration badges
		const actionTypes = new Set(userActions.map((a) => a.action));

		// Check if user has used key features
		const hasCreatedTransaction = actionTypes.has('transaction_created');
		const hasCheckedBudget = actionTypes.has('budget_checked');
		const hasCreatedGoal =
			actionTypes.has('goal_created') || (await goalService.getGoals()).length > 0;
		const hasViewedInsights = actionTypes.has('insights_viewed');

		if (hasCreatedTransaction && hasCheckedBudget && hasCreatedGoal) {
			const badge = await this.unlockBadgeIfNew({
				badgeId: 'app_usage_all_features',
				type: 'app_usage_badge',
				title: 'Feature Explorer',
				description: 'Used all major features of the app',
				badgeType: 'achievement',
				rarity: 'uncommon',
				category: 'system',
				metadata: JSON.stringify({ features: ['transactions', 'budget', 'goals'] })
			});
			if (badge) unlocked.push(badge);
		}

		return unlocked;
	}

	/**
	 * Get progress for a specific badge (even if not unlocked)
	 */
	async checkBadgeProgress(
		badgeId: string
	): Promise<{ current: number; target: number; percentage: number } | undefined> {
		// This would check current progress for locked badges
		// For now, return undefined (can be enhanced later)
		return undefined;
	}

	/**
	 * Mark a badge as notified
	 */
	async markBadgeNotified(badgeId: string): Promise<void> {
		await db.markBadgeNotified(badgeId);
	}

	/**
	 * Unlock a badge if it's new (not already unlocked)
	 */
	private async unlockBadgeIfNew(
		badgeData: Omit<Badge, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'unlockedAt'>
	): Promise<Badge | null> {
		const existing = await db.getBadgeByBadgeId(badgeData.badgeId);
		if (existing && existing.unlockedAt) {
			return null; // Already unlocked
		}

		return await db.unlockBadge({
			...badgeData,
			unlockedAt: new Date().toISOString()
		});
	}

	/**
	 * Calculate budget adherence streaks
	 */
	private async calculateBudgetStreaks(
		categories: Category[],
		transactions: Transaction[]
	): Promise<{ maxStreak: number; currentStreak: number }> {
		// Simplified streak calculation
		// In a real implementation, this would check daily budget adherence
		const now = new Date();
		const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

		const recentTransactions = transactions.filter((t) => {
			const date = t.clearedDate ? new Date(t.clearedDate) : new Date(t.createdAt);
			return date >= thirtyDaysAgo;
		});

		// For now, return a simple calculation
		// A real implementation would check daily budget compliance
		const daysWithTransactions = new Set(
			recentTransactions.map((t) => {
				const date = t.clearedDate ? new Date(t.clearedDate) : new Date(t.createdAt);
				return date.toISOString().split('T')[0];
			})
		);

		return {
			maxStreak: Math.min(daysWithTransactions.size, 30),
			currentStreak: daysWithTransactions.size
		};
	}

	/**
	 * Check if user had a perfect month (stayed within all budgets)
	 */
	private async checkPerfectMonth(
		categories: Category[],
		transactions: Transaction[]
	): Promise<boolean> {
		// Simplified check - would need actual budget vs spending comparison
		// For now, return false as placeholder
		return false;
	}

	/**
	 * Calculate logging streak (consecutive days with transaction logging)
	 */
	private calculateLoggingStreak(userActions: UserAction[], transactions: Transaction[]): number {
		const now = new Date();
		const dates = new Set<string>();

		// Get dates from transactions
		transactions.forEach((t) => {
			const date = t.clearedDate ? new Date(t.clearedDate) : new Date(t.createdAt);
			dates.add(date.toISOString().split('T')[0]);
		});

		// Get dates from user actions
		userActions.forEach((a) => {
			const date = new Date(a.timestamp);
			dates.add(date.toISOString().split('T')[0]);
		});

		// Calculate consecutive days from today backwards
		let streak = 0;
		for (let i = 0; i < 90; i++) {
			const checkDate = new Date(now);
			checkDate.setDate(checkDate.getDate() - i);
			const dateStr = checkDate.toISOString().split('T')[0];

			if (dates.has(dateStr)) {
				streak++;
			} else {
				break;
			}
		}

		return streak;
	}

	/**
	 * Get all badge definitions (for displaying locked badges)
	 */
	private getAllBadgeDefinitions(): Array<{
		badgeId: string;
		type: Badge['type'];
		title: string;
		description: string;
		badgeType: Badge['badgeType'];
		rarity: Badge['rarity'];
		category: Badge['category'];
		metadata?: Record<string, any>;
	}> {
		return [
			// Budget badges
			{
				badgeId: 'budget_streak_7',
				type: 'budget_badge',
				title: '7 Day Budget Streak',
				description: 'Stayed within budget for 7 consecutive days',
				badgeType: 'streak',
				rarity: 'common',
				category: 'survival'
			},
			{
				badgeId: 'budget_streak_30',
				type: 'budget_badge',
				title: '30 Day Budget Streak',
				description: 'Stayed within budget for 30 consecutive days',
				badgeType: 'streak',
				rarity: 'uncommon',
				category: 'survival'
			},
			{
				badgeId: 'budget_streak_90',
				type: 'budget_badge',
				title: '90 Day Budget Streak',
				description: 'Stayed within budget for 90 consecutive days',
				badgeType: 'streak',
				rarity: 'rare',
				category: 'survival'
			},
			{
				badgeId: 'budget_streak_180',
				type: 'budget_badge',
				title: '180 Day Budget Streak',
				description: 'Stayed within budget for 180 consecutive days',
				badgeType: 'streak',
				rarity: 'epic',
				category: 'survival'
			},
			{
				badgeId: 'budget_streak_365',
				type: 'budget_badge',
				title: '365 Day Budget Streak',
				description: 'Stayed within budget for 365 consecutive days',
				badgeType: 'streak',
				rarity: 'legendary',
				category: 'survival'
			},
			{
				badgeId: 'budget_perfect_month',
				type: 'budget_badge',
				title: 'Perfect Month',
				description: 'Stayed within budget for all categories in a month',
				badgeType: 'achievement',
				rarity: 'rare',
				category: 'survival'
			},
			// Goal badges
			{
				badgeId: 'goal_first_completion',
				type: 'goal_milestone',
				title: 'First Goal Achieved',
				description: 'Completed your first financial goal',
				badgeType: 'milestone_reached',
				rarity: 'common',
				category: 'growth'
			},
			{
				badgeId: 'goal_completion_5',
				type: 'goal_milestone',
				title: '5 Goals Completed',
				description: 'Completed 5 goals',
				badgeType: 'milestone_reached',
				rarity: 'uncommon',
				category: 'growth'
			},
			{
				badgeId: 'goal_completion_10',
				type: 'goal_milestone',
				title: '10 Goals Completed',
				description: 'Completed 10 goals',
				badgeType: 'milestone_reached',
				rarity: 'rare',
				category: 'growth'
			},
			{
				badgeId: 'goal_completion_25',
				type: 'goal_milestone',
				title: '25 Goals Completed',
				description: 'Completed 25 goals',
				badgeType: 'milestone_reached',
				rarity: 'epic',
				category: 'growth'
			},
			{
				badgeId: 'goal_emergency_fund',
				type: 'goal_milestone',
				title: 'Emergency Fund Complete',
				description: 'Built your emergency fund',
				badgeType: 'milestone_reached',
				rarity: 'rare',
				category: 'security'
			},
			// Behavioral badges
			{
				badgeId: 'behavioral_logging_streak_7',
				type: 'behavioral_badge',
				title: '7 Day Logging Streak',
				description: 'Logged transactions for 7 consecutive days',
				badgeType: 'streak',
				rarity: 'common',
				category: 'system'
			},
			{
				badgeId: 'behavioral_logging_streak_30',
				type: 'behavioral_badge',
				title: '30 Day Logging Streak',
				description: 'Logged transactions for 30 consecutive days',
				badgeType: 'streak',
				rarity: 'uncommon',
				category: 'system'
			},
			{
				badgeId: 'behavioral_logging_streak_90',
				type: 'behavioral_badge',
				title: '90 Day Logging Streak',
				description: 'Logged transactions for 90 consecutive days',
				badgeType: 'streak',
				rarity: 'rare',
				category: 'system'
			},
			{
				badgeId: 'behavioral_transactions_10',
				type: 'behavioral_badge',
				title: '10 Transactions',
				description: 'Logged 10 transactions',
				badgeType: 'achievement',
				rarity: 'common',
				category: 'system'
			},
			{
				badgeId: 'behavioral_transactions_50',
				type: 'behavioral_badge',
				title: '50 Transactions',
				description: 'Logged 50 transactions',
				badgeType: 'achievement',
				rarity: 'uncommon',
				category: 'system'
			},
			{
				badgeId: 'behavioral_transactions_100',
				type: 'behavioral_badge',
				title: '100 Transactions',
				description: 'Logged 100 transactions',
				badgeType: 'achievement',
				rarity: 'rare',
				category: 'system'
			},
			{
				badgeId: 'behavioral_transactions_500',
				type: 'behavioral_badge',
				title: '500 Transactions',
				description: 'Logged 500 transactions',
				badgeType: 'achievement',
				rarity: 'epic',
				category: 'system'
			},
			// Financial milestones
			{
				badgeId: 'financial_savings_1k',
				type: 'financial_milestone',
				title: '$1,000 Saved',
				description: 'Accumulated $1,000 in savings',
				badgeType: 'milestone',
				rarity: 'common',
				category: 'security'
			},
			{
				badgeId: 'financial_savings_5k',
				type: 'financial_milestone',
				title: '$5,000 Saved',
				description: 'Accumulated $5,000 in savings',
				badgeType: 'milestone',
				rarity: 'uncommon',
				category: 'security'
			},
			{
				badgeId: 'financial_savings_10k',
				type: 'financial_milestone',
				title: '$10,000 Saved',
				description: 'Accumulated $10,000 in savings',
				badgeType: 'milestone',
				rarity: 'rare',
				category: 'security'
			},
			{
				badgeId: 'financial_savings_25k',
				type: 'financial_milestone',
				title: '$25,000 Saved',
				description: 'Accumulated $25,000 in savings',
				badgeType: 'milestone',
				rarity: 'epic',
				category: 'security'
			},
			{
				badgeId: 'financial_savings_50k',
				type: 'financial_milestone',
				title: '$50,000 Saved',
				description: 'Accumulated $50,000 in savings',
				badgeType: 'milestone',
				rarity: 'legendary',
				category: 'security'
			},
			{
				badgeId: 'financial_networth_10k',
				type: 'financial_milestone',
				title: '$10,000 Net Worth',
				description: 'Reached $10,000 net worth',
				badgeType: 'milestone',
				rarity: 'uncommon',
				category: 'growth'
			},
			{
				badgeId: 'financial_networth_50k',
				type: 'financial_milestone',
				title: '$50,000 Net Worth',
				description: 'Reached $50,000 net worth',
				badgeType: 'milestone',
				rarity: 'rare',
				category: 'growth'
			},
			{
				badgeId: 'financial_networth_100k',
				type: 'financial_milestone',
				title: '$100,000 Net Worth',
				description: 'Reached $100,000 net worth',
				badgeType: 'milestone',
				rarity: 'epic',
				category: 'growth'
			},
			// App usage badges
			{
				badgeId: 'app_usage_all_features',
				type: 'app_usage_badge',
				title: 'Feature Explorer',
				description: 'Used all major features of the app',
				badgeType: 'achievement',
				rarity: 'uncommon',
				category: 'system'
			}
		];
	}
}

export const badgeService = new BadgeService();
