/**
 * Base Importer Interface
 *
 * Abstract base class for importers, providing common functionality
 * for progress tracking, error handling, and rollback support.
 */

import type {
	ImportOptions,
	ImportProgress,
	ImportResult,
	ImportStatistics,
	ImportError
} from './types';
import type { Account, Transaction } from '$lib/core/db';

const INTEREST_DESCRIPTION =
	/interest|процент|finance charge|finance charges|\bint\.|accrual|кредит|к уплате/i;

/**
 * Base importer class with common functionality
 */
export abstract class BaseImporter {
	protected statistics: ImportStatistics = {
		accountsImported: 0,
		accountsSkipped: 0,
		categoriesImported: 0,
		categoriesSkipped: 0,
		transactionsImported: 0,
		transactionsSkipped: 0,
		transactionsMerged: 0,
		transactionsReplaced: 0,
		currenciesImported: 0,
		currenciesSkipped: 0
	};

	protected errors: ImportError[] = [];
	protected warnings: string[] = [];
	protected startTime: number = 0;
	protected options: ImportOptions;

	constructor(options: ImportOptions = {}) {
		this.options = {
			importAccounts: true,
			importCategories: true,
			importTransactions: true,
			importCurrencies: true,
			importBudgets: false,
			conflictResolution: 'skip',
			mmTransactionUidConflict: 'skip',
			includeMmUidConflictReport: false,
			skipValidation: false,
			...options
		};
	}

	/**
	 * Execute the import process
	 *
	 * @param data - Optional data parameter for importers that need input (e.g., CSV files)
	 * @returns Import result with statistics and errors
	 */
	abstract import(data?: unknown): Promise<ImportResult>;

	/**
	 * Report progress to callback if provided
	 *
	 * @param step - Current step name
	 * @param stepNumber - Current step number (1-based)
	 * @param totalSteps - Total number of steps
	 * @param currentItem - Current item being processed
	 * @param itemsProcessed - Items processed so far
	 * @param totalItems - Total items to process
	 */
	protected reportProgress(
		step: string,
		stepNumber: number,
		totalSteps: number,
		currentItem?: string,
		itemsProcessed: number = 0,
		totalItems: number = 0
	): void {
		if (this.options.onProgress) {
			const progress: ImportProgress = {
				step,
				stepNumber,
				totalSteps,
				currentItem,
				itemsProcessed,
				totalItems,
				percentage: totalItems > 0 ? Math.round((itemsProcessed / totalItems) * 100) : 0
			};
			this.options.onProgress(progress);
		}
	}

	/**
	 * Add an error to the error list
	 *
	 * @param error - Error to add
	 */
	protected addError(error: ImportError): void {
		this.errors.push(error);
	}

	/**
	 * Add a warning to the warning list
	 *
	 * @param warning - Warning message
	 */
	protected addWarning(warning: string): void {
		this.warnings.push(warning);
	}

	/**
	 * Create final import result
	 *
	 * @param success - Whether import was successful
	 * @returns Import result
	 */
	protected createResult(
		success: boolean,
		importBatch?: ImportResult['importBatch']
	): ImportResult {
		const duration = Date.now() - this.startTime;

		return {
			success,
			statistics: { ...this.statistics },
			errors: [...this.errors],
			warnings: [...this.warnings],
			duration,
			completedAt: new Date().toISOString(),
			importBatch
		};
	}

	/**
	 * Start timing the import
	 */
	protected startTiming(): void {
		this.startTime = Date.now();
	}

	/**
	 * Validate import options
	 *
	 * @returns Whether options are valid
	 */
	protected validateOptions(): { isValid: boolean; errors: string[] } {
		const errors: string[] = [];

		// At least one import type must be selected
		if (
			!this.options.importAccounts &&
			!this.options.importCategories &&
			!this.options.importTransactions &&
			!this.options.importCurrencies
		) {
			errors.push('At least one import type must be selected');
		}

		// Validate date range if provided
		if (this.options.transactionDateStart && this.options.transactionDateEnd) {
			const start = new Date(this.options.transactionDateStart);
			const end = new Date(this.options.transactionDateEnd);

			if (start > end) {
				errors.push('Transaction date start must be before end date');
			}
		}

		return {
			isValid: errors.length === 0,
			errors
		};
	}
}

/**
 * Phase 10 — flag accounts where many small transactions look like interest charges.
 */
export function detectPassiveBalanceImportHints(
	accounts: Array<Pick<Account, 'id' | 'name' | 'type'>>,
	transactions: Array<Pick<Transaction, 'accountId' | 'amount' | 'description'>>
): NonNullable<ImportResult['importBatch']>['passiveBalanceTrackingHints'] {
	const hints: NonNullable<ImportResult['importBatch']>['passiveBalanceTrackingHints'] = [];

	for (const acc of accounts) {
		if (acc.type !== 'savings' && acc.type !== 'credit' && acc.type !== 'loan') continue;
		const txs = transactions.filter((t) => t.accountId === acc.id);
		const small = txs.filter((t) => Math.abs(t.amount ?? 0) < 50);
		const interestLike = small.filter((t) =>
			INTEREST_DESCRIPTION.test((t.description ?? '').toLowerCase())
		);
		if (interestLike.length >= 20) {
			hints.push({
				accountId: acc.id,
				accountName: acc.name,
				message:
					'This account looks like it has many small interest-related movements. Set up balance-based tracking in account settings?'
			});
		}
	}

	return hints.length ? hints : undefined;
}
