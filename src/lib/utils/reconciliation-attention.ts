import type { Account } from '$lib/core/db';

/** Same grace window as accounts list (newly created / imported accounts). */
export const NEW_ACCOUNT_RECON_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function isAccountWithinReconciliationGrace(
	account: Pick<Account, 'createdAt'>,
	nowMs: number = Date.now()
): boolean {
	const created = account.createdAt ? new Date(account.createdAt).getTime() : 0;
	return Boolean(created && nowMs - created < NEW_ACCOUNT_RECON_GRACE_MS);
}

/**
 * True when this account should surface in reconciliation attention counts
 * (stale reconciliation, never reconciled, or unresolved discrepancies).
 * At most one increment per account — combines all reasons into one boolean.
 */
export function accountNeedsReconciliationAttention(
	account: Pick<Account, 'createdAt'>,
	summary: { daysSinceLastReconciliation: number; unresolvedDiscrepancies: number },
	nowMs: number = Date.now()
): boolean {
	if (isAccountWithinReconciliationGrace(account, nowMs)) {
		return false;
	}
	return (
		summary.daysSinceLastReconciliation > 30 ||
		summary.daysSinceLastReconciliation === -1 ||
		summary.unresolvedDiscrepancies > 0
	);
}
