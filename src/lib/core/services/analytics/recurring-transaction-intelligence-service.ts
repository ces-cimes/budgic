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
import { performanceMonitor } from '../core/performance-monitor';
import { serviceCache } from '../core/service-cache';
import { devLog } from '$lib/utils/dev-log';
import { canonicalDuplicateKey, iqrFilter } from '$lib/utils/data-quality-utils';
import {
	RECURRING_DETECTION_CONFIG,
	TransactionSimilarityEngine,
	resolveSimilarityProfile,
	type SimilarityProfileName
} from '../intelligence/transaction-similarity-engine';
import TransactionSimilarityWorker from '../intelligence/transaction-similarity.worker?worker';

const PATTERN_CACHE_TTL = 10 * 60 * 1000; // 10 minutes — O(n²) is expensive to recompute

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

/**
 * Normalize a transaction description to a grouping key for pre-filtering.
 * Strips digits (store codes, order numbers) and non-letter characters so that
 * "Tesco Stores 4321" and "Tesco Stores 9876" collapse to the same key.
 */
function descGroupKey(description: string | null | undefined): string {
	if (!description) return '';
	return description
		.toLowerCase()
		.replace(/[0-9]+/g, '') // strip all digit sequences
		.replace(/[^a-z]/g, '') // strip non-letters
		.substring(0, 16); // cap to avoid overly specific keys
}

/**
 * Remove transactions whose normalized description appears only once in the set.
 * Such transactions can never form a recurring group, so they are noise for the
 * O(n²) clustering step.
 *
 * Conservative approach: only exclude a transaction when its key is long enough
 * to be unambiguous (≥ 4 letters after stripping digits/punctuation) AND that key
 * appears exactly once across the whole dataset.  Short or empty keys — which arise
 * from numeric-heavy descriptions like bank references, rent wire IDs, or salary
 * BACS codes — are always kept so they can still be grouped by the fuzzy engine.
 */
