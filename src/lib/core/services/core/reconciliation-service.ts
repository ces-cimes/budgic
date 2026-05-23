import { db, generateUUID } from '$lib/core/db';
import type {
	Account,
	Transaction,
	ReconciliationRecord,
	ReconciliationDiscrepancy
} from '$lib/core/db';
import { canonicalDuplicateKey } from '$lib/utils/data-quality-utils';
import { dataCorrectionService } from './data-correction-service';
import { accountService } from './account-service';
import { z } from 'zod';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

export type { ReconciliationRecord, ReconciliationDiscrepancy } from '$lib/core/db';

export interface ReconciliationSummary {
	accountId: string;
	accountName: string;
	lastReconciledDate?: string;
	daysSinceLastReconciliation: number;
	currentBalance: number;
	ledgerBalance: number;
	balanceGap: number;
	lastReconciledBalance: number;
	totalDiscrepancies: number;
	unresolvedDiscrepancies: number;
	reconciliationHealth: 'good' | 'warning' | 'critical';
}

type ReconciliationPerformOptions = Partial<
	ReconciliationOptions & {
		reconciliationType?: ReconciliationRecord['reconciliationType'];
		notes?: string;
	}
>;

export interface ReconciliationOptions {
	tolerance: number; // Acceptable difference in currency units (e.g., 0.01 for cents)
	includePendingTransactions: boolean;
	autoResolveSmallDiscrepancies: boolean;
	autoResolveThreshold: number;
}

const ReconciliationOptionsSchema = z.object({
	tolerance: z.number().positive().default(0.01),
	includePendingTransactions: z.boolean().default(false),
	autoResolveSmallDiscrepancies: z.boolean().default(true),
	autoResolveThreshold: z.number().positive().default(0.01)
});

/**
 * Reconciliation Service
 *
 * Handles balance reconciliation operations including algorithm implementation,
 * history tracking, and discrepancy detection. Provides comprehensive tools
 * for ensuring account balance accuracy and maintaining financial data integrity.
 *
 * @example
 * ```typescript
 * import { reconciliationService } from '$lib/core/services';
 *
 * // Perform manual reconciliation
 * const result = await reconciliationService.performReconciliation('account-123', 1500.00, {
 *   tolerance: 0.01,
 *   includePendingTransactions: false
 * });
 *
 * // Get reconciliation summary
 * const summary = await reconciliationService.getReconciliationSummary('account-123');
 * ```
 */
class ReconciliationService {
	// Public interface
	public get ready() {
		return db.isOpen();
	}

	public isLoading() {
		return !this.ready;
	}

	// ============================================================================
	// RECONCILIATION ALGORITHM
	// ============================================================================

