/**
 * Import/Export Type Definitions
 *
 * Type definitions for import/export functionality, including
 * import results, progress tracking, and error handling.
 */

import type { Account, PersonExternalKey } from '$lib/core/db';

/** Post-import person-ledger close queue entry (Phase E). */
export interface PersonLedgerCloseQueueEntry {
	accountId: string;
	name: string;
	externalKeys: PersonExternalKey[];
}

/** When INOUTCOME row mmUid already exists in DB */
export type MmTransactionUidConflict = 'skip' | 'replace' | 'merge';

/** One row in optional post-import MM UID conflict report */
export interface MmUidConflictReportEntry {
	mmUid: string;
	transactionId: string;
	action: 'skipped' | 'merged' | 'replaced';
	diffs?: Array<{ field: string; before: unknown; after: unknown }>;
}

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
	/** Re-import: existing mmUid updated with merge policy */
	transactionsMerged: number;
	/** Re-import: existing mmUid fully replaced from MM row */
	transactionsReplaced: number;
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
		/** Unclassified expense clusters for wizard “uncertain patterns” step */
		patternHints?: Array<{
			hintId: string;
			representativeDescription: string;
			transactionIds: string[];
			totalAbsAmount: number;
		}>;
		/** Cleared expense tx ids in this batch (for payoff / tier share math) */
		wizardExpenseTransactionIds?: string[];
		/** Absolute expense amount per transaction id (wizard metrics) */
		wizardExpenseAbsByTransactionId?: Record<string, number>;
		/** When `includeMmUidConflictReport` — merge/replace UID matches with import-owned field diffs */
		mmUidConflicts?: MmUidConflictReportEntry[];
		/** Post-import split candidate groups (same account, ~10 min, similar desc/cat) */
		splitCandidateSummary?: { groupCount: number; transactionCount: number };
		splitCandidateGroups?: Array<{ groupId: string; transactionIds: string[] }>;
		/** Account names marked as person tracking at pre-import review */
		personAccountPreFlaggedNames?: string[];
		/** Accounts to close via PersonLedgerMigrationWizard after import (Phase E) */
		personLedgerCloseQueue?: PersonLedgerCloseQueueEntry[];
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
	/**
	 * When a transaction row’s mmUid already exists (re-import).
	 * Separate from account/category `conflictResolution`.
	 */
	mmTransactionUidConflict?: MmTransactionUidConflict;
	/** If true, populate `importBatch.mmUidConflicts` for merge/replace actions (can be large) */
	includeMmUidConflictReport?: boolean;
	/**
	 * Optional MM `currencyUid` (from CURRENCY.csv / INOUTCOME) → existing Budgic `currencies` row id.
	 * Set by the pre-import currency review UI; seeds the importer before `importCurrencies()`.
	 */
	mmCurrencyUidToBudgicCurrencyId?: Record<string, string>;
	/** MM ASSETS uid → Budgic account type (pre-import accounts review) */
	mmAccountUidToBudgicType?: Record<string, Account['type']>;
	/** MM ASSETS uid → user marked person ledger at pre-import review */
	externalAccountMarkedAsPersonLedger?: Record<string, boolean>;
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
