import { db } from '$lib/core/db';

export const BUDGIC_BACKUP_VERSION = '2.0';

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

export type BudgicBackupV2 = {
	version: typeof BUDGIC_BACKUP_VERSION;
	exportDate: string;
	tables: Record<BudgicBackupTableName, unknown[]>;
};

/** Legacy export shape from early /data page. */
type BudgicBackupV1 = {
	version: string;
	exportDate: string;
	accounts?: unknown[];
	transactions?: unknown[];
	categories?: unknown[];
	goals?: unknown[];
	insights?: unknown[];
	userActions?: unknown[];
	userPreferences?: unknown[];
};

export type BudgicBackup = BudgicBackupV2 | BudgicBackupV1;

function isV2Backup(data: BudgicBackup): data is BudgicBackupV2 {
	return (
		data.version === BUDGIC_BACKUP_VERSION && typeof (data as BudgicBackupV2).tables === 'object'
	);
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
				await table.clear();
				if (rows.length > 0) {
					await table.bulkPut(rows as any);
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
