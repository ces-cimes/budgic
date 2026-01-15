/**
 * Currency Configuration Service
 * Manages currency-specific defaults and user customizations
 */

import { db, generateUUID, type CurrencyConfiguration } from '$lib/core/db';
import { getSystemCurrencyDefaults, getAllSystemCurrencyDefaults } from '$lib/core/currency-defaults';
import type { Account } from '$lib/core/db';

class CurrencyConfigService {
	/**
	 * Get configuration for a currency (with fallback to system defaults)
	 */
	async getCurrencyConfig(currencyCode: string): Promise<CurrencyConfiguration> {
		// First, try to get user's custom configuration
		const customConfig = await db.currencyConfigurations
			.where('currencyCode')
			.equals(currencyCode)
			.filter(config => !config.deletedAt)
			.first();

		if (customConfig) {
			return customConfig;
		}

		// Fallback to system defaults
		const systemDefaults = getSystemCurrencyDefaults(currencyCode);
		if (systemDefaults) {
			// Return system defaults as a CurrencyConfiguration object
			return {
				id: generateUUID(),
				...systemDefaults,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			};
		}

		// Last resort: return minimal defaults
		return {
			id: generateUUID(),
			currencyCode,
			defaultCheckingBuffer: 0,
			defaultSavingsBuffer: 0,
			defaultMinimumBalance: 0,
			defaultOverdraftLimit: 0,
			defaultOverdraftFee: 0,
			maxAmountLimit: 1000000,
			defaultBudgetAllocation: undefined,
			isCustom: false,
			notes: 'Fallback defaults',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};
	}

	/**
	 * Get default buffer for account type and currency
	 */
	async getDefaultBuffer(accountType: Account['type'], currencyCode: string): Promise<number> {
		const config = await this.getCurrencyConfig(currencyCode);

		switch (accountType) {
			case 'checking':
				return config.defaultCheckingBuffer ?? 0;
			case 'savings':
				return config.defaultSavingsBuffer ?? 0;
			default:
				return 0;
		}
	}

	/**
	 * Update currency configuration (user customization)
	 */
	async updateCurrencyConfig(
		currencyCode: string,
		updates: Partial<Omit<CurrencyConfiguration, 'id' | 'currencyCode' | 'createdAt' | 'updatedAt' | 'deletedAt'>>
	): Promise<CurrencyConfiguration> {
		// Check if configuration already exists
		const existing = await db.currencyConfigurations
			.where('currencyCode')
			.equals(currencyCode)
			.filter(config => !config.deletedAt)
			.first();

		if (existing) {
			// Update existing configuration
			const updated = {
				...existing,
				...updates,
				isCustom: true, // Mark as customized
				updatedAt: new Date().toISOString()
			};
			await db.currencyConfigurations.update(existing.id, updated);
			return updated;
		} else {
			// Create new custom configuration
			const systemDefaults = getSystemCurrencyDefaults(currencyCode);
			const newConfig: CurrencyConfiguration = {
				id: generateUUID(),
				currencyCode,
				...(systemDefaults || {}),
				...updates,
				isCustom: true,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			};
			await db.currencyConfigurations.add(newConfig);
			return newConfig;
		}
	}

	/**
	 * Reset to system defaults
	 */
	async resetToDefaults(currencyCode: string): Promise<CurrencyConfiguration> {
		// Delete custom configuration if it exists
		const existing = await db.currencyConfigurations
			.where('currencyCode')
			.equals(currencyCode)
			.filter(config => !config.deletedAt)
			.first();

		if (existing) {
			await db.currencyConfigurations.update(existing.id, {
				deletedAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			});
		}

		// Return system defaults
		return await this.getCurrencyConfig(currencyCode);
	}

	/**
	 * Get all currency configurations (custom + system defaults)
	 */
	async getAllConfigurations(): Promise<CurrencyConfiguration[]> {
		// Get all custom configurations
		const customConfigs = await db.currencyConfigurations
			.filter(config => !config.deletedAt)
			.toArray();

		// Get all system currencies
		const systemCurrencies = await db.getSystemCurrencies();
		const configs: CurrencyConfiguration[] = [];

		// For each system currency, get its configuration (custom or system default)
		for (const currency of systemCurrencies) {
			const config = await this.getCurrencyConfig(currency.code);
			configs.push(config);
		}

		return configs;
	}

	/**
	 * Initialize system defaults for all currencies
	 * This should be called during database initialization
	 */
	async initializeSystemDefaults(): Promise<void> {
		const systemDefaults = getAllSystemCurrencyDefaults();
		
		// Check which currencies already have configurations
		const existingConfigs = await db.currencyConfigurations
			.filter(config => !config.deletedAt)
			.toArray();
		
		const existingCurrencyCodes = new Set(existingConfigs.map(c => c.currencyCode));

		// Only add system defaults if they don't already exist
		for (const defaults of systemDefaults) {
			if (!existingCurrencyCodes.has(defaults.currencyCode)) {
				// Check if system default already exists (not deleted)
				const existing = await db.currencyConfigurations
					.where('currencyCode')
					.equals(defaults.currencyCode)
					.filter(config => !config.deletedAt && !config.isCustom)
					.first();

				if (!existing) {
					const config: CurrencyConfiguration = {
						id: generateUUID(),
						...defaults,
						isCustom: false,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						deletedAt: null
					};
					await db.currencyConfigurations.add(config);
				}
			}
		}
	}

	/**
	 * Get maximum amount limit for a currency
	 */
	async getMaxAmountLimit(currencyCode: string): Promise<number> {
		const config = await this.getCurrencyConfig(currencyCode);
		return config.maxAmountLimit ?? 1000000; // Default 1M if not specified
	}
}

export const currencyConfigService = new CurrencyConfigService();

