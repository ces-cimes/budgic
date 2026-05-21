/**
 * Create Budgic currencies during MM pre-import review when a detected code is missing.
 */

import { db, generateUUID, type Currency } from '$lib/core/db';
import { getSystemCurrencyDefaults } from '$lib/core/currency-defaults';
import { currencyConfigService } from '../core/currency-config-service';
import { exchangeRateService } from '../core/exchange-rate-service';
import { userService } from '../core/user-service';
import { parseTimestamp, isDeleted } from './money-manager-mapper';
import type { CSVFile } from './types';

export const MM_CURRENCY_CREATE_PREFIX = '__budgic_create__:';

export function mmCurrencyCreateSelectionKey(code: string): string {
	return `${MM_CURRENCY_CREATE_PREFIX}${code.toUpperCase()}`;
}

export function isMmCurrencyCreateSelection(value: string | undefined): boolean {
	return !!value && value.startsWith(MM_CURRENCY_CREATE_PREFIX);
}

export function codeFromMmCurrencyCreateSelection(value: string): string {
	return value.slice(MM_CURRENCY_CREATE_PREFIX.length);
}

function mmCurrencyRowForUid(currencyFile: CSVFile | undefined, mmUid: string) {
	if (!currencyFile) return undefined;
	return currencyFile.rows.find((row) => {
		if (isDeleted(row.IS_DEL)) return false;
		const uid = row.uid || row.ID;
		return uid === mmUid;
	});
}

function rateFromMmCurrencyUid(mmUid: string, targetCode: string): number | null {
	const parts = mmUid.split('_').filter(Boolean);
	if (parts.length < 2) return null;
	const base = parts[0]?.toUpperCase();
	const target = parts[1]?.toUpperCase();
	if (target !== targetCode.toUpperCase() || base === target) return null;
	return null;
}

/**
 * Insert an active Budgic currency from MM review context and seed FX vs main currency.
 */
export async function createBudgicCurrencyFromMmReview(params: {
	mmUid: string;
	suggestedCode: string;
	csvFiles: Map<string, CSVFile>;
}): Promise<Currency> {
	const code = params.suggestedCode.trim().toUpperCase();
	const existing = await db.getCurrencyByCode(code);
	if (existing) return existing;

	const currencyFile = params.csvFiles.get('CURRENCY');
	const row = mmCurrencyRowForUid(currencyFile, params.mmUid);
	getSystemCurrencyDefaults(code);

	const currency: Currency = {
		id: generateUUID(),
		code,
		name: row?.NAME?.trim() || code,
		symbol: row?.SYMBOL?.trim() || code,
		placement: row?.SYMBOL_POSITION === 'S' ? 'after' : 'before',
		decimalPlaces: row?.DECIMAL_POINT ? parseInt(row.DECIMAL_POINT, 10) : 2,
		isSystem: false,
		isActive: row?.IS_SHOW !== '0',
		createdAt: row?.MODIFY_DATE ? parseTimestamp(row.MODIFY_DATE) : new Date().toISOString(),
		updatedAt: row?.MODIFY_DATE ? parseTimestamp(row.MODIFY_DATE) : new Date().toISOString(),
		deletedAt: null
	};

	await db.currencies.add(currency);
	await currencyConfigService.getCurrencyConfig(code);

	const prefs = await userService.getUserPreferences();
	const mainCurrency = (prefs?.currency ?? 'USD').toUpperCase();
	const today = new Date();

	const rowRateRaw = row?.EXCHANGE_RATE ?? row?.RATE ?? row?.CUR_RATE;
	let seededRate: number | null = null;
	if (rowRateRaw != null && rowRateRaw !== '' && rowRateRaw !== 'null') {
		const parsed = parseFloat(String(rowRateRaw));
		if (!Number.isNaN(parsed) && parsed > 0) seededRate = parsed;
	}
	if (seededRate == null) {
		seededRate = rateFromMmCurrencyUid(params.mmUid, code);
	}

	if (mainCurrency !== code) {
		if (seededRate != null) {
			await exchangeRateService.setExchangeRate(mainCurrency, code, seededRate, today);
		} else {
			try {
				await exchangeRateService.updateRatesForCurrency(mainCurrency, {
					onlyCurrencies: new Set([code])
				});
			} catch {
				await exchangeRateService.setExchangeRate(mainCurrency, code, 1, today);
			}
		}
	}

	return currency;
}
