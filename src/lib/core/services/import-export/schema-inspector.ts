/**
 * Schema Inspector Service
 *
 * Detects and validates schema structure from CSV files,
 * identifying table names, columns, and data types.
 */

import type { CSVFile, DetectedSchema, TableSchema } from './types';

/**
 * Required tables for Money Manager import
 */
const MONEY_MANAGER_REQUIRED_TABLES = ['ASSETS', 'ZCATEGORY', 'INOUTCOME', 'CURRENCY'];
const MONEY_MANAGER_OPTIONAL_TABLES = ['BUDGET', 'BUDGET_AMOUNT', 'TAG', 'TX_TAG', 'ASSETGROUP'];

/**
 * Inspect schema from CSV files
 *
 * @param csvFiles - Map of CSV file names to parsed data
 * @param format - Expected format (e.g., 'money-manager-csv')
 * @returns Detected schema information
 *
 * @example
 * ```typescript
 * const csvFiles = await readMultipleCSVFiles(files);
 * const schema = inspectSchema(csvFiles, 'money-manager-csv');
 * if (schema.isValid) {
 *   console.log('All required tables found');
 * }
 * ```
 */
export function inspectSchema(
	csvFiles: Map<string, CSVFile>,
	format: string = 'money-manager-csv'
): DetectedSchema {
	const tables: TableSchema[] = [];
	const missingTables: string[] = [];

	// Determine required tables based on format
	const requiredTables = format === 'money-manager-csv' ? MONEY_MANAGER_REQUIRED_TABLES : [];

	// Check all CSV files
	for (const [fileName, csvFile] of csvFiles.entries()) {
		const tableName = fileName.toUpperCase();

		tables.push({
			name: tableName,
			columns: csvFile.headers,
			sampleRow: csvFile.rows.length > 0 ? csvFile.rows[0] : undefined,
			required: requiredTables.includes(tableName)
		});
	}

	// Check for missing required tables
	for (const requiredTable of requiredTables) {
		if (!tables.some((t) => t.name === requiredTable)) {
			missingTables.push(requiredTable);
		}
	}

	return {
		tables,
		format,
		version: detectVersion(csvFiles, format),
		isValid: missingTables.length === 0,
		missingTables
	};
}

/**
 * Detect schema version (if possible)
 *
 * @param csvFiles - Map of CSV files
 * @param format - Format name
 * @returns Version string or undefined
 */
function detectVersion(csvFiles: Map<string, CSVFile>, format: string): string | undefined {
	// For Money Manager, version might be in ZETC table or other metadata
	// For now, return undefined as version detection is not critical
	return undefined;
}

/**
 * Get table schema by name
 *
 * @param schema - Detected schema
 * @param tableName - Name of table to find
 * @returns Table schema or undefined
 */
export function getTableSchema(schema: DetectedSchema, tableName: string): TableSchema | undefined {
	return schema.tables.find((t) => t.name.toUpperCase() === tableName.toUpperCase());
}

/**
 * Check if a column exists in a table
 *
 * @param schema - Detected schema
 * @param tableName - Table name
 * @param columnName - Column name
 * @returns Whether column exists
 */
export function hasColumn(schema: DetectedSchema, tableName: string, columnName: string): boolean {
	const table = getTableSchema(schema, tableName);
	return table ? table.columns.includes(columnName) : false;
}

/**
 * Get sample data from a table
 *
 * @param csvFiles - Map of CSV files
 * @param tableName - Table name
 * @param limit - Maximum number of sample rows
 * @returns Array of sample rows
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
 *
 * @param schema - Detected schema
 * @param tableName - Table name
 * @param requiredColumns - Array of required column names
 * @returns Validation result
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
