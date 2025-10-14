import { db, generateUUID } from '$lib/core/db';
import type { Currency, CurrencyInfo } from '$lib/core/db';
import { validationService } from './validation-service';
import { validateAmount, formatAmount, getCurrencyInfo, isValidCurrencyCode } from '$lib/utils/currency-utils';

class CurrencyService {
	public get ready() {
		return db.isOpen();
	}

	public isLoading() {
		return !this.ready;
	}

	/**
	 * Get all active currencies
	 */
	async getActiveCurrencies(): Promise<Currency[]> {
		return await db.getActiveCurrencies();
	}

	/**
	 * Get currency by code
	 */
	async getCurrencyByCode(code: string): Promise<Currency | null> {
		return await db.getCurrencyByCode(code);
	}

	/**
	 * Get system currencies
	 */
	async getSystemCurrencies(): Promise<Currency[]> {
		return await db.getSystemCurrencies();
	}

	/**
	 * Create a custom currency
	 */
	async createCustomCurrency(currencyData: {
		code: string;
		name: string;
		symbol: string;
		placement?: 'before' | 'after';
		decimalPlaces?: number;
	}): Promise<Currency> {
		// Validate currency data before creation
		const validation = await validationService.validateCurrencyCreation(currencyData);
		if (!validation.isValid) {
			throw new Error(`Invalid currency data: ${validation.errors.join(', ')}`);
		}

		const currency: Currency = {
			id: generateUUID(),
			code: currencyData.code.toUpperCase(),
			name: currencyData.name,
			symbol: currencyData.symbol,
			placement: currencyData.placement ?? 'before',
			decimalPlaces: currencyData.decimalPlaces ?? 2,
			isSystem: false,
			isActive: true,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};

		await db.currencies.add(currency);
		return currency;
	}

	/**
	 * Update currency
	 */
	async updateCurrency(id: string, updates: Partial<Currency>): Promise<void> {
		const currency = await db.currencies.get(id);
		if (!currency) {
			throw new Error('Currency not found');
		}

		// Validate currency data before update
		const validation = await validationService.validateCurrencyUpdate(id, updates);
		if (!validation.isValid) {
			throw new Error(`Invalid currency data: ${validation.errors.join(', ')}`);
		}

		await db.currencies.update(id, {
			...updates,
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Delete currency (soft delete)
	 */
	async deleteCurrency(id: string): Promise<void> {
		const currency = await db.currencies.get(id);
		if (!currency) {
			throw new Error('Currency not found');
		}

		// Validate currency deletion
		const validation = await validationService.validateCurrencyDeletion(id);
		if (!validation.isValid) {
			throw new Error(`Cannot delete currency: ${validation.errors.join(', ')}`);
		}

		await db.currencies.update(id, {
			deletedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Validate amount for a specific currency
	 */
	validateAmount(amount: number | undefined | null, currencyCode: string): { isValid: boolean; error?: string } {
		return validateAmount(amount, currencyCode);
	}

	/**
	 * Format amount according to currency rules
	 */
	formatAmount(amount: number | undefined | null, currencyCode: string): string {
		return formatAmount(amount, currencyCode);
	}

	/**
	 * Get currency information
	 */
	getCurrencyInfo(code: string): CurrencyInfo | null {
		return getCurrencyInfo(code);
	}

	/**
	 * Get all available currency codes
	 */
	async getAvailableCurrencyCodes(): Promise<string[]> {
		const currencies = await this.getActiveCurrencies();
		return currencies.map(c => c.code);
	}

	/**
	 * Check if currency code is valid and available
	 */
	async isCurrencyCodeValid(code: string): Promise<{ isValid: boolean; error?: string }> {
		if (!isValidCurrencyCode(code)) {
			return { isValid: false, error: 'Invalid currency code format' };
		}

		const currency = await this.getCurrencyByCode(code);
		if (!currency) {
			return { isValid: false, error: 'Currency not found' };
		}

		if (!currency.isActive) {
			return { isValid: false, error: 'Currency is inactive' };
		}

		return { isValid: true };
	}

	/**
	 * Get currency display information
	 */
	async getCurrencyDisplayInfo(code: string): Promise<{
		symbol: string;
		placement: 'before' | 'after';
		decimalPlaces: number;
		formattedExample: string;
	} | null> {
		const currency = await this.getCurrencyByCode(code);
		if (!currency) return null;

		const exampleAmount = 1234.56;
		const formattedExample = this.formatAmount(exampleAmount, code);

		return {
			symbol: currency.symbol,
			placement: currency.placement,
			decimalPlaces: currency.decimalPlaces,
			formattedExample
		};
	}
}

export const currencyService = new CurrencyService(); 