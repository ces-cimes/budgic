import { getDate, getDay, parseISO } from 'date-fns';

import type { Transaction } from '$lib/core/db';

export interface SimilarityDimension {
	name: string;
	weight: number;
	compute(a: Partial<Transaction>, b: Transaction): number;
}

export interface SimilarityConfig {
	dimensions: SimilarityDimension[];
	threshold: number;
}

export interface SimilarityResult {
	transaction: Transaction;
	score: number;
	breakdown: Record<string, number>;
}

export type SimilarityProfileName =
	| 'RECURRING_DETECTION_CONFIG'
	| 'AUTOCOMPLETE_CONTEXT_CONFIG'
	| 'ESSENTIAL_DETECTION_CONFIG';

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	if (value <= 0) return 0;
	if (value >= 1) return 1;
	return value;
}

function normalizeTokens(value: string): string[] {
	return value
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.split(' ')
		.filter(Boolean);
}

function getRelevantDate(tx: Partial<Transaction>): Date | null {
	const raw = tx.clearedDate ?? tx.plannedDate ?? tx.createdAt;
	if (!raw) return null;
	try {
		return parseISO(raw);
	} catch {
		return null;
	}
}

export class TransactionSimilarityEngine {
	// Final score is normalized weighted average: sum(score_i * weight_i) / sum(weight_i)
	private scoreTransactionPair(
		a: Partial<Transaction>,
		b: Transaction,
		config: SimilarityConfig
	): SimilarityResult {
		let weightedScore = 0;
		let totalWeight = 0;
		const breakdown: Record<string, number> = {};

		for (const dimension of config.dimensions) {
			if (dimension.weight <= 0) continue;
			const rawScore = clamp01(dimension.compute(a, b));
			breakdown[dimension.name] = rawScore;
			weightedScore += rawScore * dimension.weight;
			totalWeight += dimension.weight;
		}

		// Hard gate: opposite economic direction never clusters (recurring profile).
		if (breakdown.direction === 0) {
			return { transaction: b, score: 0, breakdown };
		}

		return {
			transaction: b,
			score: totalWeight > 0 ? clamp01(weightedScore / totalWeight) : 0,
			breakdown
		};
	}

