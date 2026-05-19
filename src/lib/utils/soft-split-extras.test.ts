import { describe, expect, it } from 'vitest';
import {
	buildSplitResultFromForm,
	hydrateSplitExtrasFromCategoryWeights,
	normalizeAndClampSplitExtras,
	snapSplitWeight,
	splitFormStateFromSuggestedWeights
} from './soft-split-extras';
import {
	assertValidSoftCategoryWeights,
	assertSoftSplitCategoryIdMatchesPrimary
} from './transaction-category-weights';

describe('snapSplitWeight', () => {
	it('snaps to 5% grid', () => {
		expect(snapSplitWeight(0.12)).toBeCloseTo(0.1, 10);
		expect(snapSplitWeight(0.13)).toBeCloseTo(0.15, 10);
	});
});

describe('normalizeAndClampSplitExtras', () => {
	it('shrinks extras when primary residual would be too small', () => {
		const out = normalizeAndClampSplitExtras('a', [
			{ categoryId: 'b', weight: 0.5 },
			{ categoryId: 'c', weight: 0.5 }
		]);
		const sum = out.reduce((s, x) => s + x.weight, 0);
		expect(1 - sum).toBeGreaterThanOrEqual(0.05 - 1e-9);
	});

	it('keeps primary heaviest after clamp', () => {
		const out = normalizeAndClampSplitExtras('p', [
			{ categoryId: 'x', weight: 0.25 },
			{ categoryId: 'y', weight: 0.25 }
		]);
		const primaryW = 1 - out.reduce((s, x) => s + x.weight, 0);
		const maxEx = Math.max(...out.map((x) => x.weight));
		expect(primaryW + 1e-9).toBeGreaterThanOrEqual(maxEx);
	});
});

describe('buildSplitResultFromForm', () => {
	it('returns undefined without extras', () => {
		expect(buildSplitResultFromForm('a', [])).toBeUndefined();
		expect(buildSplitResultFromForm('a', [{ categoryId: '', weight: 0.5 }])).toBeUndefined();
	});

	it('builds valid weights for two-way split', () => {
		const r = buildSplitResultFromForm('groceries', [{ categoryId: 'dining', weight: 0.35 }]);
		expect(r).toBeDefined();
		if (!r) return;
		assertValidSoftCategoryWeights(r.weights);
		assertSoftSplitCategoryIdMatchesPrimary(r.primaryId, r.weights);
		expect(r.weights.length).toBe(2);
	});

	it('builds valid weights for three-way split', () => {
		const r = buildSplitResultFromForm('a', [
			{ categoryId: 'b', weight: 0.2 },
			{ categoryId: 'c', weight: 0.2 }
		]);
		expect(r).toBeDefined();
		if (!r) return;
		expect(r.weights.length).toBe(3);
		assertValidSoftCategoryWeights(r.weights);
		assertSoftSplitCategoryIdMatchesPrimary(r.primaryId, r.weights);
	});
});

describe('hydrateSplitExtrasFromCategoryWeights', () => {
	it('round-trips three stored rows', () => {
		const stored = [
			{ categoryId: 'a', weight: 0.5 },
			{ categoryId: 'b', weight: 0.3 },
			{ categoryId: 'c', weight: 0.2 }
		];
		const h = hydrateSplitExtrasFromCategoryWeights(stored);
		expect(h).toBeTruthy();
		if (!h) return;
		const rebuilt = buildSplitResultFromForm(h.primaryCategoryId, h.splitExtras);
		expect(rebuilt).toBeDefined();
		if (!rebuilt) return;
		assertValidSoftCategoryWeights(rebuilt.weights);
		assertSoftSplitCategoryIdMatchesPrimary(rebuilt.primaryId, rebuilt.weights);
	});
});

describe('splitFormStateFromSuggestedWeights', () => {
	it('caps to four categories and clamps', () => {
		const formed = splitFormStateFromSuggestedWeights([
			{ categoryId: 'a', weight: 0.4 },
			{ categoryId: 'b', weight: 0.25 },
			{ categoryId: 'c', weight: 0.2 },
			{ categoryId: 'd', weight: 0.1 },
			{ categoryId: 'e', weight: 0.05 }
		]);
		expect(formed).toBeTruthy();
		if (!formed) return;
		expect(formed.primaryCategoryId).toBe('a');
		expect(formed.splitExtras.length).toBeLessThanOrEqual(3);
		const built = buildSplitResultFromForm(formed.primaryCategoryId, formed.splitExtras);
		expect(built?.weights.length).toBeLessThanOrEqual(4);
		if (built) {
			assertValidSoftCategoryWeights(built.weights);
		}
	});
});
