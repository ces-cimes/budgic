import { describe, expect, it } from 'vitest';
import type { Category, Transaction } from '$lib/core/db';
import { validateTransactionCategoryWeights } from '$lib/core/db';
import {
	amountForCategory,
	buildGroupMemberMap,
	deduplicateForSpendTotals,
	distinctClearedMonths,
	expandForCategoryAttribution,
	hasSplit,
	resolveSplit,
	tierAmountsFromSplit,
	transactionHasExistingSplit
} from './transaction-split';
import { effectiveAmountForCategory } from './category-utils';

function cat(id: string, tier: Category['waterfallTier']): Category {
	return {
		id,
		name: id,
		type: 'expense',
		waterfallTier: tier,
		priority: 1,
		isActive: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: null
	};
}

const categories = new Map<string, Category>([
	['gro', cat('gro', 'survival')],
	['hh', cat('hh', 'lifestyle')]
]);

describe('resolveSplit golden parity — soft vs hard', () => {
	const softTx = {
		id: 'soft-1',
		amount: -100,
		categoryId: 'gro',
		categoryWeights: [
			{ categoryId: 'gro', weight: 0.6 },
			{ categoryId: 'hh', weight: 0.4 }
		]
	} as unknown as Transaction;

	const gid = 'group-costco';
	const hardMembers = [
		{
			id: 'hard-1',
			groupId: gid,
			amount: -60,
			categoryId: 'gro'
		},
		{
			id: 'hard-2',
			groupId: gid,
			amount: -40,
			categoryId: 'hh'
		}
	] as unknown as Transaction[];

	it('attributes identical per-category amounts', () => {
		const soft = resolveSplit(softTx)!;
		const hard = resolveSplit(hardMembers[0], hardMembers)!;

		expect(hasSplit(soft)).toBe(true);
		expect(hasSplit(hard!)).toBe(true);

		expect(amountForCategory(soft, 'gro')).toBe(-60);
		expect(amountForCategory(soft, 'hh')).toBe(-40);
		expect(amountForCategory(hard!, 'gro')).toBe(-60);
		expect(amountForCategory(hard!, 'hh')).toBe(-40);
	});

	it('attributes identical tier amounts', () => {
		const soft = resolveSplit(softTx)!;
		const hard = resolveSplit(hardMembers[0], hardMembers)!;

		expect(tierAmountsFromSplit(soft, categories)).toEqual({
			survival: -60,
			lifestyle: -40
		});
		expect(tierAmountsFromSplit(hard!, categories)).toEqual({
			survival: -60,
			lifestyle: -40
		});
	});
});

describe('DB mutual-exclusion', () => {
	it('rejects categoryWeights on grouped rows', () => {
		expect(() =>
			validateTransactionCategoryWeights({
				groupId: 'g1',
				categoryId: 'gro',
				categoryWeights: [
					{ categoryId: 'gro', weight: 0.6 },
					{ categoryId: 'hh', weight: 0.4 }
				]
			})
		).toThrow(/categoryWeights cannot be set on grouped/);
	});
});

describe('partitioned edge cases', () => {
	it('returns null without members on a grouped row', () => {
		const row = {
			id: 'r1',
			groupId: 'g1',
			amount: -60,
			categoryId: 'gro'
		} as unknown as Transaction;
		expect(resolveSplit(row)).toBeNull();
	});

	it('merges same categoryId into one slice — hasSplit false', () => {
		const gid = 'g-same';
		const members = [
			{ id: 'a', groupId: gid, amount: -30, categoryId: 'gro' },
			{ id: 'b', groupId: gid, amount: -20, categoryId: 'gro' }
		] as unknown as Transaction[];
		const split = resolveSplit(members[0], members)!;
		expect(split.slices).toHaveLength(1);
		expect(split.slices[0].amount).toBe(-50);
		expect(hasSplit(split)).toBe(false);
	});

	it('buildGroupMemberMap indexes all group rows', () => {
		const gid = 'g-map';
		const txs = [
			{ id: '1', groupId: gid, amount: -10, categoryId: 'gro' },
			{ id: '2', groupId: gid, amount: -5, categoryId: 'hh' },
			{ id: '3', amount: -99, categoryId: 'gro' }
		] as unknown as Transaction[];
		const map = buildGroupMemberMap(txs);
		expect(map.get(gid)).toHaveLength(2);
		expect(map.has('other')).toBe(false);
	});
});

describe('transactionHasExistingSplit', () => {
	it('is true for groupId or multi-entry categoryWeights', () => {
		expect(
			transactionHasExistingSplit({ groupId: 'g1', categoryId: 'gro' } as unknown as Transaction)
		).toBe(true);
		expect(
			transactionHasExistingSplit({
				categoryWeights: [
					{ categoryId: 'a', weight: 0.6 },
					{ categoryId: 'b', weight: 0.4 }
				]
			} as unknown as Transaction)
		).toBe(true);
		expect(transactionHasExistingSplit({ categoryId: 'gro' } as unknown as Transaction)).toBe(
			false
		);
	});
});

