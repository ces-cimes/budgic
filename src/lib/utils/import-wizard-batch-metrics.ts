import type { Transaction } from '$lib/core/db';

/** Open post-import wizard when unclassified expense volume exceeds this share of batch expense. */
export const IMPORT_WIZARD_UNCLASSIFIED_SPEND_THRESHOLD = 0.2;

/** Minimum count of unclassified expense rows (by category id) to avoid noisy wizard on tiny imports. */
export const IMPORT_WIZARD_MIN_UNCLASSIFIED_TX = 3;

export function isWizardBatchExpense(tx: Transaction): boolean {
	return tx.type === 'expense' && tx.status === 'cleared' && !tx.deletedAt;
}

export function tierForTransaction(
	tx: Transaction,
	categoryTierById: Record<string, string | undefined>
): string | undefined {
	if (!tx.categoryId) return undefined;
	return categoryTierById[tx.categoryId];
}

export interface BatchExpenseSpendBreakdown {
	totalAbs: number;
	unclassifiedAbs: number;
	classifiedAbs: number;
}

/**
 * Cleared batch expenses: split spend by whether category waterfall tier is known and not `unclassified`.
 * Missing category counts as unclassified spend.
 */
export function computeBatchExpenseSpendBreakdown(
	txs: Transaction[],
	categoryTierById: Record<string, string | undefined>
): BatchExpenseSpendBreakdown {
	let totalAbs = 0;
	let unclassifiedAbs = 0;
	for (const tx of txs) {
		if (!isWizardBatchExpense(tx)) continue;
		const abs = Math.abs(tx.amount || 0);
		totalAbs += abs;
		const tier = tierForTransaction(tx, categoryTierById);
		if (!tier || tier === 'unclassified') unclassifiedAbs += abs;
	}
	return {
		totalAbs,
		unclassifiedAbs,
		classifiedAbs: Math.max(0, totalAbs - unclassifiedAbs)
	};
}

export function batchUnclassifiedSpendShare(
	breakdown: Pick<BatchExpenseSpendBreakdown, 'totalAbs' | 'unclassifiedAbs'>
): number {
	if (breakdown.totalAbs <= 0) return 0;
	return breakdown.unclassifiedAbs / breakdown.totalAbs;
}

export function classifiedExpenseShare(breakdown: BatchExpenseSpendBreakdown): number {
	if (breakdown.totalAbs <= 0) return 1;
	return breakdown.classifiedAbs / breakdown.totalAbs;
}

export function countUnclassifiedExpenseTransactions(
	txs: Transaction[],
	categoryTierById: Record<string, string | undefined>
): number {
	let n = 0;
	for (const tx of txs) {
		if (!isWizardBatchExpense(tx)) continue;
		if (!tx.categoryId) {
			n += 1;
			continue;
		}
		const tier = tierForTransaction(tx, categoryTierById);
		if (!tier || tier === 'unclassified') n += 1;
	}
	return n;
}

export function shouldOpenImportWizard(
	breakdown: BatchExpenseSpendBreakdown,
	unclassifiedExpenseTxCount: number
): boolean {
	if (unclassifiedExpenseTxCount < IMPORT_WIZARD_MIN_UNCLASSIFIED_TX) return false;
	return batchUnclassifiedSpendShare(breakdown) > IMPORT_WIZARD_UNCLASSIFIED_SPEND_THRESHOLD;
}

/** Live “classified expense share” for wizard payoff using tier map (after user approves tiers). */
export function classifiedExpenseShareFromTiers(
	expenseTxIds: string[],
	amountAbsByTxId: Record<string, number>,
	tierByTxId: Record<string, string | undefined>
): number {
	let total = 0;
	let classified = 0;
	for (const id of expenseTxIds) {
		const abs = amountAbsByTxId[id] ?? 0;
		if (abs <= 0) continue;
		total += abs;
		const tier = tierByTxId[id];
		if (tier && tier !== 'unclassified') classified += abs;
	}
	if (total <= 0) return 1;
	return classified / total;
}
