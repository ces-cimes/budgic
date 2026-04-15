import { db, generateUUID } from '$lib/core/db';
import type { AutocompleteUsage, Transaction } from '$lib/core/db';

export interface DescriptionSuggestion {
	value: string;
	frequency: number;
	inferredCategoryId?: string;
	lastUsed: Date;
}

interface DescriptionAggregate {
	value: string;
	lastUsedMs: number;
	frequencyLast90Days: number;
	categoryCounts: Map<string, number>;
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

export type BoundedAutocompleteFieldKey = 'transaction.account' | 'transaction.category';

const CACHE_TTL_MS = 5 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_EIGHTY_DAYS_MS = 180 * 24 * 60 * 60 * 1000;
const RECENCY_DECAY = 0.05;
const DB_FREQUENCY_WEIGHT = 0.6;
const SELECTION_FREQUENCY_WEIGHT = 0.4;

class AutocompleteService {
	private suggestionCache = new Map<string, { expiresAt: number; value: DescriptionSuggestion[] }>();
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

		const transactions = await db.transactions.toArray();
		if (transactions.length < 3) {
			return [];
		}

		const now = Date.now();
		const ninetyDaysAgoMs = now - NINETY_DAYS_MS;
		const aggregates = new Map<string, DescriptionAggregate>();
		const selectionAggregates = await this.getSelectionAggregates();

		for (const tx of transactions) {
			const description = this.normalizeDescription(tx.description);
			if (!description) continue;

			const descriptionKey = description.toLowerCase();
			const usedAtMs = this.getTransactionTimestampMs(tx);

			let aggregate = aggregates.get(descriptionKey);
			if (!aggregate) {
				aggregate = {
					value: description,
					lastUsedMs: usedAtMs,
					frequencyLast90Days: 0,
					categoryCounts: new Map<string, number>()
				};
				aggregates.set(descriptionKey, aggregate);
			} else if (usedAtMs > aggregate.lastUsedMs) {
				aggregate.lastUsedMs = usedAtMs;
			}

			if (usedAtMs >= ninetyDaysAgoMs) {
				aggregate.frequencyLast90Days += 1;
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
				const selection = selectionAggregates.get(item.value.toLowerCase());
				const recencyScore = this.computeRecencyScore(selection?.lastSelectedMs, now);
				const normalisedDbFrequency = this.normalizeFrequency(item.frequencyLast90Days);
				const normalisedSelectionFrequency = this.normalizeFrequency(selection?.selectionFrequency ?? 0);
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
				value: item.value,
				frequency: item.frequencyLast90Days,
				inferredCategoryId: this.getMostFrequentCategoryId(item.categoryCounts),
				lastUsed: new Date(item.lastUsedMs)
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
			timestamp: nowIso,
			createdAt: nowIso,
			updatedAt: nowIso,
			deletedAt: null
		});

		this.suggestionCache.clear();
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
					existing.lastSelectedMs === null ? selectedAtMs : Math.max(existing.lastSelectedMs, selectedAtMs);
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
	async getBlendedBoundedFieldScores(fieldKey: BoundedAutocompleteFieldKey): Promise<Map<string, number>> {
		await this.ensureSelectionDataPruned();

		const nowMs = Date.now();
		const ninetyDaysAgoMs = nowMs - NINETY_DAYS_MS;
		const transactions = await db.transactions.toArray();

		interface DbAggregate {
			frequencyLast90Days: number;
			lastUsedMs: number;
		}
		const dbAggregates = new Map<string, DbAggregate>();

		for (const tx of transactions) {
			const rawId =
				fieldKey === 'transaction.account' ? tx.accountId : fieldKey === 'transaction.category' ? tx.categoryId : undefined;
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
					existing.lastSelectedMs === null ? selectedAtMs : Math.max(existing.lastSelectedMs, selectedAtMs);
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

			const selectionRecencyScore = this.computeRecencyScore(selection?.lastSelectedMs ?? null, nowMs);
			const normalisedSelectionFrequency = this.normalizeFrequency(selection?.selectionFrequency ?? 0);
			const selectionTerm = normalisedSelectionFrequency * selectionRecencyScore;

			const score = DB_FREQUENCY_WEIGHT * dbTerm + SELECTION_FREQUENCY_WEIGHT * selectionTerm;
			scores.set(idKey, score);
		}

		return scores;
	}

	clearCache() {
		this.suggestionCache.clear();
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

			const key = normalizedValue.toLowerCase();
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
					existing.lastSelectedMs === null ? selectedAtMs : Math.max(existing.lastSelectedMs, selectedAtMs);
			}
		}

		return aggregates;
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
}

export const autocompleteService = new AutocompleteService();
