/**
 * Learning & Adaptation Service
 *
 * Implements the learning and adaptation system that:
 * - Detects spending and income patterns from transaction history
 * - Adapts budget allowances based on actual spending
 * - Learns user preferences from feedback
 * - Personalizes recommendations based on behavior
 * - Tracks and applies user feedback to improve suggestions
 *
 * Features:
 * - Pattern Recognition (day-of-week, weekly, monthly, seasonal, income patterns)
 * - Adaptive Adjustments (allowance auto-tuning, buffer auto-tuning, flexibility learning)
 * - Data Quality Checks (outlier detection, duplicate detection, mis-categorization)
 * - User Feedback Integration (track acceptance rates, learn preferences)
 */

import { db, generateUUID } from '$lib/core/db';
import type {
	Transaction,
	Category,
	LearningPattern,
	UserFeedback,
	OptimizationPreference,
	Account
} from '$lib/core/db';
import { behavioralAnalysisService } from './behavioral-analysis-service';
import { transactionService } from '../core/transaction-service';
import { accountService } from '../core/account-service';
import { budgetService } from '../core/budget-service';
import { getBufferAmount } from '$lib/utils/account-metadata-utils';
import { canonicalDuplicateKey, iqrFilter, iqrOutlierScore } from '$lib/utils/data-quality-utils';
import { subMonths, startOfMonth, endOfMonth, parseISO, format, isAfter, isBefore } from 'date-fns';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface PatternDetectionResult {
	pattern: LearningPattern;
	confidence: number;
	metadata: {
		occurrences: number;
		minimumOccurrences: number;
		variance: number;
		coefficientOfVariation: number;
		timeframe: string;
		lastObserved: string;
		firstObserved: string;
	};
}

export interface AllowanceAdjustmentSuggestion {
	categoryId: string;
	categoryName: string;
	currentAllowance: number;
	suggestedAllowance: number;
	actualAverage: number;
	variance: number;
	consecutiveMonths: number;
	confidence: number;
	requiresConfirmation: boolean; // true if change > 25%
}

export interface BufferAdjustmentSuggestion {
	accountId: string;
	accountName: string;
	currentBuffer: number;
	suggestedBuffer: number;
	actualMinimums: number[];
	comfortThreshold: number;
	reason: 'over_buffering' | 'under_buffering';
	confidence: number;
}

export interface FlexibilityLearningResult {
	categoryId: string;
	categoryName: string;
	currentFlexibility: number; // 0-1 score
	learnedFlexibility: number;
	suggestionCount: number;
	acceptanceRate: number;
	confidence: number;
}

export interface DataQualityIssue {
	type: 'duplicate' | 'outlier' | 'mis_categorized' | 'unusual_amount' | 'unusual_date';
	transactionId: string;
	severity: 'low' | 'medium' | 'high';
	description: string;
	suggestedAction?: string;
}

export interface FeedbackAnalysis {
	suggestionType: string;
	totalSuggestions: number;
	accepted: number;
	rejected: number;
	modified: number;
	dismissed: number;
	acceptanceRate: number;
	shouldAdjustWeight: boolean;
	newWeight?: number;
}

// ============================================================================
// LEARNING & ADAPTATION SERVICE
// ============================================================================

class LearningAdaptationService {
	private readonly MIN_PATTERN_OCCURRENCES = {
		day_of_week: 3,
		weekly: 3,
		monthly: 3,
		seasonal: 4,
		life_event: 3,
		income_frequency: 3,
		income_amount: 3,
		paycheck_shift: 2
	};

	private readonly MIN_DATA_PERIODS = {
		weekly: 3, // months
		monthly: 6, // months
		seasonal: 12, // months
		day_of_week: 3, // months
		income_frequency: 3, // months
		income_amount: 3, // months
		paycheck_shift: 6 // months
	};

	private readonly VARIANCE_THRESHOLD = 0.3; // Coefficient of variation < 0.3
	private readonly CONFIDENCE_THRESHOLD = 70; // >70% confidence
	private readonly ALLOWANCE_TUNING_SMOOTHING = 0.3; // Gradual adjustment
	private readonly MAX_ALLOWANCE_CHANGE = 0.25; // ±25% max change per period
	private readonly ALLOWANCE_VARIANCE_THRESHOLD = 0.2; // 20% variance triggers suggestion
	private readonly MIN_FEEDBACK_COUNT = 5; // Minimum feedback before adjusting flexibility

	public get ready() {
		return Promise.resolve();
	}

	public isLoading() {
		return false;
	}

	// ============================================================================
	// PATTERN RECOGNITION
	// ============================================================================

