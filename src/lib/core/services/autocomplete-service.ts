import { db, generateUUID } from '$lib/core/db';
import type { AutocompleteUsage, Transaction } from '$lib/core/db';
import { normaliseMerchantKey } from '$lib/utils/transfer-utils';
import { serviceCache } from './core/service-cache';
import { recurringTransactionIntelligenceService } from './analytics/recurring-transaction-intelligence-service';
import { recordTxSnapshotCacheHit, recordTxSnapshotCacheMiss } from '$lib/utils/plan-perf-debug';

const SNAPSHOT_TTL = 5 * 60 * 1000;

export interface DescriptionSuggestion {
	value: string;
	frequency: number;
	inferredCategoryId?: string;
	lastUsed: Date;
	typicalAmount?: number | null;
	merchantKey?: string;
	variationCount?: number;
}

interface DescriptionAggregate {
	value: string;
	merchantKey: string;
	lastUsedMs: number;
	frequencyLast90Days: number;
	categoryCounts: Map<string, number>;
	variations: Set<string>;
	variationCounts: Map<string, number>;
	amountSamples: number[];
}

interface SelectionAggregate {
	selectionFrequency: number;
	lastSelectedMs: number | null;
}

export interface RankedValue {
	value: string;
	score: number;
	selectionFrequency: number;
	lastSelected?: Date;
}

export interface AmountStats {
	median: number;
	stddev: number;
	sampleSize: number;
}

export interface DateInference {
	nextDate: string;
	confidence: number;
}

export interface DescriptionIntelligence {
	merchantKey: string;
	typicalAmount: number | null;
	amountStats: AmountStats | null;
	dateInference: DateInference | null;
}

export interface TransferDestinationSuggestion {
	accountId: string;
	frequency: number;
	typicalAmount: number | null;
}

export type BoundedAutocompleteFieldKey = 'transaction.account' | 'transaction.category';

const CACHE_TTL_MS = 5 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_EIGHTY_DAYS_MS = 180 * 24 * 60 * 60 * 1000;
const RECENCY_DECAY = 0.05;
const DB_FREQUENCY_WEIGHT = 0.6;
const SELECTION_FREQUENCY_WEIGHT = 0.4;

class AutocompleteService {
	private suggestionCache = new Map<
		string,
		{ expiresAt: number; value: DescriptionSuggestion[] }
	>();
	private cleanupPromise: Promise<void> | null = null;
	private cleanupDone = false;

	async getSuggestionsForDescription(partial: string, limit = 8): Promise<DescriptionSuggestion[]> {
		await this.ensureSelectionDataPruned();

		const normalizedPartial = partial.trim().toLowerCase();
		const cacheKey = `${normalizedPartial}|${limit}`;
		const cached = this.suggestionCache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.value;
		}

		const transactions = await this.getTransactionsSnapshot();
		if (transactions.length < 3) {
			return [];
		}

		const now = Date.now();
		const ninetyDaysAgoMs = now - NINETY_DAYS_MS;
		const aggregates = new Map<string, DescriptionAggregate>();
		const selectionAggregates = await this.getSelectionAggregates();

		for (const tx of transactions) {
			if (tx.type === 'transfer') continue;
			const description = this.normalizeDescription(tx.description);
			if (!description) continue;

			const merchantKey = normaliseMerchantKey(description);
			const descriptionKey = merchantKey || description.toLowerCase();
			const usedAtMs = this.getTransactionTimestampMs(tx);

			let aggregate = aggregates.get(descriptionKey);
			if (!aggregate) {
				aggregate = {
					value: description,
					merchantKey: descriptionKey,
					lastUsedMs: usedAtMs,
					frequencyLast90Days: 0,
					categoryCounts: new Map<string, number>(),
					variations: new Set<string>(),
					variationCounts: new Map<string, number>(),
					amountSamples: []
				};
				aggregates.set(descriptionKey, aggregate);
			} else if (usedAtMs > aggregate.lastUsedMs) {
				aggregate.lastUsedMs = usedAtMs;
			}
			aggregate.variations.add(description);
			aggregate.variationCounts.set(
				description,
				(aggregate.variationCounts.get(description) ?? 0) + 1
			);

			if (usedAtMs >= ninetyDaysAgoMs) {
				aggregate.frequencyLast90Days += 1;
			}
			if (tx.status === 'cleared') {
				aggregate.amountSamples.push(Math.abs(tx.amount ?? 0));
			}

			if (tx.categoryId) {
				aggregate.categoryCounts.set(
					tx.categoryId,
					(aggregate.categoryCounts.get(tx.categoryId) ?? 0) + 1
				);
			}
		}

