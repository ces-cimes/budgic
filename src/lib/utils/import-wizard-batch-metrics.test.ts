import { describe, expect, it } from 'vitest';

import type { Transaction } from '$lib/core/db';

import {
	batchUnclassifiedSpendShare,
	classifiedExpenseShare,
	classifiedExpenseShareFromTiers,
	computeBatchExpenseSpendBreakdown,
	countUnclassifiedExpenseTransactions,
	shouldOpenImportWizard
} from './import-wizard-batch-metrics';

function tx(
	overrides: Partial<Transaction> & { id: string; amount: number; categoryId?: string }
): Transaction {
	return {
		id: overrides.id,
		type: 'expense',
		status: 'cleared',
		amount: overrides.amount,
		currency: 'USD',
		description: overrides.description ?? '',
		accountId: overrides.accountId ?? 'a1',
		categoryId: overrides.categoryId,
		clearedDate: overrides.clearedDate ?? '2026-01-15T12:00:00.000Z',
		createdAt: '2026-01-15T12:00:00.000Z',
		updatedAt: '2026-01-15T12:00:00.000Z',
		deletedAt: null
	} as Transaction;
}

describe('import-wizard-batch-metrics', () => {
	it('computes unclassified spend share for gate', () => {
		const tiers: Record<string, string | undefined> = { cat1: 'survival' };
		const txs = [
			tx({ id: '1', amount: -30, categoryId: 'cat1' }),
			tx({ id: '2', amount: -70, categoryId: undefined })
		];
		const breakdown = computeBatchExpenseSpendBreakdown(txs, tiers);
		expect(breakdown.totalAbs).toBe(100);
		expect(breakdown.unclassifiedAbs).toBe(70);
		expect(batchUnclassifiedSpendShare(breakdown)).toBeCloseTo(0.7);
		expect(shouldOpenImportWizard(breakdown, 3)).toBe(true);
	});

	it('does not open wizard below min tx count', () => {
		const breakdown = { totalAbs: 100, unclassifiedAbs: 90, classifiedAbs: 10 };
		expect(shouldOpenImportWizard(breakdown, 2)).toBe(false);
	});

	it('classifiedExpenseShareFromTiers tracks tier map', () => {
		const ids = ['a', 'b'];
		const amounts = { a: 40, b: 60 };
		const tiers1 = { a: 'survival' as const, b: undefined };
		expect(classifiedExpenseShareFromTiers(ids, amounts, tiers1)).toBeCloseTo(0.4);
		const tiers2 = { a: 'survival' as const, b: 'lifestyle' as const };
		expect(classifiedExpenseShareFromTiers(ids, amounts, tiers2)).toBe(1);
	});

	it('countUnclassifiedExpenseTransactions matches category gaps', () => {
		const tiers: Record<string, string | undefined> = { u: 'unclassified', s: 'survival' };
		const txs = [
			tx({ id: '1', amount: -1, categoryId: undefined }),
			tx({ id: '2', amount: -1, categoryId: 'u' }),
			tx({ id: '3', amount: -1, categoryId: 's' })
		];
		expect(countUnclassifiedExpenseTransactions(txs, tiers)).toBe(2);
		expect(classifiedExpenseShare(computeBatchExpenseSpendBreakdown(txs, tiers))).toBeCloseTo(
			1 / 3
		);
	});
});
