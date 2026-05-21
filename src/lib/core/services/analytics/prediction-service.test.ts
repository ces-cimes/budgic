import { describe, expect, it } from 'vitest';
import type { Transaction } from '$lib/core/db';
import {
	deduplicateForSpendTotals,
	distinctClearedMonths,
	expandForCategoryAttribution
} from '$lib/utils/transaction-split';
import { effectiveAmountForCategory } from '$lib/utils/category-utils';

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

describe('prediction multi-category bucketing (partitioned parity)', () => {
	it('expanded hard group attributes −60/−40 like soft 60/40', () => {
		const softTx = {
			id: 'soft',
			type: 'expense',
			status: 'cleared',
			clearedDate: '2024-06-01T12:00:00Z',
			amount: -100,
			categoryId: 'gro',
			categoryWeights: [
				{ categoryId: 'gro', weight: 0.6 },
				{ categoryId: 'hh', weight: 0.4 }
			]
		} as unknown as Transaction;

		const gid = 'g-pred';
		const hardMembers = [
			{
				id: 'h1',
				type: 'expense',
				status: 'cleared',
				clearedDate: '2024-06-01T12:00:00Z',
				groupId: gid,
				amount: -60,
				categoryId: 'gro'
			},
			{
				id: 'h2',
				type: 'expense',
				status: 'cleared',
				clearedDate: '2024-06-01T12:00:00Z',
				groupId: gid,
				amount: -40,
				categoryId: 'hh'
			}
		] as unknown as Transaction[];

		const expanded = expandForCategoryAttribution(hardMembers);
		const bucket = (txs: Transaction[], cid: string) =>
			txs
				.filter((t) => effectiveAmountForCategory(t, cid) !== 0)
				.reduce((s, t) => s + Math.abs(effectiveAmountForCategory(t, cid)), 0);

		expect(bucket(expanded, 'gro')).toBe(60);
		expect(bucket(expanded, 'hh')).toBe(40);
		expect(bucket([softTx], 'gro')).toBe(60);
		expect(bucket([softTx], 'hh')).toBe(40);

		const deduped = deduplicateForSpendTotals(hardMembers);
		expect(bucket(deduped, 'hh')).toBe(0);
	});
});