	/**
	 * Detect all spending and income patterns from transaction history
	 */
	async detectAllPatterns(days: number = 180): Promise<PatternDetectionResult[]> {
		const results: PatternDetectionResult[] = [];
		const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

		// Get transactions
		const transactions = await db.transactions
			.where('clearedDate')
			.above(cutoffDate.toISOString())
			.and((tx) => !tx.deletedAt && tx.status === 'cleared')
			.toArray();

		if (transactions.length < 10) {
			return []; // Not enough data
		}

		// Detect day-of-week patterns
		const dayOfWeekPatterns = await this.detectDayOfWeekPatterns(transactions);
		results.push(...dayOfWeekPatterns);

		// Detect weekly patterns
		const weeklyPatterns = await this.detectWeeklyPatterns(transactions);
		results.push(...weeklyPatterns);

		// Detect monthly patterns
		const monthlyPatterns = await this.detectMonthlyPatterns(transactions);
		results.push(...monthlyPatterns);

		// Detect seasonal patterns
		if (days >= 365) {
			const seasonalPatterns = await this.detectSeasonalPatterns(transactions);
			results.push(...seasonalPatterns);
		}

		// Detect income patterns
		const incomePatterns = await this.detectIncomePatterns(transactions);
		results.push(...incomePatterns);

		// Store confirmed patterns
		for (const result of results) {
			if (result.confidence >= this.CONFIDENCE_THRESHOLD) {
				await this.storePattern(result.pattern);
			}
		}

		return results;
	}

	/**
	 * Detect day-of-week spending patterns
	 */
	private async detectDayOfWeekPatterns(
		transactions: Transaction[]
	): Promise<PatternDetectionResult[]> {
		const results: PatternDetectionResult[] = [];
		const dayNames = [
			'sunday',
			'monday',
			'tuesday',
			'wednesday',
			'thursday',
			'friday',
			'saturday'
		];
		const dayData = new Map<string, number[]>();

		// Group transactions by day of week
		transactions
			.filter((tx) => tx.type === 'expense' && tx.clearedDate)
			.forEach((tx) => {
				const date = parseISO(tx.clearedDate!);
				const dayName = dayNames[date.getDay()];
				const amounts = dayData.get(dayName) || [];
				amounts.push(Math.abs(tx.amount || 0));
				dayData.set(dayName, amounts);
			});

		// Analyze each day
		for (const [day, amounts] of dayData.entries()) {
			if (amounts.length < this.MIN_PATTERN_OCCURRENCES.day_of_week) {
				continue;
			}

			const avg = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
			const variance =
				amounts.reduce((sum, amt) => sum + Math.pow(amt - avg, 2), 0) / amounts.length;
			const stdDev = Math.sqrt(variance);
			const coefficientOfVariation = avg > 0 ? stdDev / avg : 0;

			if (coefficientOfVariation < this.VARIANCE_THRESHOLD) {
				const confidence = Math.min(100, Math.round((1 - coefficientOfVariation) * 100));
				if (confidence >= this.CONFIDENCE_THRESHOLD) {
					const pattern: LearningPattern = {
						id: generateUUID(),
						patternType: 'day_of_week',
						title: `Weekend Spending Pattern`,
						description: `Higher spending detected on ${day}s`,
						confidence,
						frequency: 'weekly',
						pattern: JSON.stringify({ day, averageAmount: avg, amounts }),
						metadata: JSON.stringify({
							occurrences: amounts.length,
							minimumOccurrences: this.MIN_PATTERN_OCCURRENCES.day_of_week,
							variance,
							coefficientOfVariation,
							timeframe: `${transactions.length} transactions`,
							lastObserved: new Date().toISOString(),
							firstObserved: transactions[0]?.clearedDate || new Date().toISOString()
						}),
						isActive: true,
						appliedToProjections: false,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						deletedAt: null
					};

					results.push({
						pattern,
						confidence,
						metadata: JSON.parse(pattern.metadata)
					});
				}
			}
		}

		return results;
	}

	/**
	 * Detect weekly spending patterns
	 */
	private async detectWeeklyPatterns(
		transactions: Transaction[]
	): Promise<PatternDetectionResult[]> {
		const results: PatternDetectionResult[] = [];
		const weeklyData = new Map<string, number[]>();

		// Group by week
		transactions
			.filter((tx) => tx.type === 'expense' && tx.clearedDate)
			.forEach((tx) => {
				const date = parseISO(tx.clearedDate!);
				const weekStart = this.getWeekStart(date);
				const weekKey = format(weekStart, 'yyyy-MM-dd');
				const amounts = weeklyData.get(weekKey) || [];
				amounts.push(Math.abs(tx.amount || 0));
				weeklyData.set(weekKey, amounts);
			});

		if (weeklyData.size < this.MIN_PATTERN_OCCURRENCES.weekly) {
			return [];
		}

		const weeklyTotals = Array.from(weeklyData.values()).map((amounts) =>
			amounts.reduce((sum, amt) => sum + amt, 0)
		);
		const avg = weeklyTotals.reduce((sum, amt) => sum + amt, 0) / weeklyTotals.length;
		const variance =
			weeklyTotals.reduce((sum, amt) => sum + Math.pow(amt - avg, 2), 0) /
			weeklyTotals.length;
		const stdDev = Math.sqrt(variance);
		const coefficientOfVariation = avg > 0 ? stdDev / avg : 0;

		if (coefficientOfVariation < this.VARIANCE_THRESHOLD) {
			const confidence = Math.min(100, Math.round((1 - coefficientOfVariation) * 100));
			if (confidence >= this.CONFIDENCE_THRESHOLD) {
				const pattern: LearningPattern = {
					id: generateUUID(),
					patternType: 'weekly',
					title: 'Weekly Spending Pattern',
					description: `Consistent weekly spending averaging ${this.formatCurrency(avg)}`,
					confidence,
					frequency: 'weekly',
					pattern: JSON.stringify({ averageAmount: avg, weeklyTotals }),
					metadata: JSON.stringify({
						occurrences: weeklyData.size,
						minimumOccurrences: this.MIN_PATTERN_OCCURRENCES.weekly,
						variance,
						coefficientOfVariation,
						timeframe: `${weeklyData.size} weeks`,
						lastObserved: new Date().toISOString(),
						firstObserved: Array.from(weeklyData.keys())[0]
					}),
					isActive: true,
					appliedToProjections: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				};

				results.push({
					pattern,
					confidence,
					metadata: JSON.parse(pattern.metadata)
				});
			}
		}

		return results;
	}

