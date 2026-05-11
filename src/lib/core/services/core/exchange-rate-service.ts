/**
 * Exchange Rate Service
 * Manages currency conversion rates with API integration and caching
 */

import { db, generateUUID, type ExchangeRate } from '$lib/core/db';
import { userService } from './user-service';
import { scheduler } from '$lib/utils/scheduler';
import { devLog } from '$lib/utils/dev-log';

const EXCHANGE_RATE_TASK = 'exchange-rate:auto-update';

/** Result of best-effort conversion (budget rows show ~ when not exact). */
export type FxConversionQuality = 'ok' | 'stale' | 'raw';

interface ExchangeRateAPIResponse {
	rates: Record<string, number>;
	base: string;
	date: string;
}

class ExchangeRateService {
	private readonly API_BASE_URL = 'https://api.exchangerate-api.com/v4/latest';
	/** Use same-origin API proxy in browser to avoid CORS blocking the external API */
	private readonly API_PROXY_PATH = '/api/exchange-rates';
	private readonly CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
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
		const todayString = new Date().toISOString().split('T')[0];

		// Try to get cached rate for the transaction date first
		let cachedRate = await this.getCachedRate(from, to, dateString);
		if (cachedRate !== null) {
			return cachedRate;
		}

		// If transaction date is not today and we don't have that date's rate,
		// try using today's rate as a fallback (better than nothing for historical transactions)
		if (dateString !== todayString) {
			cachedRate = await this.getCachedRate(from, to, todayString);
			if (cachedRate !== null) {
				return cachedRate;
			}
		}

		// If no cached rate and it's today, try to fetch (only for the pair we need)
		if (this.isToday(targetDate)) {
			const only = new Set(await this.getAppCurrencies());
			only.add(to);
			await this.updateRatesForCurrency(from, { onlyCurrencies: only });
			// Try again after update
			const updatedRate = await this.getCachedRate(from, to, dateString);
			if (updatedRate !== null) {
				return updatedRate;
			}
		}

		// Try reverse rate for transaction date (if we have to->from, we can calculate from->to)
		let reverseRate = await this.getCachedRate(to, from, dateString);
		if (reverseRate !== null) {
			return 1 / reverseRate;
		}

		// Try reverse rate for today as fallback
		if (dateString !== todayString) {
			reverseRate = await this.getCachedRate(to, from, todayString);
			if (reverseRate !== null) {
				return 1 / reverseRate;
			}
		}

		// If still no rate, try to fetch base currency rates
		// Most APIs provide rates relative to a base currency (usually USD)
		const baseCurrency = await this.getBaseCurrency();
		if (from === baseCurrency) {
			// We have base->to, which is what we need
			let rate = await this.getCachedRate(baseCurrency, to, dateString);
			if (rate === null && dateString !== todayString) {
				rate = await this.getCachedRate(baseCurrency, to, todayString);
			}
			if (rate !== null) return rate;
		} else if (to === baseCurrency) {
			// We need from->base. Try direct (from->base) first, then inverted (base->from)
			let rate = await this.getCachedRate(from, baseCurrency, dateString);
			if (rate === null && dateString !== todayString) {
				rate = await this.getCachedRate(from, baseCurrency, todayString);
			}
			if (rate !== null) return rate; // 1 from = rate base
			let baseToFrom = await this.getCachedRate(baseCurrency, from, dateString);
			if (baseToFrom === null && dateString !== todayString) {
				baseToFrom = await this.getCachedRate(baseCurrency, from, todayString);
			}
			if (baseToFrom !== null) return 1 / baseToFrom; // from->base = 1/(base->from), e.g. RUB->USD = 1/(USD->RUB)
		} else {
			// Neither is base, need to convert through base
			// from->base->to = (from->base) * (base->to)
			let fromToBase = await this.getCachedRate(from, baseCurrency, dateString);
			let baseToTo = await this.getCachedRate(baseCurrency, to, dateString);
			// Try today's rates as fallback if transaction date rates not found
			if (fromToBase === null && dateString !== todayString) {
				fromToBase = await this.getCachedRate(from, baseCurrency, todayString);
			}
			if (baseToTo === null && dateString !== todayString) {
				baseToTo = await this.getCachedRate(baseCurrency, to, todayString);
			}
			if (fromToBase !== null && baseToTo !== null) {
				return fromToBase * baseToTo;
			}
		}