	/**
	 * Perform balance reconciliation for an account
	 *
	 * Compares the account's calculated balance with a provided statement balance
	 * and identifies discrepancies. Creates a reconciliation record and detects
	 * any issues that need resolution.
	 *
	 * @param accountId - Account unique identifier
	 * @param statementBalance - Balance from external statement (bank, etc.)
	 * @param options - Reconciliation options
	 * @returns Promise resolving to reconciliation result
	 * @throws {Error} If account not found or reconciliation fails
	 *
	 * @example
	 * ```typescript
	 * const result = await reconciliationService.performReconciliation('account-123', 1500.00);
	 * if (result.discrepancy !== 0) {
	 *   console.log(`Discrepancy found: $${result.discrepancy}`);
	 * }
	 * ```
	 */
	async performReconciliation(
		accountId: string,
		statementBalance: number,
		options: ReconciliationPerformOptions = {}
	): Promise<ReconciliationRecord> {
		// Validate account exists
		const account = await accountService.getAccount(accountId);
		if (!account) {
			throw new Error(`Account ${accountId} not found`);
		}

		const { reconciliationType = 'manual', notes, ...reconOptions } = options;
		// Validate and set default options
		const validatedOptions = ReconciliationOptionsSchema.parse(reconOptions);

		// Get current calculated balance
		const calculatedBalance = await this.calculateReconciliationBalance(
			accountId,
			validatedOptions
		);

		// Calculate discrepancy
		const discrepancy = statementBalance - calculatedBalance;

		// Get transactions for this reconciliation period
		const transactions = await this.getTransactionsForReconciliation(accountId, validatedOptions);
		const reconciledTransactions = transactions.filter((t) =>
			this.isTransactionReconciled(t, validatedOptions)
		);
		const unreconciledTransactions = transactions.filter(
			(t) => !this.isTransactionReconciled(t, validatedOptions)
		);

		// Create reconciliation record
		const reconciliationRecord: ReconciliationRecord = {
			id: generateUUID(),
			accountId,
			reconciledDate: new Date().toISOString(),
			statementBalance,
			calculatedBalance,
			discrepancy,
			reconciliationType,
			transactionCount: transactions.length,
			reconciledTransactionIds: reconciledTransactions.map((t) => t.id),
			unreconciledTransactionIds: unreconciledTransactions.map((t) => t.id),
			...(notes ? { notes } : {}),
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};

		// Store reconciliation record
		await db.reconciliationRecords.add(reconciliationRecord);

		const reconciledAtIso = reconciliationRecord.reconciledDate;
		for (const txId of reconciliationRecord.reconciledTransactionIds) {
			await db.transactions.update(txId, {
				reconciledAt: reconciledAtIso,
				updatedAt: new Date().toISOString()
			});
		}

		// Detect and create discrepancies if needed
		if (Math.abs(discrepancy) > validatedOptions.tolerance) {
			await this.detectAndCreateDiscrepancies(reconciliationRecord, validatedOptions);
		}

		// Update account metadata with last reconciled date
		await accountService.updateAccountMetadata(accountId, {
			lastReconciledDate: reconciliationRecord.reconciledDate
		});

		// Auto-resolve small discrepancies if enabled
		if (
			validatedOptions.autoResolveSmallDiscrepancies &&
			Math.abs(discrepancy) <= validatedOptions.autoResolveThreshold
		) {
			await this.autoResolveSmallDiscrepancy(reconciliationRecord);
		}

		return reconciliationRecord;
	}

	/**
	 * Perform automatic reconciliation based on transaction patterns
	 *
	 * @param accountId - Account unique identifier
	 * @param options - Reconciliation options
	 * @returns Promise resolving to reconciliation result
	 */
	async performAutomaticReconciliation(
		accountId: string,
		options: Partial<ReconciliationOptions & { notes?: string }> = {}
	): Promise<ReconciliationRecord> {
		const account = await accountService.getAccount(accountId);
		if (!account) {
			throw new Error(`Account ${accountId} not found`);
		}

		const { notes, ...reconOptions } = options;
		const validatedOptions = ReconciliationOptionsSchema.parse(reconOptions);
		const calculatedBalance = await this.calculateReconciliationBalance(
			accountId,
			validatedOptions
		);

		// For automatic reconciliation, assume statement balance equals calculated balance
		return await this.performReconciliation(accountId, calculatedBalance, {
			...validatedOptions,
			autoResolveSmallDiscrepancies: true,
			reconciliationType: 'automatic',
			notes
		});
	}

	/**
	 * Record a skipped check-up as a 0-delta reconciliation session.
	 */
	async skipReconciliationForNow(accountId: string, notes?: string): Promise<ReconciliationRecord> {
		const account = await accountService.getAccount(accountId);
		if (!account) {
			throw new Error(`Account ${accountId} not found`);
		}

		const calculatedBalance = await this.calculateReconciliationBalance(accountId, {
			tolerance: 0.01,
			includePendingTransactions: false,
			autoResolveSmallDiscrepancies: false,
			autoResolveThreshold: 0.01
		});

		return await this.performReconciliation(accountId, calculatedBalance, {
			tolerance: 0.01,
			includePendingTransactions: false,
			autoResolveSmallDiscrepancies: false,
			reconciliationType: 'skipped',
			notes: notes ?? 'Skipped for now'
		});
	}

