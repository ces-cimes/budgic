/**
 * Recurring Transaction Intelligence Service
 *
 * Provides intelligent handling of recurring transactions including:
 * - Pattern detection from transaction history
 * - Amount prediction based on historical data
 * - Date prediction with business days/holidays
 * - Variability tracking (seasonal, trends)
 * - Auto-categorization learning
 * - Conflict detection and resolution
 */

import { db, generateUUID } from '$lib/core/db';
import type { Transaction, Category } from '$lib/core/db';
import { transactionService } from '../core/transaction-service';
import {
	format,
	parseISO,
	addDays,
	addMonths,
	addWeeks,
	addYears,
	isWeekend,
	differenceInDays,
	startOfMonth,
	getDay
} from 'date-fns';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface RecurringPattern {
	id: string;
	confidence: number; // 0-100
	frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular';
	patternType: 'exact' | 'approximate' | 'seasonal' | 'trending';
	isActive: boolean; // Whether pattern is currently relevant (recent activity)
	dateRelevancy: number; // 0-100, based on how recent the last occurrence is

	// Core pattern data
	averageAmount: number;
	amountVariability: number; // Standard deviation or coefficient of variation
	typicalDayOfMonth?: number; // 1-31, for monthly patterns
	typicalDayOfWeek?: number; // 0-6 (Sunday-Saturday), for weekly patterns
	typicalWeekOfMonth?: number; // 1-4, for monthly patterns

	// Historical data
	occurrences: number;
	firstObserved: string; // ISO date
	lastObserved: string; // ISO date
	historicalAmounts: number[];
	historicalDates: string[]; // ISO dates

	// Variability tracking
	seasonalVariation?: {
		month: number; // 1-12
		adjustment: number; // Percentage or absolute adjustment
	}[];
	trend?: {
		direction: 'increasing' | 'decreasing' | 'stable';
		rate: number; // Change per period
		confidence: number; // 0-100
	};

	// Category learning
	learnedCategoryId?: string;
	categoryConfidence: number; // 0-100

	// Transaction matching
	matchingTransactionIds: string[];
	descriptionPattern?: string; // Regex or pattern for matching

	// Metadata
	metadata: {
		accountId?: string;
		currency?: string;
		type?: Transaction['type'];
		notes?: string;
	};
}

export interface RecurringPrediction {
	patternId: string;
	nextOccurrenceDate: string; // ISO date
	predictedAmount: number;
	confidence: number; // 0-100
	variabilityRange: {
		min: number;
		max: number;
		percentile25: number;
		percentile75: number;
	};
	notes?: string;
}

export interface RecurringConflict {
	id: string;
	type:
		| 'date_overlap'
		| 'amount_mismatch'
		| 'missing_occurrence'
		| 'duplicate_detection'
		| 'category_mismatch';
	severity: 'low' | 'medium' | 'high';
	patternId: string;
	transactionId?: string;
	description: string;
	suggestedResolution?: {
		action: 'merge' | 'split' | 'ignore' | 'update' | 'create';
		details: string;
	};
	detectedAt: string; // ISO date
}

export interface BusinessDayConfig {
	country?: string; // For country-specific holidays
	customHolidays?: string[]; // ISO date strings
	excludeWeekends: boolean; // Default true
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

class RecurringTransactionIntelligenceService {
	private patternCache: Map<string, RecurringPattern> = new Map();
	private cacheExpiry: Map<string, number> = new Map();
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	/**
	 * Detect recurring patterns from transaction history
	 */
	async detectPatterns(
		days: number = 365,
		minOccurrences: number = 3
	): Promise<RecurringPattern[]> {
		const cacheKey = `patterns_${days}_${minOccurrences}`;
		const cached = this.getCachedPatterns(cacheKey);
		if (cached) return cached;

		const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
		const transactions = await db.transactions
			.where('clearedDate')
			.above(cutoffDate.toISOString())
			.and((tx) => !tx.deletedAt && tx.status === 'cleared')
			.toArray();

		const patterns: RecurringPattern[] = [];

		// Group transactions by similarity (description, amount, category, type)
		const transactionGroups = this.groupSimilarTransactions(transactions);

		for (const group of transactionGroups) {
			if (group.length < minOccurrences) continue;

			const pattern = await this.analyzeGroupForPattern(group);
			if (pattern && pattern.confidence >= 30) {
				patterns.push(pattern);
			}
		}

		// Merge duplicate patterns (same description, same type, similar amounts)
		const mergedPatterns = this.mergeDuplicatePatterns(patterns);

		// Calculate date relevancy and active status
		const now = new Date();
		for (const pattern of mergedPatterns) {
			pattern.dateRelevancy = this.calculateDateRelevancy(pattern, now);
			pattern.isActive = this.isPatternActive(pattern, now);
		}

		// Sort by active status first, then date relevancy, then confidence
		mergedPatterns.sort((a, b) => {
			// Active patterns first
			if (a.isActive !== b.isActive) {
				return a.isActive ? -1 : 1;
			}
			// Then by date relevancy
			if (Math.abs(a.dateRelevancy - b.dateRelevancy) > 5) {
				return b.dateRelevancy - a.dateRelevancy;
			}
			// Finally by confidence
			return b.confidence - a.confidence;
		});

		this.setCachedPatterns(cacheKey, patterns);
		return patterns;
	}

