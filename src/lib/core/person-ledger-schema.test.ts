import { describe, expect, it } from 'vitest';
import { transactionAutomationCountsInAnalytics } from '$lib/core/db';

describe('person-ledger automation tags', () => {
	it('excludes person-ledger-close from analytics', () => {
		expect(transactionAutomationCountsInAnalytics({ automation: 'person-ledger-close' })).toBe(
			false
		);
	});

	it('excludes person-opening-balance from analytics', () => {
		expect(
			transactionAutomationCountsInAnalytics({ automation: 'person-opening-balance' })
		).toBe(false);
	});
});