function preFilterForClustering<T extends { description?: string | null }>(txs: T[]): T[] {
	const counts = new Map<string, number>();
	for (const tx of txs) {
		const key = descGroupKey(tx.description);
		if (key.length >= 4) counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const filtered = txs.filter((tx) => {
		const key = descGroupKey(tx.description);
		// Short/empty key → can't judge → keep (conservative)
		if (key.length < 4) return true;
		// Long meaningful key → only exclude confirmed singletons
		return (counts.get(key) ?? 0) >= 2;
	});
	// Sanity-check: if we somehow filtered everything out, use the full set
	return filtered.length >= 2 ? filtered : txs;
}

/**
 * Exponential moving average over a chronologically-ordered array of values.
 * α = 0.3 → recent observations carry ~3× more weight than observations from
 * 3 periods ago, while still smoothing out single-period noise.
 *
 * The array must be sorted oldest-first (which matches the group sort in
 * analyzeGroupForPattern).
 */
function ema(values: number[], alpha = 0.3): number {
	if (!values.length) return 0;
	return values.reduce((acc, v, i) => (i === 0 ? v : alpha * v + (1 - alpha) * acc));
}

/**
 * Collapse same-day split payments into a single synthetic transaction so the
 * clustering engine sees the full payment amount rather than each component.
 *
 * Two (or more) transactions are merged when ALL of the following hold:
 *   1. Their normalized descriptions match EXACTLY (after descGroupKey normalisation),
 *      and the key is at least 4 characters long.
 *   2. Their `clearedDate` falls within ±1 calendar day of each other.
 *   3. They share the same economic direction (both positive or both negative amount).
 *
 * The exact-description guard is intentionally strict to minimise false positives.
 * If in doubt the transactions are left separate — the fuzzy clustering stage can
 * still detect the recurring pattern via description similarity.
 *
 * The synthetic transaction inherits the first transaction's metadata and carries
 * the summed amount.  `matchingTransactionIds` is stored in the `notes` field as
 * a comma-separated list so the original IDs are not lost.
 */
function groupSameEventTransactions(txs: Transaction[]): Transaction[] {
	const used = new Set<string>();
	const result: Transaction[] = [];

	// Build an index: normalizedDescriptionKey → Transaction[]
	const byKey = new Map<string, Transaction[]>();
	for (const tx of txs) {
		const key = descGroupKey(tx.description);
		if (key.length < 4) {
			// Description too short to reliably match — keep as-is
			result.push(tx);
			used.add(tx.id);
			continue;
		}
		if (!byKey.has(key)) byKey.set(key, []);
		byKey.get(key)!.push(tx);
	}

	for (const [, group] of byKey) {
		// Sort oldest-first so we pick the earliest tx as the synthetic base
		group.sort((a, b) => (a.clearedDate ?? '').localeCompare(b.clearedDate ?? ''));

		for (let i = 0; i < group.length; i++) {
			const base = group[i];
			if (used.has(base.id)) continue;

			const dir = (base.amount ?? 0) >= 0 ? 1 : -1;
			const baseDate = base.clearedDate ? new Date(base.clearedDate) : null;
			if (!baseDate) {
				result.push(base);
				used.add(base.id);
				continue;
			}

			// Collect all transactions in the same event window
			const eventTxs: Transaction[] = [base];
			for (let j = i + 1; j < group.length; j++) {
				const other = group[j];
				if (used.has(other.id)) continue;
				const otherDir = (other.amount ?? 0) >= 0 ? 1 : -1;
				if (otherDir !== dir) continue;
				const otherDate = other.clearedDate ? new Date(other.clearedDate) : null;
				if (!otherDate) continue;
				const dayDiff = Math.abs(
					Math.round((otherDate.getTime() - baseDate.getTime()) / 86_400_000)
				);
				if (dayDiff <= 1) eventTxs.push(other);
			}

			if (eventTxs.length === 1) {
				// No merge needed — single transaction
				result.push(base);
				used.add(base.id);
			} else {
				// Merge into one synthetic transaction with the summed amount
				const summedAmount = eventTxs.reduce((s, tx) => s + (tx.amount ?? 0), 0);
				const ids = eventTxs.map((tx) => tx.id);
				// Pick the most common categoryId across the merged originals so that
				// analyzeGroupForPattern can correctly learn the category even when the
				// first (base) transaction is a transfer leg with no category assigned.
				const catCounts = new Map<string, number>();
				for (const tx of eventTxs) {
					if (tx.categoryId)
						catCounts.set(tx.categoryId, (catCounts.get(tx.categoryId) ?? 0) + 1);
				}
				const bestCatId = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
				const synthetic: Transaction = {
					...base,
					id: `synthetic:${ids.join('+')}`,
					amount: summedAmount,
					notes: ids.join(','),
					categoryId: bestCatId ?? base.categoryId
				};
				result.push(synthetic);
				ids.forEach((id) => used.add(id));
				devLog(
					`[Recurring] merged ${eventTxs.length} split-payment txs → amount ${summedAmount.toFixed(0)}`,
					ids
				);
			}
		}
	}

	return result;
}

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
	// Per-ID cache for fast single-pattern lookups (populated alongside serviceCache)
	private patternCache: Map<string, RecurringPattern> = new Map();
	private readonly similarityEngine = new TransactionSimilarityEngine();
	// Persistent worker: created on first large cluster request, reused across calls.
	private _worker: InstanceType<typeof TransactionSimilarityWorker> | null = null;

	/**
	 * Single shared Promise for the canonical detection run.
	 *
	 * The worker uses `worker.onmessage =` (assignment), so if multiple callers invoke
	 * `clusterTransactions` concurrently, each one overwrites the previous handler and
	 * only the LAST caller's Promise ever resolves — all earlier ones hang forever.
	 *
	 * By sharing one Promise for all concurrent callers we guarantee the O(n²) worker
	 * step runs exactly once at a time, and every caller awaits the same result.
	 */
	private _canonicalInFlight: Promise<RecurringPattern[]> | null = null;

	/**
	 * Detect recurring patterns from transaction history
	 */
	async detectPatterns(
		days: number = 365,
		minOccurrences: number = 3
	): Promise<RecurringPattern[]> {
		return performanceMonitor.monitor(
			'RecurringTransactionIntelligenceService',
			'detectPatterns',
			() => this._detectPatterns(days, minOccurrences)
		);
	}

	private async _detectPatterns(
		days: number,
		minOccurrences: number
	): Promise<RecurringPattern[]> {
		const canonical = await this._getCanonical();
		return this._deriveFromCanonical(canonical, days, minOccurrences);
	}

	/**
	 * Return the canonical (365-day, minOccurrences=2) pattern set.
	 *
	 * Three-tier lookup:
	 *   1. In-memory serviceCache  (fast, cleared on page unload)
	 *   2. IndexedDB recurringPatternsCache  (survives page refresh, 24 h TTL)
	 *   3. Full O(n²) detection  (always fresh, result written to both caches)
	 *
	 * Concurrent callers are coalesced onto a single in-flight Promise so the
	 * worker's `onmessage` handler is never overwritten by a second caller.
	 */
	private async _getCanonical(): Promise<RecurringPattern[]> {
		// Tier 1: in-memory cache
		const cached = serviceCache.get<RecurringPattern[]>('recurring:patterns:canonical');
		if (cached !== null) return cached;

		// Tier 2: IndexedDB — survives page refresh
		try {
			const dbRow = await db.recurringPatternsCache.get('canonical');
			if (
				dbRow &&
				Date.now() - new Date(dbRow.computedAt).getTime() < 24 * 60 * 60 * 1000
			) {
				const patterns = dbRow.patterns as RecurringPattern[];
				serviceCache.set('recurring:patterns:canonical', patterns, PATTERN_CACHE_TTL);
				for (const p of patterns) this.patternCache.set(p.id, p);
				devLog(`[Recurring] loaded ${patterns.length} patterns from IndexedDB cache`);
				return patterns;
			}
		} catch {
			// IndexedDB unavailable — fall through to full detection
		}

		// Tier 3: full detection (coalesced so only one worker runs at a time)
		if (!this._canonicalInFlight) {
			this._canonicalInFlight = this._runDetection(365, 2)
				.then(async (result) => {
					serviceCache.set('recurring:patterns:canonical', result, PATTERN_CACHE_TTL);
					try {
						await db.recurringPatternsCache.put({
							id: 'canonical',
							patterns: result,
							computedAt: new Date().toISOString()
						});
					} catch {
						// Non-fatal — in-memory cache still serves subsequent requests
					}
					this._canonicalInFlight = null;
					return result;
				})
				.catch((err) => {
					this._canonicalInFlight = null;
					throw err;
				});
		}

		return this._canonicalInFlight;
	}

	/** Filter the canonical set to the requested (days, minOccurrences) window. */
	private _deriveFromCanonical(
		canonical: RecurringPattern[],
		days: number,
		minOccurrences: number
	): RecurringPattern[] {
		// Fast path: caller wants the canonical set or a superset of it
		if (days >= 365 && minOccurrences <= 2) return canonical;

		// Derive a subset by filtering on date window and per-window occurrence count.
		// historicalDates contains all observed dates so we can count within any window.
		const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
		return canonical.filter((p) => {
			if (p.lastObserved < cutoff) return false;
			const inWindow = p.historicalDates.filter((d) => d >= cutoff).length;
			return inWindow >= minOccurrences;
		});
	}

	private async _runDetection(days: number, minOccurrences: number): Promise<RecurringPattern[]> {
		const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
		const transactions = await db.transactions
			.where('clearedDate')
			.above(cutoffDate.toISOString())
			.and((tx) => !tx.deletedAt && tx.status === 'cleared')
			.toArray();

		// Step 1: collapse same-day split payments into one synthetic transaction so the
		// clustering engine sees the full payment amount rather than each component.
		const eventGrouped = groupSameEventTransactions(transactions);

		// Step 2: pre-filter singletons. A transaction whose description appears only once
		// in the dataset cannot form a recurring group, so it is noise for O(n²) clustering.
		const clusterInput = preFilterForClustering(eventGrouped);

		devLog(
			`[Recurring] window=${days}d  raw=${transactions.length}` +
				`  after-event-group=${eventGrouped.length}` +
				`  after-prefilter=${clusterInput.length}` +
				`  (${eventGrouped.length - clusterInput.length} singletons removed)`
		);

		const rawPatterns: RecurringPattern[] = [];

		// Group transactions by similarity (description, amount, account, temporal cadence)
		const transactionGroups = await this.clusterTransactions(
			clusterInput,
			'RECURRING_DETECTION_CONFIG',
			2
		);

		devLog(`[Recurring] clusters=${transactionGroups.length}`);

		for (const group of transactionGroups) {
			if (group.length < minOccurrences) continue;

			const pattern = await this.analyzeGroupForPattern(group);
			if (pattern && pattern.confidence >= 30) {
				rawPatterns.push(pattern);
			}
		}

		devLog(`[Recurring] raw patterns=${rawPatterns.length}  (before merge)`);

		// Merge duplicate patterns (same description, same type, similar amounts)
		const mergedPatterns = this.mergeDuplicatePatterns(rawPatterns);

		// Calculate date relevancy and active status
		const now = new Date();
		for (const pattern of mergedPatterns) {
			pattern.dateRelevancy = this.calculateDateRelevancy(pattern, now);
			pattern.isActive = this.isPatternActive(pattern, now);
		}

		// Sort: active first → most occurrences → soonest next occurrence → most recent → confidence
		const frequencyPeriodDays: Record<RecurringPattern['frequency'], number> = {
			daily: 1,
			weekly: 7,
			biweekly: 14,
			monthly: 30,
			quarterly: 91,
			yearly: 365,
			irregular: 30
		};
		const approxDaysUntilNext = (p: RecurringPattern): number => {
			const period = frequencyPeriodDays[p.frequency] ?? 30;
			const daysSinceLast = (now.getTime() - new Date(p.lastObserved).getTime()) / 86_400_000;
			return Math.max(0, period - (daysSinceLast % period));
		};
		mergedPatterns.sort((a, b) => {
			if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
			if (a.occurrences !== b.occurrences) return b.occurrences - a.occurrences;
			const urgencyDiff = approxDaysUntilNext(a) - approxDaysUntilNext(b);
			if (Math.abs(urgencyDiff) > 2) return urgencyDiff; // soonest next first
			if (Math.abs(a.dateRelevancy - b.dateRelevancy) > 5) return b.dateRelevancy - a.dateRelevancy;
			return b.confidence - a.confidence;
		});

		devLog(
			`[Recurring] final patterns=${mergedPatterns.length}`,
			mergedPatterns.slice(0, 15).map((p) => ({
				desc: p.descriptionPattern,
				freq: p.frequency,
				n: p.occurrences,
				avg: p.averageAmount.toFixed(0),
				active: p.isActive,
				nextIn: `${approxDaysUntilNext(p).toFixed(0)}d`,
				conf: p.confidence
			}))
		);

		// Also populate the per-ID cache for fast single-pattern lookups
		for (const pattern of mergedPatterns) {
			this.patternCache.set(pattern.id, pattern);
		}

		return mergedPatterns;
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
	 * Patch the `learnedCategoryId` for a single pattern across all cache layers
	 * without invalidating or re-running detection.
	 *
	 * Called by the UI immediately after `applyPatternTier` so that the next page
	 * refresh reads the correct category from the IndexedDB-persisted canonical set.
	 */
	async patchPatternCategory(patternId: string, categoryId: string): Promise<void> {
		// 1. patternCache (per-ID lookup map)
		const inMap = this.patternCache.get(patternId);
		if (inMap) {
			this.patternCache.set(patternId, { ...inMap, learnedCategoryId: categoryId });
		}

		// 2. serviceCache (in-memory canonical array)
		const canonical = serviceCache.get<RecurringPattern[]>('recurring:patterns:canonical');
		if (canonical) {
			const patched = canonical.map((p) =>
				p.id === patternId ? { ...p, learnedCategoryId: categoryId } : p
			);
			serviceCache.set('recurring:patterns:canonical', patched, PATTERN_CACHE_TTL);
		}

		// 3. IndexedDB canonical row (survives page refresh)
		try {
			const dbRow = await db.recurringPatternsCache.get('canonical');
			if (dbRow) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const patched = dbRow.patterns.map((p: any) =>
					p.id === patternId ? { ...p, learnedCategoryId: categoryId } : p
				);
				await db.recurringPatternsCache.put({ ...dbRow, patterns: patched });
			}
		} catch {
			// Non-fatal — in-memory cache still serves subsequent requests
		}
	}

	/**
	 * Clear pattern cache (both in-memory and IndexedDB).
	 */
	clearCache(): void {
		this.patternCache.clear();
		serviceCache.invalidatePattern(/^recurring:patterns:/);
		// Abandon any in-flight detection so the next call starts fresh
		this._canonicalInFlight = null;
		// Delete the persisted row so a page-refresh cold start also re-detects
		void db.recurringPatternsCache.delete('canonical');
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	private getWorker(): InstanceType<typeof TransactionSimilarityWorker> {
		if (!this._worker) {
			this._worker = new TransactionSimilarityWorker();
		}
		return this._worker;
	}

	private async clusterTransactions(
		transactions: Transaction[],
		profileName: SimilarityProfileName,
		minGroupSize: number
	): Promise<Transaction[][]> {
		if (transactions.length === 0) return [];
		const config = resolveSimilarityProfile(profileName);

		if (transactions.length <= 50) {
			return this.similarityEngine.cluster(transactions, config, minGroupSize);
		}

		const worker = this.getWorker();

		try {
			const clusteredIndices = await new Promise<number[][]>((resolve, reject) => {
				worker.onmessage = (event: MessageEvent<{ clusters: number[][] }>) => {
					resolve(event.data.clusters);
				};
				worker.onerror = (error) => {
					reject(error);
				};
				worker.postMessage({
					transactions,
					profileName,
					minGroupSize
				});
			});

			return clusteredIndices.map((group) =>
				group.map((index) => transactions[index]).filter(Boolean)
			);
		} catch {
			// Worker failed — terminate it so a fresh one is created next call,
			// then fall back to main-thread clustering.
			this._worker?.terminate();
			this._worker = null;
			return this.similarityEngine.cluster(transactions, config, minGroupSize);
		}
	}

	private async analyzeGroupForPattern(group: Transaction[]): Promise<RecurringPattern | null> {
		if (group.length < 2) return null;

		// Sort by date
		group.sort((a, b) => {
			const dateA = a.clearedDate || a.plannedDate || a.createdAt;
			const dateB = b.clearedDate || b.plannedDate || b.createdAt;
			return new Date(dateA).getTime() - new Date(dateB).getTime();
		});

		const rawAmounts = group.map((tx) => Math.abs(tx.amount || 0));
		const dates = group.map((tx) => tx.clearedDate || tx.plannedDate || tx.createdAt);

		// Calculate frequency
		const frequency = this.detectFrequency(dates);
		if (!frequency) return null;

		// Strip zero-amount entries before computing the average.
		// Transfer-type transactions (e.g. credit-card payment legs) are often stored with
		// amount=0 in the DB while the UI resolves the real value from the counterpart leg.
		// Treating zeros as genuine occurrences would pull averageAmount to zero.
		// If ALL amounts are zero we keep them (no data to fall back to).
		const amounts = rawAmounts.some((a) => a > 0) ? rawAmounts.filter((a) => a > 0) : rawAmounts;

		// IQR outlier filter: exclude one-off anomalies (e.g. rent + realtor cut in one month)
		// from the amount prediction while keeping them in historicalAmounts for display.
		const { core: coreAmounts, outliers: outlierAmounts } = iqrFilter(amounts, 1.5);
		if (outlierAmounts.length > 0) {
			devLog(
				`[Recurring] IQR excluded ${outlierAmounts.length} outlier(s) from amount calc:`,
				outlierAmounts,
				'core range:',
				Math.min(...coreAmounts).toFixed(0),
				'–',
				Math.max(...coreAmounts).toFixed(0)
			);
		}

		// EMA-weighted average: recent amounts carry more weight than old ones.
		// coreAmounts is already sorted oldest-first (group was sorted by date above).
		const averageAmount = ema(coreAmounts);

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
				historicalAmounts: coreAmounts
			} as RecurringPattern),
			typicalDayOfMonth,
			typicalDayOfWeek,
			typicalWeekOfMonth,
			occurrences: group.length,
			firstObserved: dates[0],
			lastObserved: dates[dates.length - 1],
			historicalAmounts: rawAmounts, // full record including zeros for display
			historicalDates: dates,
			// Expand synthetic IDs back to their original transaction IDs so that
			// callers (e.g. applyPatternTier) can reliably bulkGet from IndexedDB.
			// Synthetic transactions encode their originals in `notes` as a comma list.
			matchingTransactionIds: group.flatMap((tx) =>
				tx.id.startsWith('synthetic:')
					? (tx.notes ?? '').split(',').filter(Boolean)
					: [tx.id]
			),
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

		// Group by canonical duplicate key (amount + normalized date + description prefix)
		const groups = new Map<string, Transaction[]>();
		for (const tx of transactions) {
			const key = canonicalDuplicateKey(tx);

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

		// Sort dates (and keep amounts aligned with the same sort order)
		const combined = allDates
			.map((d, i) => ({ date: d, amount: allAmounts[i] }))
			.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
		const sortedDates = combined.map((c) => c.date);
		const sortedAmounts = combined.map((c) => c.amount);

		// Strip zeros before IQR+EMA (same rationale as analyzeGroupForPattern)
		const nonZeroAmounts =
			sortedAmounts.some((a) => a > 0) ? sortedAmounts.filter((a) => a > 0) : sortedAmounts;
		const { core: coreAmounts } = iqrFilter(nonZeroAmounts, 1.5);
		const averageAmount = ema(coreAmounts);

		// Create merged pattern
		const merged: RecurringPattern = {
			...base,
			id: generateUUID(), // New ID for merged pattern
			matchingTransactionIds: Array.from(allTransactionIds),
			historicalAmounts: sortedAmounts, // full record including zeros
			historicalDates: sortedDates,
			occurrences: sortedAmounts.length,
			firstObserved: sortedDates[0],
			lastObserved: sortedDates[sortedDates.length - 1],
			averageAmount,
			amountVariability: this.calculateAmountVariability({
				historicalAmounts: coreAmounts
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

}

// Export singleton instance
export const recurringTransactionIntelligenceService =
	new RecurringTransactionIntelligenceService();
