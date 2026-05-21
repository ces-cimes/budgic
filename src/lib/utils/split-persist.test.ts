import { describe, expect, it, vi } from 'vitest';
import type { Transaction } from '$lib/core/db';
import { draftHasActiveSplit, hydrateSplitDraft, persistSplit } from './split-persist';
import { transactionService } from '$lib/core/services';
import { buildSplitResultFromForm } from './soft-split-extras';
import { amountForCategory, resolveSplit } from './transaction-split';

vi.mock('$lib/core/services', () => ({
	transactionService: {
		getTransaction: vi.fn(),
		updateTransaction: vi.fn(),
		createTransaction: vi.fn(),
		createTransactionGroup: vi.fn(),
		getGroupTransactions: vi.fn(),
		updateTransactionGroup: vi.fn(),
		deleteTransaction: vi.fn(),
		addTransactionToGroup: vi.fn()
	}
}));

/** Mirrors production allocateSignedAmounts (primary absorbs drift). */
function allocateSignedAmounts(
	totalAmount: number,
	slices: { categoryId: string; amount: number }[],
	primaryCategoryId: string
) {
	const round2 = (n: number) => Math.round(n * 100) / 100;
	const totalAbs = Math.abs(totalAmount);
	const sign = totalAmount < 0 ? -1 : 1;
	const mags = slices.map((s) => round2(Math.max(0, s.amount)));
	const sumMag = mags.reduce((a, b) => a + b, 0);
	const scaled =
		Math.abs(sumMag - totalAbs) < 0.02 ? mags : mags.map((m) => round2((m / sumMag) * totalAbs));
	const drift = round2(totalAbs - scaled.reduce((a, b) => a + b, 0));
	const primaryIdx = slices.findIndex((s) => s.categoryId === primaryCategoryId);
	const absorbIdx = primaryIdx >= 0 ? primaryIdx : 0;
	scaled[absorbIdx] = round2((scaled[absorbIdx] ?? 0) + drift);
	return slices.map((s, i) => ({
		categoryId: s.categoryId,
		amount: sign * (scaled[i] ?? 0)
	}));
}

describe('hydrateSplitDraft', () => {
	it('hydrates weighted split from categoryWeights', () => {
		const tx = {
			id: 't1',
			amount: -100,
			categoryId: 'gro',
			categoryWeights: [
				{ categoryId: 'gro', weight: 0.6 },
				{ categoryId: 'hh', weight: 0.4 }
			]
		} as unknown as Transaction;

		const draft = hydrateSplitDraft(tx);
		expect(draft?.mode).toBe('weighted');
		expect(draft?.primaryCategoryId).toBe('gro');
		expect(draft?.extras.length).toBeGreaterThanOrEqual(1);
	});

	it('hydrates partitioned split from group members', () => {
		const gid = 'g1';
		const members = [
			{ id: 'a', groupId: gid, amount: -60, categoryId: 'gro' },
			{ id: 'b', groupId: gid, amount: -40, categoryId: 'hh' }
		] as unknown as Transaction[];

		const draft = hydrateSplitDraft(members[0]!, members);
		expect(draft?.mode).toBe('partitioned');
		expect(draft?.exactAmounts).toEqual([
			{ categoryId: 'gro', amount: 60 },
			{ categoryId: 'hh', amount: 40 }
		]);
	});
});

describe('draftHasActiveSplit', () => {
	it('true for valid weighted draft', () => {
		expect(
			draftHasActiveSplit({
				mode: 'weighted',
				primaryCategoryId: 'gro',
				extras: [{ categoryId: 'hh', weight: 0.4 }],
				source: 'manual'
			})
		).toBe(true);
	});

	it('false when no extras', () => {
		expect(
			draftHasActiveSplit({
				mode: 'weighted',
				primaryCategoryId: 'gro',
				extras: [],
				source: 'none'
			})
		).toBe(false);
	});
});

