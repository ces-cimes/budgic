import { db } from '$lib/core/db';
import {
	mapLegacyMaturityToGuidance,
	type LegacyMaturityLevel
} from '$lib/utils/guidance-presentation';
import {
	BUDGIC_BACKUP_VERSION,
	backupPayloadHasUserData,
	isV2BackupPayload,
	type BudgicBackupV1,
	type BudgicBackupV2
} from '$lib/backup/backup-payload-utils';

export { BUDGIC_BACKUP_VERSION };

/** Tables included in full export/import (all user data stores). */
export const BACKUP_TABLE_NAMES = [
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
	'dataCorrections',
	'people',
	'personMigrationBatches'
] as const;

export type BudgicBackupTableName = (typeof BACKUP_TABLE_NAMES)[number];

export type { BudgicBackupV1, BudgicBackupV2 };

export type BudgicBackup = BudgicBackupV2 | BudgicBackupV1;

function isV2Backup(data: BudgicBackup): data is BudgicBackupV2 {
	return isV2BackupPayload(data);
}

function backupTableNamesSet(): Set<string> {
	return new Set<string>(BACKUP_TABLE_NAMES);
}

export async function exportFullBackup(): Promise<BudgicBackupV2> {
	const tables = {} as Record<BudgicBackupTableName, unknown[]>;
	const names = backupTableNamesSet();

	for (const table of db.tables) {
		if (!names.has(table.name)) {
			continue;
		}
		tables[table.name as BudgicBackupTableName] = await table.toArray();
	}

	return {
		version: BUDGIC_BACKUP_VERSION,
		exportDate: new Date().toISOString(),
		tables
	};
}

function v1TableRows(v1: BudgicBackupV1, tableName: string): unknown[] | undefined {
	const mapping: Record<string, unknown[] | undefined> = {
		accounts: v1.accounts,
		transactions: v1.transactions,
		categories: v1.categories,
		goals: v1.goals,
		insights: v1.insights,
		userActions: v1.userActions,
		userPreferences: v1.userPreferences
	};
	return mapping[tableName];
}

function normalizeUserPreferencesRow(row: Record<string, unknown>): Record<string, unknown> {
	const normalized = { ...row };
	const legacyMaturity = normalized.userMaturityLevel as LegacyMaturityLevel | undefined;
	if (legacyMaturity && (normalized.guidanceTone == null || normalized.explanationDetail == null)) {
		const mapped = mapLegacyMaturityToGuidance(legacyMaturity);
		if (normalized.guidanceTone == null) normalized.guidanceTone = mapped.guidanceTone;
		if (normalized.explanationDetail == null) {
			normalized.explanationDetail = mapped.explanationDetail;
		}
	}
	delete normalized.userMaturityLevel;
	if (normalized.recoveryModeActive == null) normalized.recoveryModeActive = false;
	if (normalized.recoveryModeDeclined == null) normalized.recoveryModeDeclined = false;
	return normalized;
}

function normalizeBackupRows(tableName: string, rows: unknown[]): unknown[] {
	if (tableName !== 'userPreferences') return rows;
	return rows.map((row) => normalizeUserPreferencesRow(row as Record<string, unknown>));
}

export async function importFullBackup(data: BudgicBackup): Promise<void> {
	if (!data.version || !data.exportDate) {
		throw new Error('Invalid backup: missing version or exportDate');
	}

	const names = backupTableNamesSet();

	await db.transaction(
		'rw',
		db.tables.map((t) => t),
		async () => {
			for (const table of db.tables) {
				if (!names.has(table.name)) {
					continue;
				}
				const rows = isV2Backup(data)
					? (data.tables[table.name as BudgicBackupTableName] ?? [])
					: (v1TableRows(data as BudgicBackupV1, table.name) ?? []);
				const normalizedRows = normalizeBackupRows(table.name, rows);
				await table.clear();
				if (normalizedRows.length > 0) {
					await table.bulkPut(normalizedRows as any);
				}
			}
		}
	);

	await db.reseedSystemCurrencyData();
}

export async function isLocalDatabaseEmpty(): Promise<boolean> {
	const [accounts, transactions] = await Promise.all([
		db.accounts.count(),
		db.transactions.count()
	]);
	return accounts === 0 && transactions === 0;
}

/** True when backup contains at least one account or transaction (user data). */
export function backupHasUserData(data: BudgicBackup): boolean {
	return backupPayloadHasUserData(data);
}
