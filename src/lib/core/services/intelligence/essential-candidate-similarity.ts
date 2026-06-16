import type { Transaction } from '$lib/core/db';
import type { ClassificationCandidate } from './essential-detector';
import {
	TransactionSimilarityEngine,
	ESSENTIAL_DETECTION_CONFIG,
	type SimilarityConfig
} from './transaction-similarity-engine';

export interface EssentialCandidateSerialized {
	patternKey: string;
	suggestedTier: ClassificationCandidate['suggestedTier'];
	matchedTransactionIds: string[];
	allowanceImpact: number;
	cadence: ClassificationCandidate['cadence'];
	confidence: number;
	reason: string;
}

/**
 * Widen each essential candidate with nearest neighbors in the batch (same profile as essentials).
 * Recomputes allowance impact from merged group spend vs total cleared expense in `pool`.
 */
export function expandEssentialCandidatesWithSimilarity(
	candidates: ClassificationCandidate[],
	pool: Transaction[],
	config: SimilarityConfig = ESSENTIAL_DETECTION_CONFIG
): EssentialCandidateSerialized[] {
	const engine = new TransactionSimilarityEngine();
	const expensePool = pool.filter(
		(t) => t.status === 'cleared' && t.type === 'expense' && !t.deletedAt
	);
	const poolById = new Map(expensePool.map((t) => [t.id, t]));
	const totalSpend = expensePool.reduce((s, t) => s + Math.abs(t.amount || 0), 0) || 1;

	return candidates.map((candidate) => {
		const ids = new Set(candidate.matchedTransactionIds);
		for (const seedId of candidate.matchedTransactionIds) {
			const seed = poolById.get(seedId);
			if (!seed) continue;
			const neighbors = engine.findNearest(
				seed,
				expensePool,
				config,
				Math.min(120, expensePool.length)
			);
			for (const n of neighbors) {
				if (n.score >= config.threshold) ids.add(n.transaction.id);
			}
		}

		const mergedIds = Array.from(ids);
		const groupSpend = mergedIds.reduce(
			(s, id) => s + Math.abs(poolById.get(id)?.amount ?? 0),
			0
		);
		const allowanceImpact = Math.min(1, groupSpend / totalSpend);
		const stabilityBoost = Math.min(0.12, mergedIds.length * 0.015);
		const confidence = Math.min(0.95, candidate.confidence + stabilityBoost);
		const expanded = mergedIds.length > candidate.matchedTransactionIds.length;
		return {
			patternKey: candidate.patternKey,
			suggestedTier: candidate.suggestedTier,
			matchedTransactionIds: mergedIds,
			allowanceImpact,
			cadence: candidate.cadence,
			confidence,
			reason: expanded
				? `${candidate.reason} · merged similar descriptions`
				: candidate.reason
		};
	});
}
