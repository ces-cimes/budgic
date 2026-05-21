import { describe, expect, it } from 'vitest';
import { guessUpdateBalanceClassification } from './update-balance-classification';
import type { Account } from '$lib/core/db';

const RATE = {
	apr: 0.05,
	compounding: 'daily' as const,
	rateType: 'fixed' as const,
	effectiveFrom: '2026-01-01T00:00:00.000Z'
};

function account(type: Account['type'], withRate = true): Account {
	return {
		id: 'a1',
		name: 'Test',
		type,
		currency: 'USD',
		currentBalance: 1000,
		isActive: true,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deletedAt: null,
		rateProfile: withRate ? RATE : undefined
	} as Account;
}

describe('guessUpdateBalanceClassification', () => {
	it('returns unclassified when there is no rate profile', () => {
		expect(guessUpdateBalanceClassification(account('savings', false), 50)).toBe('unclassified');
	});

	it('returns unclassified when diff is within epsilon', () => {
		expect(guessUpdateBalanceClassification(account('savings'), 0.01)).toBe('unclassified');
		expect(guessUpdateBalanceClassification(account('savings'), -0.01)).toBe('unclassified');
	});

	it('classifies savings surplus as interest-income', () => {
		expect(guessUpdateBalanceClassification(account('savings'), 10)).toBe('interest-income');
	});

	it('classifies savings shortfall as transfer-fee', () => {
		expect(guessUpdateBalanceClassification(account('savings'), -10)).toBe('transfer-fee');
	});

	it('classifies credit balance increase vs projection as interest-charge', () => {
		expect(guessUpdateBalanceClassification(account('credit'), -5)).toBe('interest-charge');
	});

	it('classifies loan balance increase vs projection as interest-charge', () => {
		expect(guessUpdateBalanceClassification(account('loan'), -5)).toBe('interest-charge');
	});

	it('returns unclassified for checking even with rate profile and large diff', () => {
		expect(guessUpdateBalanceClassification(account('checking'), 100)).toBe('unclassified');
	});
});
