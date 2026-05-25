import { describe, expect, it } from 'vitest';
import type { Transaction } from '$lib/core/db';
import {
	findLatestMonthWithTransactions,
	hasTransactionsOutsideMonth,
	monthDateFromKey,
	shouldAutoSnapToLatestMonth,
	transactionInMonth
} from './transaction-month-empty';

function makeTx(id: string, isoDate: string): Transaction {
	return {
		id,
		type: 'expense',
		status: 'cleared',
		amount: -10,
		currency: 'USD',
		clearedDate: isoDate,
		createdAt: isoDate
	} as Transaction;
}

describe('transaction-month-empty', () => {
	it('finds the latest month with transactions', () => {
		const txs = [
			makeTx('a', '2026-03-15T12:00:00.000Z'),
			makeTx('b', '2026-05-02T12:00:00.000Z'),
			makeTx('c', '2026-04-20T12:00:00.000Z')
		];
		expect(findLatestMonthWithTransactions(txs)).toBe('2026-05');
	});

	it('detects activity outside the selected month', () => {
		const txs = [makeTx('a', '2026-04-10T12:00:00.000Z')];
		const currentMonth = monthDateFromKey('2026-05');
		expect(transactionInMonth(txs[0], currentMonth)).toBe(false);
		expect(hasTransactionsOutsideMonth(txs, currentMonth)).toBe(true);
	});

	it('allows auto-snap only without explicit month deep link', () => {
		const currentMonth = new Date(2026, 4, 1);
		expect(shouldAutoSnapToLatestMonth('', currentMonth)).toBe(true);
		expect(shouldAutoSnapToLatestMonth('?month=2026-04', currentMonth)).toBe(false);
	});
});
