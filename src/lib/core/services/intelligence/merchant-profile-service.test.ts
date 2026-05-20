import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MerchantCategoryProfile, Transaction } from '$lib/core/db';

const { mockGetProfile, mockPut, mockAdd, mockGroupWhere, mockTxGet, mockTxUpdate, mockPersistRetro } =
	vi.hoisted(() => ({
		mockGetProfile: vi.fn(),
		mockPut: vi.fn(),
		mockAdd: vi.fn(),
		mockGroupWhere: vi.fn(),
		mockTxGet: vi.fn(),
		mockTxUpdate: vi.fn(),
		mockPersistRetro: vi.fn()
	}));

vi.mock('$lib/utils/split-persist', () => ({
	persistRetrospectiveWeightedSplit: mockPersistRetro
}));

vi.mock('$lib/core/db', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/core/db')>();
	return {
		...actual,
		db: {
			merchantCategoryProfiles: {
				where: vi.fn(() => ({
					equals: vi.fn(() => ({
						toArray: mockGetProfile
					}))
				})),
				put: mockPut,
				add: mockAdd
			},
			transactions: {
				get: mockTxGet,
				update: mockTxUpdate,
				where: vi.fn((field: string) => {
					if (field === 'groupId') {
						return { equals: mockGroupWhere };
					}
					return { equals: vi.fn() };
				})
			}
		},
		generateUUID: () => 'profile-new'
	};
});

import { merchantProfileService } from './merchant-profile-service';

function expense(overrides: Partial<Transaction> = {}): Transaction {
	return {
		id: 'tx-1',
		type: 'expense',
		status: 'cleared',
		amount: -100,
		accountId: 'acc-1',
		categoryId: 'gro',
		description: 'COSTCO WHOLESALE',
		clearedDate: '2024-06-01T12:00:00Z',
		deletedAt: null,
		...overrides
	} as Transaction;
}

function income(overrides: Partial<Transaction> = {}): Transaction {
	return {
		...expense({ amount: 1000, categoryId: 'sal', description: 'PAYROLL ACME' }),
		type: 'income',
		...overrides
	} as Transaction;
}

describe('merchantProfileService.onTransactionSaved — splits', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetProfile.mockResolvedValue([]);
		mockPut.mockResolvedValue(undefined);
		mockAdd.mockResolvedValue(undefined);
		mockGroupWhere.mockReturnValue({ filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) });
	});

	it('soft 60/40 — one observation, slice shares', async () => {
		await merchantProfileService.onTransactionSaved(
			expense({
				categoryWeights: [
					{ categoryId: 'gro', weight: 0.6 },
					{ categoryId: 'hh', weight: 0.4 }
				]
			})
		);

		expect(mockAdd).toHaveBeenCalledOnce();
		const profile = mockAdd.mock.calls[0][0] as MerchantCategoryProfile;
		expect(profile.totalObservations).toBe(1);
		const gro = profile.weights.find((w) => w.categoryId === 'gro');
		const hh = profile.weights.find((w) => w.categoryId === 'hh');
		expect(gro?.meanWeight).toBeCloseTo(0.6, 5);
		expect(hh?.meanWeight).toBeCloseTo(0.4, 5);
		expect(gro?.observationCount).toBe(1);
		expect(hh?.observationCount).toBe(1);
	});

	it('exact partitioned split — double Welford pass per slice, one totalObservations', async () => {
		const gid = 'g-exact';
		const members = [
			expense({
				id: 'hard-1',
				groupId: gid,
				amount: -60,
				categoryId: 'gro',
				categoryConfidence: 'exact'
			}),
			expense({
				id: 'hard-2',
				groupId: gid,
				amount: -40,
				categoryId: 'hh',
				categoryConfidence: 'exact'
			})
		];
		mockGroupWhere.mockReturnValue({
			filter: vi.fn(() => ({
				toArray: vi.fn().mockResolvedValue(members)
			}))
		});

		await merchantProfileService.onTransactionSaved(members[0]);
		const exactProfile = mockAdd.mock.calls[0][0] as MerchantCategoryProfile;
		expect(exactProfile.totalObservations).toBe(1);
		expect(exactProfile.weights.find((w) => w.categoryId === 'gro')?.observationCount).toBe(2);
		expect(exactProfile.weights.find((w) => w.categoryId === 'hh')?.observationCount).toBe(2);

		mockAdd.mockClear();
		await merchantProfileService.onTransactionSaved(
			expense({
				categoryWeights: [
					{ categoryId: 'gro', weight: 0.6 },
					{ categoryId: 'hh', weight: 0.4 }
				]
			})
		);
		const softProfile = mockAdd.mock.calls[0][0] as MerchantCategoryProfile;
		expect(softProfile.weights.find((w) => w.categoryId === 'gro')?.observationCount).toBe(1);
	});

	it('hard group parity — learns once from representative, not follower row', async () => {
		const gid = 'g-costco';
		const members = [
			expense({ id: 'hard-1', groupId: gid, amount: -60, categoryId: 'gro' }),
			expense({ id: 'hard-2', groupId: gid, amount: -40, categoryId: 'hh' })
		];
		mockGroupWhere.mockReturnValue({
			filter: vi.fn(() => ({
				toArray: vi.fn().mockResolvedValue(members)
			}))
		});

		await merchantProfileService.onTransactionSaved(members[0]);
		expect(mockAdd).toHaveBeenCalledOnce();
		const profile = mockAdd.mock.calls[0][0] as MerchantCategoryProfile;
		expect(profile.totalObservations).toBe(1);
		expect(profile.weights.find((w) => w.categoryId === 'gro')?.meanWeight).toBeCloseTo(0.6, 5);
		expect(profile.weights.find((w) => w.categoryId === 'hh')?.meanWeight).toBeCloseTo(0.4, 5);

		mockAdd.mockClear();
		await merchantProfileService.onTransactionSaved(members[1]);
		expect(mockAdd).not.toHaveBeenCalled();
		expect(mockPut).not.toHaveBeenCalled();
	});

	it('single-category baseline — weight 1', async () => {
		await merchantProfileService.onTransactionSaved(expense({ categoryId: 'gro' }));

		expect(mockAdd).toHaveBeenCalledOnce();
		const profile = mockAdd.mock.calls[0][0] as MerchantCategoryProfile;
		expect(profile.totalObservations).toBe(1);
		expect(profile.weights).toHaveLength(1);
		expect(profile.weights[0].meanWeight).toBe(1);
	});

	it('same-category partitioned group — single-category observation (not multi-slice)', async () => {
		const gid = 'g-same-cat';
		const members = [
			expense({ id: 'a', groupId: gid, amount: -30, categoryId: 'gro' }),
			expense({ id: 'b', groupId: gid, amount: -20, categoryId: 'gro' })
		];
		mockGroupWhere.mockReturnValue({
			filter: vi.fn(() => ({
				toArray: vi.fn().mockResolvedValue(members)
			}))
		});

		await merchantProfileService.onTransactionSaved(members[0]);
		expect(mockAdd).toHaveBeenCalledOnce();
		const profile = mockAdd.mock.calls[0][0] as MerchantCategoryProfile;
		expect(profile.totalObservations).toBe(1);
		expect(profile.weights).toHaveLength(1);
		expect(profile.weights[0].categoryId).toBe('gro');
		expect(profile.weights[0].meanWeight).toBe(1);
	});

	it('cleared income soft 60/40 — one observation, slice shares', async () => {
		await merchantProfileService.onTransactionSaved(
			income({
				categoryWeights: [
					{ categoryId: 'sal', weight: 0.6 },
					{ categoryId: 'bonus', weight: 0.4 }
				]
			})
		);

		expect(mockAdd).toHaveBeenCalledOnce();
		const profile = mockAdd.mock.calls[0][0] as MerchantCategoryProfile;
		expect(profile.totalObservations).toBe(1);
		expect(profile.weights.find((w) => w.categoryId === 'sal')?.meanWeight).toBeCloseTo(0.6, 5);
		expect(profile.weights.find((w) => w.categoryId === 'bonus')?.meanWeight).toBeCloseTo(0.4, 5);
	});

	it('transfer cleared — no learning', async () => {
		await merchantProfileService.onTransactionSaved(
			expense({ type: 'transfer', categoryId: 'gro' })
		);
		expect(mockAdd).not.toHaveBeenCalled();
	});
});

