/**
 * Write model for transaction splits (counterpart to resolveSplit).
 * @see docs/analysis/transaction-split-unification.md
 */

import type { CategoryConfidence, Transaction } from '$lib/core/db';
import { transactionService } from '$lib/core/services';
import {
	assertSoftSplitCategoryIdMatchesPrimary,
	assertValidSoftCategoryWeights,
	primaryCategoryIdFromWeights,
	roundWeightSum
} from '$lib/utils/transaction-category-weights';
import {
	buildSplitResultFromForm,
	hydrateSplitExtrasFromCategoryWeights,
	type SplitExtra
} from '$lib/utils/soft-split-extras';
import { hasSplit, resolveSplit } from '$lib/utils/transaction-split';

export type SplitPersistMode = 'weighted' | 'partitioned';
export type SplitSource = 'none' | 'manual' | 'profile';

export type SplitDraft = {
	mode: SplitPersistMode;
	primaryCategoryId: string;
	extras: SplitExtra[];
	/** Partitioned mode: absolute amounts per category (positive magnitudes). */
	exactAmounts?: { categoryId: string; amount: number }[];
	groupName?: string;
	source: SplitSource;
};

export type TransactionShell = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export type PersistSplitContext = {
	shell: TransactionShell;
	draft: SplitDraft | null;
	isEdit: boolean;
	transactionId?: string;
	groupId?: string | null;
	groupMembers?: Transaction[];
};

