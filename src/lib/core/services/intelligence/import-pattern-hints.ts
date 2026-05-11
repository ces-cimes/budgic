import type { Transaction } from '$lib/core/db';
import {
	TransactionSimilarityEngine,
	ESSENTIAL_DETECTION_CONFIG
} from './transaction-similarity-engine';

export interface ImportPatternHint {
	hintId: string;
	representativeDescription: string;
	transactionIds: string[];
	totalAbsAmount: number;
}

/**
 * Build top unclassified-expense clusters for the import wizard “uncertain patterns” step.
 */
export function buildUnclassifiedPatternHints(
	unclassifiedExpenses: Transaction[],
	maxHints = 8
): ImportPatternHint[] {
	const engine = new TransactionSimilarityEngine();
	const txs = unclassifiedExpenses.filter(
		(t) => t.status === 'cleared' && t.type === 'expense' && !t.categoryId && !t.deletedAt
	);
	if (txs.length < 2) return [];

	const clusters = engine.cluster(txs, ESSENTIAL_DETECTION_CONFIG, 2);
	const scored = clusters.map((group) => {
		const totalAbsAmount = group.reduce((s, t) => s + Math.abs(t.amount || 0), 0);
		const representativeDescription =
			group.map((t) => (t.description || '').trim()).sort((a, b) => b.length - a.length)[0] ||
			'Unnamed';
		return {
			transactionIds: group.map((t) => t.id),
			totalAbsAmount,
			representativeDescription
		};
	});
	scored.sort((a, b) => b.totalAbsAmount - a.totalAbsAmount);
	return scored.slice(0, maxHints).map((row, i) => ({
		hintId: `hint-${i}-${row.transactionIds[0] ?? i}`,
		representativeDescription: row.representativeDescription,
		transactionIds: row.transactionIds,
		totalAbsAmount: row.totalAbsAmount
	}));
}