describe('distinctClearedMonths', () => {
	it('counts unique months, not row count', () => {
		const oneMonth = Array.from({ length: 10 }, (_, i) => ({
			id: `t${i}`,
			clearedDate: '2024-03-15T12:00:00Z',
			amount: -10
		})) as unknown as Transaction[];
		expect(distinctClearedMonths(oneMonth)).toBe(1);

		const threeMonths = [
			{ id: 'a', clearedDate: '2024-01-10T12:00:00Z', amount: -10 },
			{ id: 'b', clearedDate: '2024-02-10T12:00:00Z', amount: -10 },
			{ id: 'c', clearedDate: '2024-03-10T12:00:00Z', amount: -10 }
		] as unknown as Transaction[];
		expect(distinctClearedMonths(threeMonths)).toBe(3);
	});
});

describe('expandForCategoryAttribution', () => {
	const gid = 'g-costco-expand';
	const hardMembers = [
		{ id: 'hard-1', groupId: gid, amount: -60, categoryId: 'gro', clearedDate: '2024-01-01' },
		{ id: 'hard-2', groupId: gid, amount: -40, categoryId: 'hh', clearedDate: '2024-01-01' }
	] as unknown as Transaction[];

	it('expands partitioned group to per-slice rows', () => {
		const expanded = expandForCategoryAttribution(hardMembers);
		expect(expanded).toHaveLength(2);
		expect(expanded.find((t) => t.categoryId === 'gro')?.amount).toBe(-60);
		expect(expanded.find((t) => t.categoryId === 'hh')?.amount).toBe(-40);
		expect(expanded.every((t) => !t.groupId)).toBe(true);
	});

	it('matches soft 60/40 per-category attribution vs collapsed dedup row', () => {
		const softTx = {
			id: 'soft',
			amount: -100,
			categoryId: 'gro',
			categoryWeights: [
				{ categoryId: 'gro', weight: 0.6 },
				{ categoryId: 'hh', weight: 0.4 }
			]
		} as unknown as Transaction;

		const expandedHard = expandForCategoryAttribution(hardMembers);
		const deduped = deduplicateForSpendTotals(hardMembers);
		expect(deduped).toHaveLength(1);

		for (const cid of ['gro', 'hh']) {
			const fromSoft = effectiveAmountForCategory(softTx, cid);
			const fromExpanded = expandedHard
				.filter((t) => t.categoryId === cid)
				.reduce((s, t) => s + (t.amount ?? 0), 0);
			const fromDedupedOnly = effectiveAmountForCategory(deduped[0]!, cid);
			expect(fromExpanded).toBe(fromSoft);
			expect(fromDedupedOnly).not.toBe(fromSoft);
		}
	});
});

describe('deduplicateForSpendTotals', () => {
	it('collapses partitioned group to one row with split.totalAmount', () => {
		const gid = 'g-dedup';
		const txs = [
			{ id: 'a', groupId: gid, amount: -60, categoryId: 'gro', clearedDate: '2024-01-01' },
			{ id: 'b', groupId: gid, amount: -40, categoryId: 'hh', clearedDate: '2024-01-01' },
			{ id: 'solo', amount: -25, categoryId: 'gro', clearedDate: '2024-01-02' }
		] as unknown as Transaction[];
		const out = deduplicateForSpendTotals(txs);
		expect(out).toHaveLength(2);
		const collapsed = out.find((t) => t.groupId === gid)!;
		expect(collapsed.amount).toBe(-100);
		expect(out.find((t) => t.id === 'solo')?.amount).toBe(-25);
	});

	it('leaves weighted soft split row unchanged', () => {
		const soft = {
			id: 'soft',
			amount: -100,
			categoryWeights: [
				{ categoryId: 'gro', weight: 0.6 },
				{ categoryId: 'hh', weight: 0.4 }
			]
		} as unknown as Transaction;
		expect(deduplicateForSpendTotals([soft])).toEqual([soft]);
	});
});

describe('type-agnostic partitioned splits', () => {
	it('resolves income group members', () => {
		const gid = 'g-inc';
		const members = [
			{ id: 'i1', type: 'income', groupId: gid, amount: 600, categoryId: 'sal' },
			{ id: 'i2', type: 'income', groupId: gid, amount: 400, categoryId: 'bonus' }
		] as unknown as Transaction[];
		const split = resolveSplit(members[0], members)!;
		expect(amountForCategory(split, 'sal')).toBe(600);
		expect(amountForCategory(split, 'bonus')).toBe(400);
	});

	it('resolves transfer group members', () => {
		const gid = 'g-xfer';
		const members = [
			{ id: 't1', type: 'transfer', groupId: gid, amount: -50, categoryId: 'a' },
			{ id: 't2', type: 'transfer', groupId: gid, amount: -50, categoryId: 'b' }
		] as unknown as Transaction[];
		const split = resolveSplit(members[0], members)!;
		expect(hasSplit(split)).toBe(true);
		expect(split.totalAmount).toBe(-100);
	});
});