	/**
	 * Detect monthly spending patterns
	 */
	private async detectMonthlyPatterns(
		transactions: Transaction[]
	): Promise<PatternDetectionResult[]> {
		const results: PatternDetectionResult[] = [];
		const monthlyData = new Map<string, number[]>();

		// Group by month
		transactions
			.filter((tx) => tx.type === 'expense' && tx.clearedDate)
			.forEach((tx) => {
				const date = parseISO(tx.clearedDate!);
				const monthKey = format(date, 'yyyy-MM');
				const amounts = monthlyData.get(monthKey) || [];
				amounts.push(Math.abs(tx.amount || 0));
				monthlyData.set(monthKey, amounts);
			});

		if (monthlyData.size < this.MIN_PATTERN_OCCURRENCES.monthly) {
			return [];
		}

		const monthlyTotals = Array.from(monthlyData.values()).map((amounts) =>
			amounts.reduce((sum, amt) => sum + amt, 0)
		);
		const avg = monthlyTotals.reduce((sum, amt) => sum + amt, 0) / monthlyTotals.length;
		const variance =
			monthlyTotals.reduce((sum, amt) => sum + Math.pow(amt - avg, 2), 0) /
			monthlyTotals.length;
		const stdDev = Math.sqrt(variance);
		const coefficientOfVariation = avg > 0 ? stdDev / avg : 0;

		if (coefficientOfVariation < this.VARIANCE_THRESHOLD) {
			const confidence = Math.min(100, Math.round((1 - coefficientOfVariation) * 100));
			if (confidence >= this.CONFIDENCE_THRESHOLD) {
				const pattern: LearningPattern = {
					id: generateUUID(),
					patternType: 'monthly',
					title: 'Monthly Spending Pattern',
					description: `Consistent monthly spending averaging ${this.formatCurrency(avg)}`,
					confidence,
					frequency: 'monthly',
					pattern: JSON.stringify({ averageAmount: avg, monthlyTotals }),
					metadata: JSON.stringify({
						occurrences: monthlyData.size,
						minimumOccurrences: this.MIN_PATTERN_OCCURRENCES.monthly,
						variance,
						coefficientOfVariation,
						timeframe: `${monthlyData.size} months`,
						lastObserved: new Date().toISOString(),
						firstObserved: Array.from(monthlyData.keys())[0] + '-01'
					}),
					isActive: true,
					appliedToProjections: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				};

				results.push({
					pattern,
					confidence,
					metadata: JSON.parse(pattern.metadata)
				});
			}
		}

		return results;
	}

	/**
	 * Detect seasonal patterns (quarterly or yearly)
	 */
	private async detectSeasonalPatterns(
		transactions: Transaction[]
	): Promise<PatternDetectionResult[]> {
		const results: PatternDetectionResult[] = [];
		const quarterlyData = new Map<string, number[]>();

		// Group by quarter
		transactions
			.filter((tx) => tx.type === 'expense' && tx.clearedDate)
			.forEach((tx) => {
				const date = parseISO(tx.clearedDate!);
				const quarter = Math.floor(date.getMonth() / 3) + 1;
				const quarterKey = `Q${quarter}-${date.getFullYear()}`;
				const amounts = quarterlyData.get(quarterKey) || [];
				amounts.push(Math.abs(tx.amount || 0));
				quarterlyData.set(quarterKey, amounts);
			});

		if (quarterlyData.size < this.MIN_PATTERN_OCCURRENCES.seasonal) {
			return [];
		}

		const quarterlyTotals = Array.from(quarterlyData.values()).map((amounts) =>
			amounts.reduce((sum, amt) => sum + amt, 0)
		);
		const avg = quarterlyTotals.reduce((sum, amt) => sum + amt, 0) / quarterlyTotals.length;
		const variance =
			quarterlyTotals.reduce((sum, amt) => sum + Math.pow(amt - avg, 2), 0) /
			quarterlyTotals.length;
		const stdDev = Math.sqrt(variance);
		const coefficientOfVariation = avg > 0 ? stdDev / avg : 0;

		if (coefficientOfVariation < 0.4) {
			// Slightly higher threshold for seasonal patterns
			const confidence = Math.min(100, Math.round((1 - coefficientOfVariation) * 100));
			if (confidence >= this.CONFIDENCE_THRESHOLD) {
				const pattern: LearningPattern = {
					id: generateUUID(),
					patternType: 'seasonal',
					title: 'Seasonal Spending Pattern',
					description: `Seasonal spending variations averaging ${this.formatCurrency(avg)} per quarter`,
					confidence,
					frequency: 'monthly',
					pattern: JSON.stringify({ averageAmount: avg, quarterlyTotals }),
					metadata: JSON.stringify({
						occurrences: quarterlyData.size,
						minimumOccurrences: this.MIN_PATTERN_OCCURRENCES.seasonal,
						variance,
						coefficientOfVariation,
						timeframe: `${quarterlyData.size} quarters`,
						lastObserved: new Date().toISOString(),
						firstObserved: Array.from(quarterlyData.keys())[0]
					}),
					isActive: true,
					appliedToProjections: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				};

				results.push({
					pattern,
					confidence,
					metadata: JSON.parse(pattern.metadata)
				});
			}
		}

		return results;
	}

