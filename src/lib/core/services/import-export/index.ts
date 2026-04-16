/**
 * Import/Export Services
 *
 * Services for importing data from external sources (Money Manager, etc.)
 * and exporting data in various formats.
 */

// Type definitions
export type {
	ImportResult,
	ImportStatistics,
	ImportError,
	ImportProgress,
	ImportOptions,
	CSVFile,
	DetectedSchema,
	TableSchema,
	IdMapping,
	TransferPair
} from './types';

// CSV parsing utilities
export { parseCSV, readCSVFile, readMultipleCSVFiles, validateCSVStructure } from './csv-parser';

// Schema inspection
export {
	inspectSchema,
	getTableSchema,
	hasColumn,
	getSampleData,
	validateTableColumns
} from './schema-inspector';

// Base importer
export { BaseImporter, detectPassiveBalanceImportHints } from './base-importer';

// Money Manager importer
export { MoneyManagerImporter } from './money-manager-importer';

// Money Manager mapper utilities
export {
	mapAccountType,
	mapCategoryType,
	mapTransactionType,
	mapDate,
	mapAmount,
	extractCurrencyCode,
	flattenCategoryName,
	parseTimestamp,
	isDeleted,
	getCategoryPriority
} from './money-manager-mapper';