	/**
	 * Predict next occurrence of a recurring pattern
	 */
	async predictNextOccurrence(
		patternId: string,
		businessDayConfig?: BusinessDayConfig
	): Promise<RecurringPrediction | null> {
		const pattern = await this.getPattern(patternId);
		if (!pattern) return null;

		const lastDate = parseISO(pattern.lastObserved);
		const nextDate = this.calculateNextDate(pattern, lastDate, businessDayConfig);
		const predictedAmount = this.predictAmount(pattern);
		const variabilityRange = this.calculateVariabilityRange(pattern);

		return {
			patternId: pattern.id,
			nextOccurrenceDate: nextDate.toISOString(),
			predictedAmount,
			confidence: pattern.confidence,
			variabilityRange,
			notes: this.generatePredictionNotes(pattern)
		};
	}

	/**
	 * Predict amount for a recurring transaction
	 */
	predictAmount(pattern: RecurringPattern): number {
		const amounts = pattern.historicalAmounts;
		if (amounts.length === 0) return pattern.averageAmount;

		// Apply trend if present
		let baseAmount = pattern.averageAmount;
		if (pattern.trend && pattern.trend.confidence > 50) {
			const periodsSinceLast = this.calculatePeriodsSinceLast(pattern);
			baseAmount += pattern.trend.rate * periodsSinceLast;
		}

		// Apply seasonal variation if present
		if (pattern.seasonalVariation && pattern.seasonalVariation.length > 0) {
			const currentMonth = new Date().getMonth() + 1;
			const seasonal = pattern.seasonalVariation.find((s) => s.month === currentMonth);
			if (seasonal) {
				baseAmount += seasonal.adjustment;
			}
		}

		return Math.max(0, baseAmount); // Ensure non-negative
	}

	/**
	 * Predict date with business days/holidays consideration
	 */
	private calculateNextDate(
		pattern: RecurringPattern,
		lastDate: Date,
		businessDayConfig?: BusinessDayConfig
	): Date {
		const config: BusinessDayConfig = {
			excludeWeekends: true,
			...businessDayConfig
		};

		let nextDate = new Date(lastDate);

		// Calculate base next date based on frequency
		switch (pattern.frequency) {
			case 'daily':
				nextDate = addDays(nextDate, 1);
				break;
			case 'weekly':
				nextDate = addWeeks(nextDate, 1);
				break;
			case 'biweekly':
				nextDate = addWeeks(nextDate, 2);
				break;
			case 'monthly':
				nextDate = addMonths(nextDate, 1);
				// Adjust to typical day of month if available
				if (pattern.typicalDayOfMonth) {
					nextDate.setDate(pattern.typicalDayOfMonth);
				}
				break;
			case 'quarterly':
				nextDate = addMonths(nextDate, 3);
				break;
			case 'yearly':
				nextDate = addYears(nextDate, 1);
				break;
			case 'irregular':
				// For irregular patterns, use average interval
				const avgInterval = this.calculateAverageInterval(pattern);
				nextDate = addDays(nextDate, avgInterval);
				break;
		}

		// Adjust for business days if configured
		if (config.excludeWeekends) {
			while (isWeekend(nextDate)) {
				nextDate = addDays(nextDate, 1);
			}
		}

		// Adjust for holidays if configured
		if (config.customHolidays) {
			while (config.customHolidays.includes(format(nextDate, 'yyyy-MM-dd'))) {
				nextDate = addDays(nextDate, 1);
			}
		}

		return nextDate;
	}

	/**
	 * Track variability (seasonal, trends) for a pattern
	 */
	async trackVariability(patternId: string): Promise<RecurringPattern> {
		const pattern = await this.getPattern(patternId);
		if (!pattern) throw new Error(`Pattern ${patternId} not found`);

		// Analyze seasonal variation
		const seasonalVariation = this.analyzeSeasonalVariation(pattern);
		if (seasonalVariation.length > 0) {
			pattern.seasonalVariation = seasonalVariation;
		}

		// Analyze trend
		const trend = this.analyzeTrend(pattern);
		if (trend) {
			pattern.trend = trend;
		}

		// Update variability metrics
		pattern.amountVariability = this.calculateAmountVariability(pattern);

		// Update cache
		this.patternCache.set(patternId, pattern);

		return pattern;
	}

	/**
	 * Learn category from historical transactions
	 */
	async learnCategory(patternId: string): Promise<RecurringPattern> {
		const pattern = await this.getPattern(patternId);
		if (!pattern) throw new Error(`Pattern ${patternId} not found`);

		const transactions = await db.transactions
			.where('id')
			.anyOf(pattern.matchingTransactionIds)
			.toArray();

		// Find most common category
		const categoryCounts = new Map<string, number>();
		for (const tx of transactions) {
			if (tx.categoryId) {
				categoryCounts.set(tx.categoryId, (categoryCounts.get(tx.categoryId) || 0) + 1);
			}
		}

		if (categoryCounts.size > 0) {
			const mostCommon = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1])[0];

			pattern.learnedCategoryId = mostCommon[0];
			pattern.categoryConfidence = (mostCommon[1] / transactions.length) * 100;
		}

		// Update cache
		this.patternCache.set(patternId, pattern);