	/**
	 * Baseline reconciliation for newly created or imported accounts (idempotent).
	 */
	async bootstrapReconciliationForAccount(
		accountId: string,
		source: 'create' | 'import'
	): Promise<ReconciliationRecord | null> {
		const account = await accountService.getAccount(accountId);
		if (!account) {
			throw new Error(`Account ${accountId} not found`);
		}

		if (account.metadata?.lastReconciledDate) {
			return null;
		}

		const history = await this.getReconciliationHistory(accountId, 1);
		if (history.length > 0) {
			return null;
		}

		const notes =
			source === 'create'
				? 'Automatic baseline reconciliation on account creation'
				: 'Automatic baseline reconciliation on import';

		return await this.performAutomaticReconciliation(accountId, { notes });
	}

	// ============================================================================
	// DISCREPANCY DETECTION
	// ============================================================================

	/**
	 * Detect and create discrepancy records for a reconciliation
	 */
	private async detectAndCreateDiscrepancies(
		reconciliation: ReconciliationRecord,
		options: ReconciliationOptions
	): Promise<ReconciliationDiscrepancy[]> {
		const discrepancies: ReconciliationDiscrepancy[] = [];
		const discrepancyAmount = Math.abs(reconciliation.discrepancy);

		// Analyze transaction patterns to determine discrepancy type
		const transactions = await this.getTransactionsForReconciliation(
			reconciliation.accountId,
			options
		);

		// Check for common discrepancy patterns
		const potentialIssues = await this.analyzeTransactionPatterns(
			transactions,
			reconciliation.discrepancy
		);

		for (const issue of potentialIssues) {
			const discrepancy: ReconciliationDiscrepancy = {
				id: generateUUID(),
				accountId: reconciliation.accountId,
				discrepancyType: issue.type,
				amount: issue.amount,
				description: issue.description,
				suspectedTransactionId: issue.suspectedTransactionId,
				suggestedAction: issue.suggestedAction,
				severity: this.calculateDiscrepancySeverity(issue.amount, discrepancyAmount),
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			};

			discrepancies.push(discrepancy);
			await db.reconciliationDiscrepancies.add(discrepancy);
		}

		// If no specific issues found, create a general discrepancy
		if (discrepancies.length === 0) {
			const generalDiscrepancy: ReconciliationDiscrepancy = {
				id: generateUUID(),
				accountId: reconciliation.accountId,
				discrepancyType: 'unknown',
				amount: reconciliation.discrepancy,
				description: `Unknown discrepancy of ${reconciliation.discrepancy}`,
				suggestedAction: 'investigate',
				severity: this.calculateDiscrepancySeverity(reconciliation.discrepancy, discrepancyAmount),
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			};

			discrepancies.push(generalDiscrepancy);
			await db.reconciliationDiscrepancies.add(generalDiscrepancy);
		}

		return discrepancies;
	}

	/**
	 * Analyze transaction patterns to identify potential issues
	 */
	private async analyzeTransactionPatterns(
		transactions: Transaction[],
		discrepancy: number
	): Promise<
		Array<{
			type: ReconciliationDiscrepancy['discrepancyType'];
			amount: number;
			description: string;
			suspectedTransactionId?: string;
			suggestedAction: ReconciliationDiscrepancy['suggestedAction'];
		}>
	> {
		const issues: Array<{
			type: ReconciliationDiscrepancy['discrepancyType'];
			amount: number;
			description: string;
			suspectedTransactionId?: string;
			suggestedAction: ReconciliationDiscrepancy['suggestedAction'];
		}> = [];

		// Look for transactions matching the discrepancy amount
		const matchingTransactions = transactions.filter(
			(t) => Math.abs((t.amount || 0) - Math.abs(discrepancy)) < 0.01
		);

		if (matchingTransactions.length > 0) {
			for (const transaction of matchingTransactions) {
				issues.push({
					type: 'amount_mismatch',
					amount: transaction.amount || 0,
					description: `Transaction may have incorrect amount: ${transaction.description}`,
					suspectedTransactionId: transaction.id,
					suggestedAction: 'modify_transaction'
				});
			}
		}

		// Look for duplicate transactions (same amount, same date)
		const duplicateCandidates = new Map<string, Transaction[]>();
		for (const transaction of transactions) {
			const key = canonicalDuplicateKey(transaction);
			if (!duplicateCandidates.has(key)) {
				duplicateCandidates.set(key, []);
			}
			duplicateCandidates.get(key)!.push(transaction);
		}

		for (const [, duplicates] of duplicateCandidates) {
			if (duplicates.length > 1) {
				issues.push({
					type: 'duplicate_transaction',
					amount: duplicates[0].amount || 0,
					description: `Potential duplicate transactions found: ${duplicates[0].description}`,
					suspectedTransactionId: duplicates[1].id,
					suggestedAction: 'modify_transaction'
				});
			}
		}

		// Check for timing differences (transactions that may be in different periods)
		const pendingTransactions = transactions.filter((t) => t.status === 'pending');
		if (pendingTransactions.length > 0 && Math.abs(discrepancy) > 0) {
			issues.push({
				type: 'timing_difference',
				amount: discrepancy,
				description: `${pendingTransactions.length} pending transactions may cause timing differences`,
				suggestedAction: 'investigate'
			});
		}

		return issues;
	}