	/**
	 * Detect income patterns (paycheck frequency, amount variations, bonus patterns)
	 */
	private async detectIncomePatterns(
		transactions: Transaction[]
	): Promise<PatternDetectionResult[]> {
		const results: PatternDetectionResult[] = [];
		const incomeTransactions = transactions.filter(
			(tx) => tx.type === 'income' && tx.clearedDate
		);

		if (incomeTransactions.length < this.MIN_PATTERN_OCCURRENCES.income_frequency) {
			return [];
		}

		// Detect paycheck frequency
		const frequencyPattern = await this.detectPaycheckFrequency(incomeTransactions);
		if (frequencyPattern) {
			results.push(frequencyPattern);
		}

		// Detect paycheck amount patterns
		const amountPattern = await this.detectPaycheckAmountPattern(incomeTransactions);
		if (amountPattern) {
			results.push(amountPattern);
		}

		return results;
	}

	/**
	 * Detect paycheck frequency (weekly, bi-weekly, monthly, irregular)
	 */
	private async detectPaycheckFrequency(
		incomeTransactions: Transaction[]
	): Promise<PatternDetectionResult | null> {
		if (incomeTransactions.length < 3) {
			return null;
		}

		// Calculate intervals between paychecks
		const dates = incomeTransactions
			.map((tx) => parseISO(tx.clearedDate!))
			.sort((a, b) => a.getTime() - b.getTime());

		const intervals: number[] = [];
		for (let i = 1; i < dates.length; i++) {
			const days = Math.round(
				(dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24)
			);
			intervals.push(days);
		}

		if (intervals.length < 2) {
			return null;
		}

		const avgInterval = intervals.reduce((sum, days) => sum + days, 0) / intervals.length;
		const variance =
			intervals.reduce((sum, days) => sum + Math.pow(days - avgInterval, 2), 0) /
			intervals.length;
		const stdDev = Math.sqrt(variance);
		const coefficientOfVariation = avgInterval > 0 ? stdDev / avgInterval : 0;

		// Determine frequency type
		let frequency: 'weekly' | 'monthly' | 'irregular' = 'irregular';
		if (avgInterval >= 6 && avgInterval <= 8) {
			frequency = 'weekly';
		} else if (avgInterval >= 13 && avgInterval <= 15) {
			frequency = 'weekly'; // bi-weekly
		} else if (avgInterval >= 28 && avgInterval <= 31) {
			frequency = 'monthly';
		}

		if (coefficientOfVariation < this.VARIANCE_THRESHOLD && intervals.length >= 2) {
			const confidence = Math.min(100, Math.round((1 - coefficientOfVariation) * 100));
			if (confidence >= this.CONFIDENCE_THRESHOLD) {
				const pattern: LearningPattern = {
					id: generateUUID(),
					patternType: 'income_frequency',
					title: `${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Paycheck Pattern`,
					description: `Paychecks received approximately every ${Math.round(avgInterval)} days`,
					confidence,
					frequency: frequency === 'monthly' ? 'monthly' : 'weekly',
					pattern: JSON.stringify({ averageInterval: avgInterval, intervals, frequency }),
					metadata: JSON.stringify({
						occurrences: intervals.length,
						minimumOccurrences: this.MIN_PATTERN_OCCURRENCES.income_frequency,
						variance,
						coefficientOfVariation,
						timeframe: `${intervals.length} paychecks`,
						lastObserved: new Date().toISOString(),
						firstObserved: dates[0].toISOString()
					}),
					isActive: true,
					appliedToProjections: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				};

				return {
					pattern,
					confidence,
					metadata: JSON.parse(pattern.metadata)
				};
			}
		}

		return null;
	}

