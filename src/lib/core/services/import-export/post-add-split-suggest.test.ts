import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction, UserPreferences } from '$lib/core/db';

const { mockWhereEquals, mockGetUserPreferences } = vi.hoisted(() => ({
	mockWhereEquals: vi.fn(),
	mockGetUserPreferences: vi.fn()
}));

vi.mock('$lib/core/db', () => ({
	db: {
		transactions: {
			where: vi.fn(() => ({
				equals: mockWhereEquals
			}))
		}
	},
	generateUUID: () => 'test-group-id'
}));

vi.mock('../core/user-service', () => ({
	userService: {
		getUserPreferences: mockGetUserPreferences
	}
}));

import {
	findPostAddSplitSuggestion,
	isPostAddSplitDismissed,
	postAddSplitDismissalKey
} from './post-add-split-suggest';

function tx(overrides: Partial<Transaction> & { id: string; clearedDate: string }): Transaction {
	return {
		type: 'expense',
		status: 'cleared',
		currency: 'USD',
		amount: -10,
		accountId: 'acc-1',
		deletedAt: null,
		description: 'Coffee shop downtown',
		categoryId: 'cat-1',
		...overrides
	} as Transaction;
}

const basePrefs = {
	suggestSplitsAfterAdd: true
} as UserPreferences;

describe('postAddSplitDismissalKey', () => {
	it('sorts ids for stable key', () => {
		expect(postAddSplitDismissalKey(['b', 'a'])).toBe('a::b');
	});
});

describe('isPostAddSplitDismissed', () => {
	it('returns true when 3 dismissals in 30d', () => {
		const now = Date.now();
		const key = 'a::b';
		const prefs = {
			suggestSplitsAfterAdd: true,
			postAddSplitDismissals: {
				[key]: [
					new Date(now - 1000).toISOString(),
					new Date(now - 2000).toISOString(),
					new Date(now - 3000).toISOString()
				]
			}
		} as unknown as UserPreferences;
		expect(isPostAddSplitDismissed(prefs, key)).toBe(true);
	});
});

describe('findPostAddSplitSuggestion', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetUserPreferences.mockResolvedValue(basePrefs);
	});

	function mockPool(pool: Transaction[]) {
		mockWhereEquals.mockReturnValue({
			filter: vi.fn(() => ({
				toArray: vi.fn(() => Promise.resolve(pool))
			}))
		});
	}

	it('groups anchor with neighbor within 10m', async () => {
		const anchor = tx({
			id: 'anchor',
			clearedDate: '2024-01-01T12:05:00Z',
			description: 'Coffee shop main'
		});
		const neighbor = tx({
			id: 'neighbor',
			clearedDate: '2024-01-01T12:08:00Z',
			description: 'Coffee shop extra',
			amount: -5
		});
		mockPool([anchor, neighbor]);

		const result = await findPostAddSplitSuggestion(anchor);
		expect(result).not.toBeNull();
		expect(result!.groupId).toBe('post-add-anchor');
		expect(result!.transactions.map((t) => t.id).sort()).toEqual(['anchor', 'neighbor']);
		expect(result!.pickerTransactions.length).toBeGreaterThanOrEqual(2);
	});

	it('returns null when prefs disable suggestions', async () => {
		mockGetUserPreferences.mockResolvedValue({
			...basePrefs,
			suggestSplitsAfterAdd: false
		} as UserPreferences);
		const anchor = tx({ id: 'a', clearedDate: '2024-01-01T12:00:00Z' });
		mockPool([anchor]);
		expect(await findPostAddSplitSuggestion(anchor)).toBeNull();
	});

	it('returns null when anchor already grouped', async () => {
		const anchor = tx({
			id: 'a',
			clearedDate: '2024-01-01T12:00:00Z',
			groupId: 'g1'
		});
		mockPool([anchor]);
		expect(await findPostAddSplitSuggestion(anchor)).toBeNull();
	});

	it('returns null when cluster dismissed', async () => {
		const anchor = tx({
			id: 'anchor',
			clearedDate: '2024-01-01T12:05:00Z',
			description: 'Coffee shop main'
		});
		const neighbor = tx({
			id: 'neighbor',
			clearedDate: '2024-01-01T12:08:00Z',
			description: 'Coffee shop extra'
		});
		const key = postAddSplitDismissalKey(['anchor', 'neighbor']);
		const now = Date.now();
		mockGetUserPreferences.mockResolvedValue({
			...basePrefs,
			postAddSplitDismissals: {
				[key]: [
					new Date(now - 1000).toISOString(),
					new Date(now - 2000).toISOString(),
					new Date(now - 3000).toISOString()
				]
			}
		} as UserPreferences);
		mockPool([anchor, neighbor]);
		expect(await findPostAddSplitSuggestion(anchor)).toBeNull();
	});
});