	/**
	 * Calculate discrepancy severity based on amount and context
	 */
	private calculateDiscrepancySeverity(
		amount: number,
		totalDiscrepancy: number
	): ReconciliationDiscrepancy['severity'] {
		const absAmount = Math.abs(amount);
		const percentage = totalDiscrepancy > 0 ? absAmount / totalDiscrepancy : 0;

		if (absAmount <= 0.01 && percentage < 0.1) {
			return 'low';
		} else if (absAmount <= 10 || percentage < 0.5) {
			return 'medium';
		} else {
			return 'high';
		}
	}

	// ============================================================================
	// RECONCILIATION HISTORY
	// ============================================================================

	/**
	 * Get reconciliation history for an account
	 *
	 * @param accountId - Account unique identifier
	 * @param limit - Maximum number of records to return
	 * @returns Promise resolving to array of reconciliation records
	 */
	async getReconciliationHistory(
		accountId: string,
		limit: number = 50
	): Promise<ReconciliationRecord[]> {
		return await db.reconciliationRecords
			.where('accountId')
			.equals(accountId)
			.and((record) => !record.deletedAt)
			.reverse()
			.sortBy('reconciledDate')
			.then((records) => records.slice(0, limit));
	}

	/**
	 * Get reconciliation summary for an account
	 */
	async getReconciliationSummary(accountId: string): Promise<ReconciliationSummary> {
		const account = await accountService.getAccount(accountId);
		if (!account) {
			throw new Error(`Account ${accountId} not found`);
		}

		const history = await this.getReconciliationHistory(accountId, 1);
		const lastReconciliation = history[0];
		const lastReconciledDate = account.metadata?.lastReconciledDate;

		let daysSinceLastReconciliation = 0;
		if (lastReconciledDate) {
			const daysDiff =
				(new Date().getTime() - new Date(lastReconciledDate).getTime()) / (1000 * 60 * 60 * 24);
			daysSinceLastReconciliation = Math.floor(daysDiff);
		} else {
			daysSinceLastReconciliation = Infinity;
		}

		const discrepancies = await db.reconciliationDiscrepancies
			.where('accountId')
			.equals(accountId)
			.and((d) => !d.deletedAt)
			.toArray();
		const unresolvedDiscrepancies = discrepancies.filter((d) => !d.resolvedAt);
		const ledgerBalance = await this.getLedgerBalance(accountId);
		const balanceGap = Math.abs(account.currentBalance - ledgerBalance);

		// Calculate reconciliation health
		let reconciliationHealth: ReconciliationSummary['reconciliationHealth'] = 'good';
		if (daysSinceLastReconciliation > 90 || unresolvedDiscrepancies.length > 5) {
			reconciliationHealth = 'critical';
		} else if (daysSinceLastReconciliation > 30 || unresolvedDiscrepancies.length > 2) {
			reconciliationHealth = 'warning';
		}

		return {
			accountId,
			accountName: account.name,
			lastReconciledDate,
			daysSinceLastReconciliation:
				daysSinceLastReconciliation === Infinity ? -1 : daysSinceLastReconciliation,
			currentBalance: account.currentBalance,
			ledgerBalance,
			balanceGap,
			lastReconciledBalance: lastReconciliation?.calculatedBalance || account.initialBalance,
			totalDiscrepancies: discrepancies.length,
			unresolvedDiscrepancies: unresolvedDiscrepancies.length,
			reconciliationHealth
		};
	}

