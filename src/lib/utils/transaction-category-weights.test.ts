import { describe, expect, it } from 'vitest';
import {
	assertNotGroupedWithSoftSplit,
	assertSoftSplitCategoryIdMatchesPrimary,
	assertValidSoftCategoryWeights,
	primaryCategoryIdFromWeights,
	roundWeightSum
} from './transaction-category-weights';

describe('roundWeightSum', () => {
	it('normalises to sum 1', () => {
		const w = roundWeightSum([
			{ categoryId: 'a', weight: 0.7 },
			{ categoryId: 'b', weight: 0.3 }
		]);
		const s = w.reduce((a, x) => a + x.weight, 0);
		expect(s).toBeCloseTo(1, 5);
	});

	it('handles uneven floats', () => {
		const w = roundWeightSum([
			{ categoryId: 'a', weight: 0.333 },
			{ categoryId: 'b', weight: 0.333 },
			{ categoryId: 'c', weight: 0.334 }
		]);
		expect(w.reduce((a, x) => a + x.weight, 0)).toBeCloseTo(1, 5);
	});
});

describe('primaryCategoryIdFromWeights', () => {
	it('returns id with max weight', () => {
		expect(
			primaryCategoryIdFromWeights([
				{ categoryId: 'x', weight: 0.2 },
				{ categoryId: 'y', weight: 0.8 }
			])
		).toBe('y');
	});
});

describe('assertNotGroupedWithSoftSplit', () => {
	it('throws when grouped transaction and soft split', () => {
		expect(() =>
			assertNotGroupedWithSoftSplit(true, [
				{ categoryId: 'a', weight: 0.5 },
				{ categoryId: 'b', weight: 0.5 }
			])
		).toThrow(/Grouped transaction/);
	});

	it('allows grouped without weights', () => {
		expect(() => assertNotGroupedWithSoftSplit(true, undefined)).not.toThrow();
	});

	it('allows soft split when not grouped', () => {
		expect(() =>
			assertNotGroupedWithSoftSplit(false, [
				{ categoryId: 'a', weight: 0.5 },
				{ categoryId: 'b', weight: 0.5 }
			])
		).not.toThrow();
	});
});

describe('assertValidSoftCategoryWeights', () => {
	it('rejects sum drift', () => {
		expect(() =>
			assertValidSoftCategoryWeights([
				{ categoryId: 'a', weight: 0.4 },
				{ categoryId: 'b', weight: 0.5 }
			])
		).toThrow(/sum to 1/);
	});

	it('accepts normalised pair', () => {
		expect(() =>
			assertValidSoftCategoryWeights(
				roundWeightSum([
					{ categoryId: 'a', weight: 0.7 },
					{ categoryId: 'b', weight: 0.3 }
				])
			)
		).not.toThrow();
	});
});

describe('assertSoftSplitCategoryIdMatchesPrimary', () => {
	it('throws when categoryId is not max weight', () => {
		expect(() =>
			assertSoftSplitCategoryIdMatchesPrimary('x', [
				{ categoryId: 'x', weight: 0.2 },
				{ categoryId: 'y', weight: 0.8 }
			])
		).toThrow(/highest-weight/);
	});

	it('passes when categoryId matches primary', () => {
		expect(() =>
			assertSoftSplitCategoryIdMatchesPrimary('y', [
				{ categoryId: 'x', weight: 0.2 },
				{ categoryId: 'y', weight: 0.8 }
			])
		).not.toThrow();
	});
});