		return pattern;
	}

	/**
	 * Detect conflicts in recurring transactions
	 * Note: Missing occurrences are auto-resolved by marking patterns inactive
	 */
	async detectConflicts(patternId?: string): Promise<RecurringConflict[]> {
		const patterns = patternId
			? ([await this.getPattern(patternId)].filter(Boolean) as RecurringPattern[])
			: await this.detectPatterns();

		const conflicts: RecurringConflict[] = [];

		// Only check active patterns for conflicts
		const activePatterns = patterns.filter((p) => p.isActive);

		for (const pattern of activePatterns) {
			// Missing occurrences are auto-resolved (pattern marked inactive)
			// No need to create conflicts for them

			// Check for amount mismatches
			const amountConflicts = await this.detectAmountMismatches(pattern);
			conflicts.push(...amountConflicts);

			// Check for date overlaps
			const overlapConflicts = await this.detectDateOverlaps(pattern);
			conflicts.push(...overlapConflicts);

			// Check for duplicates
			const duplicateConflicts = await this.detectDuplicates(pattern);
			conflicts.push(...duplicateConflicts);
		}

		// Check for category mismatches
		const categoryConflicts = await this.detectCategoryMismatches(activePatterns);
		conflicts.push(...categoryConflicts);

		return conflicts.sort((a, b) => {
			const severityOrder = { high: 3, medium: 2, low: 1 };
			return severityOrder[b.severity] - severityOrder[a.severity];
		});
	}

	/**
	 * Resolve a conflict
	 */
	async resolveConflict(
		conflictId: string,
		resolution: 'merge' | 'split' | 'ignore' | 'update' | 'create'
	): Promise<void> {
		// Implementation depends on conflict type
		// This is a placeholder - actual implementation would handle each conflict type
		console.log(`Resolving conflict ${conflictId} with resolution: ${resolution}`);
	}

	/**
	 * Get pattern by ID
	 */
	async getPattern(patternId: string): Promise<RecurringPattern | null> {
		if (this.patternCache.has(patternId)) {
			return this.patternCache.get(patternId)!;
		}

		// Try to find pattern from detected patterns
		const patterns = await this.detectPatterns();
		const pattern = patterns.find((p) => p.id === patternId);
		if (pattern) {
			this.patternCache.set(patternId, pattern);
			return pattern;
		}

		return null;
	}

	/**
	 * Clear pattern cache
	 */
	clearCache(): void {
		this.patternCache.clear();
		this.cacheExpiry.clear();
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	private groupSimilarTransactions(transactions: Transaction[]): Transaction[][] {
		const groups: Map<string, Transaction[]> = new Map();

		for (const tx of transactions) {
			// Create a key based on description, type, and account
			// Don't include amount in initial grouping - we'll merge similar amounts later
			const key = this.createTransactionKey(tx);

			if (!groups.has(key)) {
				groups.set(key, []);
			}
			groups.get(key)!.push(tx);
		}

		// Merge groups that are similar (same description, same type, different amounts)
		const mergedGroups: Transaction[][] = [];
		const processed = new Set<string>();

		for (const [key, group] of groups.entries()) {
			if (processed.has(key)) continue;

			const merged = [group];
			processed.add(key);

			// Find similar groups (same description pattern, same type)
			for (const [otherKey, otherGroup] of groups.entries()) {
				if (processed.has(otherKey)) continue;
				if (this.areGroupsSimilar(group, otherGroup)) {
					merged.push(otherGroup);
					processed.add(otherKey);
				}
			}

			mergedGroups.push(merged.flat());
		}

		return mergedGroups.filter((g) => g.length >= 2);
	}

	private createTransactionKey(tx: Transaction): string {
		// Normalize description for matching - focus on merchant/payee name
		const normalizedDesc = (tx.description || '')
			.toLowerCase()
			.replace(/[^\w\s]/g, '')
			.replace(/\s+/g, ' ')
			.trim();

		// Key includes: description, type, account (but NOT amount)
		// This allows grouping transactions from same merchant regardless of amount
		return `${normalizedDesc}_${tx.type}_${tx.accountId || 'none'}`;
	}

	private areGroupsSimilar(group1: Transaction[], group2: Transaction[]): boolean {
		// Must have same transaction type
		if (group1[0].type !== group2[0].type) return false;

		// Check if groups have similar descriptions
		const desc1 = (group1[0].description || '').toLowerCase();
		const desc2 = (group2[0].description || '').toLowerCase();

		// Simple similarity check - check if descriptions share significant words
		const words1 = desc1.split(/\s+/).filter((w) => w.length > 2); // Ignore short words
		const words2 = desc2.split(/\s+/).filter((w) => w.length > 2);

		if (words1.length === 0 || words2.length === 0) {
			// If no meaningful words, check exact match
			return desc1 === desc2;
		}

		const commonWords = words1.filter((w) => words2.includes(w));
		const similarity = commonWords.length / Math.max(words1.length, words2.length);

		// Require at least 60% word overlap for similarity
		return similarity >= 0.6;
	}

	private async analyzeGroupForPattern(group: Transaction[]): Promise<RecurringPattern | null> {
		if (group.length < 2) return null;

		// Sort by date
		group.sort((a, b) => {
			const dateA = a.clearedDate || a.plannedDate || a.createdAt;
			const dateB = b.clearedDate || b.plannedDate || b.createdAt;
			return new Date(dateA).getTime() - new Date(dateB).getTime();
		});

		const amounts = group.map((tx) => Math.abs(tx.amount || 0));
		const dates = group.map((tx) => tx.clearedDate || tx.plannedDate || tx.createdAt);

		// Calculate frequency
		const frequency = this.detectFrequency(dates);
		if (!frequency) return null;

		// Calculate average amount
		const averageAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;

		// Calculate typical day of month/week
		const typicalDayOfMonth = this.calculateTypicalDayOfMonth(dates);
		const typicalDayOfWeek = this.calculateTypicalDayOfWeek(dates);
		const typicalWeekOfMonth = this.calculateTypicalWeekOfMonth(dates);

		// Calculate confidence
		const confidence = this.calculatePatternConfidence(group, frequency, amounts);

		// Create pattern
		const now = new Date();
		const pattern: RecurringPattern = {
			id: generateUUID(),
			confidence,
			frequency,
			patternType: this.determinePatternType(amounts, dates),
			isActive: true, // Will be recalculated later
			dateRelevancy: 0, // Will be recalculated later
			averageAmount,
			amountVariability: this.calculateAmountVariability({
				historicalAmounts: amounts
			} as RecurringPattern),
			typicalDayOfMonth,
			typicalDayOfWeek,
			typicalWeekOfMonth,
			occurrences: group.length,
			firstObserved: dates[0],
			lastObserved: dates[dates.length - 1],
			historicalAmounts: amounts,
			historicalDates: dates,
			matchingTransactionIds: group.map((tx) => tx.id),
			descriptionPattern: this.extractDescriptionPattern(group),
			categoryConfidence: 0,
			metadata: {
				accountId: group[0].accountId,
				currency: group[0].currency,
				type: group[0].type
			}
		};

		// Cache pattern
		this.patternCache.set(pattern.id, pattern);

		return pattern;
	}

	private detectFrequency(dates: string[]): RecurringPattern['frequency'] | null {
		if (dates.length < 2) return null;

		const intervals: number[] = [];
		for (let i = 1; i < dates.length; i++) {
			const days = differenceInDays(parseISO(dates[i]), parseISO(dates[i - 1]));
			intervals.push(days);
		}

		const avgInterval = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
		const variance =
			intervals.reduce((sum, d) => sum + Math.pow(d - avgInterval, 2), 0) / intervals.length;
		const stdDev = Math.sqrt(variance);
		const coefficientOfVariation = stdDev / avgInterval;

		// If high variation, it's irregular
		if (coefficientOfVariation > 0.3) {
			return 'irregular';
		}

		// Determine frequency based on average interval
		if (avgInterval <= 1.5) return 'daily';
		if (avgInterval <= 4) return 'weekly';
		if (avgInterval <= 11) return 'biweekly';
		if (avgInterval <= 35) return 'monthly';
		if (avgInterval <= 100) return 'quarterly';
		if (avgInterval <= 400) return 'yearly';

		return 'irregular';
	}

	private calculateTypicalDayOfMonth(dates: string[]): number | undefined {
		const daysOfMonth = dates.map((d) => parseISO(d).getDate());
		const counts = new Map<number, number>();

		for (const day of daysOfMonth) {
			counts.set(day, (counts.get(day) || 0) + 1);
		}

		const mostCommon = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];

		return mostCommon && mostCommon[1] >= dates.length * 0.5 ? mostCommon[0] : undefined;
	}

	private calculateTypicalDayOfWeek(dates: string[]): number | undefined {
		const daysOfWeek = dates.map((d) => getDay(parseISO(d)));
		const counts = new Map<number, number>();

		for (const day of daysOfWeek) {
			counts.set(day, (counts.get(day) || 0) + 1);
		}

		const mostCommon = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];

		return mostCommon && mostCommon[1] >= dates.length * 0.5 ? mostCommon[0] : undefined;
	}

	private calculateTypicalWeekOfMonth(dates: string[]): number | undefined {
		const weeksOfMonth = dates.map((d) => {
			const date = parseISO(d);
			const start = startOfMonth(date);
			const weekOfMonth = Math.ceil((date.getDate() + start.getDay()) / 7);
			return weekOfMonth;
		});

		const counts = new Map<number, number>();
		for (const week of weeksOfMonth) {
			counts.set(week, (counts.get(week) || 0) + 1);
		}

		const mostCommon = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];

		return mostCommon && mostCommon[1] >= dates.length * 0.5 ? mostCommon[0] : undefined;
	}

	private calculatePatternConfidence(
		group: Transaction[],
		frequency: RecurringPattern['frequency'],
		amounts: number[]
	): number {
		let confidence = 0;

		// Base confidence from number of occurrences
		confidence += Math.min(50, group.length * 10);

		// Frequency consistency
		if (frequency !== 'irregular') {
			confidence += 20;
		}

		// Amount consistency
		const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
		const amountVariance =
			amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / amounts.length;
		const amountStdDev = Math.sqrt(amountVariance);
		const coefficientOfVariation = amountStdDev / avgAmount;

		if (coefficientOfVariation < 0.1) {
			confidence += 20; // Very consistent amounts
		} else if (coefficientOfVariation < 0.2) {
			confidence += 10; // Moderately consistent
		}

		// Date consistency
		const dates = group.map((tx) => tx.clearedDate || tx.plannedDate || tx.createdAt);
		const intervals: number[] = [];
		for (let i = 1; i < dates.length; i++) {
			intervals.push(differenceInDays(parseISO(dates[i]), parseISO(dates[i - 1])));
		}
		const avgInterval = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
		const intervalVariance =
			intervals.reduce((sum, d) => sum + Math.pow(d - avgInterval, 2), 0) / intervals.length;
		const intervalStdDev = Math.sqrt(intervalVariance);
		const intervalCV = intervalStdDev / avgInterval;

		if (intervalCV < 0.1) {
			confidence += 10; // Very consistent intervals
		}

		return Math.min(100, confidence);
	}

	private determinePatternType(
		amounts: number[],
		dates: string[]
	): RecurringPattern['patternType'] {
		// Check for exact matches
		const uniqueAmounts = new Set(amounts);
		if (uniqueAmounts.size === 1) {
			return 'exact';
		}

		// Check for seasonal variation
		const monthlyAmounts = new Map<number, number[]>();
		for (let i = 0; i < dates.length; i++) {
			const month = parseISO(dates[i]).getMonth() + 1;
			if (!monthlyAmounts.has(month)) {
				monthlyAmounts.set(month, []);
			}
			monthlyAmounts.get(month)!.push(amounts[i]);
		}

		if (monthlyAmounts.size >= 3) {
			// Check for significant seasonal variation
			const monthlyAverages = Array.from(monthlyAmounts.entries()).map(([month, amts]) => ({
				month,
				avg: amts.reduce((s, a) => s + a, 0) / amts.length
			}));

			const overallAvg = monthlyAverages.reduce((s, m) => s + m.avg, 0) / monthlyAverages.length;
			const maxDeviation = Math.max(...monthlyAverages.map((m) => Math.abs(m.avg - overallAvg)));

			if (maxDeviation / overallAvg > 0.15) {
				return 'seasonal';
			}
		}

		// Check for trend
		if (amounts.length >= 3) {
			const trend = this.calculateSimpleTrend(amounts);
			if (trend && Math.abs(trend.rate) > 0.05) {
				return 'trending';
			}
		}

		return 'approximate';
	}

	private extractDescriptionPattern(group: Transaction[]): string {
		const descriptions = group.map((tx) => (tx.description || '').toLowerCase().trim());

		// Find common words
		const allWords = descriptions.flatMap((d) => d.split(/\s+/));
		const wordCounts = new Map<string, number>();

		for (const word of allWords) {
			if (word.length > 2) {
				// Ignore short words
				wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
			}
		}

		const commonWords = Array.from(wordCounts.entries())
			.filter(([_, count]) => count >= group.length * 0.7)
			.map(([word]) => word)
			.join(' ');

		return commonWords || descriptions[0] || '';
	}

	private calculateAmountVariability(pattern: RecurringPattern): number {
		const amounts = pattern.historicalAmounts;
		if (amounts.length === 0) return 0;

		const avg = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
		const variance = amounts.reduce((sum, a) => sum + Math.pow(a - avg, 2), 0) / amounts.length;
		const stdDev = Math.sqrt(variance);

		// Return coefficient of variation (percentage)
		return (stdDev / avg) * 100;
	}

	private analyzeSeasonalVariation(
		pattern: RecurringPattern
	): Array<{ month: number; adjustment: number }> {
		if (pattern.historicalAmounts.length < 6) return [];

		const monthlyAmounts = new Map<number, number[]>();
		for (let i = 0; i < pattern.historicalDates.length; i++) {
			const month = parseISO(pattern.historicalDates[i]).getMonth() + 1;
			if (!monthlyAmounts.has(month)) {
				monthlyAmounts.set(month, []);
			}
			monthlyAmounts.get(month)!.push(pattern.historicalAmounts[i]);
		}

		const overallAvg = pattern.averageAmount;
		const seasonalVariation: Array<{ month: number; adjustment: number }> = [];

		for (const [month, amounts] of monthlyAmounts.entries()) {
			if (amounts.length >= 2) {
				const monthAvg = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
				const adjustment = monthAvg - overallAvg;
				seasonalVariation.push({ month, adjustment });
			}
		}

		return seasonalVariation;
	}

	private analyzeTrend(pattern: RecurringPattern): {
		direction: 'increasing' | 'decreasing' | 'stable';
		rate: number;
		confidence: number;
	} | null {
		if (pattern.historicalAmounts.length < 3) return null;

		const trend = this.calculateSimpleTrend(pattern.historicalAmounts);
		if (!trend) return null;

		const direction =
			trend.rate > 0.05 ? 'increasing' : trend.rate < -0.05 ? 'decreasing' : 'stable';
		const confidence = Math.min(100, Math.abs(trend.rate) * 1000);

		return { direction, rate: trend.rate, confidence };
	}

	private calculateSimpleTrend(values: number[]): { rate: number; rSquared: number } | null {
		if (values.length < 2) return null;

		const n = values.length;
		const x = Array.from({ length: n }, (_, i) => i);
		const y = values;

		const sumX = x.reduce((s, v) => s + v, 0);
		const sumY = y.reduce((s, v) => s + v, 0);
		const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
		const sumXX = x.reduce((s, v) => s + v * v, 0);
		const sumYY = y.reduce((s, v) => s + v * v, 0);

		const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
		const intercept = (sumY - slope * sumX) / n;

		// Calculate R-squared
		const yMean = sumY / n;
		const ssRes = y.reduce((s, v, i) => {
			const predicted = slope * i + intercept;
			return s + Math.pow(v - predicted, 2);
		}, 0);
		const ssTot = y.reduce((s, v) => s + Math.pow(v - yMean, 2), 0);
		const rSquared = 1 - ssRes / ssTot;

		return { rate: slope, rSquared };
	}

	private calculateAverageInterval(pattern: RecurringPattern): number {
		if (pattern.historicalDates.length < 2) return 30; // Default to monthly

		const intervals: number[] = [];
		for (let i = 1; i < pattern.historicalDates.length; i++) {
			intervals.push(
				differenceInDays(
					parseISO(pattern.historicalDates[i]),
					parseISO(pattern.historicalDates[i - 1])
				)
			);
		}

		return intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
	}

	private calculatePeriodsSinceLast(pattern: RecurringPattern): number {
		const lastDate = parseISO(pattern.lastObserved);
		const now = new Date();

		switch (pattern.frequency) {
			case 'daily':
				return differenceInDays(now, lastDate);
			case 'weekly':
				return Math.floor(differenceInDays(now, lastDate) / 7);
			case 'biweekly':
				return Math.floor(differenceInDays(now, lastDate) / 14);
			case 'monthly':
				return (
					(now.getFullYear() - lastDate.getFullYear()) * 12 + (now.getMonth() - lastDate.getMonth())
				);
			case 'quarterly':
				return Math.floor(
					(now.getFullYear() - lastDate.getFullYear()) * 4 +
						(now.getMonth() - lastDate.getMonth()) / 3
				);
			case 'yearly':
				return now.getFullYear() - lastDate.getFullYear();
			default:
				return Math.floor(differenceInDays(now, lastDate) / 30);
		}
	}

	private calculateVariabilityRange(pattern: RecurringPattern): {
		min: number;
		max: number;
		percentile25: number;
		percentile75: number;
	} {
		const amounts = [...pattern.historicalAmounts].sort((a, b) => a - b);
		const n = amounts.length;

		if (n === 0) {
			return { min: 0, max: 0, percentile25: 0, percentile75: 0 };
		}

		const percentile25 = amounts[Math.floor(n * 0.25)];
		const percentile75 = amounts[Math.floor(n * 0.75)];

		return {
			min: amounts[0],
			max: amounts[n - 1],
			percentile25,
			percentile75
		};
	}

	private generatePredictionNotes(pattern: RecurringPattern): string {
		const notes: string[] = [];

		if (pattern.trend && pattern.trend.confidence > 50) {
			notes.push(
				`Trending ${pattern.trend.direction} at ${(pattern.trend.rate * 100).toFixed(1)}% per period`
			);
		}

		if (pattern.seasonalVariation && pattern.seasonalVariation.length > 0) {
			notes.push('Seasonal variation detected');
		}

		if (pattern.amountVariability > 20) {
			notes.push(`High variability: ${pattern.amountVariability.toFixed(1)}%`);
		}

		return notes.join('; ') || 'Standard pattern';
	}

	private async detectMissingOccurrences(pattern: RecurringPattern): Promise<RecurringConflict[]> {
		// Auto-resolve missing occurrences by marking pattern as inactive
		// Don't create conflicts - patterns that stop appearing are simply inactive
		// This is handled by isPatternActive() method
		return [];
	}

	private async detectAmountMismatches(pattern: RecurringPattern): Promise<RecurringConflict[]> {
		const conflicts: RecurringConflict[] = [];
		const transactions = await db.transactions
			.where('id')
			.anyOf(pattern.matchingTransactionIds)
			.toArray();

		for (const tx of transactions) {
			const amount = Math.abs(tx.amount || 0);
			const expectedRange = this.calculateVariabilityRange(pattern);

			// Check if amount is outside expected range (more than 2 standard deviations)
			if (amount < expectedRange.min * 0.5 || amount > expectedRange.max * 1.5) {
				conflicts.push({
					id: generateUUID(),
					type: 'amount_mismatch',
					severity: 'medium',
					patternId: pattern.id,
					transactionId: tx.id,
					description: `Amount ${amount} is outside expected range (${expectedRange.min}-${expectedRange.max})`,
					suggestedResolution: {
						action: 'update',
						details: 'Review and update transaction amount or pattern'
					},
					detectedAt: new Date().toISOString()
				});
			}
		}

		return conflicts;
	}

	private async detectDateOverlaps(pattern: RecurringPattern): Promise<RecurringConflict[]> {
		const conflicts: RecurringConflict[] = [];
		const transactions = await db.transactions
			.where('id')
			.anyOf(pattern.matchingTransactionIds)
			.toArray();

		// Sort by date
		transactions.sort((a, b) => {
			const dateA = a.clearedDate || a.plannedDate || a.createdAt;
			const dateB = b.clearedDate || b.plannedDate || b.createdAt;
			return new Date(dateA).getTime() - new Date(dateB).getTime();
		});

		// Check for transactions that are too close together
		for (let i = 1; i < transactions.length; i++) {
			const prevDate = parseISO(
				transactions[i - 1].clearedDate ||
					transactions[i - 1].plannedDate ||
					transactions[i - 1].createdAt
			);
			const currDate = parseISO(
				transactions[i].clearedDate || transactions[i].plannedDate || transactions[i].createdAt
			);
			const daysBetween = differenceInDays(currDate, prevDate);

			const expectedInterval = this.calculateAverageInterval(pattern);
			if (daysBetween < expectedInterval * 0.5) {
				conflicts.push({
					id: generateUUID(),
					type: 'date_overlap',
					severity: 'low',
					patternId: pattern.id,
					transactionId: transactions[i].id,
					description: `Transaction date ${format(currDate, 'yyyy-MM-dd')} is too close to previous occurrence (${daysBetween} days, expected ~${expectedInterval})`,
					suggestedResolution: {
						action: 'merge',
						details: 'Consider merging duplicate transactions'
					},
					detectedAt: new Date().toISOString()
				});
			}
		}

		return conflicts;
	}

	private async detectDuplicates(pattern: RecurringPattern): Promise<RecurringConflict[]> {
		const conflicts: RecurringConflict[] = [];
		const transactions = await db.transactions
			.where('id')
			.anyOf(pattern.matchingTransactionIds)
			.toArray();

		// Group by date and amount
		const groups = new Map<string, Transaction[]>();
		for (const tx of transactions) {
			const date = tx.clearedDate || tx.plannedDate || tx.createdAt;
			const amount = Math.round((tx.amount || 0) * 100) / 100; // Round to 2 decimals
			const key = `${date}_${amount}`;

			if (!groups.has(key)) {
				groups.set(key, []);
			}
			groups.get(key)!.push(tx);
		}

		// Find duplicates
		for (const [key, group] of groups.entries()) {
			if (group.length > 1) {
				conflicts.push({
					id: generateUUID(),
					type: 'duplicate_detection',
					severity: 'medium',
					patternId: pattern.id,
					transactionId: group[1].id,
					description: `Duplicate transaction detected: ${group.length} transactions with same date and amount`,
					suggestedResolution: {
						action: 'merge',
						details: 'Merge duplicate transactions'
					},
					detectedAt: new Date().toISOString()
				});
			}
		}

		return conflicts;
	}

	private async detectCategoryMismatches(
		patterns: RecurringPattern[]
	): Promise<RecurringConflict[]> {
		const conflicts: RecurringConflict[] = [];

		for (const pattern of patterns) {
			if (!pattern.learnedCategoryId) continue;

			const transactions = await db.transactions
				.where('id')
				.anyOf(pattern.matchingTransactionIds)
				.toArray();

			for (const tx of transactions) {
				if (tx.categoryId && tx.categoryId !== pattern.learnedCategoryId) {
					conflicts.push({
						id: generateUUID(),
						type: 'category_mismatch',
						severity: 'low',
						patternId: pattern.id,
						transactionId: tx.id,
						description: `Transaction category doesn't match learned pattern category`,
						suggestedResolution: {
							action: 'update',
							details: 'Update transaction category to match pattern'
						},
						detectedAt: new Date().toISOString()
					});
				}
			}
		}

		return conflicts;
	}

	private mergeDuplicatePatterns(patterns: RecurringPattern[]): RecurringPattern[] {
		const merged: RecurringPattern[] = [];
		const processed = new Set<string>();

		for (let i = 0; i < patterns.length; i++) {
			if (processed.has(patterns[i].id)) continue;

			const pattern = patterns[i];
			const duplicates: RecurringPattern[] = [pattern];
			processed.add(pattern.id);

			// Find duplicates (same description, same type, different amounts)
			for (let j = i + 1; j < patterns.length; j++) {
				const other = patterns[j];
				if (processed.has(other.id)) continue;

				if (this.arePatternsDuplicates(pattern, other)) {
					duplicates.push(other);
					processed.add(other.id);
				}
			}

			// Merge duplicates into one pattern
			if (duplicates.length > 1) {
				const mergedPattern = this.mergePatterns(duplicates);
				merged.push(mergedPattern);
			} else {
				merged.push(pattern);
			}
		}

		return merged;
	}

	private arePatternsDuplicates(pattern1: RecurringPattern, pattern2: RecurringPattern): boolean {
		// Must have same transaction type
		if (pattern1.metadata.type !== pattern2.metadata.type) return false;

		// Must have same description pattern (merchant/payee)
		const desc1 = (pattern1.descriptionPattern || '').toLowerCase().trim();
		const desc2 = (pattern2.descriptionPattern || '').toLowerCase().trim();

		if (desc1 !== desc2 && desc1.length > 0 && desc2.length > 0) {
			// Check word overlap for similar descriptions
			const words1 = desc1.split(/\s+/).filter((w) => w.length > 2);
			const words2 = desc2.split(/\s+/).filter((w) => w.length > 2);
			const commonWords = words1.filter((w) => words2.includes(w));
			const similarity = commonWords.length / Math.max(words1.length, words2.length);

			if (similarity < 0.7) return false; // Need at least 70% word overlap
		}

		// Same account (or both have no account)
		if (pattern1.metadata.accountId !== pattern2.metadata.accountId) return false;

		// Amounts can differ - that's why we're merging them
		return true;
	}

	private mergePatterns(patterns: RecurringPattern[]): RecurringPattern {
		// Use the pattern with highest confidence as base
		const base = patterns.reduce((best, current) =>
			current.confidence > best.confidence ? current : best
		);

		// Merge all transaction IDs
		const allTransactionIds = new Set<string>();
		for (const pattern of patterns) {
			pattern.matchingTransactionIds.forEach((id) => allTransactionIds.add(id));
		}

		// Merge all amounts and dates
		const allAmounts: number[] = [];
		const allDates: string[] = [];
		for (const pattern of patterns) {
			allAmounts.push(...pattern.historicalAmounts);
			allDates.push(...pattern.historicalDates);
		}

		// Sort dates
		allDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

		// Recalculate average amount
		const averageAmount = allAmounts.reduce((sum, a) => sum + a, 0) / allAmounts.length;

		// Create merged pattern
		const merged: RecurringPattern = {
			...base,
			id: generateUUID(), // New ID for merged pattern
			matchingTransactionIds: Array.from(allTransactionIds),
			historicalAmounts: allAmounts,
			historicalDates: allDates,
			occurrences: allAmounts.length,
			firstObserved: allDates[0],
			lastObserved: allDates[allDates.length - 1],
			averageAmount,
			amountVariability: this.calculateAmountVariability({
				historicalAmounts: allAmounts
			} as RecurringPattern),
			// Recalculate frequency with merged data
			frequency: this.detectFrequency(allDates) || base.frequency,
			// Recalculate confidence (may be lower due to amount variability)
			confidence: Math.max(30, base.confidence - 10) // Slightly lower due to merging
		};

		return merged;
	}

	private calculateDateRelevancy(pattern: RecurringPattern, now: Date): number {
		const lastDate = parseISO(pattern.lastObserved);
		const daysSinceLast = differenceInDays(now, lastDate);

		// Calculate expected interval based on frequency
		let expectedInterval = 30; // Default to monthly
		switch (pattern.frequency) {
			case 'daily':
				expectedInterval = 1;
				break;
			case 'weekly':
				expectedInterval = 7;
				break;
			case 'biweekly':
				expectedInterval = 14;
				break;
			case 'monthly':
				expectedInterval = 30;
				break;
			case 'quarterly':
				expectedInterval = 90;
				break;
			case 'yearly':
				expectedInterval = 365;
				break;
			case 'irregular':
				// Use average interval from historical data
				if (pattern.historicalDates.length >= 2) {
					const intervals: number[] = [];
					for (let i = 1; i < pattern.historicalDates.length; i++) {
						intervals.push(
							differenceInDays(
								parseISO(pattern.historicalDates[i]),
								parseISO(pattern.historicalDates[i - 1])
							)
						);
					}
					expectedInterval = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
				}
				break;
		}

		// Relevancy decreases as time passes beyond expected interval
		// 100% if within expected interval, decreases linearly to 0% at 3x expected interval
		const maxDays = expectedInterval * 3;
		if (daysSinceLast <= expectedInterval) {
			return 100;
		} else if (daysSinceLast >= maxDays) {
			return 0;
		} else {
			// Linear decrease from 100% to 0%
			return Math.max(
				0,
				100 - ((daysSinceLast - expectedInterval) / (maxDays - expectedInterval)) * 100
			);
		}
	}

	private isPatternActive(pattern: RecurringPattern, now: Date): boolean {
		const lastDate = parseISO(pattern.lastObserved);
		const daysSinceLast = differenceInDays(now, lastDate);

		// Calculate expected interval
		let expectedInterval = 30;
		switch (pattern.frequency) {
			case 'daily':
				expectedInterval = 1;
				break;
			case 'weekly':
				expectedInterval = 7;
				break;
			case 'biweekly':
				expectedInterval = 14;
				break;
			case 'monthly':
				expectedInterval = 30;
				break;
			case 'quarterly':
				expectedInterval = 90;
				break;
			case 'yearly':
				expectedInterval = 365;
				break;
			case 'irregular':
				if (pattern.historicalDates.length >= 2) {
					const intervals: number[] = [];
					for (let i = 1; i < pattern.historicalDates.length; i++) {
						intervals.push(
							differenceInDays(
								parseISO(pattern.historicalDates[i]),
								parseISO(pattern.historicalDates[i - 1])
							)
						);
					}
					expectedInterval = intervals.reduce((sum, d) => sum + d, 0) / intervals.length;
				}
				break;
		}

		// Pattern is active if last occurrence was within 2x expected interval
		// This gives some leeway for irregular patterns
		return daysSinceLast <= expectedInterval * 2;
	}

	private getCachedPatterns(key: string): RecurringPattern[] | null {
		const expiry = this.cacheExpiry.get(key);
		if (expiry && expiry > Date.now()) {
			// Cache is valid, but we need to return patterns by key
			// For now, return null and rely on patternCache
			return null;
		}
		return null;
	}

	private setCachedPatterns(key: string, patterns: RecurringPattern[]): void {
		this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
		// Also cache individual patterns
		for (const pattern of patterns) {
			this.patternCache.set(pattern.id, pattern);
		}
	}
}

// Export singleton instance
export const recurringTransactionIntelligenceService =
	new RecurringTransactionIntelligenceService();