	/**
	 * Get discrepancies for an account
	 */
	async getAccountDiscrepancies(accountId: string): Promise<ReconciliationDiscrepancy[]> {
		return await db.reconciliationDiscrepancies
			.where('accountId')
			.equals(accountId)
			.and((d) => !d.deletedAt)
			.reverse()
			.sortBy('createdAt');
	}

	/**
	 * Resolve a discrepancy
	 */
	async resolveDiscrepancy(discrepancyId: string, notes?: string): Promise<void> {
		const discrepancy = await db.reconciliationDiscrepancies.get(discrepancyId);
		if (!discrepancy) {
			throw new Error(`Discrepancy ${discrepancyId} not found`);
		}

		await db.reconciliationDiscrepancies.update(discrepancyId, {
			resolvedAt: new Date().toISOString()
		});
	}

	// ============================================================================
	// HELPER METHODS
	// ============================================================================

	/**
	 * Cleared-transaction ledger balance (same basis as reconciliation).
	 */
	async getLedgerBalance(
		accountId: string,
		options: Partial<ReconciliationOptions> = {}
	): Promise<number> {
		const validatedOptions = ReconciliationOptionsSchema.parse({
			includePendingTransactions: false,
			...options
		});
		return await this.calculateReconciliationBalance(accountId, validatedOptions);
	}

	/**
	 * Calculate balance for reconciliation purposes
	 */
	private async calculateReconciliationBalance(
		accountId: string,
		options: ReconciliationOptions
	): Promise<number> {
		if (options.includePendingTransactions) {
			// Include all transactions regardless of status
			return await accountService.recalculateAccountBalance(accountId);
		} else {
			// Only include cleared transactions
			const account = await accountService.getAccount(accountId);
			if (!account) return 0;

			const transactions = await db.getTransactionsByAccount(accountId);
			const clearedTransactions = transactions.filter((t) => t.status === 'cleared');

			let balance = account.initialBalance;
			for (const transaction of clearedTransactions) {
				const impact = accountService.getTransactionImpact(transaction, accountId);
				balance += impact;
			}

			return balance;
		}
	}

	/**
	 * Get transactions for reconciliation analysis
	 */
	private async getTransactionsForReconciliation(
		accountId: string,
		options: ReconciliationOptions
	): Promise<Transaction[]> {
		const allTransactions = await db.getTransactionsByAccount(accountId);

		if (options.includePendingTransactions) {
			return allTransactions;
		} else {
			return allTransactions.filter((t) => t.status === 'cleared');
		}
	}

	/**
	 * Check if transaction is considered reconciled
	 */
	private isTransactionReconciled(
		transaction: Transaction,
		options: ReconciliationOptions
	): boolean {
		if (options.includePendingTransactions) {
			return transaction.status !== 'cancelled';
		} else {
			return transaction.status === 'cleared';
		}
	}

	/**
	 * Auto-resolve small discrepancies
	 */
	private async autoResolveSmallDiscrepancy(reconciliation: ReconciliationRecord): Promise<void> {
		if (Math.abs(reconciliation.discrepancy) <= 0) {
			return;
		}

		const account = await accountService.getAccount(reconciliation.accountId);
		if (!account) {
			return;
		}

		const oldBalance = account.currentBalance ?? 0;
		const newBalance = oldBalance + reconciliation.discrepancy;

		await accountService.updateAccount(reconciliation.accountId, {
			currentBalance: newBalance
		});

		await dataCorrectionService.append([
			{
				accountId: reconciliation.accountId,
				field: 'account.currentBalance',
				oldValue: oldBalance,
				newValue: newBalance,
				source: 'reconciliation'
			}
		]);

		await db.reconciliationRecords.update(reconciliation.id, {
			balanceAdjustmentApplied: reconciliation.discrepancy,
			resolvedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}
}

/**
 * Singleton instance of ReconciliationService
 *
 * This is the main export for the reconciliation service. Use this instance
 * throughout the application for all reconciliation operations.
 *
 * @example
 * ```typescript
 * import { reconciliationService } from '$lib/core/services';
 *
 * const result = await reconciliationService.performReconciliation('account-123', 1500.00);
 * ```
 */
export const reconciliationService = new ReconciliationService();
