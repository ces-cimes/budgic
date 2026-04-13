import { db } from '$lib/core/db';
import type { UserAction } from '$lib/core/db';
import { userService } from '../core/user-service';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AppUsageMetrics {
	totalSessions: number;
	totalActions: number;
	averageSessionDuration: number; // in seconds
	averageActionsPerSession: number;
	mostActiveDay: string;
	mostActiveHour: number;
	engagementScore: number; // 0-100
	featureUsage: FeatureUsage[];
	sessionFrequency: 'daily' | 'weekly' | 'monthly' | 'irregular';
	lastActiveDate: string;
	firstActiveDate: string;
}

export interface FeatureUsage {
	feature: string;
	usageCount: number;
	percentage: number;
	lastUsed: string;
	averageTimeSpent?: number; // in seconds
}

export interface SessionData {
	sessionId: string;
	startTime: string;
	endTime?: string;
	duration?: number; // in seconds
	actionCount: number;
	features: string[];
}

export interface UsagePattern {
	type: 'daily' | 'weekly' | 'monthly' | 'seasonal';
	title: string;
	description: string;
	confidence: number;
	pattern: Record<string, any>;
	metadata: {
		occurrences: number;
		timeframe: string;
		lastObserved: string;
	};
}

// ============================================================================
// APP USAGE ANALYTICS SERVICE
// ============================================================================

class AppUsageAnalyticsService {
	public get ready() {
		return Promise.resolve();
	}

	public isLoading() {
		return false;
	}

	// ============================================================================
	// USAGE METRICS
	// ============================================================================

	/**
	 * Get comprehensive app usage metrics
	 */
	async getUsageMetrics(days: number = 30): Promise<AppUsageMetrics> {
		const actions = await userService.getUserActions(days);

		if (actions.length === 0) {
			return this.getEmptyMetrics();
		}

		// Group actions by session
		const sessions = this.groupActionsBySession(actions);
		const totalSessions = sessions.size;
		const totalActions = actions.length;

		// Calculate session durations
		const sessionDurations: number[] = [];
		sessions.forEach((sessionActions) => {
			if (sessionActions.length > 1) {
				const start = new Date(sessionActions[0].timestamp);
				const end = new Date(sessionActions[sessionActions.length - 1].timestamp);
				const duration = (end.getTime() - start.getTime()) / 1000;
				sessionDurations.push(duration);
			}
		});

		const averageSessionDuration =
			sessionDurations.length > 0
				? sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length
				: 0;

		const averageActionsPerSession = totalSessions > 0 ? totalActions / totalSessions : 0;

		// Find most active day and hour
		const { mostActiveDay, mostActiveHour } = this.findMostActiveTime(actions);

		// Calculate feature usage
		const featureUsage = this.calculateFeatureUsage(actions);

		// Calculate engagement score (0-100)
		const engagementScore = this.calculateEngagementScore(
			totalSessions,
			totalActions,
			averageSessionDuration,
			days
		);

		// Determine session frequency
		const sessionFrequency = this.determineSessionFrequency(sessions, days);

		// Get date range
		const sortedActions = actions.sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
		const firstActiveDate = sortedActions[0]?.timestamp || new Date().toISOString();
		const lastActiveDate =
			sortedActions[sortedActions.length - 1]?.timestamp || new Date().toISOString();

		return {
			totalSessions,
			totalActions,
			averageSessionDuration: Math.round(averageSessionDuration),
			averageActionsPerSession: Math.round(averageActionsPerSession * 100) / 100,
			mostActiveDay,
			mostActiveHour,
			engagementScore,
			featureUsage,
			sessionFrequency,
			lastActiveDate,
			firstActiveDate
		};
	}

