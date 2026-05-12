/**
 * Money Manager re-import: merge vs replace when mmUid already exists.
 */

import type { Transaction } from '$lib/core/db';

/** Import-owned fields updated on merge (not description/notes/category/status). */
export const MM_MERGE_IMPORT_OWNED_KEYS = [
	'type',
	'accountId',
	'amount',
	'currency',
	'accountAmount',
	'clearedDate',
	'currencyConversion',
	'importMetadata',
	'importQuality',
	'importSource',
	'transferDetails'
] as const satisfies readonly (keyof Transaction)[];

export type MmMergeImportOwnedKey = (typeof MM_MERGE_IMPORT_OWNED_KEYS)[number];

/** Keys cleared on full replace before applying fresh row (MM wins everything). */
const MM_REPLACE_CLEAR_KEYS: (keyof Transaction)[] = [
	'categoryWeights',
	'categoryConfidence',
	'memo',
	'flexibilityTier',
	'priority',
	'directionalConstraint',
	'dependencies',
	'dependencyType',
	'dependencyMetadata',
	'reference',
	'recurrenceRule',
	'parentRecurrenceId',
	'groupId',
	'groupName',
	'reimbursements',
	'plannedDate',
	'plannedAmount',
	'deadline',
	'spreadingStrategy',
	'debtGroupId',
	'acknowledgedDebtPeriod',
	'reconciledAt',
	'automation',
	'confidence',
	'toAccountId'
];

function replaceExplicitClears(): Partial<Record<keyof Transaction, undefined>> {
	return Object.fromEntries(MM_REPLACE_CLEAR_KEYS.map((k) => [k, undefined])) as Partial<
		Record<keyof Transaction, undefined>
	>;
}

/**
 * Partial update for merge policy: MM refreshes amounts/dates/FX/metadata; user keeps category, notes, description, status, etc.
 */
export function buildMmMergeUpdates(
	fresh: Transaction
): Partial<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>> {
	return {
		type: fresh.type,
		accountId: fresh.accountId,
		amount: fresh.amount,
		currency: fresh.currency,
		accountAmount: fresh.accountAmount,
		clearedDate: fresh.clearedDate,
		currencyConversion: fresh.currencyConversion,
		importMetadata: fresh.importMetadata,
		importQuality: fresh.importQuality,
		importSource: fresh.importSource,
		transferDetails: fresh.transferDetails
	};
}

/**
 * Full replace from MM row: same as fresh insert payload except stable `id`, with user-owned Budgic fields cleared.
 */
export function buildMmReplaceUpdates(
	fresh: Transaction
): Partial<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>> {
	const { id: _drop, createdAt: _c, updatedAt: _u, deletedAt: _d, ...freshRest } = fresh;
	return {
		...replaceExplicitClears(),
		...freshRest
	};
}

export function simulateMmMerge(existing: Transaction, fresh: Transaction): Transaction {
	return { ...existing, ...buildMmMergeUpdates(fresh) };
}

export function simulateMmReplace(existing: Transaction, fresh: Transaction): Transaction {
	return { ...existing, ...buildMmReplaceUpdates(fresh), id: existing.id };
}

function jsonEqual(a: unknown, b: unknown): boolean {
	try {
		return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
	} catch {
		return false;
	}
}

/** Diffs for merge: import-owned keys only. */
export function diffMmMergeImportOwned(
	before: Transaction,
	after: Transaction
): Array<{ field: string; before: unknown; after: unknown }> {
	const out: Array<{ field: string; before: unknown; after: unknown }> = [];
	for (const key of MM_MERGE_IMPORT_OWNED_KEYS) {
		const bv = before[key];
		const av = after[key];
		if (!jsonEqual(bv, av)) {
			out.push({ field: key as string, before: bv ?? null, after: av ?? null });
		}
	}
	return out;
}

/** Diffs for replace: same import-owned keys plus fields MM overwrites vs user. */
export const MM_REPLACE_EXTRA_DIFF_KEYS = [
	'categoryId',
	'description',
	'notes',
	'status'
] as const satisfies readonly (keyof Transaction)[];

export function diffMmReplace(
	before: Transaction,
	after: Transaction
): Array<{ field: string; before: unknown; after: unknown }> {
	const keys = new Set<string>([
		...MM_MERGE_IMPORT_OWNED_KEYS,
		...MM_REPLACE_EXTRA_DIFF_KEYS
	]);
	const out: Array<{ field: string; before: unknown; after: unknown }> = [];
	for (const key of keys) {
		const k = key as keyof Transaction;
		const bv = before[k];
		const av = after[k];
		if (!jsonEqual(bv, av)) {
			out.push({ field: key, before: bv ?? null, after: av ?? null });
		}
	}
	return out;
}