function matureProfile(): MerchantCategoryProfile {
	return {
		id: 'prof-1',
		merchantKey: 'costco wholesale',
		accountId: 'acc-1',
		totalObservations: 10,
		stability: 0.9,
		weights: [
			{
				categoryId: 'gro',
				meanWeight: 0.6,
				stdDev: 0.05,
				observationCount: 10,
				weightM2: 0
			},
			{
				categoryId: 'hh',
				meanWeight: 0.4,
				stdDev: 0.05,
				observationCount: 10,
				weightM2: 0
			}
		],
		lastUpdated: '2024-01-01',
		createdAt: '2024-01-01',
		updatedAt: '2024-01-01',
		deletedAt: null
	};
}

describe('merchantProfileService.applyRetrospectiveSplits — split guard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetProfile.mockResolvedValue([matureProfile()]);
		mockPut.mockResolvedValue(undefined);
		mockTxUpdate.mockResolvedValue(undefined);
		mockPersistRetro.mockResolvedValue(true);
	});

	it('applies weights to eligible single-category history', async () => {
		const tx = expense({ id: 'plain' });
		mockTxGet.mockResolvedValue(tx);

		const n = await merchantProfileService.applyRetrospectiveSplits(
			'costco wholesale',
			'acc-1',
			['plain']
		);

		expect(n).toBe(1);
		expect(mockPersistRetro).toHaveBeenCalledWith(
			'plain',
			[
				{ categoryId: 'gro', weight: 0.6 },
				{ categoryId: 'hh', weight: 0.4 }
			],
			'gro'
		);
	});

	it('skips partitioned group members', async () => {
		mockTxGet.mockResolvedValue(expense({ id: 'hard-1', groupId: 'g1', amount: -60 }));

		const n = await merchantProfileService.applyRetrospectiveSplits(
			'costco wholesale',
			'acc-1',
			['hard-1']
		);

		expect(n).toBe(0);
		expect(mockTxUpdate).not.toHaveBeenCalled();
	});

	it('skips rows that already have soft splits', async () => {
		mockTxGet.mockResolvedValue(
			expense({
				id: 'soft',
				categoryWeights: [
					{ categoryId: 'gro', weight: 0.7 },
					{ categoryId: 'hh', weight: 0.3 }
				]
			})
		);

		const n = await merchantProfileService.applyRetrospectiveSplits(
			'costco wholesale',
			'acc-1',
			['soft']
		);

		expect(n).toBe(0);
		expect(mockTxUpdate).not.toHaveBeenCalled();
	});
});
