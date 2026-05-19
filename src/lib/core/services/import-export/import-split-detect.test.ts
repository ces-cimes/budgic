import { describe, expect, it } from 'vitest';
import type { Transaction } from '$lib/core/db';
import {
	detectImportSplitCandidates,
	getSplitPickerCandidateIds,
	isEligibleForSplitDetection,
	SPLIT_PROXIMITY_MS
} from './import-split-detect';

function tx(overrides: Partial<Transaction> & { id: string; clearedDate: string }): Transaction {
	return {
		type: 'expense',
		status: 'cleared',
		currency: 'USD',
		amount: -10,
		accountId: 'acc-1',
		deletedAt: null,
		description: 'Coffee shop',
		...overrides
	} as Transaction;
}

describe('isEligibleForSplitDetection', () => {
	it('rejects grouped and transfer rows', () => {
		expect(isEligibleForSplitDetection(tx({ id: '1', clearedDate: '2024-01-01T12:00:00Z' }))).toBe(
			true
		);
		expect(
			isEligibleForSplitDetection(
				tx({ id: '2', clearedDate: '2024-01-01T12:00:00Z', groupId: 'g1' })
			)
		).toBe(false);
		expect(
			isEligibleForSplitDetection(
				tx({
					id: '3',
					clearedDate: '2024-01-01T12:00:00Z',
					type: 'transfer'
				})
			)
		).toBe(false);
	});
});

describe('detectImportSplitCandidates', () => {
	it('groups pair within 10m with similar description', () => {
		const txs = [
			tx({
				id: 'a',
				clearedDate: '2024-01-01T12:00:00Z',
				description: 'Target store purchase',
				amount: -30
			}),
			tx({
				id: 'b',
				clearedDate: '2024-01-01T12:05:00Z',
				description: 'Target store items',
				amount: -20,
				categoryId: 'cat-2'
			})
		];
		const groups = detectImportSplitCandidates(txs);
		expect(groups.size).toBe(1);
		const members = [...groups.values()][0]!;
		expect(members.sort()).toEqual(['a', 'b']);
	});

	it('groups by same category when descriptions differ', () => {
		const txs = [
			tx({
				id: 'a',
				clearedDate: '2024-01-01T12:00:00Z',
				description: 'Alpha',
				categoryId: 'groceries'
			}),
			tx({
				id: 'b',
				clearedDate: '2024-01-01T12:02:00Z',
				description: 'Beta',
				categoryId: 'groceries'
			})
		];
		const groups = detectImportSplitCandidates(txs);
		expect(groups.size).toBe(1);
	});

	it('does not group across accounts', () => {
		const txs = [
			tx({
				id: 'a',
				clearedDate: '2024-01-01T12:00:00Z',
				accountId: 'acc-1'
			}),
			tx({
				id: 'b',
				clearedDate: '2024-01-01T12:01:00Z',
				accountId: 'acc-2'
			})
		];
		expect(detectImportSplitCandidates(txs).size).toBe(0);
	});

	it('does not group when more than 10 minutes apart', () => {
		const gap = SPLIT_PROXIMITY_MS + 1000;
		const t0 = Date.parse('2024-01-01T12:00:00Z');
		const txs = [
			tx({
				id: 'a',
				clearedDate: new Date(t0).toISOString(),
				description: 'Same merchant here'
			}),
			tx({
				id: 'b',
				clearedDate: new Date(t0 + gap).toISOString(),
				description: 'Same merchant here'
			})
		];
		expect(detectImportSplitCandidates(txs).size).toBe(0);
	});

	it('does not create singleton groups', () => {
		const txs = [tx({ id: 'a', clearedDate: '2024-01-01T12:00:00Z' })];
		expect(detectImportSplitCandidates(txs).size).toBe(0);
	});

	it('assigns each transaction to at most one group', () => {
		const txs = [
			tx({
				id: 'a',
				clearedDate: '2024-01-01T12:00:00Z',
				description: 'Store A',
				categoryId: 'c1'
			}),
			tx({
				id: 'b',
				clearedDate: '2024-01-01T12:01:00Z',
				description: 'Store A line',
				categoryId: 'c1'
			}),
			tx({
				id: 'c',
				clearedDate: '2024-01-01T12:02:00Z',
				description: 'Store A extra',
				categoryId: 'c1'
			})
		];
		const groups = detectImportSplitCandidates(txs);
		const allIds = [...groups.values()].flat();
		expect(new Set(allIds).size).toBe(allIds.length);
	});
});

describe('getSplitPickerCandidateIds', () => {
	it('returns batch txs in expanded time window on same account', () => {
		const batch = [
			tx({ id: 'a', clearedDate: '2024-01-01T12:00:00Z' }),
			tx({
				id: 'b',
				clearedDate: '2024-01-01T12:08:00Z',
				description: 'Other'
			}),
			tx({
				id: 'c',
				clearedDate: '2024-01-01T12:30:00Z',
				description: 'Far'
			})
		];
		const anchor = [batch[0]!, batch[1]!];
		const ids = getSplitPickerCandidateIds(batch, anchor);
		expect(ids).toContain('a');
		expect(ids).toContain('b');
		expect(ids).not.toContain('c');
	});
});
