import { describe, expect, it } from 'vitest';
import {
	TRANSACTION_DATA_PRESET_TABLE_KEYS,
	FULL_DATABASE_RESET_TABLE_KEYS
} from './data-reset-presets';

describe('data-reset-presets table sets', () => {
	it('transaction preset keys are a subset of full reset keys', () => {
		const full = new Set(FULL_DATABASE_RESET_TABLE_KEYS);
		for (const key of TRANSACTION_DATA_PRESET_TABLE_KEYS) {
			expect(full.has(key)).toBe(true);
		}
	});

	it('full reset includes tables the transaction preset intentionally keeps', () => {
		const full = new Set(FULL_DATABASE_RESET_TABLE_KEYS);
		expect(full.has('accounts')).toBe(true);
		expect(full.has('categories')).toBe(true);
		expect(full.has('userPreferences')).toBe(true);
		expect(full.has('currencies')).toBe(true);
		expect(full.has('roundUpRules')).toBe(true);
		expect(full.has('exchangeRates')).toBe(true);
	});

	it('transaction preset does not clear structural or preference tables', () => {
		const tx = new Set<string>(TRANSACTION_DATA_PRESET_TABLE_KEYS);
		expect(tx.has('accounts')).toBe(false);
		expect(tx.has('categories')).toBe(false);
		expect(tx.has('userPreferences')).toBe(false);
		expect(tx.has('currencies')).toBe(false);
		expect(tx.has('roundUpRules')).toBe(false);
		expect(tx.has('goals')).toBe(false);
		expect(tx.has('userActions')).toBe(false);
		expect(tx.has('currencyConfigurations')).toBe(false);
		expect(tx.has('exchangeRates')).toBe(false);
	});

	it('full reset covers every BudgicDB store (update count when schema adds a table)', () => {
		expect(FULL_DATABASE_RESET_TABLE_KEYS.length).toBe(25);
	});

	it('transaction preset has no duplicate keys', () => {
		expect(new Set(TRANSACTION_DATA_PRESET_TABLE_KEYS).size).toBe(
			TRANSACTION_DATA_PRESET_TABLE_KEYS.length
		);
	});
});
