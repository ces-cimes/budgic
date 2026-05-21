import { describe, expect, it } from 'vitest';
import {
	applySliceObservation,
	recomputeStability,
	upsertWelford,
	welfordPassesForSplit,
	type ProfileWeightRow
} from './merchant-profile-welford';
import type { TransactionSplit } from '$lib/utils/transaction-split';

function emptyRow(categoryId: string): ProfileWeightRow {
	return {
		categoryId,
		meanWeight: 0,
		stdDev: 0,
		observationCount: 0,
		weightM2: 0
	};
}

describe('merchant-profile-welford', () => {
	it('upsertWelford seeds first observation', () => {
		const next = upsertWelford(emptyRow('food'), 0.6);
		expect(next.meanWeight).toBe(0.6);
		expect(next.observationCount).toBe(1);
		expect(next.stdDev).toBe(0);
	});

	it('upsertWelford updates mean and stdDev on second observation', () => {
		const first = upsertWelford(emptyRow('food'), 0.4);
		const second = upsertWelford(first, 0.8);
		expect(second.observationCount).toBe(2);
		expect(second.meanWeight).toBeCloseTo(0.6, 8);
		expect(second.stdDev).toBeGreaterThan(0);
	});

	it('welfordPassesForSplit returns 2 for exact multi-slice splits', () => {
		const split = {
			id: 's1',
			slices: [
				{ categoryId: 'a', share: 0.6 },
				{ categoryId: 'b', share: 0.4 }
			],
			categoryConfidence: 'exact'
		} as TransactionSplit;
		expect(welfordPassesForSplit(split)).toBe(2);
		expect(welfordPassesForSplit(null)).toBe(1);
	});

	it('applySliceObservation runs double pass for exact splits', () => {
		const once = applySliceObservation(emptyRow('food'), 0.5, 1);
		const twice = applySliceObservation(emptyRow('food'), 0.5, 2);
		expect(once.observationCount).toBe(1);
		expect(twice.observationCount).toBe(2);
		expect(twice.weightM2).toBe(0);
	});

	it('recomputeStability decreases as stdDev grows', () => {
		const stable = recomputeStability([
			{ categoryId: 'a', meanWeight: 0.5, stdDev: 0.05, observationCount: 10, weightM2: 0 },
			{ categoryId: 'b', meanWeight: 0.5, stdDev: 0.05, observationCount: 10, weightM2: 0 }
		]);
		const noisy = recomputeStability([
			{ categoryId: 'a', meanWeight: 0.5, stdDev: 0.4, observationCount: 10, weightM2: 0 },
			{ categoryId: 'b', meanWeight: 0.5, stdDev: 0.4, observationCount: 10, weightM2: 0 }
		]);
		expect(stable).toBeGreaterThan(noisy);
	});
});