	/**
	 * Detect paycheck amount patterns
	 */
	private async detectPaycheckAmountPattern(
		incomeTransactions: Transaction[]
	): Promise<PatternDetectionResult | null> {
		if (incomeTransactions.length < 3) {
			return null;
		}

		const amounts = incomeTransactions.map((tx) => Math.abs(tx.amount || 0));
		const avg = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
		const variance =
			amounts.reduce((sum, amt) => sum + Math.pow(amt - avg, 2), 0) / amounts.length;
		const stdDev = Math.sqrt(variance);
		const coefficientOfVariation = avg > 0 ? stdDev / avg : 0;

		if (coefficientOfVariation < this.VARIANCE_THRESHOLD) {
			const confidence = Math.min(100, Math.round((1 - coefficientOfVariation) * 100));
			if (confidence >= this.CONFIDENCE_THRESHOLD) {
				const pattern: LearningPattern = {
					id: generateUUID(),
					patternType: 'income_amount',
					title: 'Consistent Paycheck Amount',
					description: `Paychecks average ${this.formatCurrency(avg)}`,
					confidence,
					frequency: 'monthly',
					pattern: JSON.stringify({ averageAmount: avg, amounts }),
					metadata: JSON.stringify({
						occurrences: amounts.length,
						minimumOccurrences: this.MIN_PATTERN_OCCURRENCES.income_amount,
						variance,
						coefficientOfVariation,
						timeframe: `${amounts.length} paychecks`,
						lastObserved: new Date().toISOString(),
						firstObserved:
							incomeTransactions[0]?.clearedDate || new Date().toISOString()
					}),
					isActive: true,
					appliedToProjections: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				};

				return {
					pattern,
					confidence,
					metadata: JSON.parse(pattern.metadata)
				};
			}
		}

		return null;
	}

	// ============================================================================
	// ADAPTIVE ADJUSTMENTS
	// ============================================================================

	/**
	 * Review and suggest allowance adjustments based on actual spending
	 */
	async reviewAllowanceAdjustments(): Promise<AllowanceAdjustmentSuggestion[]> {
		const suggestions: AllowanceAdjustmentSuggestion[] = [];
		const now = new Date();
		const threeMonthsAgo = subMonths(now, 3);

		// Get all active categories
		const categories = await db.categories
			.filter((cat) => cat.isActive && !cat.deletedAt)
			.toArray();

		for (const category of categories) {
			if (!category.budgetAmount || category.budgetAmount === 0) {
				continue; // Skip categories without budget
			}

			// Get transactions for this category in the last 3 months
			const transactions = await db.transactions
				.where('categoryId')
				.equals(category.id)
				.and((tx) => {
					if (!tx.clearedDate) return false;
					const date = parseISO(tx.clearedDate);
					return (
						!tx.deletedAt &&
						tx.status === 'cleared' &&
						tx.type === 'expense' &&
						isAfter(date, threeMonthsAgo) &&
						isBefore(date, now)
					);
				})
				.toArray();

			if (transactions.length === 0) {
				continue;
			}

			// Group by month
			const monthlySpending = new Map<string, number>();
			transactions.forEach((tx) => {
				const date = parseISO(tx.clearedDate!);
				const monthKey = format(date, 'yyyy-MM');
				const current = monthlySpending.get(monthKey) || 0;
				monthlySpending.set(monthKey, current + Math.abs(tx.amount || 0));
			});

			if (monthlySpending.size < 3) {
				continue; // Need at least 3 months of data
			}

			const monthlyAmounts = Array.from(monthlySpending.values());
			const actualAverage =
				monthlyAmounts.reduce((sum, amt) => sum + amt, 0) / monthlyAmounts.length;
			const budgeted = category.budgetAmount;
			const variance = Math.abs(actualAverage - budgeted) / budgeted;

			// Check if variance > 20% for 3+ consecutive months
			let consecutiveMonths = 0;
			for (const amount of monthlyAmounts) {
				const monthVariance = Math.abs(amount - budgeted) / budgeted;
				if (monthVariance > this.ALLOWANCE_VARIANCE_THRESHOLD) {
					consecutiveMonths++;
				} else {
					consecutiveMonths = 0; // Reset if variance drops
				}
			}

			if (consecutiveMonths >= 3 && variance > this.ALLOWANCE_VARIANCE_THRESHOLD) {
				// Calculate suggested allowance with smoothing
				const suggestedAllowance =
					budgeted * (1 - this.ALLOWANCE_TUNING_SMOOTHING) +
					actualAverage * this.ALLOWANCE_TUNING_SMOOTHING;

				// Apply max change limit
				const maxChange = budgeted * this.MAX_ALLOWANCE_CHANGE;
				const change = suggestedAllowance - budgeted;
				const finalSuggested =
					Math.abs(change) > maxChange
						? budgeted + (change > 0 ? maxChange : -maxChange)
						: suggestedAllowance;

				const changePercent = Math.abs((finalSuggested - budgeted) / budgeted);
				const requiresConfirmation = changePercent > this.MAX_ALLOWANCE_CHANGE;

				suggestions.push({
					categoryId: category.id,
					categoryName: category.name,
					currentAllowance: budgeted,
					suggestedAllowance: finalSuggested,
					actualAverage,
					variance,
					consecutiveMonths,
					confidence: Math.min(
						100,
						Math.round((consecutiveMonths / monthlyAmounts.length) * 100)
					),
					requiresConfirmation
				});
			}
		}

		return suggestions;
	}

