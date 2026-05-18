/**
 * Schema Inspector Service
 *
 * Detects and validates schema structure from CSV files or SQLite table names,
 * identifying table names, columns, and data types.
 */

import type { CSVFile, DetectedSchema, TableSchema } from './types';

/** Required tables for Money Manager import */
export const MONEY_MANAGER_REQUIRED_TABLES = ['ASSETS', 'ZCATEGORY', 'INOUTCOME', 'CURRENCY'] as const;

/** Optional tables for Money Manager import */
export const MONEY_MANAGER_OPTIONAL_TABLES = [
	'BUDGET',
	'BUDGET_AMOUNT',
	'TAG',
	'TX_TAG',
	'ASSETGROUP'
] as const;

export type MoneyManagerImportFormat = 'money-manager-csv' | 'money-manager-sqlite';

const ALL_MM_TABLES = [...MONEY_MANAGER_REQUIRED_TABLES, ...MONEY_MANAGER_OPTIONAL_TABLES];

function requiredTablesForFormat(format: MoneyManagerImportFormat): readonly string[] {
	return format === 'money-manager-csv' || format === 'money-manager-sqlite'
		? MONEY_MANAGER_REQUIRED_TABLES
		: [];
}

/**
 * Inspect schema from table names (CSV map keys or SQLite sqlite_master).
 */
export function inspectSchemaFromTableNames(
	tableNames: string[],
	format: MoneyManagerImportFormat
): DetectedSchema {
	const normalized = tableNames.map((n) => n.toUpperCase());
	const requiredTables = requiredTablesForFormat(format);
	const missingTables: string[] = [];

	for (const requiredTable of requiredTables) {
		if (!normalized.includes(requiredTable)) {
			missingTables.push(requiredTable);
		}
	}

	const tables: TableSchema[] = normalized.map((name) => ({
		name,
		columns: [],
		required: requiredTables.includes(name)
	}));

	return {
		tables,
		format,
		version: undefined,
		isValid: missingTables.length === 0,
		missingTables
	};
}

/**
 * Inspect schema from CSV files
 */
export function inspectSchema(
	csvFiles: Map<string, CSVFile>,
	format: MoneyManagerImportFormat = 'money-manager-csv'
): DetectedSchema {
	const tableNames = [...csvFiles.keys()];
	const base = inspectSchemaFromTableNames(tableNames, format);

	const tables: TableSchema[] = [];
	for (const [fileName, csvFile] of csvFiles.entries()) {
		const tableName = fileName.toUpperCase();
		tables.push({
			name: tableName,
			columns: csvFile.headers,
			sampleRow: csvFile.rows.length > 0 ? csvFile.rows[0] : undefined,
			required: MONEY_MANAGER_REQUIRED_TABLES.includes(
				tableName as (typeof MONEY_MANAGER_REQUIRED_TABLES)[number]
			)
		});
	}

	return {
		...base,
		tables
	};
}

/**
 * Get table schema by name
 */
export function getTableSchema(schema: DetectedSchema, tableName: string): TableSchema | undefined {
	return schema.tables.find((t) => t.name.toUpperCase() === tableName.toUpperCase());
}

/**
 * Check if a column exists in a table
 */
export function hasColumn(schema: DetectedSchema, tableName: string, columnName: string): boolean {
	const table = getTableSchema(schema, tableName);
	return table ? table.columns.includes(columnName) : false;
}

/**
 * Get sample data from a table
 */
export function getSampleData(
	csvFiles: Map<string, CSVFile>,
	tableName: string,
	limit: number = 5
): Record<string, string>[] {
	const csvFile = csvFiles.get(tableName);
	if (!csvFile) {
		return [];
	}

	return csvFile.rows.slice(0, limit);
}

/**
 * Validate that all required columns exist in a table
 */
export function validateTableColumns(
	schema: DetectedSchema,
	tableName: string,
	requiredColumns: string[]
): { isValid: boolean; missingColumns: string[] } {
	const table = getTableSchema(schema, tableName);

	if (!table) {
		return {
			isValid: false,
			missingColumns: requiredColumns
		};
	}

	const missingColumns = requiredColumns.filter((col) => !table.columns.includes(col));

	return {
		isValid: missingColumns.length === 0,
		missingColumns
	};
}

/** All MM table names we may read from SQLite (required + optional). */
export function getMoneyManagerTableNames(): readonly string[] {
	return ALL_MM_TABLES;
}
