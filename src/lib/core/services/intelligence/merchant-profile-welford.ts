import { hasSplit, type TransactionSplit } from '$lib/utils/transaction-split';
import type { MerchantCategoryProfile } from '$lib/core/db';

export type ProfileWeightRow = MerchantCategoryProfile['weights'][number];

export function upsertWelford(row: ProfileWeightRow, observedWeight: number): ProfileWeightRow {
	const n0 = row.observationCount;
	if (n0 === 0) {
		return {
			...row,
			meanWeight: observedWeight,
			stdDev: 0,
			observationCount: 1,
			weightM2: 0
		};
	}
	const n = n0 + 1;
	const delta = observedWeight - row.meanWeight;
	const mean = row.meanWeight + delta / n;
	const delta2 = observedWeight - mean;
	const m2 = (row.weightM2 ?? 0) + delta * delta2;
	const stdDev = n > 1 ? Math.sqrt(Math.max(0, m2 / (n - 1))) : 0;
	return { ...row, meanWeight: mean, stdDev, observationCount: n, weightM2: m2 };
}

/** Welford passes per slice: 2 when multi-slice split has `categoryConfidence: 'exact'`. */
export function welfordPassesForSplit(split: TransactionSplit | null): number {
	if (split && hasSplit(split) && split.categoryConfidence === 'exact') return 2;
	return 1;
}

export function applySliceObservation(
	row: ProfileWeightRow,
	observedWeight: number,
	passes: number
): ProfileWeightRow {
	let next = row;
	for (let i = 0; i < passes; i++) {
		next = upsertWelford(next, observedWeight);
	}
	return next;
}

export function recomputeStability(weights: ProfileWeightRow[]): number {
	if (weights.length === 0) return 0;
	const meanStd = weights.reduce((a, w) => a + w.stdDev, 0) / weights.length;
	return Math.max(0, Math.min(1, 1 - meanStd));
}