	/**
	 * Review and suggest buffer adjustments based on actual minimums
	 */
	async reviewBufferAdjustments(): Promise<BufferAdjustmentSuggestion[]> {
		const suggestions: BufferAdjustmentSuggestion[] = [];
		const accounts = await accountService.getAccounts();

		for (const account of accounts) {
			if (!account.isActive || account.deletedAt) {
				continue;
			}

			const currentBuffer = getBufferAmount(account);
			if (currentBuffer === 0) {
				continue; // Skip accounts without buffer
			}

			// Get balance history (would need to track daily balances or calculate from transactions)
			// For now, we'll use a simplified approach based on transaction patterns
			const comfortThreshold = currentBuffer * 0.8; // 80% of buffer as comfort threshold

			// This is a simplified implementation - in production, you'd track actual daily minimums
			// For now, we'll suggest based on account type and metadata
			const metadata = account.metadata;
			if (metadata?.bufferAmount) {
				// Check if buffer seems too high or too low based on account activity
				const transactions = await db.transactions
					.where('accountId')
					.equals(account.id)
					.and((tx) => !tx.deletedAt && tx.status === 'cleared')
					.toArray();

				if (transactions.length > 0) {
					const avgTransaction =
						transactions.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0) /
						transactions.length;

					// If buffer is much larger than average transaction, might be over-buffering
					if (currentBuffer > avgTransaction * 10) {
						suggestions.push({
							accountId: account.id,
							accountName: account.name,
							currentBuffer,
							suggestedBuffer: avgTransaction * 5, // Suggest reducing to 5x average
							actualMinimums: [], // Would be populated from daily balance tracking
							comfortThreshold,
							reason: 'over_buffering',
							confidence: 60
						});
					}
				}
			}
		}

