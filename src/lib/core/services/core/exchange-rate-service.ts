/**
 * Exchange Rate Service
 * Manages currency conversion rates with API integration and caching
 */

import { db, generateUUID, type ExchangeRate } from '$lib/core/db';
import { userService } from './user-service';

interface ExchangeRateAPIResponse {
	rates: Record<string, number>;
	base: string;
	date: string;
}

class ExchangeRateService {
	private readonly API_BASE_URL = 'https://api.exchangerate-api.com/v4/latest';
	private readonly CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
	private updateInterval: ReturnType<typeof setInterval> | null = null;
	private isUpdating = false;

	/**
	 * Get exchange rate between two currencies
	 * Returns the rate to convert from fromCurrency to toCurrency
	 * (1 fromCurrency = rate toCurrency)
	 */
	async getExchangeRate(
		fromCurrency: string,
		toCurrency: string,
		date?: Date
	): Promise<number | null> {
		// Same currency, rate is 1
		if (fromCurrency === toCurrency) {
			return 1;
		}

		// Normalize currencies
		const from = fromCurrency.toUpperCase();
		const to = toCurrency.toUpperCase();

		// Use today's date if not specified
		const targetDate = date || new Date();
		const dateString = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD

		// Try to get cached rate first
		const cachedRate = await this.getCachedRate(from, to, dateString);
		if (cachedRate !== null) {
			return cachedRate;
		}

		// If no cached rate and it's today, try to fetch
		if (this.isToday(targetDate)) {
			await this.updateRatesForCurrency(from);
			// Try again after update
			const updatedRate = await this.getCachedRate(from, to, dateString);
			if (updatedRate !== null) {
				return updatedRate;
			}
		}

		// Try reverse rate (if we have to->from, we can calculate from->to)
		const reverseRate = await this.getCachedRate(to, from, dateString);
		if (reverseRate !== null) {
			return 1 / reverseRate;
		}

		// If still no rate, try to fetch base currency rates
		// Most APIs provide rates relative to a base currency (usually USD)
		const baseCurrency = await this.getBaseCurrency();
		if (from === baseCurrency) {
			// We have base->to, which is what we need
			const rate = await this.getCachedRate(baseCurrency, to, dateString);
			if (rate !== null) return rate;
		} else if (to === baseCurrency) {
			// We have from->base, need to invert
			const rate = await this.getCachedRate(from, baseCurrency, dateString);
			if (rate !== null) return 1 / rate;
		} else {
			// Neither is base, need to convert through base
			// from->base->to = (from->base) * (base->to)
			const fromToBase = await this.getCachedRate(from, baseCurrency, dateString);
			const baseToTo = await this.getCachedRate(baseCurrency, to, dateString);
			if (fromToBase !== null && baseToTo !== null) {
				return fromToBase * baseToTo;
			}
		}

		// Last resort: fetch if it's today
		if (this.isToday(targetDate)) {
			await this.updateRatesForCurrency(baseCurrency);
			// Try the conversion through base again
			const fromToBase = await this.getCachedRate(from, baseCurrency, dateString);
			const baseToTo = await this.getCachedRate(baseCurrency, to, dateString);
			if (fromToBase !== null && baseToTo !== null) {
				return fromToBase * baseToTo;
			}
		}

		return null; // No rate available
	}

	/**
	 * Convert amount from one currency to another
	 */
	async convertAmount(
		amount: number,
		fromCurrency: string,
		toCurrency: string,
		date?: Date
	): Promise<number | null> {
		const rate = await this.getExchangeRate(fromCurrency, toCurrency, date);
		if (rate === null) {
			return null;
		}
		return amount * rate;
	}

