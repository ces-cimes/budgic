import { describe, it, expect } from 'vitest';
import { __test, passiveAccountService } from './passive-account-service';
import type { Account } from '$lib/core/db';

describe('passiveAccountService.projectBalance', () => {
	it('compounds daily APR over 30 days on a positive balance', () => {
		const base = 10_000;
		const apr = 0.12; // 12% annual
		const days = 30;
		const out = __test.projectSignedBalance(base, apr, 'daily', days);
		const daily = apr / 365;
		const expected = base * Math.pow(1 + daily, days);
		expect(out).toBeCloseTo(expected, 8);
	});

	it('returns current balance when no rate profile', () => {
		const account = {
			currentBalance: 2500
		} as Account;
		expect(passiveAccountService.projectBalance(account, new Date())).toBe(2500);
	});

	it('uses monthly equivalent daily rate per spec', () => {
		const base = 5000;
		const apr = 0.06;
		const daily = apr / 12 / 30;
		const out = __test.projectSignedBalance(base, apr, 'monthly', 30);
		expect(out).toBeCloseTo(base * Math.pow(1 + daily, 30), 8);
	});

	it('grows debt magnitude when APR is negative (charging) on negative balance', () => {
		const base = -2000;
		const apr = -0.18;
		const days = 30;
		const out = __test.projectSignedBalance(base, apr, 'daily', days);
		const daily = -apr / 365;
		const expectedMag = 2000 * Math.pow(1 + daily, days);
		expect(out).toBeCloseTo(-expectedMag, 6);
	});
});
