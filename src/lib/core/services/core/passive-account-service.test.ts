import { describe, it, expect } from 'vitest';
import { __test, passiveAccountService } from './passive-account-service';
import type { Account } from '$lib/core/db';

const RATE_BASE = {
	apr: 0.12,
	compounding: 'daily' as const,
	rateType: 'fixed' as const,
	effectiveFrom: '2026-01-01T00:00:00.000Z'
};

function passiveAccount(overrides: Partial<Account> = {}): Account {
	return {
		id: 'sav-1',
		name: 'Savings',
		type: 'savings',
		currency: 'USD',
		currentBalance: 10_000,
		isActive: true,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deletedAt: null,
		...overrides
	} as Account;
}

describe('passiveAccountService.projectBalance', () => {
	it('compounds daily APR over 30 days on a positive balance', () => {
		const base = 10_000;
		const apr = 0.12;
		const days = 30;
		const out = __test.projectSignedBalance(base, apr, 'daily', days);
		const daily = apr / 365;
		const expected = base * Math.pow(1 + daily, days);
		expect(out).toBeCloseTo(expected, 8);
	});

	it('returns current balance when no rate profile', () => {
		const account = passiveAccount({ currentBalance: 2500, rateProfile: undefined });
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

	it('projects from lastConfirmed anchor when rateProfile is set', () => {
		const anchor = new Date('2026-01-01T00:00:00.000Z');
		const asOf = new Date('2026-02-01T00:00:00.000Z');
		const days = (asOf.getTime() - anchor.getTime()) / 86_400_000;
		const account = passiveAccount({
			lastConfirmedBalance: 10_000,
			lastConfirmedAt: anchor.toISOString(),
			rateProfile: RATE_BASE
		});
		const expected = __test.projectSignedBalance(10_000, RATE_BASE.apr, 'daily', days);
		expect(passiveAccountService.projectBalance(account, asOf)).toBeCloseTo(expected, 8);
	});

	it('uses rateProfile.effectiveFrom when lastConfirmedAt is absent', () => {
		const asOf = new Date('2026-02-01T00:00:00.000Z');
		const anchor = new Date(RATE_BASE.effectiveFrom);
		const days = (asOf.getTime() - anchor.getTime()) / 86_400_000;
		const account = passiveAccount({
			currentBalance: 8000,
			lastConfirmedBalance: undefined,
			lastConfirmedAt: undefined,
			rateProfile: RATE_BASE
		});
		const expected = __test.projectSignedBalance(8000, RATE_BASE.apr, 'daily', days);
		expect(passiveAccountService.projectBalance(account, asOf)).toBeCloseTo(expected, 8);
	});

	it('returns currentBalance when elapsed days are not finite', () => {
		const account = passiveAccount({
			currentBalance: 4200,
			lastConfirmedAt: '2026-01-01T00:00:00.000Z',
			rateProfile: RATE_BASE
		});
		expect(passiveAccountService.projectBalance(account, new Date('invalid'))).toBe(4200);
	});

	it('supports annual compounding on a full account fixture', () => {
		const anchor = new Date('2026-01-01T00:00:00.000Z');
		const asOf = new Date('2026-01-16T00:00:00.000Z');
		const days = 15;
		const account = passiveAccount({
			lastConfirmedBalance: 5000,
			lastConfirmedAt: anchor.toISOString(),
			rateProfile: { ...RATE_BASE, apr: 0.06, compounding: 'annual' }
		});
		const expected = __test.projectSignedBalance(5000, 0.06, 'annual', days);
		expect(passiveAccountService.projectBalance(account, asOf)).toBeCloseTo(expected, 8);
	});
});

describe('passiveAccountService.suggestedSheetOpeningBalance', () => {
	it('returns projected balance when rateProfile and confirmation exist', () => {
		const asOf = new Date('2026-02-01T00:00:00.000Z');
		const account = passiveAccount({
			lastConfirmedBalance: 10_000,
			lastConfirmedAt: '2026-01-01T00:00:00.000Z',
			rateProfile: RATE_BASE
		});
		expect(passiveAccountService.suggestedSheetOpeningBalance(account, asOf)).toBe(
			passiveAccountService.projectBalance(account, asOf)
		);
	});

	it('returns lastConfirmedBalance when there is no rate profile', () => {
		const account = passiveAccount({
			rateProfile: undefined,
			lastConfirmedBalance: 7500,
			currentBalance: 8000
		});
		expect(passiveAccountService.suggestedSheetOpeningBalance(account, new Date())).toBe(7500);
	});

	it('falls back to currentBalance when profile exists but account was never confirmed', () => {
		const account = passiveAccount({
			currentBalance: 3200,
			lastConfirmedBalance: undefined,
			lastConfirmedAt: undefined,
			rateProfile: RATE_BASE
		});
		expect(passiveAccountService.suggestedSheetOpeningBalance(account, new Date())).toBe(3200);
	});

	it('uses lastConfirmedBalance alone as confirmation signal', () => {
		const asOf = new Date('2026-02-01T00:00:00.000Z');
		const account = passiveAccount({
			lastConfirmedBalance: 9000,
			lastConfirmedAt: undefined,
			rateProfile: RATE_BASE
		});
		expect(passiveAccountService.suggestedSheetOpeningBalance(account, asOf)).toBe(
			passiveAccountService.projectBalance(account, asOf)
		);
	});
});