		return suggestions;
	}

	/**
	 * Learn flexibility scores from user feedback on transaction movement suggestions
	 */
	async learnFlexibilityFromFeedback(): Promise<FlexibilityLearningResult[]> {
		const results: FlexibilityLearningResult[] = [];

		// Get feedback on transaction movement suggestions
		const feedback = await db.userFeedback
			.where('feedbackType')
			.equals('category_flexibility')
			.and((fb) => !fb.deletedAt)
			.toArray();

		// Group feedback by category
		const categoryFeedback = new Map<string, UserFeedback[]>();
		feedback.forEach((fb) => {
			const details = fb.details ? JSON.parse(fb.details) : {};
			const categoryId = details.categoryId;
			if (categoryId) {
				const existing = categoryFeedback.get(categoryId) || [];
				existing.push(fb);
				categoryFeedback.set(categoryId, existing);
			}
		});

		// Analyze each category
		for (const [categoryId, feedbacks] of categoryFeedback.entries()) {
			if (feedbacks.length < this.MIN_FEEDBACK_COUNT) {
				continue; // Need minimum feedback before learning
			}

			const category = await db.categories.get(categoryId);
			if (!category) {
				continue;
			}

			// Calculate acceptance rate
			const accepted = feedbacks.filter((fb) => fb.action === 'accepted').length;
			const rejected = feedbacks.filter((fb) => fb.action === 'rejected').length;
			const acceptanceRate = feedbacks.length > 0 ? accepted / feedbacks.length : 0;

			// Learn flexibility score (0-1, where 1 is most flexible)
			// If user accepts movement suggestions, category is flexible
			// If user rejects, category is less flexible
			const currentFlexibility = 0.5; // Default, would come from category metadata
			const learnedFlexibility = Math.max(0, Math.min(1, acceptanceRate));

			// Gradual adjustment (don't jump immediately)
			const adjustmentFactor = 0.3;
			const adjustedFlexibility =
				currentFlexibility * (1 - adjustmentFactor) + learnedFlexibility * adjustmentFactor;

			results.push({
				categoryId,
				categoryName: category.name,
				currentFlexibility,
				learnedFlexibility: adjustedFlexibility,
				suggestionCount: feedbacks.length,
				acceptanceRate,
				confidence: Math.min(
					100,
					Math.round((feedbacks.length / this.MIN_FEEDBACK_COUNT) * 100)
				)
			});

			// Store preference
			await this.storeOptimizationPreference({
				preferenceType: 'category_flexibility',
				categoryId,
				key: `${categoryId}_flexibility`,
				value: adjustedFlexibility,
				confidence: Math.min(
					100,
					Math.round((feedbacks.length / this.MIN_FEEDBACK_COUNT) * 100)
				),
				feedbackCount: feedbacks.length
			});
		}

		return results;
	}

	// ============================================================================
	// DATA QUALITY CHECKS
	// ============================================================================

	/**
	 * Check data quality and identify issues
	 */
	async checkDataQuality(days: number = 90): Promise<DataQualityIssue[]> {
		const issues: DataQualityIssue[] = [];
		const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

		const transactions = await db.transactions
			.where('clearedDate')
			.above(cutoffDate.toISOString())
			.and((tx) => !tx.deletedAt && tx.status === 'cleared')
			.toArray();

		// Check for duplicates
		const duplicateIssues = await this.detectDuplicates(transactions);
		issues.push(...duplicateIssues);

		// Check for outliers
		const outlierIssues = await this.detectOutliers(transactions);
		issues.push(...outlierIssues);

		// Check for mis-categorized transactions
		const misCategorizedIssues = await this.detectMisCategorized(transactions);
		issues.push(...misCategorizedIssues);

		return issues;
	}

	/**
	 * Detect duplicate transactions
	 */
	private async detectDuplicates(transactions: Transaction[]): Promise<DataQualityIssue[]> {
		const issues: DataQualityIssue[] = [];
		const seen = new Map<string, Transaction[]>();

		// Group by amount, date, and description
		transactions.forEach((tx) => {
			const key = canonicalDuplicateKey(tx);
			const existing = seen.get(key) || [];
			existing.push(tx);
			seen.set(key, existing);
		});

		// Find duplicates
		for (const [key, txs] of seen.entries()) {
			if (txs.length > 1) {
				// Potential duplicates
				for (let i = 1; i < txs.length; i++) {
					issues.push({
						type: 'duplicate',
						transactionId: txs[i].id,
						severity: 'medium',
						description: `Possible duplicate of transaction ${txs[0].id}`,
						suggestedAction: 'Review and merge if duplicate'
					});
				}
			}
		}

		return issues;
	}

	/**
	 * Detect outlier transactions (unusual amounts)
	 */
	private async detectOutliers(transactions: Transaction[]): Promise<DataQualityIssue[]> {
		const issues: DataQualityIssue[] = [];

		// Group by category
		const categoryTransactions = new Map<string, Transaction[]>();
		transactions.forEach((tx) => {
			if (tx.categoryId) {
				const existing = categoryTransactions.get(tx.categoryId) || [];
				existing.push(tx);
				categoryTransactions.set(tx.categoryId, existing);
			}
		});

		// Check each category for outliers
		for (const [categoryId, txs] of categoryTransactions.entries()) {
			if (txs.length < 4) {
				continue; // Need enough data
			}

			const amounts = txs.map((tx) => Math.abs(tx.amount || 0));
			const outliers = new Set(iqrFilter(amounts, 2.0).outliers);
			txs.forEach((tx) => {
				const amount = Math.abs(tx.amount || 0);
				if (outliers.has(amount)) {
					const score = iqrOutlierScore(amount, amounts, 2.0);
					issues.push({
						type: 'outlier',
						transactionId: tx.id,
						severity: score >= 0.8 ? 'high' : score >= 0.4 ? 'medium' : 'low',
						description: `Unusually large amount (${this.formatCurrency(amount)}) for this category`,
						suggestedAction: 'Verify amount is correct or mark as one-time exception'
					});
				}
			});
		}

		return issues;
	}

	/**
	 * Detect potentially mis-categorized transactions
	 */
	private async detectMisCategorized(transactions: Transaction[]): Promise<DataQualityIssue[]> {
		const issues: DataQualityIssue[] = [];

		// This is a simplified check - in production, you'd use ML or more sophisticated heuristics
		// For now, we'll flag transactions that seem unusual for their category based on amount patterns

		const categoryTransactions = new Map<string, Transaction[]>();
		transactions.forEach((tx) => {
			if (tx.categoryId) {
				const existing = categoryTransactions.get(tx.categoryId) || [];
				existing.push(tx);
				categoryTransactions.set(tx.categoryId, existing);
			}
		});

		// Check for transactions that are significantly different from category norm
		for (const [categoryId, txs] of categoryTransactions.entries()) {
			if (txs.length < 3) {
				continue;
			}

			const amounts = txs.map((tx) => Math.abs(tx.amount || 0));
			const avg = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
			const median = amounts.sort((a, b) => a - b)[Math.floor(amounts.length / 2)];

			// Flag if transaction is very different from median (more than 5x)
			txs.forEach((tx) => {
				const amount = Math.abs(tx.amount || 0);
				if (amount > median * 5 || amount < median / 5) {
					issues.push({
						type: 'mis_categorized',
						transactionId: tx.id,
						severity: 'low',
						description: `Amount seems unusual for this category (${this.formatCurrency(amount)} vs typical ${this.formatCurrency(median)})`,
						suggestedAction: 'Verify category is correct'
					});
				}
			});
		}

		return issues;
	}

	// ============================================================================
	// USER FEEDBACK INTEGRATION
	// ============================================================================

	/**
	 * Record user feedback on a suggestion
	 */
	async recordFeedback(feedback: {
		feedbackType: UserFeedback['feedbackType'];
		suggestionId?: string;
		action: UserFeedback['action'];
		details?: Record<string, any>;
		metadata?: Record<string, any>;
	}): Promise<UserFeedback> {
		const userFeedback: UserFeedback = {
			id: generateUUID(),
			feedbackType: feedback.feedbackType,
			suggestionId: feedback.suggestionId,
			action: feedback.action,
			details: feedback.details ? JSON.stringify(feedback.details) : undefined,
			metadata: feedback.metadata ? JSON.stringify(feedback.metadata) : undefined,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};

		await db.userFeedback.add(userFeedback);

		// Analyze feedback and adjust preferences if needed
		await this.analyzeFeedbackAndAdjust(feedback.feedbackType);

		return userFeedback;
	}

	/**
	 * Analyze feedback and adjust optimization weights/preferences
	 */
	private async analyzeFeedbackAndAdjust(
		feedbackType: UserFeedback['feedbackType']
	): Promise<void> {
		// Get all feedback of this type
		const feedback = await db.userFeedback
			.where('feedbackType')
			.equals(feedbackType)
			.and((fb) => !fb.deletedAt)
			.toArray();

		if (feedback.length < 5) {
			return; // Need minimum feedback before adjusting
		}

		const analysis = this.analyzeFeedback(feedback);

		if (analysis.shouldAdjustWeight && analysis.newWeight !== undefined) {
			// Store preference for this suggestion type
			await this.storeOptimizationPreference({
				preferenceType: 'suggestion_weight',
				key: `${feedbackType}_weight`,
				value: analysis.newWeight,
				confidence: Math.min(100, Math.round((feedback.length / 10) * 100)),
				feedbackCount: feedback.length
			});
		}
	}

	/**
	 * Analyze feedback to determine if weights should be adjusted
	 */
	private analyzeFeedback(feedback: UserFeedback[]): FeedbackAnalysis {
		const total = feedback.length;
		const accepted = feedback.filter((fb) => fb.action === 'accepted').length;
		const rejected = feedback.filter((fb) => fb.action === 'rejected').length;
		const modified = feedback.filter((fb) => fb.action === 'modified').length;
		const dismissed = feedback.filter((fb) => fb.action === 'dismissed').length;

		const acceptanceRate = total > 0 ? accepted / total : 0;

		// Adjust weight if acceptance rate is very low (<20%) or very high (>80%)
		const shouldAdjustWeight = acceptanceRate < 0.2 || acceptanceRate > 0.8;
		let newWeight: number | undefined;

		if (shouldAdjustWeight) {
			// Reduce weight if low acceptance, increase if high acceptance
			// Base weight is 1.0, adjust by ±0.2
			const baseWeight = 1.0;
			if (acceptanceRate < 0.2) {
				newWeight = Math.max(0.1, baseWeight - 0.2);
			} else if (acceptanceRate > 0.8) {
				newWeight = Math.min(2.0, baseWeight + 0.2);
			}
		}

		return {
			suggestionType: feedback[0]?.feedbackType || 'unknown',
			totalSuggestions: total,
			accepted,
			rejected,
			modified,
			dismissed,
			acceptanceRate,
			shouldAdjustWeight,
			newWeight
		};
	}

	/**
	 * Get user preferences for optimization
	 */
	async getOptimizationPreferences(
		preferenceType?: OptimizationPreference['preferenceType']
	): Promise<OptimizationPreference[]> {
		let query = db.optimizationPreferences.filter((pref) => !pref.deletedAt);

		if (preferenceType) {
			query = query.filter((pref) => pref.preferenceType === preferenceType);
		}

		return await query.toArray();
	}

	/**
	 * Get preference value for a specific key
	 */
	async getPreferenceValue(key: string): Promise<number | null> {
		const preference = await db.optimizationPreferences
			.where('key')
			.equals(key)
			.and((pref) => !pref.deletedAt)
			.first();

		return preference?.value ?? null;
	}

	// ============================================================================
	// PATTERN STORAGE & RETRIEVAL
	// ============================================================================

	/**
	 * Store a learning pattern
	 */
	private async storePattern(pattern: LearningPattern): Promise<void> {
		// Check if pattern already exists (by type and category)
		const existing = await db.learningPatterns
			.where('patternType')
			.equals(pattern.patternType)
			.and((p) => p.categoryId === pattern.categoryId && !p.deletedAt)
			.first();

		if (existing) {
			// Update existing pattern
			pattern.id = existing.id;
			pattern.updatedAt = new Date().toISOString();
			await db.learningPatterns.update(existing.id, pattern);
		} else {
			// Create new pattern
			await db.learningPatterns.add(pattern);
		}
	}

	/**
	 * Get active learning patterns
	 */
	async getActivePatterns(
		patternType?: LearningPattern['patternType']
	): Promise<LearningPattern[]> {
		let query = db.learningPatterns.filter((p) => p.isActive && !p.deletedAt);

		if (patternType) {
			query = query.filter((p) => p.patternType === patternType);
		}

		return await query.toArray();
	}

	/**
	 * Store optimization preference
	 */
	private async storeOptimizationPreference(preference: {
		preferenceType: OptimizationPreference['preferenceType'];
		categoryId?: string;
		key: string;
		value: number;
		confidence: number;
		feedbackCount: number;
		metadata?: Record<string, any>;
	}): Promise<void> {
		// Check if preference already exists
		const existing = await db.optimizationPreferences
			.where('key')
			.equals(preference.key)
			.and((p) => !p.deletedAt)
			.first();

		const optimizationPreference: OptimizationPreference = {
			id: existing?.id || generateUUID(),
			preferenceType: preference.preferenceType,
			categoryId: preference.categoryId,
			key: preference.key,
			value: preference.value,
			confidence: preference.confidence,
			feedbackCount: preference.feedbackCount,
			metadata: preference.metadata ? JSON.stringify(preference.metadata) : undefined,
			createdAt: existing?.createdAt || new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};

		if (existing) {
			await db.optimizationPreferences.update(existing.id, optimizationPreference);
		} else {
			await db.optimizationPreferences.add(optimizationPreference);
		}
	}

	// ============================================================================
	// HELPER METHODS
	// ============================================================================

	private getWeekStart(date: Date): Date {
		const d = new Date(date);
		const day = d.getDay();
		const diff = d.getDate() - day; // Sunday = 0
		return new Date(d.setDate(diff));
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

export const learningAdaptationService = new LearningAdaptationService();