export type PersistSplitResult = {
	transaction: Transaction;
	groupId?: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function hydrateSplitDraft(tx: Transaction, members?: Transaction[]): SplitDraft | null {
	const split = resolveSplit(tx, members);
	if (!split || !hasSplit(split)) return null;

	if (split.kind === 'weighted') {
		const hydrated = hydrateSplitExtrasFromCategoryWeights(
			tx.categoryWeights ?? split.slices.map((s) => ({ categoryId: s.categoryId, weight: s.share }))
		);
		if (!hydrated) return null;
		return {
			mode: 'weighted',
			primaryCategoryId: hydrated.primaryCategoryId,
			extras: hydrated.splitExtras,
			source: tx.categoryConfidence === 'profile-inferred' ? 'profile' : 'manual',
			groupName: tx.groupName
		};
	}

	return {
		mode: 'partitioned',
		primaryCategoryId: split.primaryCategoryId,
		extras: [],
		exactAmounts: split.slices.map((s) => ({
			categoryId: s.categoryId,
			amount: Math.abs(s.amount)
		})),
		groupName: split.groupName ?? tx.groupName,
		source: split.categoryConfidence === 'profile-inferred' ? 'profile' : 'manual'
	};
}

/** Build draft from add/edit form bindables (null when split UI inactive). */
export function buildSplitDraftFromFormState(args: {
	primaryCategoryId: string;
	mode: SplitPersistMode;
	extras: SplitExtra[];
	exactAmounts: { categoryId: string; amount: number }[];
	source: SplitSource;
	groupName?: string;
	splitSectionOpen: boolean;
}): SplitDraft | null {
	if (!args.splitSectionOpen || !args.primaryCategoryId) return null;
	return {
		mode: args.mode,
		primaryCategoryId: args.primaryCategoryId,
		extras: args.extras,
		exactAmounts: args.exactAmounts,
		groupName: args.groupName,
		source: args.source
	};
}

export function draftHasActiveSplit(draft: SplitDraft | null | undefined): boolean {
	if (!draft?.primaryCategoryId) return false;
	if (draft.mode === 'weighted') {
		return buildSplitResultFromForm(draft.primaryCategoryId, draft.extras) !== undefined;
	}
	const rows = draft.exactAmounts?.filter((r) => r.categoryId?.trim() && r.amount > 0) ?? [];
	return rows.length >= 2;
}

function weightedConfidence(source: SplitSource): CategoryConfidence {
	return source === 'profile' ? 'profile-inferred' : 'weighted';
}

function buildWeightedPayload(draft: SplitDraft): {
	weights: { categoryId: string; weight: number }[];
	primaryId: string;
} {
	const built = buildSplitResultFromForm(draft.primaryCategoryId, draft.extras);
	if (!built) {
		throw new Error('Invalid approximate split');
	}
	assertValidSoftCategoryWeights(built.weights);
	assertSoftSplitCategoryIdMatchesPrimary(built.primaryId, built.weights);
	return built;
}

function allocateSignedAmounts(
	totalAmount: number,
	slices: { categoryId: string; amount: number }[],
	primaryCategoryId: string
): { categoryId: string; amount: number }[] {
	const totalAbs = Math.abs(totalAmount);
	const sign = totalAmount < 0 ? -1 : 1;
	const mags = slices.map((s) => round2(Math.max(0, s.amount)));
	const sumMag = mags.reduce((a, b) => a + b, 0);
	if (sumMag < 1e-9) {
		throw new Error('Exact split requires positive amounts');
	}
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

function shellWithoutSplitFields(shell: TransactionShell): TransactionShell {
	const {
		categoryWeights: _cw,
		groupId: _gid,
		groupName: _gn,
		categoryConfidence: _cc,
		...rest
	} = shell;
	return rest;
}

function buildPartitionedRows(
	shell: TransactionShell,
	draft: SplitDraft
): Array<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>> {
	const slices = draft.exactAmounts?.filter((r) => r.categoryId?.trim() && r.amount > 0) ?? [];
	if (slices.length < 2) {
		throw new Error('Exact split requires at least two categories with amounts');
	}
	const categoryIds = slices.map((s) => s.categoryId);
	if (new Set(categoryIds).size !== categoryIds.length) {
		throw new Error('Exact split requires distinct categories');
	}
	const signed = allocateSignedAmounts(shell.amount ?? 0, slices, draft.primaryCategoryId);
	const categoriesDiffer = new Set(signed.map((s) => s.categoryId)).size >= 2;
	const confidence: CategoryConfidence | undefined = categoriesDiffer ? 'exact' : undefined;
	const base = shellWithoutSplitFields(shell);

	return signed.map((slice) => ({
		...base,
		amount: slice.amount,
		categoryId: slice.categoryId,
		categoryConfidence: confidence,
		categoryWeights: undefined,
		groupId: undefined,
		groupName: undefined
	}));
}

async function persistWeighted(
	ctx: PersistSplitContext,
	draft: SplitDraft
): Promise<PersistSplitResult> {
	const { weights, primaryId } = buildWeightedPayload(draft);
	const confidence = weightedConfidence(draft.source);
	const payload: TransactionShell = {
		...shellWithoutSplitFields(ctx.shell),
		categoryId: primaryId,
		categoryWeights: weights,
		categoryConfidence: confidence,
		groupId: undefined,
		groupName: undefined
	};

	if (ctx.isEdit && ctx.transactionId) {
		const tx = await transactionService.updateTransaction(ctx.transactionId, payload);
		return { transaction: tx };
	}

	const tx = await transactionService.createTransaction(payload);
	return { transaction: tx };
}

async function persistPartitionedCreate(
	ctx: PersistSplitContext,
	draft: SplitDraft
): Promise<PersistSplitResult> {
	const rows = buildPartitionedRows(ctx.shell, draft);
	const groupName = draft.groupName?.trim() || 'Split';
	const groupId = await transactionService.createTransactionGroup(rows, groupName);
	const members = await transactionService.getGroupTransactions(groupId);
	const rep = members.reduce((a, b) => (Math.abs(b.amount ?? 0) > Math.abs(a.amount ?? 0) ? b : a));
	return { transaction: rep, groupId };
}

async function persistPartitionedUpdate(
	ctx: PersistSplitContext,
	draft: SplitDraft
): Promise<PersistSplitResult> {
	const groupId = ctx.groupId;
	if (!groupId) {
		throw new Error('Cannot update partitioned split without groupId');
	}
	const members = ctx.groupMembers ?? (await transactionService.getGroupTransactions(groupId));
	const rows = buildPartitionedRows(ctx.shell, draft);
	const groupName = draft.groupName?.trim() || members[0]?.groupName || 'Split';

	const poolByCategory = new Map<string, Transaction[]>();
	for (const m of members) {
		const cid = m.categoryId ?? '';
		if (!cid) continue;
		const arr = poolByCategory.get(cid) ?? [];
		arr.push(m);
		poolByCategory.set(cid, arr);
	}

	const matchedIds = new Set<string>();
	const individualUpdates: Array<{
		id: string;
		amount: number;
		description?: string;
		accountId?: string;
		categoryId: string;
		categoryConfidence?: Transaction['categoryConfidence'];
	}> = [];
	const rowsToCreate: typeof rows = [];

	for (const row of rows) {
		const categoryId = row.categoryId ?? '';
		if (!categoryId) continue;
		const pool = poolByCategory.get(categoryId);
		const existing = pool?.shift();
		if (existing?.id) {
			matchedIds.add(existing.id);
			individualUpdates.push({
				id: existing.id,
				amount: row.amount ?? 0,
				description: ctx.shell.description,
				accountId: ctx.shell.accountId,
				categoryId,
				categoryConfidence: row.categoryConfidence
			});
		} else {
			rowsToCreate.push(row);
		}
	}

	for (const m of members) {
		if (!matchedIds.has(m.id)) {
			await transactionService.deleteTransaction(m.id);
		}
	}

	for (const row of rowsToCreate) {
		const created = await transactionService.createTransaction(row);
		await transactionService.addTransactionToGroup(created.id, groupId);
	}

	if (individualUpdates.length > 0 || rowsToCreate.length > 0) {
		await transactionService.updateTransactionGroup(groupId, {
			sharedFields: {
				type: ctx.shell.type,
				status: ctx.shell.status,
				currency: ctx.shell.currency,
				plannedDate: ctx.shell.plannedDate,
				clearedDate: ctx.shell.clearedDate,
				recurrenceRule: ctx.shell.recurrenceRule,
				parentRecurrenceId: ctx.shell.parentRecurrenceId,
				reference: ctx.shell.reference,
				notes: ctx.shell.notes,
				importSource: ctx.shell.importSource,
				toAccountId: ctx.shell.toAccountId,
				groupName
			},
			individualUpdates: individualUpdates.length > 0 ? individualUpdates : undefined
		});
	}

	const updated = await transactionService.getGroupTransactions(groupId);
	const rep =
		updated.find((m) => m.id === ctx.transactionId) ??
		updated.reduce((a, b) => (Math.abs(b.amount ?? 0) > Math.abs(a.amount ?? 0) ? b : a));
	return { transaction: rep, groupId };
}

async function collapsePartitionedToWeighted(
	ctx: PersistSplitContext,
	draft: SplitDraft
): Promise<PersistSplitResult> {
	const members = ctx.groupMembers!;
	const { weights, primaryId } = buildWeightedPayload(draft);
	const repId = ctx.transactionId ?? members[0]!.id;
	for (const m of members) {
		if (m.id !== repId) {
			await transactionService.deleteTransaction(m.id);
		}
	}
	const tx = await transactionService.updateTransaction(repId, {
		...shellWithoutSplitFields(ctx.shell),
		categoryId: primaryId,
		categoryWeights: weights,
		categoryConfidence: weightedConfidence(draft.source),
		groupId: undefined,
		groupName: undefined
	});
	return { transaction: tx };
}

/**
 * Persist allocation from add/edit form (or bulk weighted backfill).
 */
export async function persistSplit(ctx: PersistSplitContext): Promise<PersistSplitResult> {
	if (!draftHasActiveSplit(ctx.draft)) {
		const payload: TransactionShell = {
			...shellWithoutSplitFields(ctx.shell),
			categoryWeights: undefined,
			groupId: ctx.shell.type === 'transfer' ? ctx.shell.groupId : undefined,
			groupName: ctx.shell.type === 'transfer' ? ctx.shell.groupName : undefined
		};
		if (ctx.isEdit && ctx.transactionId) {
			const tx = await transactionService.updateTransaction(ctx.transactionId, payload);
			return { transaction: tx };
		}
		const tx = await transactionService.createTransaction(payload);
		return { transaction: tx };
	}

	const draft = ctx.draft!;

	if (draft.mode === 'weighted') {
		if (ctx.groupId && ctx.groupMembers && ctx.groupMembers.length >= 2) {
			return collapsePartitionedToWeighted(ctx, draft);
		}
		return persistWeighted(ctx, draft);
	}

	if (ctx.isEdit && ctx.groupId && ctx.groupMembers && ctx.groupMembers.length >= 2) {
		return persistPartitionedUpdate(ctx, draft);
	}

	if (ctx.isEdit && ctx.transactionId && !ctx.groupId) {
		const result = await persistPartitionedCreate(ctx, draft);
		await transactionService.deleteTransaction(ctx.transactionId);
		return result;
	}

	return persistPartitionedCreate(ctx, draft);
}

/**
 * Bulk retrospective: apply learned weights to one eligible row.
 */
export async function persistRetrospectiveWeightedSplit(
	transactionId: string,
	weights: { categoryId: string; weight: number }[],
	primaryCategoryId: string
): Promise<boolean> {
	const tx = await transactionService.getTransaction(transactionId);
	if (!tx || tx.deletedAt) return false;

	const normalized = roundWeightSum(weights);
	assertValidSoftCategoryWeights(normalized);

	await transactionService.updateTransaction(transactionId, {
		categoryWeights: normalized,
		categoryId: primaryCategoryId,
		categoryConfidence: 'profile-inferred',
		groupId: undefined,
		groupName: undefined
	});
	return true;
}