	findNearest(
		query: Partial<Transaction>,
		pool: Transaction[],
		config: SimilarityConfig,
		limit = 10
	): SimilarityResult[] {
		if (!pool.length || limit <= 0) return [];

		return pool
			.map((tx) => this.scoreTransactionPair(query, tx, config))
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);
	}

	cluster(
		transactions: Transaction[],
		config: SimilarityConfig,
		minGroupSize = 2
	): Transaction[][] {
		if (transactions.length < minGroupSize) return [];

		const adjacency = new Map<number, Set<number>>();

		for (let i = 0; i < transactions.length; i += 1) {
			adjacency.set(i, new Set());
		}

		for (let i = 0; i < transactions.length; i += 1) {
			for (let j = i + 1; j < transactions.length; j += 1) {
				const score = this.scoreTransactionPair(
					transactions[i],
					transactions[j],
					config
				).score;
				if (score >= config.threshold) {
					adjacency.get(i)!.add(j);
					adjacency.get(j)!.add(i);
				}
			}
		}

		const visited = new Set<number>();
		const groups: Transaction[][] = [];

		for (let i = 0; i < transactions.length; i += 1) {
			if (visited.has(i)) continue;
			const stack = [i];
			const component: number[] = [];

			while (stack.length) {
				const current = stack.pop()!;
				if (visited.has(current)) continue;
				visited.add(current);
				component.push(current);

				for (const neighbor of adjacency.get(current) ?? []) {
					if (!visited.has(neighbor)) {
						stack.push(neighbor);
					}
				}
			}

			if (component.length >= minGroupSize) {
				groups.push(component.map((index) => transactions[index]));
			}
		}

		return groups;
	}

	static descriptionDimension(weight: number): SimilarityDimension {
		return {
			name: 'description',
			weight,
			compute: (a, b) => {
				const left = (a.description ?? '').trim();
				const right = (b.description ?? '').trim();
				if (!left || !right) return 0;

				const leftSet = new Set(normalizeTokens(left));
				const rightSet = new Set(normalizeTokens(right));
				if (!leftSet.size || !rightSet.size) return 0;

				let intersection = 0;
				for (const token of leftSet) {
					if (rightSet.has(token)) intersection += 1;
				}

				const union = new Set([...leftSet, ...rightSet]).size;
				return union > 0 ? intersection / union : 0;
			}
		};
	}

	static amountDimension(weight: number, sigma = 0.15): SimilarityDimension {
		return {
			name: 'amount',
			weight,
			compute: (a, b) => {
				if (a.amount === undefined || b.amount === undefined) return 0;
				const leftAmount = Math.abs(a.amount);
				const rightAmount = Math.abs(b.amount);
				const maxAmount = Math.max(leftAmount, rightAmount, 1e-6);
				const relativeDiff = Math.abs(leftAmount - rightAmount) / maxAmount;
				const denominator = 2 * sigma * sigma;
				return Math.exp(-Math.pow(relativeDiff, 2) / denominator);
			}
		};
	}

	static accountDimension(weight: number): SimilarityDimension {
		return {
			name: 'account',
			weight,
			compute: (a, b) => (a.accountId && b.accountId && a.accountId === b.accountId ? 1 : 0)
		};
	}

	static categoryDimension(weight: number): SimilarityDimension {
		return {
			name: 'category',
			weight,
			compute: (a, b) =>
				a.categoryId && b.categoryId && a.categoryId === b.categoryId ? 1 : 0
		};
	}

	static typeDimension(weight: number): SimilarityDimension {
		return {
			name: 'type',
			weight,
			compute: (a, b) => (a.type && b.type && a.type === b.type ? 1 : 0)
		};
	}

	static temporalDimension(weight: number): SimilarityDimension {
		return {
			name: 'temporal',
			weight,
			compute: (a, b) => {
				const leftDate = getRelevantDate(a);
				const rightDate = getRelevantDate(b);
				if (!leftDate || !rightDate) return 0;

				const dayDelta = Math.abs(getDate(leftDate) - getDate(rightDate));
				const sigmaDays = 5;
				const dayOfMonthScore = Math.exp(
					-Math.pow(dayDelta, 2) / (2 * sigmaDays * sigmaDays)
				);
				const dayOfWeekBonus = getDay(leftDate) === getDay(rightDate) ? 0.2 : 0;

				return clamp01(dayOfMonthScore * 0.8 + dayOfWeekBonus);
			}
		};
	}

	/**
	 * Hard 0/1 dimension: transactions with opposite economic directions (money-in vs
	 * money-out) should never be clustered together regardless of description/amount match.
	 *
	 * Direction is determined by the raw sign of `amount`:
	 *   positive → money flowing in the "normal" direction for the transaction type
	 *   negative → reversal / refund / return
	 *
	 * This prevents e.g. a borrowed 15k (logged as negative expense) and a returned 15k
	 * (positive expense) from forming a spurious "recurring" pattern.
	 */
	static directionDimension(weight: number): SimilarityDimension {
		return {
			name: 'direction',
			weight,
			compute: (a, b) => {
				const dirA = (a.amount ?? 0) >= 0 ? 1 : -1;
				const dirB = (b.amount ?? 0) >= 0 ? 1 : -1;
				return dirA === dirB ? 1 : 0;
			}
		};
	}
}

/** IndexedDB + in-memory canonical pattern cache id; bump when profile below changes. */
export const RECURRING_CANONICAL_CACHE_KEY = 'canonical:v2';

// Weights sum to 1.0 (aligned with contextual-intelligence-surfaces + amount/direction gates).
// direction hard-gates opposite-sign pairs to score 0 regardless of other dimensions.
export const RECURRING_DETECTION_CONFIG: SimilarityConfig = {
	threshold: 0.6,
	dimensions: [
		TransactionSimilarityEngine.descriptionDimension(0.4),
		TransactionSimilarityEngine.amountDimension(0.2, 0.1),
		TransactionSimilarityEngine.accountDimension(0.2),
		TransactionSimilarityEngine.typeDimension(0.1),
		TransactionSimilarityEngine.temporalDimension(0.1),
		TransactionSimilarityEngine.directionDimension(0.1)
	]
};

export const AUTOCOMPLETE_CONTEXT_CONFIG: SimilarityConfig = {
	threshold: 0.4,
	dimensions: [
		TransactionSimilarityEngine.descriptionDimension(0.5),
		TransactionSimilarityEngine.accountDimension(0.2),
		TransactionSimilarityEngine.categoryDimension(0.2),
		TransactionSimilarityEngine.amountDimension(0.1, 0.3)
	]
};

export const ESSENTIAL_DETECTION_CONFIG: SimilarityConfig = {
	threshold: 0.55,
	dimensions: [
		TransactionSimilarityEngine.descriptionDimension(0.35),
		TransactionSimilarityEngine.amountDimension(0.35, 0.05),
		TransactionSimilarityEngine.temporalDimension(0.2),
		TransactionSimilarityEngine.accountDimension(0.1)
	]
};

const PROFILE_MAP: Record<SimilarityProfileName, SimilarityConfig> = {
	RECURRING_DETECTION_CONFIG,
	AUTOCOMPLETE_CONTEXT_CONFIG,
	ESSENTIAL_DETECTION_CONFIG
};

export function resolveSimilarityProfile(profileName: SimilarityProfileName): SimilarityConfig {
	return PROFILE_MAP[profileName];
}
