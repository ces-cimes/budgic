/**
 * Canonical read model for transaction splits (weighted vs partitioned).
 * @see docs/analysis/transaction-split-unification.md
 */

import type { Category, CategoryConfidence, Transaction } from '$lib/core/db';
import { primaryCategoryIdFromWeights } from './transaction-category-weights';

export type SplitKind = 'weighted' | 'partitioned';

export type SplitSlice = {
	categoryId: string;
	/** 0–1, normalized across slices */
	share: number;
	/** Signed; always populated when resolved */
	amount: number;
	/** Partitioned: backing transaction id (largest |amount| row when merged) */
	rowId?: string;
};

export type TransactionSplit = {
	/** tx.id (weighted) or groupId (partitioned) */
	id: string;
	kind: SplitKind;
	slices: SplitSlice[];
	/** Signed total of the economic event */
	totalAmount: number;
	primaryCategoryId: string;
	categoryConfidence?: CategoryConfidence;
	groupName?: string;
	merchantKey?: string;
};

/** Preload group members for list views / N+1 avoidance */
export function buildGroupMemberMap(transactions: Transaction[]): Map<string, Transaction[]> {
	const map = new Map<string, Transaction[]>();
	for (const tx of transactions) {
		const gid = tx.groupId;
		if (!gid) continue;
		const list = map.get(gid) ?? [];
		list.push(tx);
		map.set(gid, list);
	}
	return map;
}

function resolveWeightedSplit(tx: Transaction): TransactionSplit {
	const weights = tx.categoryWeights!;
	const base = tx.amount ?? 0;
	const slices: SplitSlice[] = weights.map((w) => ({
		categoryId: w.categoryId,
		share: w.weight,
		amount: base * w.weight
	}));
	return {
		id: tx.id,
		kind: 'weighted',
		slices,
		totalAmount: base,
		primaryCategoryId: primaryCategoryIdFromWeights(weights),
		categoryConfidence: tx.categoryConfidence,
		groupName: tx.groupName
	};
}

function pickRepresentative(members: Transaction[]): Transaction {
	return members.reduce((a, b) =>
		Math.abs(b.amount ?? 0) > Math.abs(a.amount ?? 0) ? b : a
	);
}

function resolvePartitionedSplit(tx: Transaction, members: Transaction[]): TransactionSplit {
	const byCategory = new Map<string, { amount: number; rowId: string; maxAbs: number }>();
	for (const m of members) {
		const cid = m.categoryId ?? '';
		if (!cid) continue;
		const amt = m.amount ?? 0;
		const absAmt = Math.abs(amt);
		const existing = byCategory.get(cid);
		if (!existing) {
			byCategory.set(cid, { amount: amt, rowId: m.id, maxAbs: absAmt });
		} else {
			existing.amount += amt;
			if (absAmt > existing.maxAbs) {
				existing.maxAbs = absAmt;
				existing.rowId = m.id;
			}
		}
	}

	const merged = [...byCategory.entries()];
	const absDenom = merged.reduce((s, [, v]) => s + Math.abs(v.amount), 0);
	const slices: SplitSlice[] = merged.map(([categoryId, { amount, rowId }]) => ({
		categoryId,
		share: absDenom > 1e-9 ? Math.abs(amount) / absDenom : 0,
		amount,
		rowId
	}));

	const totalAmount = members.reduce((s, m) => s + (m.amount ?? 0), 0);
	const representative = pickRepresentative(members);
	const groupId = tx.groupId!;

	return {
		id: groupId,
		kind: 'partitioned',
		slices,
		totalAmount,
		primaryCategoryId: representative.categoryId ?? '',
		categoryConfidence: representative.categoryConfidence,
		groupName: representative.groupName ?? tx.groupName
	};
}

/**
 * Resolve a transaction into a canonical split, or null when not a multi-category split.
 * Pass `members` (all group rows) for partitioned splits; omit for per-row legacy callers.
 */
export function resolveSplit(tx: Transaction, members?: Transaction[]): TransactionSplit | null {
	if (tx.categoryWeights && tx.categoryWeights.length >= 2) {
		return resolveWeightedSplit(tx);
	}
	if (tx.groupId && members && members.length > 0) {
		const groupMembers = members.filter((m) => m.groupId === tx.groupId);
		if (groupMembers.length >= 2) {
			return resolvePartitionedSplit(tx, groupMembers);
		}
	}
	return null;
}

export function hasSplit(split: TransactionSplit): boolean {
	return split.slices.length >= 2;
}

export function amountForCategory(split: TransactionSplit, categoryId: string): number {
	return split.slices
		.filter((s) => s.categoryId === categoryId)
		.reduce((sum, s) => sum + s.amount, 0);
}

export function categoryIdsInSplit(split: TransactionSplit): string[] {
	return split.slices.map((s) => s.categoryId);
}

/** Per-waterfall-tier signed amounts for a resolved split */
export function tierAmountsFromSplit(
	split: TransactionSplit,
	categories: Map<string, Category>
): Record<string, number> {
	const result: Record<string, number> = {};
	const addToTier = (tier: string, amount: number) => {
		result[tier] = (result[tier] ?? 0) + amount;
	};
	for (const slice of split.slices) {
		const tier = categories.get(slice.categoryId)?.waterfallTier ?? 'unclassified';
		addToTier(tier, slice.amount);
	}
	return result;
}
