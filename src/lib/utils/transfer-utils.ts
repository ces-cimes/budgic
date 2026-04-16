import type { Account, Transaction } from '$lib/core/db';

/**
 * Display label for transfers: source account → destination account.
 * The stored `description` field is not used for display.
 */
export function formatTransferLabel(tx: Transaction, accounts: Account[]): string {
	const src = accounts.find((a) => a.id === tx.accountId)?.name ?? 'Unknown';
	const dst =
		accounts.find((a) => a.id === tx.transferDetails?.toAccountId)?.name ?? 'Unknown';
	return `${src} → ${dst}`;
}
