import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getActiveTransactions: vi.fn(),
	autocompleteUsageToArray: vi.fn(),
	tagsToArray: vi.fn()
}));

vi.mock('$lib/core/db', () => ({
	db: {
		getActiveTransactions: mocks.getActiveTransactions,
		transactions: {
			toArray: mocks.getActiveTransactions
		},
		autocompleteUsage: {
			where: vi.fn((field: string) => ({
				equals: vi.fn(() => ({
					toArray: field === 'fieldKey' ? mocks.autocompleteUsageToArray : vi.fn(async () => [])
				})),
				below: vi.fn(() => ({
					toArray: vi.fn(async () => [])
				}))
			})),
			bulkUpdate: vi.fn(async () => undefined)
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
		autocompleteService.clearCache();
		mocks.autocompleteUsageToArray.mockResolvedValue([]);
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
		mocks.getActiveTransactions.mockResolvedValue([
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

describe('autocompleteService description filtering', () => {
	const recentDate = new Date().toISOString();

	function makeTx(
		id: string,
		type: 'expense' | 'income',
		status: 'cleared' | 'planned',
		categoryId: string
	) {
		return {
			id,
			type,
			status,
			description: 'Acme Corp',
			categoryId,
			currency: 'USD',
			clearedDate: status === 'cleared' ? recentDate : undefined,
			plannedDate: status === 'planned' ? recentDate : undefined,
			createdAt: recentDate,
			amount: type === 'income' ? 1000 : -50
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		autocompleteService.clearCache();
		mocks.autocompleteUsageToArray.mockResolvedValue([]);
	});

	it('filters suggestions by transaction type and status', async () => {
		mocks.getActiveTransactions.mockResolvedValue([
			makeTx('e1', 'expense', 'cleared', 'cat-grocery'),
			makeTx('e2', 'expense', 'cleared', 'cat-grocery'),
			makeTx('e3', 'expense', 'cleared', 'cat-grocery'),
			makeTx('i1', 'income', 'cleared', 'cat-paycheck'),
			makeTx('i2', 'income', 'cleared', 'cat-paycheck'),
			makeTx('i3', 'income', 'cleared', 'cat-paycheck')
		]);

		const expenseSuggestions = await autocompleteService.getSuggestionsForDescription('acme', 8, {
			type: 'expense',
			status: 'cleared'
		});
		const incomeSuggestions = await autocompleteService.getSuggestionsForDescription('acme', 8, {
			type: 'income',
			status: 'cleared'
		});

		expect(expenseSuggestions[0]?.inferredCategoryId).toBe('cat-grocery');
		expect(incomeSuggestions[0]?.inferredCategoryId).toBe('cat-paycheck');
	});

	it('uses exact status match (cleared vs planned)', async () => {
		mocks.getActiveTransactions.mockResolvedValue([
			makeTx('c1', 'expense', 'cleared', 'cat-grocery'),
			makeTx('c2', 'expense', 'cleared', 'cat-grocery'),
			makeTx('c3', 'expense', 'cleared', 'cat-grocery'),
			makeTx('p1', 'expense', 'planned', 'cat-subscription'),
			makeTx('p2', 'expense', 'planned', 'cat-subscription'),
			makeTx('p3', 'expense', 'planned', 'cat-subscription')
		]);

		const clearedSuggestions = await autocompleteService.getSuggestionsForDescription('acme', 8, {
			type: 'expense',
			status: 'cleared'
		});
		const plannedSuggestions = await autocompleteService.getSuggestionsForDescription('acme', 8, {
			type: 'expense',
			status: 'planned'
		});

		expect(clearedSuggestions[0]?.inferredCategoryId).toBe('cat-grocery');
		expect(plannedSuggestions[0]?.inferredCategoryId).toBe('cat-subscription');
	});

	it('uses separate cache entries per filter', async () => {
		mocks.getActiveTransactions.mockResolvedValue([
			makeTx('e1', 'expense', 'cleared', 'cat-grocery'),
			makeTx('e2', 'expense', 'cleared', 'cat-grocery'),
			makeTx('e3', 'expense', 'cleared', 'cat-grocery'),
			makeTx('i1', 'income', 'cleared', 'cat-paycheck'),
			makeTx('i2', 'income', 'cleared', 'cat-paycheck'),
			makeTx('i3', 'income', 'cleared', 'cat-paycheck')
		]);

		const expenseSuggestions = await autocompleteService.getSuggestionsForDescription('acme', 8, {
			type: 'expense',
			status: 'cleared'
		});
		const incomeSuggestions = await autocompleteService.getSuggestionsForDescription('acme', 8, {
			type: 'income',
			status: 'cleared'
		});

		expect(expenseSuggestions[0]?.inferredCategoryId).toBe('cat-grocery');
		expect(incomeSuggestions[0]?.inferredCategoryId).toBe('cat-paycheck');

		mocks.getActiveTransactions.mockResolvedValue([]);
		const cachedExpense = await autocompleteService.getSuggestionsForDescription('acme', 8, {
			type: 'expense',
			status: 'cleared'
		});
		const cachedIncome = await autocompleteService.getSuggestionsForDescription('acme', 8, {
			type: 'income',
			status: 'cleared'
		});

		expect(cachedExpense[0]?.inferredCategoryId).toBe('cat-grocery');
		expect(cachedIncome[0]?.inferredCategoryId).toBe('cat-paycheck');
	});
});
