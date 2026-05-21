import { describe, it, expect, vi, beforeEach } from 'vitest';
import { envelopeBorrowingService } from './envelope-borrowing-service';
import type { DailyAllowanceView } from './allowance-calculation';

vi.mock('$lib/core/db', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/core/db')>();
	return {
		...actual,
		db: {
			...actual.db,
			getActiveCategories: vi.fn()
		}
	};
});

import { db } from '$lib/core/db';

function minimalAllowance(): DailyAllowanceView {
	const now = new Date();
	return {
		daily: 10,
		monthlyRemaining: 100,
		lifestyleRemaining: 100,
		lifestyleSpent: 0,
		lifestyleBudget: 100,
		pace: 1,
		signal: 'on_track',
		confidenceLevel: 'high',
		currency: 'USD',
		lifestyleLines: [
			{
				categoryId: 'cat-a',
				categoryName: 'Dining',
				budgetAmount: 100,
				spentAmount: 0,
				remaining: 100,
				dailyRate: 10,
				daysRemaining: 10
			}
		],
		total: {
			dailySafe: 10,
			monthly: 100,
			remaining: 100,
			spentSoFar: 0,
			daysRemaining: 10,
			currency: 'USD',
			confidence: 1,
			projectedBalance: 0
		},
		periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
		periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0),
		recommendations: []
	};
}

describe('envelopeBorrowingService category labels', () => {
	beforeEach(() => {
		vi.mocked(db.getActiveCategories).mockReset();
		vi.mocked(db.getActiveCategories).mockResolvedValue([]);
	});

	it('resolveCategoryDisplayName prefers allowance lifestyle line names', async () => {
		const map = await envelopeBorrowingService.buildCategoryNameMap(minimalAllowance());
		expect(envelopeBorrowingService.resolveCategoryDisplayName('cat-a', map)).toBe('Dining');
	});

	it('resolveCategoryDisplayName falls back to DB category name', async () => {
		vi.mocked(db.getActiveCategories).mockResolvedValue([
			{
				id: 'cat-b',
				name: 'Travel',
				type: 'expense',
				isActive: true,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			}
		] as Awaited<ReturnType<typeof db.getActiveCategories>>);
		const map = await envelopeBorrowingService.buildCategoryNameMap(null);
		expect(envelopeBorrowingService.resolveCategoryDisplayName('cat-b', map)).toBe('Travel');
	});
});
