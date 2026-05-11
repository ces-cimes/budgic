/**
 * Import/Export Type Definitions
 *
 * Type definitions for import/export functionality, including
 * import results, progress tracking, and error handling.
 */

/**
 * Import result statistics
 */
export interface ImportStatistics {
	/** Number of accounts imported */
	accountsImported: number;
	/** Number of accounts skipped (duplicates, errors) */
	accountsSkipped: number;
	/** Number of categories imported */
	categoriesImported: number;
	/** Number of categories skipped */
	categoriesSkipped: number;
	/** Number of transactions imported */
	transactionsImported: number;
	/** Number of transactions skipped */
	transactionsSkipped: number;
	/** Number of currencies imported */
	currenciesImported: number;
	/** Number of currencies skipped */
	currenciesSkipped: number;
	/** Number of budgets imported (if applicable) */
	budgetsImported?: number;
	/** Number of budgets skipped */
	budgetsSkipped?: number;
}

/**
 * Import error details
 */
export interface ImportError {
	/** Error type/category */
	type: 'validation' | 'mapping' | 'database' | 'file' | 'unknown';
	/** Error message */
	message: string;
	/** Entity type that caused the error */
	entityType?: 'account' | 'category' | 'transaction' | 'currency' | 'budget';
	/** Original data that caused the error (sanitized) */
	originalData?: Record<string, unknown>;
	/** Line number in source file (if applicable) */
	lineNumber?: number;
	/** Stack trace (in development) */
	stack?: string;
}

/**
 * Import progress information
 */
export interface ImportProgress {
	/** Current step name */
	step: string;
	/** Current step number (1-based) */
	stepNumber: number;
	/** Total number of steps */
	totalSteps: number;
	/** Current item being processed */
	currentItem?: string;
	/** Items processed so far */
	itemsProcessed: number;
	/** Total items to process */
	totalItems: number;
	/** Percentage complete (0-100) */
	percentage: number;
}

/**
 * Complete import result
 */
export interface ImportResult {
	/** Whether import was successful */
	success: boolean;
	/** Import statistics */
	statistics: ImportStatistics;
	/** List of errors encountered */
	errors: ImportError[];
	/** Warnings (non-fatal issues) */
	warnings: string[];
	/** Import duration in milliseconds */
	duration: number;
	/** Timestamp when import completed */
	completedAt: string;
	/** Optional post-import metadata for guided clean-up UX */
	importBatch?: {
		transactionIds: string[];
		unclassifiedTransactionIds: string[];
		accountIdsAffected: string[];
		dateRange?: { start: string; end: string };
		automationSummary?: {
			roundUpCount: number;
			roundUpAmount: number;
			interestCount: number;
			interestAmount: number;
			reconciliationAdjustmentCount: number;
		};
		essentialCandidates?: Array<{
			patternKey: string;
			suggestedTier: 'survival' | 'security' | 'growth' | 'lifestyle' | 'unclassified';
			matchedTransactionIds: string[];
			allowanceImpact: number;
			cadence: 'monthly' | 'weekly' | 'irregular';
			confidence: number;
			reason: string;
		}>;
		/** Phase 10 — accounts that look interest-heavy for balance-first setup */
		passiveBalanceTrackingHints?: Array<{
			accountId: string;
			accountName: string;
			message: string;
		}>;
		/** Counts for post-import quality summary (MM import batch) */
		qualitySummary?: {
			total: number;
			clean: number;
			dateInferred: number;
			amountInferred: number;
			currencyFallback: number;
		};
	};
}

/**
 * Import options
 */
export interface ImportOptions {
	/** Whether to import accounts */
	importAccounts?: boolean;
	/** Whether to import categories */
	importCategories?: boolean;
	/** Whether to import transactions */
	importTransactions?: boolean;
	/** Whether to import currencies */
	importCurrencies?: boolean;
	/** Whether to import budgets */
	importBudgets?: boolean;
	/** Date range filter for transactions (start date) */
	transactionDateStart?: string;
	/** Date range filter for transactions (end date) */
	transactionDateEnd?: string;
	/** Conflict resolution strategy */
	conflictResolution?: 'skip' | 'rename' | 'merge' | 'replace';
	/** Whether to skip validation (not recommended) */
	skipValidation?: boolean;
	/** Callback for progress updates */
	onProgress?: (progress: ImportProgress) => void;
}

/**
 * CSV file data structure
 */
export interface CSVFile {
	/** File name (table name) */
	name: string;
	/** CSV headers (column names) */
	headers: string[];
	/** CSV rows (data) */
	rows: Record<string, string>[];
	/** Total number of rows */
	rowCount: number;
}

/**
 * Schema information for a table/file
 */
export interface TableSchema {
	/** Table/file name */
	name: string;
	/** Column names */
	columns: string[];
	/** Sample data row (for type detection) */
	sampleRow?: Record<string, string>;
	/** Whether this table is required */
	required: boolean;
}

/**
 * Detected schema information
 */
export interface DetectedSchema {
	/** List of detected tables */
	tables: TableSchema[];
	/** Source format (e.g., 'money-manager-csv') */
	format: string;
	/** Schema version (if detectable) */
	version?: string;
	/** Whether all required tables are present */
	isValid: boolean;
	/** Missing required tables */
	missingTables: string[];
}

/**
 * Mapping between source and target IDs
 */
export interface IdMapping {
	/** Source ID (e.g., MM uid) */
	sourceId: string;
	/** Target ID (Budgic ID) */
	targetId: string;
	/** Entity type */
	entityType: 'account' | 'category' | 'currency';
}

/**
 * Transfer pair information (for MM transfers)
 */
export interface TransferPair {
	/** Transfer transaction uid (links the pair) */
	txUidTrans: string;
	/** Transfer out transaction (DO_TYPE=3) */
	transferOut?: Record<string, string>;
	/** Transfer in transaction (DO_TYPE=4) */
	transferIn?: Record<string, string>;
	/** Fee transaction (if exists) */
	feeTransaction?: Record<string, string>;
}
