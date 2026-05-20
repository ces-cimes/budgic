import { describe, expect, it } from 'vitest';
import type { Transaction } from '$lib/core/db';
import {
	deduplicateForSpendTotals,
	distinctClearedMonths
} from '$lib/utils/transaction-split';

const MIN_MONTHS_FOR_PREDICTION = 3;

/** Mirrors predictCategorySpending minimum-history gate after Phase 2 deferred fix. */
function hasEnoughMonthlyHistoryForPrediction(transactions: Transaction[]): boolean {
	const spendRows = deduplicateForSpendTotals(transactions);
	const months = distinctClearedMonths(spendRows);
	return months >= MIN_MONTHS_FOR_PREDICTION;
}

describe('prediction minimum history (month-based, not row count)', () => {
	it('rejects many rows in a single month', () => {
		const txs = Array.from({ length: 10 }, (_, i) => ({
			id: `t${i}`,
			type: 'expense',
			status: 'cleared',
			clearedDate: '2024-06-15T12:00:00Z',
			amount: -20,
			categoryId: 'gro'
		})) as unknown as Transaction[];

		expect(deduplicateForSpendTotals(txs)).toHaveLength(10);
		expect(hasEnoughMonthlyHistoryForPrediction(txs)).toBe(false);
	});

	it('accepts few rows across enough distinct months', () => {
		const txs = [
			{
				id: 'a',
				type: 'expense',
				status: 'cleared',
				clearedDate: '2024-04-01T12:00:00Z',
				amount: -50,
				categoryId: 'gro'
			},
			{
				id: 'b',
				type: 'expense',
				status: 'cleared',
				clearedDate: '2024-05-01T12:00:00Z',
				amount: -50,
				categoryId: 'gro'
			},
			{
				id: 'c',
				type: 'expense',
				status: 'cleared',
				clearedDate: '2024-06-01T12:00:00Z',
				amount: -50,
				categoryId: 'gro'
			}
		] as unknown as Transaction[];

		expect(hasEnoughMonthlyHistoryForPrediction(txs)).toBe(true);
	});
});
