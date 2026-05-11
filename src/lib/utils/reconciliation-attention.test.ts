import { describe, it, expect } from 'vitest';
import {
	NEW_ACCOUNT_RECON_GRACE_MS,
	accountNeedsReconciliationAttention,
	isAccountWithinReconciliationGrace
} from './reconciliation-attention';
import type { Account } from '$lib/core/db';

describe('reconciliation-attention', () => {
	it('accountNeedsReconciliationAttention counts at most one reason per account', () => {
		const account: Pick<Account, 'createdAt'> = {
			createdAt: new Date(Date.now() - NEW_ACCOUNT_RECON_GRACE_MS - 1).toISOString()
		};
		const summary = {
			daysSinceLastReconciliation: 60,
			unresolvedDiscrepancies: 2
		};
		expect(accountNeedsReconciliationAttention(account, summary)).toBe(true);
	});

	it('suppresses attention during grace window', () => {
		const account: Pick<Account, 'createdAt'> = {
			createdAt: new Date().toISOString()
		};
		const summary = {
			daysSinceLastReconciliation: -1,
			unresolvedDiscrepancies: 5
		};
		expect(isAccountWithinReconciliationGrace(account)).toBe(true);
		expect(accountNeedsReconciliationAttention(account, summary)).toBe(false);
	});
});
