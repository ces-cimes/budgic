import { db, type Transaction } from '$lib/core/db';
import { transactionService } from '../core/transaction-service';
import { accountService } from '../core/account-service';

function calendarDayKey(iso: string | undefined): string {
	if (!iso) return '';
	return iso.slice(0, 10);
}

function normDesc(desc: string | undefined): string {
	return (desc || '').trim().toLowerCase();
}

/**
 * Collapse same-day micro-interest rows per account + description into one row; soft-deletes extras.
 * Run only after `automation` has been tagged on transactions.
 */
export async function mergeDailyMicroInterestTransactions(
	candidateIds: string[]
): Promise<{ removedIds: string[]; touchedAccountIds: string[] }> {
	const txs = (await Promise.all(candidateIds.map((id) => db.transactions.get(id)))).filter(
		(t): t is Transaction => !!t && !t.deletedAt
	);

	const interest = txs.filter(
		(t) => t.automation === 'interest-income' || t.automation === 'interest-charge'
	);
	if (interest.length < 2) return { removedIds: [], touchedAccountIds: [] };

	const groups = new Map<string, Transaction[]>();
	for (const tx of interest) {
		if (!tx.accountId || !tx.clearedDate) continue;
		const key = `${tx.accountId}|${calendarDayKey(tx.clearedDate)}|${normDesc(tx.description)}`;
		const arr = groups.get(key) ?? [];
		arr.push(tx);
		groups.set(key, arr);
	}

	const removedIds: string[] = [];
	const touchedAccountIds = new Set<string>();

	for (const [, group] of groups) {
		if (group.length < 2) continue;
		const sorted = [...group].sort(
			(a, b) => Date.parse(a.clearedDate!) - Date.parse(b.clearedDate!)
		);
		const keeper = sorted[0];
		const mergedIds = sorted.slice(1).map((t) => t.id);
		const totalAmount = sorted.reduce((s, t) => s + (t.amount || 0), 0);

		let meta: Record<string, unknown> = {};
		if (keeper.importMetadata) {
			try {
				meta = JSON.parse(keeper.importMetadata) as Record<string, unknown>;
			} catch {
				meta = {};
			}
		}
		meta.interestDailyMerge = true;
		meta.mergedTransactionIds = mergedIds;

		await transactionService.updateTransaction(
			keeper.id,
			{
				amount: totalAmount,
				importMetadata: JSON.stringify(meta)
			},
			{ dataCorrectionSource: 'automation' }
		);

		for (const id of mergedIds) {
			await transactionService.deleteTransaction(id);
			removedIds.push(id);
		}
		touchedAccountIds.add(keeper.accountId!);
	}

	return { removedIds, touchedAccountIds: Array.from(touchedAccountIds) };
}

export async function recalculateBalancesForAccounts(accountIds: string[]): Promise<void> {
	for (const id of accountIds) {
		try {
			await accountService.recalculateAccountBalance(id);
		} catch {
			// best-effort
		}
	}
}
