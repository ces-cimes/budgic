import { beforeEach, describe, expect, it, vi } from 'vitest';
import { budgetService } from './budget-service';

vi.mock('$lib/core/db', async () => {
	const actual = await vi.importActual('$lib/core/db');
	return {
		...actual,
		db: {
			getActiveCategories: vi.fn(),
			getActiveAccounts: vi.fn(),
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
		vi.mocked(db.getActiveAccounts).mockResolvedValue([
			{ id: 'checking-1', type: 'checking' },
			{ id: 'credit-1', type: 'credit' }
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

	it('does not double count matched transfer to credit account', async () => {
		vi.mocked(db.transactions.toArray).mockResolvedValue([
			{
				id: 'exp-1',
				type: 'expense',
				status: 'cleared',
				accountId: 'credit-1',
				amount: -250,
				currency: 'USD',
				categoryId: 'cat-lifestyle',
				clearedDate: '2026-04-08T00:00:00.000Z',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			},
			{
				id: 'xfer-1',
				type: 'transfer',
				status: 'cleared',
				accountId: 'checking-1',
				amount: -250,
				currency: 'USD',
				clearedDate: '2026-04-09T00:00:00.000Z',
				transferDetails: { toAccountId: 'credit-1', transferAmount: 250, feeAmount: 0 },
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			}
		] as any);
		vi.mocked(db.userPreferences.toCollection).mockReturnValue({
			first: vi.fn().mockResolvedValue({ reimbursementAllowanceMode: 'conservative' })
		} as any);

		const summary = await budgetService.getBudgetSummary();
		expect(summary.confidence.exactSpend).toBe(250);
	});
});