	/**
	 * Get cached exchange rate from database
	 */
	private async getCachedRate(
		fromCurrency: string,
		toCurrency: string,
		dateString: string
	): Promise<number | null> {
		// Convert date string to ISO datetime for query (match storage format)
		const queryDate = new Date(dateString + 'T00:00:00.000Z').toISOString();
		const rate = await db.exchangeRates
			.where('[fromCurrency+toCurrency+date]')
			.equals([fromCurrency, toCurrency, queryDate])
			.filter(rate => !rate.deletedAt)
			.first();

		if (!rate) {
			return null;
		}

		// Check if rate is still fresh (within cache duration)
		const rateDate = new Date(rate.date);
		const now = new Date();
		const age = now.getTime() - rateDate.getTime();

		if (age > this.CACHE_DURATION_MS) {
			// Rate is stale, but return it anyway if it's not today
			// For historical dates, stale is fine
			if (this.isToday(rateDate)) {
				return null; // Stale rate for today, need to refresh
			}
		}

		return rate.rate;
	}

	/**
	 * Update exchange rates for a base currency from API
	 */
	async updateRatesForCurrency(baseCurrency: string = 'USD'): Promise<void> {
		if (this.isUpdating) {
			return; // Already updating, skip
		}

		this.isUpdating = true;
		try {
			const url = `${this.API_BASE_URL}/${baseCurrency}`;
			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`Failed to fetch exchange rates: ${response.statusText}`);
			}

			const data: ExchangeRateAPIResponse = await response.json();

			// Store all rates relative to base currency
			const today = new Date().toISOString().split('T')[0];
			const dateTime = new Date().toISOString();

			// Use a transaction to store all rates atomically
			await db.transaction('rw', [db.exchangeRates], async () => {
				for (const [targetCurrency, rate] of Object.entries(data.rates)) {
					// Skip if same as base (rate would be 1)
					if (targetCurrency === baseCurrency) {
						continue;
					}

					// Check if rate already exists for today
					const queryDate = new Date(today + 'T00:00:00.000Z').toISOString();
					const existing = await db.exchangeRates
						.where('[fromCurrency+toCurrency+date]')
						.equals([baseCurrency, targetCurrency, queryDate])
						.filter(rate => !rate.deletedAt)
						.first();

					if (existing) {
						// Update existing rate
						await db.exchangeRates.update(existing.id, {
							rate,
							lastFetched: dateTime,
							updatedAt: dateTime
						});
					} else {
						// Create new rate
						// Store date as ISO datetime for consistency with schema
						const rateDate = new Date(today + 'T00:00:00.000Z').toISOString();
						await db.exchangeRates.add({
							id: generateUUID(),
							fromCurrency: baseCurrency,
							toCurrency: targetCurrency,
							rate,
							date: rateDate,
							source: 'exchangerate-api',
							lastFetched: dateTime,
							notes: `Auto-fetched from ExchangeRate-API`,
							createdAt: dateTime,
							updatedAt: dateTime,
							deletedAt: null
						});
					}
				}
			});

