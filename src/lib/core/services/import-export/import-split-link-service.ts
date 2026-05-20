/**
 * Hard split **link** for import review and post-add suggestions (partitioned only).
 *
 * `linkTransactionsAsSplitGroup` sets shared `groupId` in place — must not write
 * `categoryWeights` or downgrade to approximate splits. See
 * docs/analysis/transaction-split-unification.md § Import workflow.
 */
import {
	db,
	generateUUID,
	validateTransactionGroup,
	type ImportQuality,
	type Transaction
} from '$lib/core/db';
import { accountService } from '../core/account-service';
import { transactionService } from '../core/transaction-service';

function getRelevantTimestampMs(tx: Transaction): number | null {
	const raw = tx.clearedDate ?? tx.plannedDate ?? tx.createdAt;
	if (!raw) return null;
	const ms = Date.parse(raw);
	return Number.isFinite(ms) ? ms : null;
}

function stripSplitCandidateFlag(q: ImportQuality | undefined): ImportQuality | undefined {
	if (!q) return undefined;
	const { splitCandidateGroupId: _s, ...rest } = q;
	const keys = Object.keys(rest).filter(
		(k) => rest[k as keyof typeof rest] !== undefined && k !== 'splitCandidateGroupId'
	);
	if (keys.length === 0) return undefined;
	return rest as ImportQuality;
}

function pickGroupName(transactions: Transaction[]): string {
	const descriptions = transactions
		.map((t) => (t.description ?? '').trim())
		.filter(Boolean)
		.sort((a, b) => b.length - a.length);
	return descriptions[0] ?? 'Split';
}

function pickEarliestIso(
	transactions: Transaction[],
	field: 'clearedDate' | 'plannedDate'
): string | undefined {
	const values = transactions
		.map((t) => t[field])
		.filter((v): v is string => !!v)
		.sort((a, b) => Date.parse(a) - Date.parse(b));
	return values[0];
}

export interface LinkSplitGroupResult {
	groupId: string;
	memberIds: string[];
}

export interface DismissSplitCandidateResult {
	groupId: string;
	transactionIds: string[];
}

/**
 * Link existing imported transactions as a hard split group (in-place groupId).
 */
export async function linkTransactionsAsSplitGroup(
	selectedIds: string[]
): Promise<LinkSplitGroupResult> {
	const uniqueIds = [...new Set(selectedIds)];
	if (uniqueIds.length < 2) {
		throw new Error('Select at least two transactions to create a split');
	}

	const transactions = (await Promise.all(uniqueIds.map((id) => db.transactions.get(id)))).filter(
		(t): t is Transaction => !!t && !t.deletedAt
	);

	if (transactions.length !== uniqueIds.length) {
		throw new Error('One or more transactions were not found');
	}

	const accountId = transactions[0]!.accountId;
	const type = transactions[0]!.type;
	const status = transactions[0]!.status;
	const currency = transactions[0]!.currency;

	if (!transactions.every((t) => t.accountId === accountId)) {
		throw new Error('All transactions must use the same account');
	}
	if (!transactions.every((t) => t.type === type)) {
		throw new Error('All transactions must have the same type');
	}
	if (!transactions.every((t) => t.status === status)) {
		throw new Error('All transactions must have the same status');
	}
	if (!transactions.every((t) => t.currency === currency)) {
		throw new Error('All transactions must have the same currency');
	}
	if (transactions.some((t) => t.groupId)) {
		throw new Error('One or more transactions are already in a group');
	}

	const categoryIds = new Set(
		transactions.map((t) => t.categoryId).filter((id): id is string => !!id)
	);
	const needsExactCategory = type === 'expense' && categoryIds.size > 1;

	const groupId = generateUUID();
	const groupName = pickGroupName(transactions);
	const clearedDate = pickEarliestIso(transactions, 'clearedDate');
	const plannedDate = pickEarliestIso(transactions, 'plannedDate');

	const draft = transactions.map((t) => ({
		...t,
		groupId,
		groupName,
		clearedDate: clearedDate ?? t.clearedDate,
		plannedDate: plannedDate ?? t.plannedDate,
		...(needsExactCategory ? { categoryConfidence: 'exact' as const } : {})
	}));

	const validation = validateTransactionGroup(draft);
	if (!validation.isValid) {
		throw new Error(validation.errors.join('; '));
	}

	const touchedAccounts = new Set<string>();
	for (const tx of transactions) {
		const importQuality = stripSplitCandidateFlag(tx.importQuality);
		await transactionService.updateTransaction(
			tx.id,
			{
				groupId,
				groupName,
				clearedDate: clearedDate ?? tx.clearedDate,
				plannedDate: plannedDate ?? tx.plannedDate,
				...(needsExactCategory ? { categoryConfidence: 'exact' } : {}),
				importQuality
			},
			{ dataCorrectionSource: 'user' }
		);
		if (tx.accountId) touchedAccounts.add(tx.accountId);
	}

	for (const accountId of touchedAccounts) {
		await accountService.recalculateAccountBalance(accountId);
	}

	return { groupId, memberIds: transactions.map((t) => t.id) };
}

/**
 * Dismiss a split candidate group from the import review queue.
 */
export async function dismissSplitCandidateGroup(
	groupId: string
): Promise<DismissSplitCandidateResult> {
	const rows = await db.transactions
		.filter(
			(t) =>
				!t.deletedAt &&
				t.importQuality?.splitCandidateGroupId === groupId &&
				!t.importQuality?.reviewDismissed
		)
		.toArray();

	for (const tx of rows) {
		await transactionService.updateTransaction(
			tx.id,
			{
				importQuality: {
					...tx.importQuality,
					reviewDismissed: true
				}
			},
			{ dataCorrectionSource: 'user' }
		);
	}

	return { groupId, transactionIds: rows.map((t) => t.id) };
}