		const suggestions = Array.from(aggregates.values())
			.filter((item) =>
				normalizedPartial ? item.value.toLowerCase().includes(normalizedPartial) : true
			)
			.filter((item) => item.frequencyLast90Days > 0)
			.map((item) => {
				const selection = selectionAggregates.get(item.merchantKey);
				const recencyScore = this.computeRecencyScore(selection?.lastSelectedMs, now);
				const normalisedDbFrequency = this.normalizeFrequency(item.frequencyLast90Days);
				const normalisedSelectionFrequency = this.normalizeFrequency(
					selection?.selectionFrequency ?? 0
				);
				const score =
					DB_FREQUENCY_WEIGHT * normalisedDbFrequency +
					SELECTION_FREQUENCY_WEIGHT * normalisedSelectionFrequency * recencyScore;

				return { item, score };
			})
			.sort((a, b) => {
				if (b.score !== a.score) {
					return b.score - a.score;
				}
				if (b.item.frequencyLast90Days !== a.item.frequencyLast90Days) {
					return b.item.frequencyLast90Days - a.item.frequencyLast90Days;
				}
				return b.item.lastUsedMs - a.item.lastUsedMs;
			})
			.slice(0, Math.max(1, limit))
			.map(({ item }) => ({
				value: this.getCanonicalVariation(item),
				frequency: item.frequencyLast90Days,
				inferredCategoryId: this.getMostFrequentCategoryId(item.categoryCounts),
				lastUsed: new Date(item.lastUsedMs),
				typicalAmount: this.computeMedian(item.amountSamples.slice(0, 10)),
				merchantKey: item.merchantKey,
				variationCount: item.variations.size
			}));

		this.suggestionCache.set(cacheKey, {
			expiresAt: Date.now() + CACHE_TTL_MS,
			value: suggestions
		});

