import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '$lib/core/db';

const { mockGet, mockFilter, mockUpdateTransaction, mockRecalculate } = vi.hoisted(() => ({
	mockGet: vi.fn(),
	mockFilter: vi.fn(),
	mockUpdateTransaction: vi.fn(),
	mockRecalculate: vi.fn()
}));

vi.mock('$lib/core/db', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/core/db')>();
	return {
		...actual,
		db: {
			transactions: {
				get: mockGet,
				filter: mockFilter
			}
		},
		generateUUID: () => 'new-group-id',
		validateTransactionGroup: vi.fn(() => ({ isValid: true, errors: [], totalAmount: -50 }))
	};
});

vi.mock('../core/transaction-service', () => ({
	transactionService: {
		updateTransaction: mockUpdateTransaction
	}
}));

vi.mock('../core/account-service', () => ({
	accountService: {
		recalculateAccountBalance: mockRecalculate
	}
}));

import {
	dismissSplitCandidateGroup,
	linkTransactionsAsSplitGroup
} from './import-split-link-service';

function baseTx(id: string, overrides: Partial<Transaction> = {}): Transaction {
	return {
		id,
		type: 'expense',
		status: 'cleared',
		currency: 'USD',
		amount: -25,
		accountId: 'acc-1',
		categoryId: 'cat-1',
		clearedDate: '2024-06-01T12:00:00Z',
		deletedAt: null,
		description: 'Store',
		importQuality: { splitCandidateGroupId: 'cand-1' },
		...overrides
	} as Transaction;
}

describe('linkTransactionsAsSplitGroup', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUpdateTransaction.mockResolvedValue({});
		mockRecalculate.mockResolvedValue(undefined);
	});

	it('rejects fewer than two ids', async () => {
		await expect(linkTransactionsAsSplitGroup(['a'])).rejects.toThrow(/at least two/i);
	});

	it('links rows with shared groupId and clears split flag', async () => {
		const a = baseTx('a');
		const b = baseTx('b', { amount: -25, categoryId: 'cat-2' });
		mockGet.mockImplementation((id: string) =>
			Promise.resolve(id === 'a' ? a : id === 'b' ? b : undefined)
		);

		const result = await linkTransactionsAsSplitGroup(['a', 'b']);
		expect(result.groupId).toBe('new-group-id');
		expect(result.memberIds.sort()).toEqual(['a', 'b']);
		expect(mockUpdateTransaction).toHaveBeenCalledTimes(2);
		expect(mockUpdateTransaction).toHaveBeenCalledWith(
			'a',
			expect.objectContaining({
				groupId: 'new-group-id',
				categoryConfidence: 'exact'
			}),
			expect.any(Object)
		);
		expect(mockRecalculate).toHaveBeenCalledWith('acc-1');
	});
});

describe('dismissSplitCandidateGroup', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUpdateTransaction.mockResolvedValue({});
	});

	it('marks all group members reviewDismissed', async () => {
		const rows = [baseTx('a'), baseTx('b')];
		mockFilter.mockReturnValue({
			toArray: vi.fn(() => Promise.resolve(rows))
		});

		const result = await dismissSplitCandidateGroup('cand-1');
		expect(result).toEqual({ groupId: 'cand-1', transactionIds: ['a', 'b'] });
		expect(mockUpdateTransaction).toHaveBeenCalledTimes(2);
		expect(mockUpdateTransaction).toHaveBeenCalledWith(
			'a',
			expect.objectContaining({
				importQuality: expect.objectContaining({ reviewDismissed: true })
			}),
			expect.any(Object)
		);
	});
});
