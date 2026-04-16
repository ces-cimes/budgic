import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	transactionsToArray: vi.fn(),
	autocompleteUsageToArray: vi.fn(),
	tagsToArray: vi.fn()
}));

vi.mock('$lib/core/db', () => ({
	db: {
		transactions: {
			toArray: mocks.transactionsToArray
		},
		autocompleteUsage: {
			where: vi.fn((fieldKey: string) => ({
				equals: vi.fn(() => ({
					toArray:
						fieldKey === 'fieldKey'
							? mocks.autocompleteUsageToArray
							: vi.fn(async () => [])
				}))
			}))
		},
		tags: {
			where: vi.fn(() => ({
				startsWith: vi.fn(() => ({
					toArray: mocks.tagsToArray
				}))
			}))
		}
	},
	generateUUID: vi.fn(() => 'test-id')
}));

import { autocompleteService } from './autocomplete-service';

describe('autocompleteService intelligence helpers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ranks tag suggestions by frequency for prefix', async () => {
		mocks.tagsToArray.mockResolvedValue([
			{ name: 'groceries', usageCount: 6, normalizedName: 'groceries' },
			{ name: 'gift', usageCount: 3, normalizedName: 'gift' },
			{ name: 'gym', usageCount: 2, normalizedName: 'gym' }
		]);

		const results = await autocompleteService.getTagSuggestions('g', 3);
		expect(results).toEqual(['groceries', 'gift', 'gym']);
	});

	it('suggests transfer destinations by usage and median amount', async () => {
		mocks.transactionsToArray.mockResolvedValue([
			{
				id: 'tx1',
				type: 'transfer',
				accountId: 'a1',
				amount: -100,
				transferDetails: { toAccountId: 'a2', transferAmount: 100 }
			},
			{
				id: 'tx2',
				type: 'transfer',
				accountId: 'a1',
				amount: -110,
				transferDetails: { toAccountId: 'a2', transferAmount: 110 }
			},
			{
				id: 'tx3',
				type: 'transfer',
				accountId: 'a1',
				amount: -50,
				transferDetails: { toAccountId: 'a3', transferAmount: 50 }
			},
			{
				id: 'tx4',
				type: 'expense',
				accountId: 'a1',
				amount: 999
			}
		]);

		const results = await autocompleteService.getTransferDestinationSuggestions('a1', 5);
		expect(results[0]).toMatchObject({ accountId: 'a2', frequency: 2, typicalAmount: 105 });
		expect(results[1]).toMatchObject({ accountId: 'a3', frequency: 1, typicalAmount: 50 });
	});
});
