import { beforeEach, describe, expect, it, vi } from 'vitest';
import { budgetService } from './budget-service';

vi.mock('$lib/core/db', async () => {
	const actual = await vi.importActual('$lib/core/db');
	return {
		...actual,
		db: {
			getActiveCategories: vi.fn(),
			transactions: {
				toArray: vi.fn()
			},
			userPreferences: {
				toCollection: vi.fn(() => ({
					first: vi.fn()
				}))
			}
		}
	};
});

import { db } from '$lib/core/db';

describe('budgetService reimbursement allowance mode', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.getActiveCategories).mockResolvedValue([
			{
				id: 'cat-lifestyle',
				name: 'Lifestyle',
				waterfallTier: 'lifestyle',
				priority: 1
			}
		] as any);
	});

	it('uses full expense in conservative mode', async () => {
		vi.mocked(db.transactions.toArray).mockResolvedValue([
			{
				id: 'tx-1',
				type: 'expense',
				status: 'cleared',
				amount: -100,
				currency: 'USD',
				categoryId: 'cat-lifestyle',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null,
				reimbursements: [
					{
						id: 'r-1',
						direction: 'lending',
						amount: 40,
						currency: 'USD',
						status: 'expecting',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					}
				]
			}
		] as any);
		vi.mocked(db.userPreferences.toCollection).mockReturnValue({
			first: vi.fn().mockResolvedValue({ reimbursementAllowanceMode: 'conservative' })
		} as any);

		const summary = await budgetService.getBudgetSummary();
		expect(summary.confidence.exactSpend).toBe(100);
		expect(summary.confidence.ratio).toBe(1);
	});

	it('nets open lending reimbursements in optimistic mode', async () => {
		vi.mocked(db.transactions.toArray).mockResolvedValue([
			{
				id: 'tx-1',
				type: 'expense',
				status: 'cleared',
				amount: -100,
				currency: 'USD',
				categoryId: 'cat-lifestyle',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null,
				reimbursements: [
					{
						id: 'r-1',
						direction: 'lending',
						amount: 40,
						currency: 'USD',
						status: 'expecting',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					}
				]
			}
		] as any);
		vi.mocked(db.userPreferences.toCollection).mockReturnValue({
			first: vi.fn().mockResolvedValue({ reimbursementAllowanceMode: 'optimistic' })
		} as any);

		const summary = await budgetService.getBudgetSummary();
		expect(summary.confidence.exactSpend).toBe(60);
		expect(summary.confidence.ratio).toBe(1);
	});
});
