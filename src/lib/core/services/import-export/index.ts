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
	MmTransactionUidConflict,
	MmUidConflictReportEntry,
	CSVFile,
	DetectedSchema,
	TableSchema,
	IdMapping,
	TransferPair
} from './types';

// CSV parsing utilities
export {
	parseCSV,
	readCSVFile,
	readMultipleCSVFiles,
	validateCSVStructure,
	normalizeMmCsvFileKeys,
	getMmCsvTable
} from './csv-parser';

// Schema inspection
export {
	inspectSchema,
	inspectSchemaFromTableNames,
	getTableSchema,
	hasColumn,
	getSampleData,
	validateTableColumns,
	MONEY_MANAGER_REQUIRED_TABLES,
	MONEY_MANAGER_OPTIONAL_TABLES,
	getMoneyManagerTableNames,
	type MoneyManagerImportFormat
} from './schema-inspector';

// Money Manager SQLite reader
export {
	openMoneyManagerSqlite,
	closeSqlite,
	fingerprintMoneyManagerSqlite,
	extractMoneyManagerCsvFiles,
	getLargeImportWarnings,
	readMoneyManagerSqliteFile,
	isSqliteDatabaseFile,
	MM_SQLITE_FILE_SIZE_WARN_BYTES,
	MM_SQLITE_INOUTCOME_ROW_WARN,
	type SqliteDb
} from './mm-sqlite-reader';

// Import source detection
export {
	detectImportSource,
	releaseImportSourceDetection,
	type ImportSourceDetection,
	type ImportSourceKind
} from './import-source-detector';

// Base importer
export { BaseImporter, detectPassiveBalanceImportHints } from './base-importer';

// Money Manager importer
export { MoneyManagerImporter } from './money-manager-importer';

export {
	detectMmCurrencyReviewNeeded,
	type MmCurrencyReviewDetection,
	type MmCurrencyReviewRow
} from './mm-currency-review-detect';

export {
	buildMmAccountReviewRows,
	inferMmAccountType,
	MM_ACCOUNT_REVIEW_TYPE_LABELS,
	REVIEW_ACCOUNT_TYPES,
	type MmAccountReviewRow,
	type MmAccountTypeSource,
	type BuildMmAccountReviewRowsOptions
} from './mm-account-type-inference';

export {
	detectImportSplitCandidates,
	getSplitPickerCandidateIds,
	isEligibleForSplitDetection,
	SPLIT_PROXIMITY_MS
} from './import-split-detect';

export {
	linkTransactionsAsSplitGroup,
	dismissSplitCandidateGroup,
	type LinkSplitGroupResult,
	type DismissSplitCandidateResult
} from './import-split-link-service';

// Money Manager mapper utilities
export {
	mapAccountType,
	mapCategoryType,
	mapTransactionType,
	mapDate,
	mapDateWithQuality,
	mapAmount,
	mapAmountWithQuality,
	extractCurrencyCode,
	extractCurrencyCodeWithQuality,
	flattenCategoryName,
	parseTimestamp,
	parseTimestampWithQuality,
	isDeleted,
	getCategoryPriority
} from './money-manager-mapper';
