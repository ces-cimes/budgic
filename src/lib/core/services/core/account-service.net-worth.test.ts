import { describe, expect, it, vi, beforeEach } from 'vitest';
import { accountCountsInNetWorth } from '$lib/core/db';

vi.mock('$lib/core/db', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/core/db')>();
	return {
		...actual,
		db: {
			getActiveAccounts: vi.fn()
		}
	};
});

vi.mock('$lib/core/services', () => ({
	userService: {
		getUserPreferences: vi.fn(async () => ({ currency: 'USD', includeAccruedInNetWorth: false }))
	},
	exchangeRateService: {
		convertAmount: vi.fn()
	}
}));

vi.mock('./passive-account-service', () => ({
	passiveAccountService: { projectBalance: vi.fn() }
}));

describe('accountCountsInNetWorth', () => {
	it('includes wallet and person ledgers', () => {
		expect(accountCountsInNetWorth({})).toBe(true);
		expect(accountCountsInNetWorth({ ledgerRole: 'wallet' })).toBe(true);
		expect(accountCountsInNetWorth({ ledgerRole: 'person' })).toBe(true);
	});

	it('excludes archived_person', () => {
		expect(accountCountsInNetWorth({ ledgerRole: 'archived_person' })).toBe(false);
	});
});

describe('accountService.getTotalBalance', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('skips archived_person accounts', async () => {
		const { db } = await import('$lib/core/db');
		vi.mocked(db.getActiveAccounts).mockResolvedValue([
			{
				id: 'w1',
				name: 'Checking',
				type: 'checking',
				currency: 'USD',
				currentBalance: 100,
				initialBalance: 100,
				isActive: true,
				createdAt: '',
				updatedAt: '',
				deletedAt: null
			},
			{
				id: 'p1',
				name: 'Alice',
				type: 'cash',
				currency: 'USD',
				currentBalance: 50,
				initialBalance: 50,
				isActive: true,
				ledgerRole: 'archived_person',
				createdAt: '',
				updatedAt: '',
				deletedAt: null
			}
		] as import('$lib/core/db').Account[]);

		const { accountService } = await import('./account-service');
		const total = await accountService.getTotalBalance();
		expect(total).toBe(100);
	});
});