	/**
	 * Get detailed session data
	 */
	async getSessionData(days: number = 30): Promise<SessionData[]> {
		const actions = await userService.getUserActions(days);
		const sessions = this.groupActionsBySession(actions);

		const sessionData: SessionData[] = [];

		sessions.forEach((sessionActions, sessionId) => {
			const sortedActions = sessionActions.sort(
				(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
			);
			const startTime = sortedActions[0].timestamp;
			const endTime = sortedActions[sortedActions.length - 1].timestamp;
			const start = new Date(startTime);
			const end = new Date(endTime);
			const duration = (end.getTime() - start.getTime()) / 1000;

			const features = new Set<string>();
			sortedActions.forEach((action) => {
				// Extract feature from action type
				const feature = this.extractFeatureFromAction(action.action);
				if (feature) {
					features.add(feature);
				}
			});

			sessionData.push({
				sessionId,
				startTime,
				endTime,
				duration: Math.round(duration),
				actionCount: sortedActions.length,
				features: Array.from(features)
			});
		});

		return sessionData.sort(
			(a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
		);
	}

	/**
	 * Detect usage patterns
	 */
	async detectUsagePatterns(days: number = 90): Promise<UsagePattern[]> {
		const actions = await userService.getUserActions(days);

		if (actions.length < 10) {
			return [];
		}

		const patterns: UsagePattern[] = [];

		// Daily pattern detection
		const dailyPattern = this.detectDailyPattern(actions);
		if (dailyPattern) {
			patterns.push(dailyPattern);
		}

		// Weekly pattern detection
		const weeklyPattern = this.detectWeeklyPattern(actions);
		if (weeklyPattern) {
			patterns.push(weeklyPattern);
		}

		// Monthly pattern detection
		const monthlyPattern = this.detectMonthlyPattern(actions);
		if (monthlyPattern) {
			patterns.push(monthlyPattern);
		}

		return patterns;
	}

	/**
	 * Get feature adoption metrics
	 */
	async getFeatureAdoptionMetrics(): Promise<{
		adoptedFeatures: string[];
		underutilizedFeatures: string[];
		recommendations: string[];
	}> {
		const actions = await userService.getUserActions(90);
		const featureUsage = this.calculateFeatureUsage(actions);

		const adoptedFeatures = featureUsage.filter((f) => f.usageCount >= 10).map((f) => f.feature);

		const underutilizedFeatures = featureUsage
			.filter((f) => f.usageCount < 5 && f.percentage < 2)
			.map((f) => f.feature);

		const recommendations: string[] = [];
		if (underutilizedFeatures.length > 0) {
			recommendations.push(`Consider exploring: ${underutilizedFeatures.slice(0, 3).join(', ')}`);
		}

		return {
			adoptedFeatures,
			underutilizedFeatures,
			recommendations
		};
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	private groupActionsBySession(actions: UserAction[]): Map<string, UserAction[]> {
		const sessions = new Map<string, UserAction[]>();

		actions.forEach((action) => {
			const sessionId = action.sessionId || 'unknown';
			const sessionActions = sessions.get(sessionId) || [];
			sessionActions.push(action);
			sessions.set(sessionId, sessionActions);
		});

		return sessions;
	}

	private findMostActiveTime(actions: UserAction[]): {
		mostActiveDay: string;
		mostActiveHour: number;
	} {
		const dayCounts = new Map<string, number>();
		const hourCounts = new Map<number, number>();
		const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

		actions.forEach((action) => {
			const date = new Date(action.timestamp);
			const dayName = dayNames[date.getDay()];
			const hour = date.getHours();

			dayCounts.set(dayName, (dayCounts.get(dayName) || 0) + 1);
			hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
		});

		const mostActiveDay =
			Array.from(dayCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

		const mostActiveHour =
			Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 12;

		return { mostActiveDay, mostActiveHour };
	}

	private calculateFeatureUsage(actions: UserAction[]): FeatureUsage[] {
		const featureCounts = new Map<
			string,
			{ count: number; lastUsed: string; timestamps: string[] }
		>();

		actions.forEach((action) => {
			const feature = this.extractFeatureFromAction(action.action);
			if (feature) {
				const current = featureCounts.get(feature) || {
					count: 0,
					lastUsed: action.timestamp,
					timestamps: []
				};
				current.count++;
				if (new Date(action.timestamp) > new Date(current.lastUsed)) {
					current.lastUsed = action.timestamp;
				}
				current.timestamps.push(action.timestamp);
				featureCounts.set(feature, current);
			}
		});

		const totalActions = actions.length;
		const featureUsage: FeatureUsage[] = [];

		featureCounts.forEach((data, feature) => {
			const percentage = totalActions > 0 ? (data.count / totalActions) * 100 : 0;

			// Calculate average time spent if we have multiple timestamps
			let averageTimeSpent: number | undefined;
			if (data.timestamps.length > 1) {
				const sortedTimestamps = data.timestamps
					.map((ts) => new Date(ts).getTime())
					.sort((a, b) => a - b);

				const intervals: number[] = [];
				for (let i = 1; i < sortedTimestamps.length; i++) {
					intervals.push((sortedTimestamps[i] - sortedTimestamps[i - 1]) / 1000);
				}

				// Filter out very long intervals (likely different sessions)
				const reasonableIntervals = intervals.filter((interval) => interval < 3600); // Less than 1 hour
				if (reasonableIntervals.length > 0) {
					averageTimeSpent =
						reasonableIntervals.reduce((sum, interval) => sum + interval, 0) /
						reasonableIntervals.length;
				}
			}

			featureUsage.push({
				feature,
				usageCount: data.count,
				percentage: Math.round(percentage * 100) / 100,
				lastUsed: data.lastUsed,
				averageTimeSpent: averageTimeSpent ? Math.round(averageTimeSpent) : undefined
			});
		});

		return featureUsage.sort((a, b) => b.usageCount - a.usageCount);
	}

	private extractFeatureFromAction(action: string): string | null {
		// Map action types to features
		const actionToFeature: Record<string, string> = {
			view_accounts: 'Accounts',
			create_account: 'Accounts',
			update_account: 'Accounts',
			view_transactions: 'Transactions',
			create_transaction: 'Transactions',
			update_transaction: 'Transactions',
			delete_transaction: 'Transactions',
			create_split_transaction: 'Transactions',
			view_budget: 'Budget',
			create_budget: 'Budget',
			update_budget: 'Budget',
			check_budget: 'Budget',
			view_insights: 'Insights',
			view_analytics: 'Analytics',
			view_goals: 'Goals',
			create_goal: 'Goals',
			update_goal: 'Goals',
			view_settings: 'Settings',
			update_settings: 'Settings'
		};

		return actionToFeature[action] || null;
	}

	private calculateEngagementScore(
		totalSessions: number,
		totalActions: number,
		averageSessionDuration: number,
		days: number
	): number {
		// Base score from session frequency
		const sessionsPerDay = days > 0 ? totalSessions / days : 0;
		const sessionScore = Math.min(40, sessionsPerDay * 10);

		// Score from actions per session
		const actionsPerSession = totalSessions > 0 ? totalActions / totalSessions : 0;
		const actionScore = Math.min(30, actionsPerSession * 2);

		// Score from session duration (longer sessions = more engaged)
		const durationScore = Math.min(30, averageSessionDuration / 10);

		return Math.round(sessionScore + actionScore + durationScore);
	}

	private determineSessionFrequency(
		sessions: Map<string, UserAction[]>,
		days: number
	): 'daily' | 'weekly' | 'monthly' | 'irregular' {
		if (sessions.size === 0) {
			return 'irregular';
		}

		const sessionsPerDay = sessions.size / days;

		if (sessionsPerDay >= 0.7) {
			return 'daily'; // At least 5 sessions per week
		} else if (sessionsPerDay >= 0.14) {
			return 'weekly'; // At least 1 session per week
		} else if (sessionsPerDay >= 0.033) {
			return 'monthly'; // At least 1 session per month
		} else {
			return 'irregular';
		}
	}

	private detectDailyPattern(actions: UserAction[]): UsagePattern | null {
		if (actions.length < 7) {
			return null;
		}

		// Check if user is active most days
		const uniqueDays = new Set<string>();
		actions.forEach((action) => {
			const date = new Date(action.timestamp);
			const dayKey = date.toISOString().substring(0, 10);
			uniqueDays.add(dayKey);
		});

		const daysWithActivity = uniqueDays.size;
		const totalDays =
			Math.ceil(
				(new Date(actions[actions.length - 1].timestamp).getTime() -
					new Date(actions[0].timestamp).getTime()) /
					(1000 * 60 * 60 * 24)
			) + 1;

		if (totalDays > 0 && daysWithActivity / totalDays >= 0.7) {
			return {
				type: 'daily',
				title: 'Daily User',
				description: `You use the app on ${daysWithActivity} out of ${totalDays} days`,
				confidence: Math.min(100, Math.round((daysWithActivity / totalDays) * 100)),
				pattern: { daysWithActivity, totalDays },
				metadata: {
					occurrences: daysWithActivity,
					timeframe: `${totalDays} days`,
					lastObserved: actions[actions.length - 1].timestamp
				}
			};
		}

		return null;
	}

	private detectWeeklyPattern(actions: UserAction[]): UsagePattern | null {
		if (actions.length < 14) {
			return null;
		}

		// Group by week
		const weeklyCounts = new Map<string, number>();
		actions.forEach((action) => {
			const date = new Date(action.timestamp);
			const weekStart = this.getWeekStart(date);
			const weekKey = weekStart.toISOString().substring(0, 10);
			weeklyCounts.set(weekKey, (weeklyCounts.get(weekKey) || 0) + 1);
		});

		if (weeklyCounts.size >= 3) {
			const counts = Array.from(weeklyCounts.values());
			const avg = counts.reduce((sum, c) => sum + c, 0) / counts.length;
			const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
			const stdDev = Math.sqrt(variance);
			const coefficientOfVariation = avg > 0 ? stdDev / avg : 0;

			if (coefficientOfVariation < 0.3) {
				return {
					type: 'weekly',
					title: 'Consistent Weekly Usage',
					description: `You consistently use the app with an average of ${Math.round(avg)} actions per week`,
					confidence: Math.min(100, Math.round((1 - coefficientOfVariation) * 100)),
					pattern: { weeklyCounts: Object.fromEntries(weeklyCounts) },
					metadata: {
						occurrences: weeklyCounts.size,
						timeframe: `${weeklyCounts.size} weeks`,
						lastObserved: actions[actions.length - 1].timestamp
					}
				};
			}
		}

		return null;
	}

	private detectMonthlyPattern(actions: UserAction[]): UsagePattern | null {
		if (actions.length < 30) {
			return null;
		}

		// Group by month
		const monthlyCounts = new Map<string, number>();
		actions.forEach((action) => {
			const date = new Date(action.timestamp);
			const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
			monthlyCounts.set(monthKey, (monthlyCounts.get(monthKey) || 0) + 1);
		});

		if (monthlyCounts.size >= 3) {
			const counts = Array.from(monthlyCounts.values());
			const avg = counts.reduce((sum, c) => sum + c, 0) / counts.length;
			const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
			const stdDev = Math.sqrt(variance);
			const coefficientOfVariation = avg > 0 ? stdDev / avg : 0;

			if (coefficientOfVariation < 0.3) {
				return {
					type: 'monthly',
					title: 'Consistent Monthly Usage',
					description: `You consistently use the app with an average of ${Math.round(avg)} actions per month`,
					confidence: Math.min(100, Math.round((1 - coefficientOfVariation) * 100)),
					pattern: { monthlyCounts: Object.fromEntries(monthlyCounts) },
					metadata: {
						occurrences: monthlyCounts.size,
						timeframe: `${monthlyCounts.size} months`,
						lastObserved: actions[actions.length - 1].timestamp
					}
				};
			}
		}

		return null;
	}

	private getWeekStart(date: Date): Date {
		const d = new Date(date);
		const day = d.getDay();
		const diff = d.getDate() - day; // Sunday = 0
		return new Date(d.setDate(diff));
	}

	private getEmptyMetrics(): AppUsageMetrics {
		return {
			totalSessions: 0,
			totalActions: 0,
			averageSessionDuration: 0,
			averageActionsPerSession: 0,
			mostActiveDay: 'Unknown',
			mostActiveHour: 12,
			engagementScore: 0,
			featureUsage: [],
			sessionFrequency: 'irregular',
			lastActiveDate: new Date().toISOString(),
			firstActiveDate: new Date().toISOString()
		};
	}
}

export const appUsageAnalyticsService = new AppUsageAnalyticsService();