		// Last resort: fetch if it's today (only for the pair we need)
		if (this.isToday(targetDate)) {
			const only = new Set(await this.getAppCurrencies());
			only.add(from);
			only.add(to);
			await this.updateRatesForCurrency(baseCurrency, { onlyCurrencies: only });
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
	 * Convert with quality: exact rate first, then any stored pair (stale), then raw amount.
	 */
	async convertAmountWithQuality(
		amount: number,
		fromCurrency: string,
		toCurrency: string,
		date?: Date
	): Promise<{ value: number; quality: FxConversionQuality }> {
		const from = (fromCurrency || 'USD').toUpperCase();
		const to = (toCurrency || 'USD').toUpperCase();
		if (from === to) {
			return { value: amount, quality: 'ok' };
		}
		const direct = await this.convertAmount(amount, from, to, date);
		if (direct !== null) {
			return { value: direct, quality: 'ok' };
		}
		const staleRate = await this.getLatestStoredRate(from, to);
		if (staleRate !== null) {
			return { value: amount * staleRate, quality: 'stale' };
		}
		return { value: amount, quality: 'raw' };
	}

	/** Most recent non-deleted rate for the pair (any date), or inverted reverse pair. */
	private async getLatestStoredRate(
		fromCurrency: string,
		toCurrency: string
	): Promise<number | null> {
		const from = fromCurrency.toUpperCase();
		const to = toCurrency.toUpperCase();
		const forward = await db.exchangeRates
			.where('[fromCurrency+toCurrency]')
			.equals([from, to])
			.filter((r) => !r.deletedAt)
			.toArray();
		if (forward.length > 0) {
			forward.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
			return forward[0].rate;
		}
		const rev = await db.exchangeRates
			.where('[fromCurrency+toCurrency]')
			.equals([to, from])
			.filter((r) => !r.deletedAt)
			.toArray();
		if (rev.length > 0) {
			rev.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
			return 1 / rev[0].rate;
		}
		return null;
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
			.filter((rate) => !rate.deletedAt)
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
	 * Update exchange rates for a base currency from API.
	 * @param baseCurrency - Base currency (e.g. user's main currency). We store base->X for each X.
	 * @param options.onlyCurrencies - If set, only store rates for these target currencies (currencies that exist in the app). Avoids storing 150+ unused pairs.
	 */
	async updateRatesForCurrency(
		baseCurrency: string = 'USD',
		options?: { onlyCurrencies?: Set<string> }
	): Promise<void> {
		if (this.isUpdating) {
			return; // Already updating, skip
		}

		this.isUpdating = true;
		try {
			// In browser, use our API proxy to avoid CORS; in Node (e.g. SSR) use external API
			const url =
				typeof window !== 'undefined'
					? `${this.API_PROXY_PATH}/${baseCurrency}`
					: `${this.API_BASE_URL}/${baseCurrency}`;
			const response = await fetch(url);

			if (!response.ok) {
				const errText = await response.text();
				throw new Error(
					`Failed to fetch exchange rates: ${response.status} ${response.statusText}${errText ? ` ${errText.slice(0, 200)}` : ''}`
				);
			}

			const data: ExchangeRateAPIResponse = await response.json();

			// Use API's date when available to match rate validity; fallback to local UTC date
			const today =
				data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date)
					? data.date
					: new Date().toISOString().split('T')[0];
			const dateTime = new Date().toISOString();
			const onlyCurrencies = options?.onlyCurrencies;

			// Use a transaction to store all rates atomically
			await db.transaction('rw', [db.exchangeRates], async () => {
				for (const [targetCurrency, rate] of Object.entries(data.rates)) {
					// Skip if same as base (rate would be 1)
					if (targetCurrency === baseCurrency) {
						continue;
					}
					// Only store rates for currencies that exist in the app (accounts, etc.)
					if (onlyCurrencies && !onlyCurrencies.has(targetCurrency)) {
						continue;
					}

					// Check if rate already exists for today
					const queryDate = new Date(today + 'T00:00:00.000Z').toISOString();
					const existing = await db.exchangeRates
						.where('[fromCurrency+toCurrency+date]')
						.equals([baseCurrency, targetCurrency, queryDate])
						.filter((rate) => !rate.deletedAt)
						.first();

					if (existing) {
						// Skip updating if the rate is manually set by user
						// Manual rates should not be overwritten by API updates
						if (existing.source === 'manual') {
							continue;
						}

						// Update existing rate (only API-sourced rates)
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

			devLog(`Updated exchange rates for base currency: ${baseCurrency}`);
		} catch (error) {
			console.error('Failed to update exchange rates:', error);
			throw error;
		} finally {
			this.isUpdating = false;
		}
	}

	/**
	 * Update exchange rates for currencies used in the app.
	 * Fetches base=mainCurrency and only stores base->X for each X that appears in accounts or transactions.
	 * This keeps the DB small and limits to rates needed for conversion to main currency.
	 */
	async updateAllRates(): Promise<void> {
		const [accounts, transactions] = await Promise.all([
			db.getActiveAccounts(),
			db.transactions.filter((t) => !t.deletedAt).toArray()
		]);
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';

		// Collect currencies from accounts
		const onlyCurrencies = new Set<string>();
		accounts.forEach((account) => {
			if (account.currency && account.currency !== mainCurrency) {
				onlyCurrencies.add(account.currency);
			}
		});

		// Also collect currencies from transactions (in case transactions use currencies not in accounts)
		transactions.forEach((tx) => {
			if (tx.currency && tx.currency !== mainCurrency) {
				onlyCurrencies.add(tx.currency);
			} else if (tx.accountId) {
				// If transaction doesn't have currency, get it from account
				const account = accounts.find((a) => a.id === tx.accountId);
				if (account?.currency && account.currency !== mainCurrency) {
					onlyCurrencies.add(account.currency);
				}
			}
		});

		// If no other currencies found, still fetch (will store all, but better than nothing)
		// This handles the case where user hasn't created accounts yet but has transactions
		await this.updateRatesForCurrency(
			mainCurrency,
			onlyCurrencies.size > 0 ? { onlyCurrencies } : undefined
		);
	}

	/**
	 * Get base currency (defaults to USD, but can use user's main currency)
	 */
	private async getBaseCurrency(): Promise<string> {
		const preferences = await userService.getUserPreferences();
		return preferences?.currency || 'USD';
	}

	/** Currencies that exist in the app (accounts + main), used to limit which rates we fetch and store. */
	private async getAppCurrencies(): Promise<Set<string>> {
		const accounts = await db.getActiveAccounts();
		const main = await this.getBaseCurrency();
		const set = new Set<string>([main]);
		accounts.forEach((a) => {
			if (a.currency) set.add(a.currency);
		});
		return set;
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
		scheduler.schedule(
			EXCHANGE_RATE_TASK,
			() => this.updateAllRates().catch((err) => console.error('Rate update failed:', err)),
			this.CACHE_DURATION_MS
		);
	}

	/**
	 * Stop automatic rate updates
	 */
	stopAutoUpdates(): void {
		scheduler.cancel(EXCHANGE_RATE_TASK);
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
			.filter((rate) => !rate.deletedAt)
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
			.filter((rate) => {
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
		return this.setExchangeRateInternal(
			fromCurrency,
			toCurrency,
			rate,
			date,
			'manual',
			'Manually set by user'
		);
	}

	/**
	 * Internal method to set exchange rate with custom source
	 * Used by both manual entry and automatic conversions
	 */
	private async setExchangeRateInternal(
		fromCurrency: string,
		toCurrency: string,
		rate: number,
		date: Date | undefined,
		source: 'manual' | 'exchangerate-api' | 'calculated',
		notes?: string
	): Promise<ExchangeRate> {
		const targetDate = date || new Date();
		const dateString = targetDate.toISOString().split('T')[0];
		const rateDate = new Date(dateString + 'T00:00:00.000Z').toISOString();
		const dateTime = new Date().toISOString();

		// Check if rate already exists
		const existing = await db.exchangeRates
			.where('[fromCurrency+toCurrency+date]')
			.equals([fromCurrency.toUpperCase(), toCurrency.toUpperCase(), rateDate])
			.filter((rate) => !rate.deletedAt)
			.first();

		if (existing) {
			// Preserve source if it's manual, otherwise use the provided source
			const shouldPreserveManual = existing.source === 'manual';
			const updated = {
				...existing,
				rate,
				source: shouldPreserveManual ? 'manual' : source,
				notes: shouldPreserveManual ? existing.notes : notes || existing.notes,
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
				source,
				notes: notes || `Auto-calculated from ${source}`,
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
			.filter((rate) => {
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

	/**
	 * Check if an exchange rate is outdated (older than specified days)
	 */
	isRateOutdated(rate: ExchangeRate, maxAgeDays: number = 1): boolean {
		const rateDate = new Date(rate.date);
		const today = new Date();
		const diffTime = today.getTime() - rateDate.getTime();
		const diffDays = diffTime / (1000 * 60 * 60 * 24);
		return diffDays > maxAgeDays;
	}

	/**
	 * Reset a manual exchange rate back to API value
	 * Fetches the latest rate from API and marks it as API-sourced
	 */
	async resetRateToAPI(fromCurrency: string, toCurrency: string): Promise<ExchangeRate> {
		// Fetch the rate from API for this specific currency pair
		const onlyCurrencies = new Set<string>([toCurrency]);
		await this.updateRatesForCurrency(fromCurrency, { onlyCurrencies });

		// After fetching, update the source field to 'exchangerate-api' to mark it as API-sourced
		// This is necessary because updateRatesForCurrency doesn't change the source field when updating existing rates
		const today = new Date();
		const dateString = today.toISOString().split('T')[0];
		const rateDate = new Date(dateString + 'T00:00:00.000Z').toISOString();

		const existing = await db.exchangeRates
			.where('[fromCurrency+toCurrency+date]')
			.equals([fromCurrency.toUpperCase(), toCurrency.toUpperCase(), rateDate])
			.filter((r) => !r.deletedAt)
			.first();

		if (!existing) {
			throw new Error(`Exchange rate ${fromCurrency} → ${toCurrency} not found after API update`);
		}

		// Update source to mark as API-sourced
		const updated = {
			...existing,
			source: 'exchangerate-api' as const,
			notes: 'Auto-fetched from ExchangeRate-API',
			updatedAt: new Date().toISOString()
		};

		await db.exchangeRates.update(existing.id, updated);
		return updated;
	}

	/**
	 * Convert exchange rates when main currency changes
	 * Re-bases all rates from oldMain to newMain
	 */
	async convertExchangeRates(oldMain: string, newMain: string): Promise<void> {
		if (oldMain === newMain) return;

		const today = new Date();
		const todayString = today.toISOString().split('T')[0];
		const rateDate = new Date(todayString + 'T00:00:00.000Z').toISOString();

		// Get all rates for today
		const allRates = await this.getRatesForDate(today);

		// Get conversion rate from old main to new main
		let oldToNewRate: number | null = null;
		const directRate = allRates.find((r) => r.fromCurrency === oldMain && r.toCurrency === newMain);
		if (directRate) {
			oldToNewRate = directRate.rate;
		} else {
			// Try reverse
			const reverseRate = allRates.find(
				(r) => r.fromCurrency === newMain && r.toCurrency === oldMain
			);
			if (reverseRate) {
				oldToNewRate = 1 / reverseRate.rate;
			} else {
				// Try to get via exchange rate service
				oldToNewRate = await this.getExchangeRate(oldMain, newMain, today);
			}
		}

		// Collect all currencies that need rates from new main
		const currenciesNeedingRates = new Set<string>();
		allRates.forEach((rate) => {
			if (rate.fromCurrency === oldMain && rate.toCurrency !== newMain) {
				currenciesNeedingRates.add(rate.toCurrency);
			}
			if (rate.toCurrency === oldMain && rate.fromCurrency !== newMain) {
				currenciesNeedingRates.add(rate.fromCurrency);
			}
		});

		// Convert rates: for each currency X that had oldMain->X, create newMain->X
		for (const currency of currenciesNeedingRates) {
			if (currency === newMain) continue;

			// Get old rate (oldMain -> currency)
			const oldRate = allRates.find((r) => r.fromCurrency === oldMain && r.toCurrency === currency);

			let newRateValue: number | null = null;

			if (oldRate && oldToNewRate !== null) {
				// Convert: newMain -> currency = (oldMain -> currency) / (oldMain -> newMain)
				newRateValue = oldRate.rate / oldToNewRate;
			} else {
				// Try reverse: currency -> oldMain
				const reverseOldRate = allRates.find(
					(r) => r.fromCurrency === currency && r.toCurrency === oldMain
				);
				if (reverseOldRate && oldToNewRate !== null) {
					// currency -> newMain = (currency -> oldMain) * (oldMain -> newMain)
					newRateValue = reverseOldRate.rate * oldToNewRate;
				}
			}

			if (newRateValue !== null && isFinite(newRateValue) && newRateValue > 0) {
				// Set the new rate (this will create or update), preserving source if manual
				await this.setExchangeRateInternal(
					newMain,
					currency,
					newRateValue,
					today,
					'calculated',
					`Calculated from currency change: ${oldMain} → ${newMain}`
				);
			}
		}

		// Also handle the reverse: if we had currency -> oldMain, we need currency -> newMain
		// This is already handled above, but we also need newMain -> oldMain for completeness
		if (oldToNewRate !== null && isFinite(oldToNewRate) && oldToNewRate > 0) {
			await this.setExchangeRateInternal(
				newMain,
				oldMain,
				oldToNewRate,
				today,
				'calculated',
				`Calculated from currency change: ${oldMain} → ${newMain}`
			);
		}
	}
}

export const exchangeRateService = new ExchangeRateService();
