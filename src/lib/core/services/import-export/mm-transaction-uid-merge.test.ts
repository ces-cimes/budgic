import { describe, expect, it } from 'vitest';
import type { Transaction } from '$lib/core/db';
import {
	buildMmMergeUpdates,
	buildMmReplaceUpdates,
	diffMmMergeImportOwned,
	MM_MERGE_IMPORT_OWNED_KEYS,
	simulateMmMerge,
	simulateMmReplace
} from './mm-transaction-uid-merge';

function baseExisting(over: Partial<Transaction> = {}): Transaction {
	return {
		id: 'tx-existing',
		type: 'expense',
		status: 'cleared',
		currency: 'USD',
		amount: -10,
		accountAmount: -10,
		accountId: 'acc-1',
		categoryId: 'cat-user',
		description: 'User desc',
		notes: 'User notes',
		clearedDate: '2024-01-01T12:00:00.000Z',
		importSource: 'money-manager',
		importMetadata: JSON.stringify({ mmUid: 'mm-1', source: 'money-manager' }),
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
		deletedAt: null,
		categoryWeights: [{ categoryId: 'a', weight: 0.6 }],
		...over
	};
}

function freshFromMm(over: Partial<Transaction> = {}): Transaction {
	return {
		id: 'tx-new-uuid',
		type: 'expense',
		status: 'cleared',
		currency: 'EUR',
		amount: -20,
		accountAmount: -22,
		accountId: 'acc-1',
		categoryId: 'cat-mm',
		description: 'MM ZCONTENT',
		notes: 'MM ZCONTENT',
		clearedDate: '2024-06-01T12:00:00.000Z',
		importSource: 'money-manager',
		importMetadata: JSON.stringify({ mmUid: 'mm-1', source: 'money-manager', doType: 1 }),
		currencyConversion: {
			exchangeRate: 1.1,
			conversionDate: '2024-06-01T12:00:00.000Z',
			sourceCurrency: 'EUR',
			targetCurrency: 'USD'
		},
		createdAt: '2024-06-01T00:00:00.000Z',
		updatedAt: '2024-06-01T00:00:00.000Z',
		deletedAt: null,
		...over
	};
}

describe('mm-transaction-uid-merge', () => {
	it('merge updates only import-owned keys', () => {
		const existing = baseExisting();
		const fresh = freshFromMm();
		const patch = buildMmMergeUpdates(fresh);
		for (const k of MM_MERGE_IMPORT_OWNED_KEYS) {
			expect(patch).toHaveProperty(k);
		}
		expect(patch).not.toHaveProperty('description');
		expect(patch).not.toHaveProperty('notes');
		expect(patch).not.toHaveProperty('categoryId');
		expect(patch).not.toHaveProperty('status');
	});

	it('simulateMmMerge keeps user description, notes, category', () => {
		const merged = simulateMmMerge(baseExisting(), freshFromMm());
		expect(merged.description).toBe('User desc');
		expect(merged.notes).toBe('User notes');
		expect(merged.categoryId).toBe('cat-user');
		expect(merged.currency).toBe('EUR');
		expect(merged.amount).toBe(-20);
		expect(merged.accountAmount).toBe(-22);
		expect(merged.clearedDate).toBe('2024-06-01T12:00:00.000Z');
	});

	it('diffMmMergeImportOwned lists changed import-owned fields', () => {
		const existing = baseExisting();
		const fresh = freshFromMm();
		const merged = simulateMmMerge(existing, fresh);
		const diffs = diffMmMergeImportOwned(existing, merged);
		const fields = new Set(diffs.map((d) => d.field));
		expect(fields.has('currency')).toBe(true);
		expect(fields.has('amount')).toBe(true);
		expect(fields.has('description')).toBe(false);
	});

	it('simulateMmReplace applies MM category and clears categoryWeights', () => {
		const existing = baseExisting({ categoryWeights: [{ categoryId: 'a', weight: 0.5 }] });
		const fresh = freshFromMm();
		const replaced = simulateMmReplace(existing, fresh);
		expect(replaced.categoryId).toBe('cat-mm');
		expect(replaced.description).toBe('MM ZCONTENT');
		expect(replaced.categoryWeights).toBeUndefined();
	});

	it('buildMmReplaceUpdates includes explicit clears', () => {
		const fresh = freshFromMm();
		const u = buildMmReplaceUpdates(fresh);
		expect(u.memo).toBeUndefined();
		expect(u.flexibilityTier).toBeUndefined();
		expect(u.currency).toBe('EUR');
	});
});
