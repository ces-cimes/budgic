import { db } from '$lib/core/db';
import type { Transaction } from '$lib/core/db';

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

const CACHE_TTL_MS = 5 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

class AutocompleteService {
	private suggestionCache = new Map<string, { expiresAt: number; value: DescriptionSuggestion[] }>();

	async getSuggestionsForDescription(partial: string, limit = 8): Promise<DescriptionSuggestion[]> {
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
			.sort((a, b) => {
				if (b.frequencyLast90Days !== a.frequencyLast90Days) {
					return b.frequencyLast90Days - a.frequencyLast90Days;
				}
				return b.lastUsedMs - a.lastUsedMs;
			})
			.slice(0, Math.max(1, limit))
			.map((item) => ({
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

	clearCache() {
		this.suggestionCache.clear();
	}

	private normalizeDescription(value: string | undefined): string | null {
		if (!value) return null;
		const normalized = value.trim().replace(/\s+/g, ' ');
		return normalized.length > 0 ? normalized : null;
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
