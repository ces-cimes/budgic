import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAccountPace } from './account-pace-service';
import type { Account, Transaction } from '$lib/core/db';

vi.mock('$lib/core/db', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/core/db')>();
	return {
		...actual,
		db: {
			...actual.db,
			userPreferences: {
				toCollection: () => ({
					first: async () => ({ currency: 'USD' })
				})
			},
			getActiveCategories: async () => [{ id: 'l1', waterfallTier: 'lifestyle', name: 'Fun' }]
		},
		expenseCountsTowardAllowanceAnalytics: () => true
	};
});

vi.mock('./transaction-service', () => ({
	transactionService: {
		getTransactionsByAccount: vi.fn()
	}
}));

vi.mock('$lib/core/services', () => ({
	exchangeRateService: {
		convertAmount: vi.fn(async (amount: number) => amount)
	}
}));

import { transactionService } from './transaction-service';

const account: Account = {
	id: 'acc-1',
	name: 'Checking',
	type: 'checking',
	currency: 'USD',
	currentBalance: 1000,
	initialBalance: 1000,
	isActive: true,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	deletedAt: null
};

describe('getAccountPace', () => {
	beforeEach(() => {
		vi.mocked(transactionService.getTransactionsByAccount).mockReset();
	});

	it('computes MTD vs prior-month window spend', async () => {
		const now = new Date();
		const thisMonth = new Date(now.getFullYear(), now.getMonth(), 5);
		const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 5);
		const txs: Transaction[] = [
			{
				id: '1',
				accountId: 'acc-1',
				type: 'expense',
				status: 'cleared',
				amount: -100,
				clearedDate: thisMonth.toISOString(),
				categoryId: 'l1',
				currency: 'USD',
				createdAt: thisMonth.toISOString(),
				updatedAt: thisMonth.toISOString(),
				deletedAt: null
			},
			{
				id: '2',
				accountId: 'acc-1',
				type: 'expense',
				status: 'cleared',
				amount: -50,
				clearedDate: lastMonth.toISOString(),
				categoryId: 'l1',
				currency: 'USD',
				createdAt: lastMonth.toISOString(),
				updatedAt: lastMonth.toISOString(),
				deletedAt: null
			}
		];
		vi.mocked(transactionService.getTransactionsByAccount).mockResolvedValue(txs);

		const pace = await getAccountPace(account);
		expect(pace.mtdSpend).toBe(100);
		expect(pace.priorPeriodSpend).toBe(50);
		expect(pace.velocityRatio).toBe(2);
		expect(pace.velocityLabel).toBe('faster');
	});
});
