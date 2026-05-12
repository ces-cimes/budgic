/**
 * Dexie presets for clearing local data: transaction-only vs full schema wipe.
 * UI copy lives next to table lists so Danger zone stays accurate.
 */

import { db } from '$lib/core/db';
import { accountService } from '$lib/core/services/core/account-service';
import { balanceProjectionService } from '$lib/core/services/analytics/balance-projection-service';
import type { Table } from 'dexie';

/** Dexie store keys cleared by {@link clearTransactionDataPreset} (must match BudgicDB). */
export const TRANSACTION_DATA_PRESET_TABLE_KEYS = [
	'transactions',
	'reconciliationRecords',
	'reconciliationDiscrepancies',
	'dataCorrections',
	'insights',
	'learningPatterns',
	'merchantCategoryProfiles',
	'recurringPatternsCache',
	'negativeAllowanceEvents',
	'envelopeBorrowings',
	'rolloverAdjustments',
	'badges',
	'userFeedback',
	'optimizationPreferences',
	'tags',
	'autocompleteUsage'
] as const;

/** Dexie store keys cleared by {@link clearFullDatabaseReset} — full BudgicDB surface (v29). */
export const FULL_DATABASE_RESET_TABLE_KEYS = [
	'accounts',
	'currencies',
	'categories',
	'transactions',
	'goals',
	'userPreferences',
	'userActions',
	'autocompleteUsage',
	'tags',
	'insights',
	'currencyConfigurations',
	'exchangeRates',
	'badges',
	'reconciliationRecords',
	'reconciliationDiscrepancies',
	'learningPatterns',
	'userFeedback',
	'optimizationPreferences',
	'negativeAllowanceEvents',
	'envelopeBorrowings',
	'rolloverAdjustments',
	'roundUpRules',
	'merchantCategoryProfiles',
	'recurringPatternsCache',
	'dataCorrections'
] as const;

/** Short bullets for Danger zone — what “Clear transaction data” removes. */
export const TRANSACTION_DATA_PRESET_REMOVES_BULLETS: readonly string[] = [
	'All transactions',
	'Reconciliation records and discrepancies',
	'Import corrections log, insights, learning patterns',
	'Merchant category profiles and recurring-pattern cache',
	'Envelope borrowings, rollover adjustments, negative allowance events',
	'Badges, feedback, optimization preferences',
	'Tags and autocomplete usage'
];

/** Short bullets — what stays after “Clear transaction data”. */
export const TRANSACTION_DATA_PRESET_KEEPS_BULLETS: readonly string[] = [
	'Accounts, categories, goals, round-up rules',
	'User preferences and action history',
	'Currencies, exchange rates, currency configuration'
];

/** Short bullets for “Full reset”. */
export const FULL_DATABASE_RESET_REMOVES_BULLETS: readonly string[] = [
	'Every local table (full BudgicDB schema)',
	'Accounts, categories, transactions, goals, preferences',
	'Currencies, rates, reconciliation, automation, caches — everything'
];

type TransactionPresetKey = (typeof TRANSACTION_DATA_PRESET_TABLE_KEYS)[number];
type FullResetKey = (typeof FULL_DATABASE_RESET_TABLE_KEYS)[number];

function tableForKey(key: TransactionPresetKey | FullResetKey): Table {
	return db[key] as Table;
}

function transactionPresetTables(): Table[] {
	return TRANSACTION_DATA_PRESET_TABLE_KEYS.map((k) => tableForKey(k));
}

function fullResetTables(): Table[] {
	return FULL_DATABASE_RESET_TABLE_KEYS.map((k) => tableForKey(k));
}

/**
 * Clears transaction-linked and derived tables; keeps accounts, categories, prefs, currencies, goals, round-up rules, user actions.
 * Recalculates active account balances and clears balance projection cache for those accounts.
 */
export async function clearTransactionDataPreset(): Promise<void> {
	const tables = transactionPresetTables();
	await db.transaction('rw', tables, async () => {
		for (const t of tables) {
			await t.clear();
		}
	});

	const active = await db.getActiveAccounts();
	const ids = active.map((a) => a.id);
	for (const id of ids) {
		await accountService.recalculateAccountBalance(id);
	}
	if (ids.length > 0) {
		balanceProjectionService.clearCacheForAccounts(ids);
	}
}

/**
 * Wipes every BudgicDB store. Caller should `location.reload()` (or full remount) so system currencies re-seed.
 */
export async function clearFullDatabaseReset(): Promise<void> {
	const tables = fullResetTables();
	await db.transaction('rw', tables, async () => {
		for (const t of tables) {
			await t.clear();
		}
	});
}
