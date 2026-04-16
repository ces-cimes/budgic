import { describe, expect, it } from 'vitest';
import type { Category, Transaction } from '$lib/core/db';
import {
	absAnalyticsTierPortion,
	effectiveAmountForCategory,
	shouldIncludeClearedExpenseInAnalyticsSpend,
	tierAmounts
} from './category-utils';

function cat(id: string, tier: Category['waterfallTier']): Category {
	return {
		id,
		name: id,
		type: 'expense',
		waterfallTier: tier,
		priority: 1,
		isActive: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: null
	};
}

describe('effectiveAmountForCategory', () => {
	it('returns full amount for legacy single category', () => {
		const tx = {
			categoryId: 'a',
			amount: -100,
			categoryWeights: undefined
		} as unknown as Transaction;
		expect(effectiveAmountForCategory(tx, 'a')).toBe(-100);
		expect(effectiveAmountForCategory(tx, 'b')).toBe(0);
	});

	it('applies weights', () => {
		const tx = {
			categoryId: 'gro',
			amount: -1000,
			categoryWeights: [
				{ categoryId: 'gro', weight: 0.7 },
				{ categoryId: 'junk', weight: 0.3 }
			]
		} as unknown as Transaction;
		expect(effectiveAmountForCategory(tx, 'gro')).toBe(-700);
		expect(effectiveAmountForCategory(tx, 'junk')).toBe(-300);
	});
});

describe('tierAmounts', () => {
	it('splits across tiers', () => {
		const map = new Map<string, Category>([
			['gro', cat('gro', 'survival')],
			['junk', cat('junk', 'lifestyle')]
		]);
		const tx = {
			categoryId: 'gro',
			amount: -100,
			categoryWeights: [
				{ categoryId: 'gro', weight: 0.7 },
				{ categoryId: 'junk', weight: 0.3 }
			]
		} as unknown as Transaction;
		const ta = tierAmounts(tx, map);
		expect(ta.survival).toBe(-70);
		expect(ta.lifestyle).toBe(-30);
	});
});

describe('absAnalyticsTierPortion', () => {
	it('excludes unclassified slice', () => {
		const map = new Map<string, Category>([
			['a', cat('a', 'survival')],
			['u', cat('u', 'unclassified')]
		]);
		const tx = {
			categoryId: 'a',
			amount: -100,
			categoryWeights: [
				{ categoryId: 'a', weight: 0.5 },
				{ categoryId: 'u', weight: 0.5 }
			]
		} as unknown as Transaction;
		expect(absAnalyticsTierPortion(tx, map)).toBe(50);
	});
});

describe('shouldIncludeClearedExpenseInAnalyticsSpend', () => {
	it('is false when only unclassified', () => {
		const map = new Map<string, Category>([['u', cat('u', 'unclassified')]]);
		const tx = {
			type: 'expense',
			status: 'cleared',
			categoryId: 'u',
			automation: undefined
		} as unknown as Transaction;
		expect(shouldIncludeClearedExpenseInAnalyticsSpend(tx, map)).toBe(false);
	});
});
