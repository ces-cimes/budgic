import type { Account } from '$lib/core/db';

/** Same grace window as accounts list (fallback when bootstrap reconciliation fails). */
export const NEW_ACCOUNT_RECON_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_RECON_CHECKUP_INTERVAL_DAYS = 30;

export function isAccountWithinReconciliationGrace(
	account: Pick<Account, 'createdAt'>,
	nowMs: number = Date.now()
): boolean {
	const created = account.createdAt ? new Date(account.createdAt).getTime() : 0;
	return Boolean(created && nowMs - created < NEW_ACCOUNT_RECON_GRACE_MS);
}

/**
 * True when account is past the user-configured check-up cadence (informational; drives bell alert).
 * Grace applies only when never reconciled and bootstrap did not run.
 */
export function accountNeedsReconciliationCheckup(
	account: Pick<Account, 'createdAt'>,
	summary: { daysSinceLastReconciliation: number },
	intervalDays: number = DEFAULT_RECON_CHECKUP_INTERVAL_DAYS,
	nowMs: number = Date.now()
): boolean {
	if (
		summary.daysSinceLastReconciliation === -1 &&
		isAccountWithinReconciliationGrace(account, nowMs)
	) {
		return false;
	}
	return (
		summary.daysSinceLastReconciliation > intervalDays || summary.daysSinceLastReconciliation === -1
	);
}

/**
 * True when account has actionable reconciliation issues (unresolved discrepancy rows or material balance gap).
 */
export function accountHasOpenReconciliationIssues(
	summary: { unresolvedDiscrepancies: number },
	ledgerBalance: number,
	currentBalance: number,
	tolerance: number = 0.01
): boolean {
	if (summary.unresolvedDiscrepancies > 0) {
		return true;
	}
	return Math.abs(currentBalance - ledgerBalance) > tolerance;
}

/**
 * @deprecated Use accountNeedsReconciliationCheckup or accountHasOpenReconciliationIssues.
 */
export function accountNeedsReconciliationAttention(
	account: Pick<Account, 'createdAt'>,
	summary: { daysSinceLastReconciliation: number; unresolvedDiscrepancies: number },
	nowMs: number = Date.now()
): boolean {
	return (
		accountNeedsReconciliationCheckup(
			account,
			summary,
			DEFAULT_RECON_CHECKUP_INTERVAL_DAYS,
			nowMs
		) || summary.unresolvedDiscrepancies > 0
	);
}