			console.log(`Updated exchange rates for base currency: ${baseCurrency}`);
		} catch (error) {
			console.error('Failed to update exchange rates:', error);
			throw error;
		} finally {
			this.isUpdating = false;
		}
	}

	/**
	 * Update exchange rates for all currencies used in the app
	 */
	async updateAllRates(): Promise<void> {
		// Get all unique currencies from accounts
		const accounts = await db.getActiveAccounts();
		const currencies = new Set<string>();

		// Add all account currencies
		accounts.forEach(account => {
			currencies.add(account.currency);
		});

		// Add user's main currency
		const preferences = await userService.getUserPreferences();
		if (preferences?.currency) {
			currencies.add(preferences.currency);
		}

		// Update rates for USD (most APIs use USD as base)
		// This will give us rates for all currencies relative to USD
		await this.updateRatesForCurrency('USD');
	}

	/**
	 * Get base currency (defaults to USD, but can use user's main currency)
	 */
	private async getBaseCurrency(): Promise<string> {
		const preferences = await userService.getUserPreferences();
		return preferences?.currency || 'USD';
	}

	/**
	 * Check if date is today
	 */
	private isToday(date: Date): boolean {
		const today = new Date();
		return (
			date.getFullYear() === today.getFullYear() &&
			date.getMonth() === today.getMonth() &&
			date.getDate() === today.getDate()
		);
	}

	/**
	 * Start automatic rate updates (daily)
	 */
	startAutoUpdates(): void {
		if (this.updateInterval) {
			return; // Already started
		}

		// Update immediately
		this.updateAllRates().catch(err => {
			console.error('Initial rate update failed:', err);
		});

		// Then update daily (every 24 hours)
		this.updateInterval = setInterval(() => {
			this.updateAllRates().catch(err => {
				console.error('Scheduled rate update failed:', err);
			});
		}, this.CACHE_DURATION_MS);
	}

	/**
	 * Stop automatic rate updates
	 */
	stopAutoUpdates(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	/**
	 * Get all exchange rates for a specific date
	 */
	async getRatesForDate(date: Date): Promise<ExchangeRate[]> {
		const dateString = date.toISOString().split('T')[0];
		const rateDate = new Date(dateString + 'T00:00:00.000Z').toISOString();
		return await db.exchangeRates
			.where('date')
			.equals(rateDate)
			.filter(rate => !rate.deletedAt)
			.toArray();
	}

	/**
	 * Get exchange rate history for a currency pair
	 */
	async getRateHistory(
		fromCurrency: string,
		toCurrency: string,
		days: number = 30
	): Promise<ExchangeRate[]> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - days);

		return await db.exchangeRates
			.where('[fromCurrency+toCurrency]')
			.equals([fromCurrency.toUpperCase(), toCurrency.toUpperCase()])
			.filter(rate => {
				if (rate.deletedAt) return false;
				const rateDate = new Date(rate.date);
				return rateDate >= cutoffDate;
			})
			.sortBy('date');
	}

	/**
	 * Manually set an exchange rate (for user overrides or manual entry)
	 */
	async setExchangeRate(
		fromCurrency: string,
		toCurrency: string,
		rate: number,
		date?: Date
	): Promise<ExchangeRate> {
		const targetDate = date || new Date();
		const dateString = targetDate.toISOString().split('T')[0];
		const rateDate = new Date(dateString + 'T00:00:00.000Z').toISOString();
		const dateTime = new Date().toISOString();

		// Check if rate already exists
		const existing = await db.exchangeRates
			.where('[fromCurrency+toCurrency+date]')
			.equals([fromCurrency.toUpperCase(), toCurrency.toUpperCase(), rateDate])
			.filter(rate => !rate.deletedAt)
			.first();

		if (existing) {
			// Update existing
			const updated = {
				...existing,
				rate,
				source: 'manual',
				updatedAt: dateTime
			};
			await db.exchangeRates.update(existing.id, updated);
			return updated;
		} else {
			// Create new
			const newRate: ExchangeRate = {
				id: generateUUID(),
				fromCurrency: fromCurrency.toUpperCase(),
				toCurrency: toCurrency.toUpperCase(),
				rate,
				date: rateDate,
				source: 'manual',
				notes: 'Manually set by user',
				createdAt: dateTime,
				updatedAt: dateTime,
				deletedAt: null
			};
			await db.exchangeRates.add(newRate);
			return newRate;
		}
	}

	/**
	 * Delete old exchange rates (cleanup)
	 */
	async cleanupOldRates(daysToKeep: number = 90): Promise<number> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

		const oldRates = await db.exchangeRates
			.filter(rate => {
				if (rate.deletedAt) return false;
				const rateDate = new Date(rate.date);
				return rateDate < cutoffDate;
			})
			.toArray();

		// Soft delete old rates
		const now = new Date().toISOString();
		for (const rate of oldRates) {
			await db.exchangeRates.update(rate.id, {
				deletedAt: now,
				updatedAt: now
			});
		}

		return oldRates.length;
	}
}

export const exchangeRateService = new ExchangeRateService();

