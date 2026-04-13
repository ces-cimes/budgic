/**
 * System default currency configurations
 * These provide sensible defaults for each currency based on purchasing power parity
 * and local financial practices.
 */

import type { CurrencyConfiguration } from '$lib/core/db';
import { generateUUID } from '$lib/core/db';

/**
 * Get system default configuration for a currency
 */
export function getSystemCurrencyDefaults(
	currencyCode: string
): Omit<CurrencyConfiguration, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> | null {
	const defaults = SYSTEM_CURRENCY_DEFAULTS.get(currencyCode);
	if (!defaults) {
		return null;
	}

	return {
		...defaults,
		isCustom: false
	};
}

/**
 * Get all system default configurations
 */
export function getAllSystemCurrencyDefaults(): Array<
	Omit<CurrencyConfiguration, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
> {
	return Array.from(SYSTEM_CURRENCY_DEFAULTS.values()).map((row) => ({
		...row,
		isCustom: false
	}));
}

/**
 * System currency defaults map
 * Values are based on purchasing power parity and local financial practices
 */
const SYSTEM_CURRENCY_DEFAULTS = new Map<
	string,
	Omit<CurrencyConfiguration, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'isCustom'>
>([
	[
		'USD',
		{
			currencyCode: 'USD',
			defaultCheckingBuffer: 500,
			defaultSavingsBuffer: 1000,
			defaultMinimumBalance: 0,
			defaultOverdraftLimit: 0,
			defaultOverdraftFee: 0,
			maxAmountLimit: 1000000,
			defaultBudgetAllocation: undefined,
			notes: 'US Dollar defaults'
		}
	],
	[
		'EUR',
		{
			currencyCode: 'EUR',
			defaultCheckingBuffer: 450,
			defaultSavingsBuffer: 900,
			defaultMinimumBalance: 0,
			defaultOverdraftLimit: 0,
			defaultOverdraftFee: 0,
			maxAmountLimit: 1000000,
			defaultBudgetAllocation: undefined,
			notes: 'Euro defaults (approximate PPP adjustment)'
		}
	],
	[
		'GBP',
		{
			currencyCode: 'GBP',
			defaultCheckingBuffer: 400,
			defaultSavingsBuffer: 800,
			defaultMinimumBalance: 0,
			defaultOverdraftLimit: 0,
			defaultOverdraftFee: 0,
			maxAmountLimit: 1000000,
			defaultBudgetAllocation: undefined,
			notes: 'British Pound defaults (approximate PPP adjustment)'
		}
	],
	[
		'JPY',
		{
			currencyCode: 'JPY',
			defaultCheckingBuffer: 50000,
			defaultSavingsBuffer: 100000,
			defaultMinimumBalance: 0,
			defaultOverdraftLimit: 0,
			defaultOverdraftFee: 0,
			maxAmountLimit: 100000000, // 100M yen
			defaultBudgetAllocation: undefined,
			notes: 'Japanese Yen defaults (adjusted for currency value)'
		}
	],
	[
		'CAD',
		{
			currencyCode: 'CAD',
			defaultCheckingBuffer: 650,
			defaultSavingsBuffer: 1300,
			defaultMinimumBalance: 0,
			defaultOverdraftLimit: 0,
			defaultOverdraftFee: 0,
			maxAmountLimit: 1000000,
			defaultBudgetAllocation: undefined,
			notes: 'Canadian Dollar defaults (approximate PPP adjustment)'
		}
	],
	[
		'AUD',
		{
			currencyCode: 'AUD',
			defaultCheckingBuffer: 700,
			defaultSavingsBuffer: 1400,
			defaultMinimumBalance: 0,
			defaultOverdraftLimit: 0,
			defaultOverdraftFee: 0,
			maxAmountLimit: 1000000,
			defaultBudgetAllocation: undefined,
			notes: 'Australian Dollar defaults (approximate PPP adjustment)'
		}
	],
	[
		'CHF',
		{
			currencyCode: 'CHF',
			defaultCheckingBuffer: 450,
			defaultSavingsBuffer: 900,
			defaultMinimumBalance: 0,
			defaultOverdraftLimit: 0,
			defaultOverdraftFee: 0,
			maxAmountLimit: 1000000,
			defaultBudgetAllocation: undefined,
			notes: 'Swiss Franc defaults (approximate PPP adjustment)'
		}
	],
	[
		'CNY',
		{
			currencyCode: 'CNY',
			defaultCheckingBuffer: 3500,
			defaultSavingsBuffer: 7000,
			defaultMinimumBalance: 0,
			defaultOverdraftLimit: 0,
			defaultOverdraftFee: 0,
			maxAmountLimit: 10000000, // 10M yuan
			defaultBudgetAllocation: undefined,
			notes: 'Chinese Yuan defaults (adjusted for currency value)'
		}
	],
	[
		'RUB',
		{
			currencyCode: 'RUB',
			defaultCheckingBuffer: 35000,
			defaultSavingsBuffer: 70000,
			defaultMinimumBalance: 0,
			defaultOverdraftLimit: 0,
			defaultOverdraftFee: 0,
			maxAmountLimit: 10000000, // 10M rubles
			defaultBudgetAllocation: undefined,
			notes: 'Russian Ruble defaults (adjusted for currency value)'
		}
	],
	[
		'BTC',
		{
			currencyCode: 'BTC',
			defaultCheckingBuffer: 0.01, // 0.01 BTC
			defaultSavingsBuffer: 0.1, // 0.1 BTC
			defaultMinimumBalance: 0,
			defaultOverdraftLimit: 0,
			defaultOverdraftFee: 0,
			maxAmountLimit: 100, // 100 BTC
			defaultBudgetAllocation: undefined,
			notes: 'Bitcoin defaults (crypto-specific)'
		}
	],
	[
		'ETH',
		{
			currencyCode: 'ETH',
			defaultCheckingBuffer: 0.1, // 0.1 ETH
			defaultSavingsBuffer: 1, // 1 ETH
			defaultMinimumBalance: 0,
			defaultOverdraftLimit: 0,
			defaultOverdraftFee: 0,
			maxAmountLimit: 1000, // 1000 ETH
			defaultBudgetAllocation: undefined,
			notes: 'Ethereum defaults (crypto-specific)'
		}
	]
]);