		return suggestions;
	}

	async recordSelection(
		fieldKey: string,
		value: string,
		selectedFromSuggestion: boolean,
		context?: Record<string, unknown>
	): Promise<void> {
		await this.ensureSelectionDataPruned();

		// Phase 0.6: exclude generic description learning for transfers — but Phase 7.6
		// transfer memo pool must still persist under `transaction.transfer.memo`.
		if (
			context &&
			context['transactionType'] === 'transfer' &&
			fieldKey !== 'transaction.transfer.memo'
		) {
			return;
		}

		const normalizedValue = this.normalizeDescription(value);
		if (!normalizedValue) {
			return;
		}

		const nowIso = new Date().toISOString();
		await db.autocompleteUsage.add({
			id: generateUUID(),
			fieldKey,
			value: normalizedValue,
			selectedFromSuggestion,
			context: context ? JSON.stringify(context) : undefined,
			typicalAmount: this.resolveTypicalAmount(context),
			timestamp: nowIso,
			createdAt: nowIso,
			updatedAt: nowIso,
			deletedAt: null
		});

		this.suggestionCache.clear();
	}

	async getDescriptionIntelligence(description: string): Promise<DescriptionIntelligence | null> {
		const normalizedDescription = this.normalizeDescription(description);
		if (!normalizedDescription) return null;

		const merchantKey = normaliseMerchantKey(normalizedDescription);
		const stats = await this.getAmountStatsForMerchant(merchantKey, normalizedDescription);
		const dateInference = await this.getDateInferenceForMerchant(
			merchantKey,
			normalizedDescription
		);

		return {
			merchantKey,
			typicalAmount: stats?.median ?? null,
			amountStats: stats,
			dateInference
		};
	}

	async getTransferMemoSuggestions(
		fromAccountId: string,
		toAccountId: string,
		partial: string,
		limit = 8
	): Promise<RankedValue[]> {
		const usageRows = await db.autocompleteUsage
			.where('fieldKey')
			.equals('transaction.transfer.memo')
			.toArray();
		const query = partial.trim().toLowerCase();
		const filtered = usageRows.filter((row) => {
			if (!row.context) return false;
			try {
				const parsed = JSON.parse(row.context) as { fromAccountId?: string; toAccountId?: string };
				if (parsed.fromAccountId !== fromAccountId || parsed.toAccountId !== toAccountId)
					return false;
			} catch {
				return false;
			}
			return query.length === 0 || row.value.toLowerCase().includes(query);
		});
		return this.rankUsageRows(filtered).slice(0, limit);
	}

	async getNoteSuggestionsForMerchant(
		description: string,
		partial: string,
		limit = 8
	): Promise<RankedValue[]> {
		const merchantKey = normaliseMerchantKey(description);
		if (!merchantKey) return [];

		const usageRows = await db.autocompleteUsage
			.where('fieldKey')
			.equals('transaction.notes')
			.toArray();
		const query = partial.trim().toLowerCase();
		const filtered = usageRows.filter((row) => {
			if (!row.context) return false;
			try {
				const parsed = JSON.parse(row.context) as { merchantKey?: string };
				if (parsed.merchantKey !== merchantKey) return false;
			} catch {
				return false;
			}
			return query.length === 0 || row.value.toLowerCase().startsWith(query);
		});
		return this.rankUsageRows(filtered).slice(0, limit);
	}

	async getTagSuggestions(partial: string, limit = 8): Promise<string[]> {
		const query = partial.trim().toLowerCase();
		if (!query) return [];
		const tags = await db.tags.where('normalizedName').startsWith(query).toArray();
		return tags
			.sort(
				(a, b) => b.usageCount - a.usageCount || a.normalizedName.localeCompare(b.normalizedName)
			)
			.slice(0, limit)
			.map((tag) => tag.name);
	}

	async getTransferDestinationSuggestions(
		fromAccountId: string,
		limit = 5
	): Promise<TransferDestinationSuggestion[]> {
		const transactions = await this.getTransactionsSnapshot();
		const frequencies = new Map<string, number>();
		const amountsByDestination = new Map<string, number[]>();

		for (const tx of transactions) {
			if (tx.type !== 'transfer') continue;
			if (tx.accountId !== fromAccountId) continue;
			const destinationId = tx.transferDetails?.toAccountId ?? tx.toAccountId;
			if (!destinationId) continue;

			frequencies.set(destinationId, (frequencies.get(destinationId) ?? 0) + 1);
			const bucket = amountsByDestination.get(destinationId) ?? [];
			bucket.push(Math.abs(tx.transferDetails?.transferAmount ?? tx.amount ?? 0));
			amountsByDestination.set(destinationId, bucket);
		}

		return Array.from(frequencies.entries())
			.map(([accountId, frequency]) => ({
				accountId,
				frequency,
				typicalAmount: this.computeMedian((amountsByDestination.get(accountId) ?? []).slice(0, 10))
			}))
			.sort((a, b) => b.frequency - a.frequency)
			.slice(0, limit);
	}

	async getRankedValuesForField(fieldKey: string): Promise<RankedValue[]> {
		await this.ensureSelectionDataPruned();
		const usageRows = await db.autocompleteUsage.where('fieldKey').equals(fieldKey).toArray();
		const nowMs = Date.now();
		const aggregateMap = new Map<string, SelectionAggregate>();

		for (const row of usageRows) {
			const normalized = this.normalizeDescription(row.value);
			if (!normalized) continue;
			const key = normalized.toLowerCase();
			const selectedAtMs = Date.parse(row.timestamp);
			const existing = aggregateMap.get(key);
			if (!existing) {
				aggregateMap.set(key, {
					selectionFrequency: 1,
					lastSelectedMs: Number.isNaN(selectedAtMs) ? null : selectedAtMs
				});
				continue;
			}
			existing.selectionFrequency += 1;
			if (!Number.isNaN(selectedAtMs)) {
				existing.lastSelectedMs =
					existing.lastSelectedMs === null
						? selectedAtMs
						: Math.max(existing.lastSelectedMs, selectedAtMs);
			}
		}

		return Array.from(aggregateMap.entries())
			.map(([value, aggregate]) => {
				const recencyScore = this.computeRecencyScore(aggregate.lastSelectedMs, nowMs);
				const normalizedSelection = this.normalizeFrequency(aggregate.selectionFrequency);
				return {
					value,
					score: normalizedSelection * recencyScore,
					selectionFrequency: aggregate.selectionFrequency,
					lastSelected: aggregate.lastSelectedMs ? new Date(aggregate.lastSelectedMs) : undefined
				};
			})
			.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				return b.selectionFrequency - a.selectionFrequency;
			});
	}

	/**
	 * Blend passive DB frequency (last 90 days of transactions) with explicit
	 * autocompleteUsage selections for bounded fields (account / category).
	 * Uses the same weighting as description suggestions: 0.6 DB + 0.4 selection×recency.
	 */
	async getBlendedBoundedFieldScores(
		fieldKey: BoundedAutocompleteFieldKey
	): Promise<Map<string, number>> {
		await this.ensureSelectionDataPruned();

		const nowMs = Date.now();
		const ninetyDaysAgoMs = nowMs - NINETY_DAYS_MS;
		const transactions = await this.getTransactionsSnapshot();

		interface DbAggregate {
			frequencyLast90Days: number;
			lastUsedMs: number;
		}
		const dbAggregates = new Map<string, DbAggregate>();

		for (const tx of transactions) {
			const rawId =
				fieldKey === 'transaction.account'
					? tx.accountId
					: fieldKey === 'transaction.category'
						? tx.categoryId
						: undefined;
			if (!rawId) continue;

			const idKey = rawId.toLowerCase();
			const usedAtMs = this.getTransactionTimestampMs(tx);

			let agg = dbAggregates.get(idKey);
			if (!agg) {
				agg = { frequencyLast90Days: 0, lastUsedMs: usedAtMs };
				dbAggregates.set(idKey, agg);
			} else if (usedAtMs > agg.lastUsedMs) {
				agg.lastUsedMs = usedAtMs;
			}

			if (usedAtMs >= ninetyDaysAgoMs) {
				agg.frequencyLast90Days += 1;
			}
		}

		const usageRows = await db.autocompleteUsage.where('fieldKey').equals(fieldKey).toArray();
		const selectionAggregates = new Map<string, SelectionAggregate>();

		for (const row of usageRows) {
			const normalizedId = this.normalizeBoundedId(row.value);
			if (!normalizedId) continue;

			const idKey = normalizedId.toLowerCase();
			const selectedAtMs = Date.parse(row.timestamp);
			const existing = selectionAggregates.get(idKey);
			if (!existing) {
				selectionAggregates.set(idKey, {
					selectionFrequency: 1,
					lastSelectedMs: Number.isNaN(selectedAtMs) ? null : selectedAtMs
				});
				continue;
			}
			existing.selectionFrequency += 1;
			if (!Number.isNaN(selectedAtMs)) {
				existing.lastSelectedMs =
					existing.lastSelectedMs === null
						? selectedAtMs
						: Math.max(existing.lastSelectedMs, selectedAtMs);
			}
		}

		const idKeys = new Set<string>([...dbAggregates.keys(), ...selectionAggregates.keys()]);
		const scores = new Map<string, number>();

		for (const idKey of idKeys) {
			const db = dbAggregates.get(idKey);
			const selection = selectionAggregates.get(idKey);

			const normalisedDbFrequency = this.normalizeFrequency(db?.frequencyLast90Days ?? 0);
			const dbRecencyScore = this.computeRecencyScore(db?.lastUsedMs ?? null, nowMs);
			const dbTerm = normalisedDbFrequency * dbRecencyScore;

			const selectionRecencyScore = this.computeRecencyScore(
				selection?.lastSelectedMs ?? null,
				nowMs
			);
			const normalisedSelectionFrequency = this.normalizeFrequency(
				selection?.selectionFrequency ?? 0
			);
			const selectionTerm = normalisedSelectionFrequency * selectionRecencyScore;

			const score = DB_FREQUENCY_WEIGHT * dbTerm + SELECTION_FREQUENCY_WEIGHT * selectionTerm;
			scores.set(idKey, score);
		}

		return scores;
	}

	clearCache() {
		this.suggestionCache.clear();
		serviceCache.invalidate('transactions:snapshot');
	}

	private async ensureSelectionDataPruned(): Promise<void> {
		if (this.cleanupDone) return;
		if (!this.cleanupPromise) {
			this.cleanupPromise = this.pruneOldSelections().finally(() => {
				this.cleanupDone = true;
			});
		}
		await this.cleanupPromise;
	}

	private async pruneOldSelections(): Promise<void> {
		const cutoffIso = new Date(Date.now() - ONE_EIGHTY_DAYS_MS).toISOString();
		const stale = await db.autocompleteUsage.where('timestamp').below(cutoffIso).toArray();
		if (stale.length === 0) return;

		const nowIso = new Date().toISOString();
		await db.autocompleteUsage.bulkUpdate(
			stale.map((entry) => ({
				key: entry.id,
				changes: {
					deletedAt: nowIso,
					updatedAt: nowIso
				}
			}))
		);
	}

	private async getSelectionAggregates(): Promise<Map<string, SelectionAggregate>> {
		const usageRows = await db.autocompleteUsage
			.where('fieldKey')
			.equals('transaction.description')
			.toArray();
		const aggregates = new Map<string, SelectionAggregate>();

		for (const row of usageRows) {
			const normalizedValue = this.normalizeDescription(row.value);
			if (!normalizedValue) continue;

			const key = normaliseMerchantKey(normalizedValue) || normalizedValue.toLowerCase();
			const selectedAtMs = Date.parse(row.timestamp);
			const existing = aggregates.get(key);
			if (!existing) {
				aggregates.set(key, {
					selectionFrequency: 1,
					lastSelectedMs: Number.isNaN(selectedAtMs) ? null : selectedAtMs
				});
				continue;
			}

			existing.selectionFrequency += 1;
			if (!Number.isNaN(selectedAtMs)) {
				existing.lastSelectedMs =
					existing.lastSelectedMs === null
						? selectedAtMs
						: Math.max(existing.lastSelectedMs, selectedAtMs);
			}
		}

		return aggregates;
	}

	private async getTransactionsSnapshot(): Promise<Transaction[]> {
		const snapshotHad = serviceCache.has('transactions:snapshot');
		const data = await serviceCache.getOrSet(
			'transactions:snapshot',
			() => db.transactions.toArray(),
			SNAPSHOT_TTL
		);
		if (snapshotHad) recordTxSnapshotCacheHit();
		else recordTxSnapshotCacheMiss();
		return data;
	}

	private normalizeFrequency(value: number): number {
		if (value <= 0) return 0;
		return Math.log1p(value);
	}

	private computeRecencyScore(lastSelectedMs: number | null | undefined, nowMs: number): number {
		if (!lastSelectedMs) return 0;
		const daysSinceLastSelection = Math.max(0, (nowMs - lastSelectedMs) / (24 * 60 * 60 * 1000));
		return Math.exp(-RECENCY_DECAY * daysSinceLastSelection);
	}

	private normalizeDescription(value: string | undefined): string | null {
		if (!value) return null;
		const normalized = value.trim().replace(/\s+/g, ' ');
		return normalized.length > 0 ? normalized : null;
	}

	private normalizeBoundedId(value: string | undefined): string | null {
		if (!value) return null;
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	private getTransactionTimestampMs(tx: Transaction): number {
		const raw = tx.clearedDate ?? tx.plannedDate ?? tx.createdAt;
		const parsed = Date.parse(raw);
		return Number.isNaN(parsed) ? 0 : parsed;
	}

	private getMostFrequentCategoryId(categoryCounts: Map<string, number>): string | undefined {
		let winner: string | undefined;
		let winnerCount = -1;

		for (const [categoryId, count] of categoryCounts.entries()) {
			if (count > winnerCount) {
				winner = categoryId;
				winnerCount = count;
			}
		}

		return winner;
	}

	private getCanonicalVariation(aggregate: DescriptionAggregate): string {
		let winner = aggregate.value;
		let winnerCount = -1;
		for (const [variation, count] of aggregate.variationCounts.entries()) {
			if (count > winnerCount) {
				winner = variation;
				winnerCount = count;
			}
		}
		return winner;
	}

	private rankUsageRows(rows: AutocompleteUsage[]): RankedValue[] {
		const nowMs = Date.now();
		const aggregateMap = new Map<string, SelectionAggregate>();
		for (const row of rows) {
			const normalized = this.normalizeDescription(row.value);
			if (!normalized) continue;
			const key = normalized.toLowerCase();
			const selectedAtMs = Date.parse(row.timestamp);
			const existing = aggregateMap.get(key);
			if (!existing) {
				aggregateMap.set(key, {
					selectionFrequency: 1,
					lastSelectedMs: Number.isNaN(selectedAtMs) ? null : selectedAtMs
				});
				continue;
			}
			existing.selectionFrequency += 1;
			if (!Number.isNaN(selectedAtMs)) {
				existing.lastSelectedMs =
					existing.lastSelectedMs === null
						? selectedAtMs
						: Math.max(existing.lastSelectedMs, selectedAtMs);
			}
		}

		return Array.from(aggregateMap.entries())
			.map(([value, aggregate]) => ({
				value,
				score:
					this.normalizeFrequency(aggregate.selectionFrequency) *
					this.computeRecencyScore(aggregate.lastSelectedMs, nowMs),
				selectionFrequency: aggregate.selectionFrequency,
				lastSelected: aggregate.lastSelectedMs ? new Date(aggregate.lastSelectedMs) : undefined
			}))
			.sort((a, b) => b.score - a.score || b.selectionFrequency - a.selectionFrequency);
	}

	private async getAmountStatsForMerchant(
		merchantKey: string,
		fallbackDescription: string
	): Promise<AmountStats | null> {
		const transactions = await this.getTransactionsSnapshot();
		const amounts: number[] = [];
		for (const tx of transactions) {
			if (tx.type === 'transfer') continue;
			if (tx.status !== 'cleared') continue;
			const normalized = this.normalizeDescription(tx.description);
			if (!normalized) continue;
			const key = normaliseMerchantKey(normalized) || normalized.toLowerCase();
			if (key !== merchantKey && normalized.toLowerCase() !== fallbackDescription.toLowerCase())
				continue;
			amounts.push(Math.abs(tx.amount ?? 0));
		}
		if (amounts.length < 3) return null;

		const sorted = [...amounts].sort((a, b) => a - b);
		const median = this.computeMedian(sorted);
		if (median === null) return null;
		const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
		const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;
		return { median, stddev: Math.sqrt(variance), sampleSize: sorted.length };
	}

	private async getDateInferenceForMerchant(
		merchantKey: string,
		fallbackDescription: string
	): Promise<DateInference | null> {
		try {
			const patterns = await recurringTransactionIntelligenceService.detectPatterns(365, 3);
			const merchantPattern = patterns
				.filter((pattern) => pattern.frequency !== 'irregular')
				.find((pattern) => {
					const patternKey = normaliseMerchantKey(pattern.descriptionPattern ?? '');
					return patternKey.length > 0 && patternKey === merchantKey;
				});
			if (merchantPattern && merchantPattern.confidence > 75) {
				const prediction = await recurringTransactionIntelligenceService.predictNextOccurrence(
					merchantPattern.id
				);
				if (prediction) {
					return {
						nextDate: prediction.nextOccurrenceDate,
						confidence: prediction.confidence / 100
					};
				}
			}
		} catch (error) {
			console.warn('Recurring intelligence date inference failed, using local fallback', error);
		}

		const transactions = await this.getTransactionsSnapshot();
		const dates: Date[] = [];
		for (const tx of transactions) {
			if (tx.type === 'transfer') continue;
			const normalized = this.normalizeDescription(tx.description);
			if (!normalized) continue;
			const key = normaliseMerchantKey(normalized) || normalized.toLowerCase();
			if (key !== merchantKey && normalized.toLowerCase() !== fallbackDescription.toLowerCase())
				continue;
			const timestamp = tx.clearedDate ?? tx.plannedDate ?? tx.createdAt;
			const parsed = new Date(timestamp);
			if (!Number.isNaN(parsed.getTime())) {
				dates.push(parsed);
			}
		}

		if (dates.length < 3) return null;
		const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
		const intervalsDays: number[] = [];
		for (let i = 1; i < sorted.length; i += 1) {
			const deltaMs = sorted[i].getTime() - sorted[i - 1].getTime();
			const deltaDays = deltaMs / (24 * 60 * 60 * 1000);
			if (deltaDays > 0) intervalsDays.push(deltaDays);
		}
		if (intervalsDays.length < 2) return null;

		const medianInterval = this.computeMedian(intervalsDays);
		if (medianInterval === null) return null;
		const meanInterval =
			intervalsDays.reduce((sum, value) => sum + value, 0) / intervalsDays.length;
		const variance =
			intervalsDays.reduce((sum, value) => sum + (value - meanInterval) ** 2, 0) /
			intervalsDays.length;
		const stddev = Math.sqrt(variance);
		const confidence = Math.max(0, Math.min(1, 1 - stddev / Math.max(1, medianInterval)));
		if (confidence <= 0.75) return null;

		const nextDate = new Date(sorted[sorted.length - 1].getTime());
		nextDate.setDate(nextDate.getDate() + Math.round(medianInterval));
		return {
			nextDate: nextDate.toISOString(),
			confidence
		};
	}

	private resolveTypicalAmount(context?: Record<string, unknown>): number | null {
		const raw = context?.['typicalAmount'];
		return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
	}

	private computeMedian(values: number[]): number | null {
		if (values.length === 0) return null;
		const sorted = [...values].sort((a, b) => a - b);
		const middle = Math.floor(sorted.length / 2);
		if (sorted.length % 2 === 0) {
			return (sorted[middle - 1] + sorted[middle]) / 2;
		}
		return sorted[middle];
	}
}

export const autocompleteService = new AutocompleteService();