describe('allocateSignedAmounts parity', () => {
	it('expense negative amounts match resolveSplit soft attribution', () => {
		const signed = allocateSignedAmounts(
			-100,
			[
				{ categoryId: 'gro', amount: 60 },
				{ categoryId: 'hh', amount: 40 }
			],
			'gro'
		);
		expect(signed.reduce((s, x) => s + x.amount, 0)).toBe(-100);

		const softTx = {
			id: 'soft',
			amount: -100,
			categoryId: 'gro',
			categoryWeights: [
				{ categoryId: 'gro', weight: 0.6 },
				{ categoryId: 'hh', weight: 0.4 }
			]
		} as unknown as Transaction;
		const soft = resolveSplit(softTx)!;
		expect(signed.find((x) => x.categoryId === 'gro')?.amount).toBe(amountForCategory(soft, 'gro'));
		expect(signed.find((x) => x.categoryId === 'hh')?.amount).toBe(amountForCategory(soft, 'hh'));
	});

	it('income positive amounts sum to total', () => {
		const signed = allocateSignedAmounts(
			100,
			[
				{ categoryId: 'sal', amount: 70 },
				{ categoryId: 'bonus', amount: 30 }
			],
			'sal'
		);
		expect(signed.reduce((s, x) => s + x.amount, 0)).toBe(100);
	});

	it('absorbs rounding drift on primary when primary is not first slice', () => {
		const signed = allocateSignedAmounts(
			-100,
			[
				{ categoryId: 'hh', amount: 40 },
				{ categoryId: 'gro', amount: 60 }
			],
			'gro'
		);
		expect(signed.reduce((s, x) => s + x.amount, 0)).toBe(-100);
		expect(signed.find((x) => x.categoryId === 'gro')?.amount).toBe(-60);
		expect(signed.find((x) => x.categoryId === 'hh')?.amount).toBe(-40);
	});
});

describe('persistPartitionedUpdate member sync', () => {
	const shell = {
		type: 'expense' as const,
		status: 'cleared' as const,
		amount: -100,
		accountId: 'acc-1',
		description: 'COSTCO',
		currency: 'USD',
		clearedDate: '2024-06-01T12:00:00Z'
	};

	it('adds a third group member when exact split gains a category', async () => {
		const gid = 'g-upd';
		const members = [
			{ id: 'm1', groupId: gid, amount: -60, categoryId: 'gro', ...shell },
			{ id: 'm2', groupId: gid, amount: -40, categoryId: 'hh', ...shell }
		] as unknown as Transaction[];

		vi.mocked(transactionService.getGroupTransactions).mockResolvedValue(members);
		vi.mocked(transactionService.createTransaction).mockResolvedValue({
			id: 'm3',
			...shell,
			amount: -10,
			categoryId: 'ent',
			groupId: gid
		} as Transaction);
		vi.mocked(transactionService.addTransactionToGroup).mockResolvedValue(undefined);
		vi.mocked(transactionService.updateTransactionGroup).mockResolvedValue(undefined);
		vi.mocked(transactionService.getGroupTransactions)
			.mockResolvedValueOnce(members)
			.mockResolvedValueOnce([
				...members,
				{ id: 'm3', groupId: gid, amount: -10, categoryId: 'ent', ...shell }
			] as Transaction[]);

		await persistSplit({
			shell,
			draft: {
				mode: 'partitioned',
				primaryCategoryId: 'gro',
				extras: [],
				exactAmounts: [
					{ categoryId: 'gro', amount: 60 },
					{ categoryId: 'hh', amount: 30 },
					{ categoryId: 'ent', amount: 10 }
				],
				source: 'manual'
			},
			isEdit: true,
			transactionId: 'm1',
			groupId: gid,
			groupMembers: members
		});

		expect(transactionService.createTransaction).toHaveBeenCalled();
		expect(transactionService.addTransactionToGroup).toHaveBeenCalledWith('m3', gid);
		expect(transactionService.deleteTransaction).not.toHaveBeenCalled();
	});

	it('deletes removed member when exact split drops a category', async () => {
		const gid = 'g-del';
		const members = [
			{ id: 'm1', groupId: gid, amount: -50, categoryId: 'gro', ...shell },
			{ id: 'm2', groupId: gid, amount: -30, categoryId: 'hh', ...shell },
			{ id: 'm3', groupId: gid, amount: -20, categoryId: 'ent', ...shell }
		] as unknown as Transaction[];

		vi.mocked(transactionService.getGroupTransactions)
			.mockResolvedValueOnce(members)
			.mockResolvedValueOnce(members.slice(0, 2) as Transaction[]);
		vi.mocked(transactionService.updateTransactionGroup).mockResolvedValue(undefined);

		await persistSplit({
			shell,
			draft: {
				mode: 'partitioned',
				primaryCategoryId: 'gro',
				extras: [],
				exactAmounts: [
					{ categoryId: 'gro', amount: 70 },
					{ categoryId: 'hh', amount: 30 }
				],
				source: 'manual'
			},
			isEdit: true,
			transactionId: 'm1',
			groupId: gid,
			groupMembers: members
		});

		expect(transactionService.deleteTransaction).toHaveBeenCalledWith('m3');
	});
});
