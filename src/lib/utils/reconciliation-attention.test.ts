import { describe, it, expect } from 'vitest';
import {
	NEW_ACCOUNT_RECON_GRACE_MS,
	accountNeedsReconciliationCheckup,
	accountHasOpenReconciliationIssues,
	isAccountWithinReconciliationGrace
} from './reconciliation-attention';
import type { Account } from '$lib/core/db';

describe('reconciliation-attention', () => {
	it('accountNeedsReconciliationCheckup respects cadence interval', () => {
		const account: Pick<Account, 'createdAt'> = {
			createdAt: new Date(Date.now() - NEW_ACCOUNT_RECON_GRACE_MS - 1).toISOString()
		};
		const summary = { daysSinceLastReconciliation: 45 };

		expect(accountNeedsReconciliationCheckup(account, summary, 30)).toBe(true);
		expect(accountNeedsReconciliationCheckup(account, summary, 60)).toBe(false);
	});

	it('accountNeedsReconciliationCheckup suppresses never-reconciled during grace fallback', () => {
		const account: Pick<Account, 'createdAt'> = {
			createdAt: new Date().toISOString()
		};
		const summary = { daysSinceLastReconciliation: -1 };

		expect(isAccountWithinReconciliationGrace(account)).toBe(true);
		expect(accountNeedsReconciliationCheckup(account, summary, 30)).toBe(false);
	});

	it('accountHasOpenReconciliationIssues counts unresolved discrepancies', () => {
		expect(accountHasOpenReconciliationIssues({ unresolvedDiscrepancies: 2 }, 100, 100)).toBe(true);
	});

	it('accountHasOpenReconciliationIssues counts material ledger gap', () => {
		expect(accountHasOpenReconciliationIssues({ unresolvedDiscrepancies: 0 }, 100, 105, 0.01)).toBe(
			true
		);
		expect(
			accountHasOpenReconciliationIssues({ unresolvedDiscrepancies: 0 }, 100, 100.005, 0.01)
		).toBe(false);
	});
});
