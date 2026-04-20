import { describe, expect, it } from 'vitest';
import type { Transaction } from '$lib/core/db';
import { canonicalDuplicateKey, iqrFilter, iqrOutlierScore } from './data-quality-utils';

describe('iqrFilter', () => {
	it('returns all values as core when there are fewer than 4 values', () => {
		expect(iqrFilter([1, 2, 100])).toEqual({
			core: [1, 2, 100],
			outliers: []
		});
	});

	it('uses configurable fence multiplier', () => {
		const values = [1, 2, 3, 4, 8, 20];
		expect(iqrFilter(values, 1.5).outliers).toEqual([20]);
		expect(iqrFilter(values, 2.0).outliers).toEqual([]);
	});
});

describe('iqrOutlierScore', () => {
	it('returns 0 for values within fences', () => {
		const pool = [10, 10, 10, 10, 10, 15];
		expect(iqrOutlierScore(10, pool, 1.5)).toBe(0);
	});

	it('returns a positive score beyond fence and caps at 1', () => {
		const pool = [1, 2, 3, 4, 8, 20];
		expect(iqrOutlierScore(18, pool, 1.5)).toBeCloseTo(1 / 9, 5);
		expect(iqrOutlierScore(30, pool, 1.5)).toBe(1);
	});
});

describe('canonicalDuplicateKey', () => {
	it('prefers clearedDate over plannedDate', () => {
		const tx = {
			amount: -1200.5,
			clearedDate: '2026-04-15T08:00:00.000Z',
			plannedDate: '2026-04-16T08:00:00.000Z',
			description: 'Very long merchant description 12345'
		} as unknown as Transaction;

		expect(canonicalDuplicateKey(tx)).toBe('-1200.5_2026-04-15_Very long merchant d');
	});

	it('falls back to plannedDate and empty date segment', () => {
		const withPlanned = {
			amount: -20,
			plannedDate: '2026-04-20T09:00:00.000Z',
			description: 'Coffee shop'
		} as unknown as Transaction;
		expect(canonicalDuplicateKey(withPlanned)).toBe('-20_2026-04-20_Coffee shop');

		const withNoDate = {
			amount: -20,
			description: 'Coffee shop'
		} as unknown as Transaction;
		expect(canonicalDuplicateKey(withNoDate)).toBe('-20__Coffee shop');
	});
});
