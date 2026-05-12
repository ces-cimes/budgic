import {
	db,
	validateTransactionGroup,
	validateNewGroupTransaction,
	generateUUID,
	calculateTransactionImpact
} from '$lib/core/db';
import type { Transaction } from '$lib/core/db';
import { accountService } from './account-service';
import { roundUpService } from './round-up-service';
import { crossRouteSyncService } from '../analytics/cross-route-sync-service';
import { balanceProjectionService } from '../analytics/balance-projection-service';
import { exchangeRateService } from './exchange-rate-service';
import { serviceCache } from './service-cache';
import { addDays, addWeeks, addMonths } from 'date-fns';
import { merchantProfileService } from '../intelligence/merchant-profile-service';
import { dataCorrectionService, type DataCorrectionAppend } from './data-correction-service';

/** Invalidate all derived caches that depend on the transaction table. */
async function invalidateTransactionCaches(): Promise<void> {
	serviceCache.invalidate('transactions:snapshot');
	serviceCache.invalidatePattern(/^prediction:spending:/);
	serviceCache.invalidatePattern(/^recurring:patterns:/);
	// Also clear the persisted IndexedDB pattern cache so a page-refresh cold
	// start picks up the mutation rather than serving a 24 h stale result.
	await db.recurringPatternsCache.delete('canonical');
}

type TransferDetails = NonNullable<Transaction['transferDetails']>;

function automationFromTransferFeeType(
	feeType: TransferDetails['feeType'] | undefined
): Transaction['automation'] | undefined {
	if (!feeType || feeType === 'early-withdrawal' || feeType === 'penalty') {
		return undefined;
	}
	return feeType === 'tax-withholding' ? 'tax-withholding' : 'transfer-fee';
}

export interface BulkOperationResult {
	success: number;
	failed: number;
	errors: Array<{ id: string; reason: string }>;
}

export type UpdateTransactionOptions = {
	dataCorrectionSource?: 'user' | 'reconciliation' | 'automation';
	/** MM CSV re-import full replace: normally `updateTransaction` omits timestamp fields */
	importReplaceTimestamps?: { createdAt: string; updatedAt: string };
};

class TransactionService {
	private readonly correctionTrackedKeys = new Set<string>([
		'amount',
		'currency',
		'accountId',
		'categoryId',
		'clearedDate',
		'plannedDate',
		'description',
		'status',
		'type',
		'importQuality',
		'automation',
		'memo',
		'notes',
		'accountAmount',
		'plannedAmount',
		'transferDetails'
	]);

	private async maybeRecordDataCorrections(
		prev: Transaction,
		updates: Partial<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
		next: Transaction,
		source: NonNullable<UpdateTransactionOptions['dataCorrectionSource']>
	): Promise<void> {
		const rows: DataCorrectionAppend[] = [];
		for (const key of Object.keys(updates)) {
			if (!this.correctionTrackedKeys.has(key)) continue;
			const k = key as keyof Transaction;
			const oldVal = prev[k];
			const newVal = next[k];
			let same = false;
			try {
				same = JSON.stringify(oldVal ?? null) === JSON.stringify(newVal ?? null);
			} catch {
				same = false;
			}
			if (same) continue;
			rows.push({
				transactionId: prev.id,
				field: key,
				oldValue: oldVal ?? null,
				newValue: newVal ?? null,
				source
			});
		}
		if (rows.length > 0) {
			await dataCorrectionService.append(rows);
		}
	}
	private async upsertInsight(payload: {
		type: 'overdraft_overdue' | 'repayment_overdue';
		title: string;
		message: string;
		severity?: 'info' | 'warning' | 'alert' | 'success';
		amount?: number;
	}): Promise<void> {
		const existing = await db.insights
			.where('type')
			.equals(payload.type)
			.filter((insight) => insight.isActive && !insight.deletedAt)
			.first();
		const now = new Date().toISOString();
		if (existing) {
			await db.insights.update(existing.id, {
				title: payload.title,
				message: payload.message,
				severity: payload.severity ?? 'warning',
				amount: payload.amount,
				updatedAt: now
			});
			return;
		}
		await db.insights.add({
			id: generateUUID(),
			type: payload.type,
			severity: payload.severity ?? 'warning',
			title: payload.title,
			message: payload.message,
			amount: payload.amount,
			actionable: true,
			isActive: true,
			createdAt: now,
			updatedAt: now,
			deletedAt: null
		});
	}

	private async handleOverdraftLifecycle(accountId: string): Promise<void> {
		const account = await accountService.getAccount(accountId);
		if (!account || account.type !== 'checking' || !account.overdraftFacility) return;
		if (account.currentBalance >= 0) return;
		if (!account.overdraftStartedAt) return;
		const graceDays = account.overdraftFacility.gracePeriodDays;
		const deadline = addDays(new Date(account.overdraftStartedAt), graceDays);
		if (deadline.getTime() <= Date.now()) {
			await this.upsertInsight({
				type: 'overdraft_overdue',
				title: 'Overdraft grace period expired',
				message: `${account.name} remains below zero past the overdraft grace period.`,
				severity: 'alert',
				amount: Math.abs(account.currentBalance)
			});
		}
	}

	private getInstallmentDate(
		startDate: Date,
		index: number,
		frequency: 'weekly' | 'biweekly' | 'monthly'
	): Date {
		if (frequency === 'weekly') return addWeeks(startDate, index);
		if (frequency === 'biweekly') return addWeeks(startDate, index * 2);
		return addMonths(startDate, index);
	}

	private async createRepaymentScheduleForCreditSpend(tx: Transaction): Promise<void> {
		if (tx.type !== 'expense' || tx.status !== 'cleared' || !tx.accountId) return;
		const creditAccount = await accountService.getAccount(tx.accountId);
		if (!creditAccount || creditAccount.type !== 'credit' || !creditAccount.repaymentConfig) return;
		let sourceChecking = creditAccount.linkedAccountId
			? ((await accountService.getAccount(creditAccount.linkedAccountId)) ?? undefined)
			: undefined;
		if (!sourceChecking) {
			const checkingAccounts = (await accountService.getAccounts()).filter(
				(a) => a.type === 'checking'
			);
			sourceChecking = checkingAccounts[0];
		}
		if (!sourceChecking) return;
		const cfg = creditAccount.repaymentConfig;
		const start = addDays(new Date(tx.clearedDate ?? tx.createdAt), cfg.gracePeriodDays);
		const installments = cfg.installmentCount;
		const perInstallment = Math.abs(tx.amount ?? 0) / installments;
		for (let i = 0; i < installments; i++) {
			const due = this.getInstallmentDate(start, i, cfg.installmentFrequency);
			await this.createTransaction(
				{
					type: 'transfer',
					status: 'planned',
					accountId: sourceChecking.id,
					currency: tx.currency,
					amount: -perInstallment,
					plannedDate: due.toISOString(),
					description: `Repayment for ${tx.description || 'credit purchase'}`,
					toAccountId: creditAccount.id,
					transferDetails: {
						toAccountId: creditAccount.id,
						transferAmount: perInstallment,
						feeAmount: 0
					},
					reference: `repayment:${tx.id}:${i + 1}/${installments}`
				},
				true
			);
		}
	}

	private async checkRepaymentOverdueInsights(): Promise<void> {
		const overdue = await db.transactions
			.where('status')
			.equals('planned')
			.filter(
				(tx) =>
					tx.type === 'transfer' &&
					(tx.reference?.startsWith('repayment:') ?? false) &&
					!!tx.plannedDate &&
					new Date(tx.plannedDate).getTime() < Date.now()
			)
			.toArray();
		if (overdue.length === 0) return;
		const amount = overdue.reduce(
			(sum, tx) => sum + Math.abs(tx.transferDetails?.transferAmount ?? tx.amount ?? 0),
			0
		);
		await this.upsertInsight({
			type: 'repayment_overdue',
			title: 'Repayment overdue',
			message: `You have ${overdue.length} overdue repayment(s).`,
			severity: 'alert',
			amount
		});
	}
	/**
	 * Calculate and cache currency conversions for a transaction
	 * This ensures balance calculations use the correct amounts in account currencies
	 * Returns only the fields that were calculated/modified
	 */
	private async calculateCurrencyConversions(
		transaction: Partial<Transaction>,
		accountId?: string
	): Promise<
		Partial<Pick<Transaction, 'accountAmount' | 'currencyConversion' | 'transferDetails'>>
	> {
		if (!accountId || !transaction.currency) {
			return transaction;
		}

		const account = await accountService.getAccount(accountId);
		if (!account) {
			return transaction;
		}

		const transactionCurrency = transaction.currency;
		const accountCurrency = account.currency;

		// If currencies match, no conversion needed
		if (transactionCurrency === accountCurrency) {
			// For non-transfers, set accountAmount = amount
			if (transaction.type !== 'transfer' && transaction.amount !== undefined) {
				return {
					accountAmount: transaction.amount
				};
			}
			return {};
		}

		// Currencies differ - need conversion
		const transactionDate = transaction.clearedDate
			? new Date(transaction.clearedDate)
			: transaction.plannedDate
				? new Date(transaction.plannedDate)
				: new Date();

		// For regular transactions (income, expense, adjustment)
		if (transaction.type !== 'transfer' && transaction.amount !== undefined) {
			const convertedAmount = await exchangeRateService.convertAmount(
				transaction.amount,
				transactionCurrency,
				accountCurrency,
				transactionDate
			);

			if (convertedAmount !== null) {
				return {
					accountAmount: convertedAmount,
					currencyConversion: {
						exchangeRate: convertedAmount / transaction.amount,
						conversionDate: transactionDate.toISOString(),
						sourceCurrency: transactionCurrency,
						targetCurrency: accountCurrency
					}
				};
			} else {
				// Conversion failed - use original amount and log warning
				console.warn(
					`Failed to convert ${transaction.amount} ${transactionCurrency} to ${accountCurrency} for transaction. ` +
						`Using original amount. Exchange rate may not be available for ${transactionDate.toISOString().substring(0, 10)}.`
				);
				return {};
			}
		}

		// For transfers, handle source account conversion
		if (transaction.type === 'transfer' && transaction.transferDetails) {
			const result: Partial<
				Pick<Transaction, 'accountAmount' | 'currencyConversion' | 'transferDetails'>
			> = {};

			// Convert transfer amount for source account
			if (transaction.transferDetails.transferAmount !== undefined) {
				const sourceConverted = await exchangeRateService.convertAmount(
					transaction.transferDetails.transferAmount,
					transactionCurrency,
					accountCurrency,
					transactionDate
				);

				if (sourceConverted !== null) {
					result.accountAmount = sourceConverted;
				}
			}

			// Convert fee amount if fee is on this account
			if (transaction.transferDetails.feeAmount && transaction.transferDetails.feeAmount > 0) {
				const feeAccountId = transaction.transferDetails.feeAccountId || accountId;
				if (feeAccountId === accountId) {
					const feeConverted = await exchangeRateService.convertAmount(
						transaction.transferDetails.feeAmount,
						transactionCurrency,
						accountCurrency,
						transactionDate
					);

					if (feeConverted !== null) {
						result.transferDetails = {
							...transaction.transferDetails,
							feeAccountAmount: feeConverted
						};
					}
				}
			}

			// Store conversion metadata
			if (result.accountAmount !== undefined) {
				result.currencyConversion = {
					exchangeRate: result.accountAmount / (transaction.transferDetails.transferAmount || 1),
					conversionDate: transactionDate.toISOString(),
					sourceCurrency: transactionCurrency,
					targetCurrency: accountCurrency
				};
			}

			return result;
		}

		return {};
	}

	/**
	 * Calculate currency conversions for transfer destination account
	 * Returns only the fields that were calculated/modified
	 */
	private async calculateTransferDestinationConversion(
		transaction: Partial<Transaction>
	): Promise<Partial<Pick<Transaction, 'transferDetails'>>> {
		if (transaction.type !== 'transfer' || !transaction.transferDetails) {
			return transaction;
		}

		const toAccountId = transaction.transferDetails.toAccountId;
		if (!toAccountId || !transaction.currency) {
			return transaction;
		}

		const toAccount = await accountService.getAccount(toAccountId);
		if (!toAccount) {
			return transaction;
		}

		const transactionCurrency = transaction.currency;
		const toAccountCurrency = toAccount.currency;

		// If currencies match, no conversion needed
		if (transactionCurrency === toAccountCurrency) {
			if (transaction.transferDetails.transferAmount !== undefined) {
				return {
					transferDetails: {
						...transaction.transferDetails,
						toAccountAmount: transaction.transferDetails.transferAmount
					}
				};
			}
			return {};
		}

		// Convert transfer amount to destination account currency
		const transactionDate = transaction.clearedDate
			? new Date(transaction.clearedDate)
			: transaction.plannedDate
				? new Date(transaction.plannedDate)
				: new Date();

		if (transaction.transferDetails.transferAmount !== undefined) {
			const toAccountConverted = await exchangeRateService.convertAmount(
				transaction.transferDetails.transferAmount,
				transactionCurrency,
				toAccountCurrency,
				transactionDate
			);

			if (toAccountConverted !== null) {
				return {
					transferDetails: {
						...transaction.transferDetails,
						toAccountAmount: toAccountConverted
					}
				};
			}
		}

		return {};
	}
	public get ready() {
		return db.isOpen();
	}

	public isLoading() {
		return !this.ready;
	}

	// ============================================================================
	// TRANSACTION MANAGEMENT
	// ============================================================================

	/**
	 * Create a new transaction
	 * @param skipBalanceRecalculation - If true, skip balance recalculation (useful for bulk imports)
	 */
	async createTransaction(
		data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
		skipBalanceRecalculation: boolean = false
	): Promise<Transaction> {
		// Calculate currency conversions before creating transaction
		// IMPORTANT: If accountAmount is already set (e.g., from import), preserve it and skip conversion
		let transactionData: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> = {
			...data
		};

		// Only calculate conversions if accountAmount is not already set
		// This preserves imported conversions from MM or other sources
		const hasAccountAmount = data.accountAmount !== undefined;
		const hasTransferAmounts =
			data.type === 'transfer' && data.transferDetails?.toAccountAmount !== undefined;

		if (!hasAccountAmount && data.accountId) {
			// Calculate conversion for source account only if not already provided
			const conversions = await this.calculateCurrencyConversions(transactionData, data.accountId);
			transactionData = { ...transactionData, ...conversions };
		}

		// For transfers, calculate conversion for destination account only if not already provided
		if (data.type === 'transfer' && data.transferDetails && !hasTransferAmounts) {
			const transferConversions =
				await this.calculateTransferDestinationConversion(transactionData);
			transactionData = { ...transactionData, ...transferConversions };

			// Also calculate fee conversion if fee account is different and not already provided
			if (
				transactionData.transferDetails?.feeAccountId &&
				transactionData.transferDetails.feeAccountId !== data.accountId &&
				transactionData.transferDetails.feeAmount &&
				transactionData.transferDetails.feeAmount > 0 &&
				transactionData.transferDetails.feeAccountAmount === undefined
			) {
				const feeAccount = await accountService.getAccount(
					transactionData.transferDetails.feeAccountId
				);
				if (
					feeAccount &&
					transactionData.currency &&
					feeAccount.currency !== transactionData.currency
				) {
					const transactionDate = data.clearedDate
						? new Date(data.clearedDate)
						: data.plannedDate
							? new Date(data.plannedDate)
							: new Date();

					const feeConverted = await exchangeRateService.convertAmount(
						transactionData.transferDetails.feeAmount,
						transactionData.currency,
						feeAccount.currency,
						transactionDate
					);

					if (feeConverted !== null && transactionData.transferDetails) {
						transactionData.transferDetails = {
							...transactionData.transferDetails,
							feeAccountAmount: feeConverted
						};
					}
				}
			}
		}

		const automationFromFee = automationFromTransferFeeType(
			transactionData.transferDetails?.feeType
		);

		const transaction: Transaction = {
			id: generateUUID(),
			...transactionData,
			automation: automationFromFee ?? transactionData.automation,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};

		await db.transactions.add(transaction);

		// Update account balance only if accountId is present and not skipping recalculation
		if (!skipBalanceRecalculation) {
			const affectedAccountIds: string[] = [];
			if (transaction.accountId) {
				await accountService.recalculateAccountBalance(transaction.accountId);
				affectedAccountIds.push(transaction.accountId);
			}

			// Handle transfers - both accounts are affected
			if (transaction.type === 'transfer' && transaction.transferDetails) {
				const toAccountId = transaction.transferDetails.toAccountId;
				if (toAccountId && !affectedAccountIds.includes(toAccountId)) {
					await accountService.recalculateAccountBalance(toAccountId);
					affectedAccountIds.push(toAccountId);
				}
			}

			// Clear balance projection cache for affected accounts
			if (affectedAccountIds.length > 0) {
				balanceProjectionService.clearCacheForAccounts(affectedAccountIds);
			}
		}

		// Emit sync event for transaction creation
		await crossRouteSyncService.onTransactionCreated(transaction);
		if (transaction.accountId) {
			await this.handleOverdraftLifecycle(transaction.accountId);
		}
		await this.createRepaymentScheduleForCreditSpend(transaction);
		await roundUpService.applyRulesForExpense(transaction);
		await this.checkRepaymentOverdueInsights();

		if (transaction.status === 'cleared') {
			merchantProfileService.onTransactionSaved(transaction).catch((err) =>
				console.warn('merchantProfileService.onTransactionSaved failed', err)
			);
		}

		await invalidateTransactionCaches();
		return transaction;
	}

	/**
	 * Get transaction by ID
	 */
	async getTransaction(id: string): Promise<Transaction | null> {
		return (await db.transactions.get(id)) || null;
	}

	/**
	 * Update transaction
	 */
	async updateTransaction(
		id: string,
		updates: Partial<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
		options?: UpdateTransactionOptions
	): Promise<Transaction> {
		const transaction = await db.transactions.get(id);
		if (!transaction) {
			throw new Error(`Transaction ${id} not found`);
		}

		// Check if amount, currency, or account changed - need to recalculate conversions
		// BUT: Only recalculate if accountAmount is not already set (preserve imported conversions)
		const needsRecalculation =
			(updates.amount !== undefined ||
				updates.currency !== undefined ||
				updates.accountId !== undefined ||
				updates.transferDetails !== undefined ||
				updates.clearedDate !== undefined ||
				updates.plannedDate !== undefined) &&
			// Only recalculate if accountAmount is not already set (preserve imported values)
			updates.accountAmount === undefined;

		let updatedData: Transaction = { ...transaction, ...updates };

		// Recalculate currency conversions if needed and not already provided
		if (needsRecalculation && updatedData.accountAmount === undefined) {
			const accountId = updatedData.accountId || transaction.accountId;
			if (accountId) {
				const conversions = await this.calculateCurrencyConversions(updatedData, accountId);
				updatedData = { ...updatedData, ...conversions };
			}

			// For transfers, recalculate destination conversion only if not already provided
			if (
				updatedData.type === 'transfer' &&
				updatedData.transferDetails &&
				updatedData.transferDetails.toAccountAmount === undefined
			) {
				const transferConversions = await this.calculateTransferDestinationConversion(updatedData);
				updatedData = { ...updatedData, ...transferConversions };
			}
		}

		const automationFromFee = automationFromTransferFeeType(updatedData.transferDetails?.feeType);

		let updatedTransaction: Transaction = {
			...updatedData,
			automation: automationFromFee ?? updatedData.automation,
			updatedAt: new Date().toISOString()
		};

		if (options?.importReplaceTimestamps) {
			updatedTransaction = {
				...updatedTransaction,
				createdAt: options.importReplaceTimestamps.createdAt,
				updatedAt: options.importReplaceTimestamps.updatedAt
			};
		}

		// Explicit undefined in `updates` means remove optional field (Dexie merge does not drop keys)
		for (const key of Object.keys(updates)) {
			if (
				Object.prototype.hasOwnProperty.call(updates, key) &&
				(updates as Record<string, unknown>)[key] === undefined
			) {
				delete (updatedTransaction as Record<string, unknown>)[key];
			}
		}

		if (options?.dataCorrectionSource) {
			await this.maybeRecordDataCorrections(
				transaction,
				updates,
				updatedTransaction,
				options.dataCorrectionSource
			);
		}

		await db.transactions.update(id, updatedTransaction);

		// Update account balance for both old and new accountId (if changed)
		const accountIds = new Set<string>();
		if (transaction.accountId) {
			accountIds.add(transaction.accountId);
		}
		if (updatedTransaction.accountId) {
			accountIds.add(updatedTransaction.accountId);
		}

		// Check if transfer details changed (affects multiple accounts)
		if (updatedTransaction.type === 'transfer' && updatedTransaction.transferDetails) {
			accountIds.add(updatedTransaction.transferDetails.toAccountId);
		} else if (transaction.type === 'transfer' && transaction.transferDetails) {
			accountIds.add(transaction.transferDetails.toAccountId);
		}

		for (const accountId of accountIds) {
			await accountService.recalculateAccountBalance(accountId);
		}

		// Clear balance projection cache for affected accounts
		if (accountIds.size > 0) {
			balanceProjectionService.clearCacheForAccounts(Array.from(accountIds));
		}

		// Emit sync event for transaction update
		await crossRouteSyncService.onTransactionUpdated(updatedTransaction, updates);
		if (updatedTransaction.accountId) {
			await this.handleOverdraftLifecycle(updatedTransaction.accountId);
		}
		if (transaction.status !== 'cleared' && updatedTransaction.status === 'cleared') {
			const existingRepayments = await db.transactions
				.where('reference')
				.startsWith(`repayment:${id}:`)
				.filter((t) => !t.deletedAt)
				.count();
			if (existingRepayments === 0) {
				await this.createRepaymentScheduleForCreditSpend(updatedTransaction);
			}
			await roundUpService.applyRulesForExpense(updatedTransaction);
		}
		await this.checkRepaymentOverdueInsights();

		if (updatedTransaction.status === 'cleared') {
			merchantProfileService.onTransactionSaved(updatedTransaction).catch((err) =>
				console.warn('merchantProfileService.onTransactionSaved failed', err)
			);
		}

		await invalidateTransactionCaches();
		return updatedTransaction;
	}

	/**
	 * Delete transaction (soft delete)
	 */
	async deleteTransaction(id: string): Promise<void> {
		const transaction = await db.transactions.get(id);
		if (!transaction) {
			throw new Error(`Transaction ${id} not found`);
		}

		await db.softDeleteTransaction(id);

		// Update account balance only if accountId is present
		const affectedAccountIds: string[] = [];
		if (transaction.accountId) {
			await accountService.recalculateAccountBalance(transaction.accountId);
			affectedAccountIds.push(transaction.accountId);
		}

		// Handle transfers - both accounts are affected
		if (transaction.type === 'transfer' && transaction.transferDetails) {
			const toAccountId = transaction.transferDetails.toAccountId;
			if (toAccountId && !affectedAccountIds.includes(toAccountId)) {
				await accountService.recalculateAccountBalance(toAccountId);
				affectedAccountIds.push(toAccountId);
			}
		}

		// Clear balance projection cache for affected accounts
		if (affectedAccountIds.length > 0) {
			balanceProjectionService.clearCacheForAccounts(affectedAccountIds);
		}

		// Emit sync event for transaction deletion
		await crossRouteSyncService.onTransactionDeleted(id);
		await invalidateTransactionCaches();
	}

	/**
	 * Bulk update transactions (extended MVP supports categoryId, status, and accountId)
	 */
	async bulkUpdateTransactions(
		ids: string[],
		updates: Partial<Pick<Transaction, 'categoryId' | 'status' | 'accountId'>>
	): Promise<BulkOperationResult> {
		const uniqueIds = [...new Set(ids)];
		const result: BulkOperationResult = { success: 0, failed: 0, errors: [] };

		if (uniqueIds.length === 0) {
			return result;
		}

		const allowedUpdates: Partial<Pick<Transaction, 'categoryId' | 'status' | 'accountId'>> = {};
		if (updates.categoryId !== undefined) {
			allowedUpdates.categoryId = updates.categoryId;
		}
		if (updates.status !== undefined) {
			allowedUpdates.status = updates.status;
		}
		if (updates.accountId !== undefined) {
			allowedUpdates.accountId = updates.accountId;
		}

		if (Object.keys(allowedUpdates).length === 0) {
			throw new Error(
				'Bulk update requires at least one supported field (categoryId, status, or accountId)'
			);
		}

		const now = new Date().toISOString();
		const targets = await db.transactions.where('id').anyOf(uniqueIds).toArray();
		const targetById = new Map(targets.map((tx) => [tx.id, tx]));
		const accountIds = new Set<string>();
		const updatedTransactions: Transaction[] = [];

		for (const id of uniqueIds) {
			if (!targetById.has(id)) {
				result.failed += 1;
				result.errors.push({ id, reason: 'Transaction not found' });
			}
		}

		// No Dexie transaction wrapper: conversion reads accounts / exchangeRates / preferences, which must
		// not run inside an rw scope locked to `transactions` only (IndexedDB NotFoundError).
		for (const tx of targets) {
			try {
				let updatedTransaction: Transaction = {
					...tx,
					...allowedUpdates,
					updatedAt: now
				};

				if (allowedUpdates.accountId !== undefined && allowedUpdates.accountId) {
					const conversionUpdates = await this.calculateCurrencyConversions(
						updatedTransaction,
						allowedUpdates.accountId
					);
					updatedTransaction = { ...updatedTransaction, ...conversionUpdates };
				}

				await db.transactions.update(tx.id, updatedTransaction);
				updatedTransactions.push(updatedTransaction);
				result.success += 1;
			} catch (error) {
				result.failed += 1;
				result.errors.push({
					id: tx.id,
					reason: error instanceof Error ? error.message : 'Unknown bulk update error'
				});
			}
		}

		for (const tx of targets) {
			if (tx.accountId) accountIds.add(tx.accountId);
			if (allowedUpdates.accountId) accountIds.add(allowedUpdates.accountId);
			if (tx.type === 'transfer' && tx.transferDetails?.toAccountId) {
				accountIds.add(tx.transferDetails.toAccountId);
			}
		}

		for (const accountId of accountIds) {
			await accountService.recalculateAccountBalance(accountId);
		}

		if (accountIds.size > 0) {
			balanceProjectionService.clearCacheForAccounts(Array.from(accountIds));
		}

		for (const tx of updatedTransactions) {
			await crossRouteSyncService.onTransactionUpdated(tx, allowedUpdates);
		}

		return result;
	}

	/**
	 * Bulk replace literal text in transaction descriptions (all occurrences per row).
	 * Does not affect balances; skips DB write when the description is unchanged.
	 */
	async bulkReplaceTransactionDescriptions(
		ids: string[],
		find: string,
		replaceWith: string
	): Promise<BulkOperationResult> {
		const trimmedFind = find.trim();
		if (!trimmedFind) {
			throw new Error('Find text cannot be empty');
		}

		const uniqueIds = [...new Set(ids)];
		const result: BulkOperationResult = { success: 0, failed: 0, errors: [] };

		if (uniqueIds.length === 0) {
			return result;
		}

		const now = new Date().toISOString();
		const targets = await db.transactions.where('id').anyOf(uniqueIds).toArray();
		const targetById = new Map(targets.map((tx) => [tx.id, tx]));
		const updatedTransactions: Transaction[] = [];

		for (const id of uniqueIds) {
			if (!targetById.has(id)) {
				result.failed += 1;
				result.errors.push({ id, reason: 'Transaction not found' });
			}
		}

		await db.transaction('rw', db.transactions, async () => {
			for (const tx of targets) {
				try {
					const current = tx.description ?? '';
					if (!current.includes(trimmedFind)) {
						continue;
					}
					const nextDescription = current.split(trimmedFind).join(replaceWith);
					const updatedTransaction: Transaction = {
						...tx,
						description: nextDescription,
						updatedAt: now
					};
					await db.transactions.update(tx.id, updatedTransaction);
					updatedTransactions.push(updatedTransaction);
					result.success += 1;
				} catch (error) {
					result.failed += 1;
					result.errors.push({
						id: tx.id,
						reason: error instanceof Error ? error.message : 'Unknown bulk description error'
					});
				}
			}
		});

		for (const tx of updatedTransactions) {
			await crossRouteSyncService.onTransactionUpdated(tx, { description: tx.description });
		}

		return result;
	}

	/**
	 * Set every selected transaction description to the same value (including empty string).
	 */
	async bulkSetTransactionDescriptions(
		ids: string[],
		description: string
	): Promise<BulkOperationResult> {
		const uniqueIds = [...new Set(ids)];
		const result: BulkOperationResult = { success: 0, failed: 0, errors: [] };

		if (uniqueIds.length === 0) {
			return result;
		}

		const now = new Date().toISOString();
		const targets = await db.transactions.where('id').anyOf(uniqueIds).toArray();
		const targetById = new Map(targets.map((tx) => [tx.id, tx]));
		const updatedTransactions: Transaction[] = [];

		for (const id of uniqueIds) {
			if (!targetById.has(id)) {
				result.failed += 1;
				result.errors.push({ id, reason: 'Transaction not found' });
			}
		}

		await db.transaction('rw', db.transactions, async () => {
			for (const tx of targets) {
				try {
					const current = tx.description ?? '';
					if (current === description) {
						continue;
					}
					const updatedTransaction: Transaction = {
						...tx,
						description,
						updatedAt: now
					};
					await db.transactions.update(tx.id, updatedTransaction);
					updatedTransactions.push(updatedTransaction);
					result.success += 1;
				} catch (error) {
					result.failed += 1;
					result.errors.push({
						id: tx.id,
						reason: error instanceof Error ? error.message : 'Unknown bulk description set error'
					});
				}
			}
		});

		for (const tx of updatedTransactions) {
			await crossRouteSyncService.onTransactionUpdated(tx, { description: tx.description });
		}

		return result;
	}

	/**
	 * Shift cleared and/or planned dates by a whole number of calendar days.
	 * Recalculates currency fields when needed (same rules as single update) and recalculates balances once per affected account.
	 */
	async bulkShiftTransactionDates(
		ids: string[],
		shiftDays: number,
		applyTo: 'cleared' | 'planned' | 'both'
	): Promise<BulkOperationResult> {
		if (!Number.isFinite(shiftDays) || !Number.isInteger(shiftDays)) {
			throw new Error('Shift days must be a whole number');
		}
		if (shiftDays === 0) {
			throw new Error('Shift days cannot be zero');
		}

		const uniqueIds = [...new Set(ids)];
		const result: BulkOperationResult = { success: 0, failed: 0, errors: [] };

		if (uniqueIds.length === 0) {
			return result;
		}

		const now = new Date().toISOString();
		const targets = await db.transactions.where('id').anyOf(uniqueIds).toArray();
		const targetById = new Map(targets.map((tx) => [tx.id, tx]));
		const accountIds = new Set<string>();
		const updatedRows: Array<{
			tx: Transaction;
			patch: Partial<Pick<Transaction, 'clearedDate' | 'plannedDate'>>;
		}> = [];

		for (const id of uniqueIds) {
			if (!targetById.has(id)) {
				result.failed += 1;
				result.errors.push({ id, reason: 'Transaction not found' });
			}
		}

		function shiftIso(dateStr: string): string {
			const d = new Date(dateStr);
			if (Number.isNaN(d.getTime())) {
				throw new Error('Invalid date');
			}
			return addDays(d, shiftDays).toISOString();
		}

		// No Dexie transaction wrapper: FX helpers read other object stores (see bulkUpdateTransactions).
		for (const tx of targets) {
			try {
				const patch: Partial<Pick<Transaction, 'clearedDate' | 'plannedDate'>> = {};
				if (applyTo === 'cleared' || applyTo === 'both') {
					if (tx.clearedDate) {
						patch.clearedDate = shiftIso(tx.clearedDate);
					}
				}
				if (applyTo === 'planned' || applyTo === 'both') {
					if (tx.plannedDate) {
						patch.plannedDate = shiftIso(tx.plannedDate);
					}
				}
				if (Object.keys(patch).length === 0) {
					continue;
				}

				let updatedData: Transaction = { ...tx, ...patch };
				const needsRecalculation =
					(patch.clearedDate !== undefined || patch.plannedDate !== undefined) &&
					updatedData.accountAmount === undefined;

				if (needsRecalculation) {
					const accountId = updatedData.accountId || tx.accountId;
					if (accountId) {
						const conversions = await this.calculateCurrencyConversions(updatedData, accountId);
						updatedData = { ...updatedData, ...conversions };
					}
					if (
						updatedData.type === 'transfer' &&
						updatedData.transferDetails &&
						updatedData.transferDetails.toAccountAmount === undefined
					) {
						const transferConversions =
							await this.calculateTransferDestinationConversion(updatedData);
						updatedData = { ...updatedData, ...transferConversions };
					}
				}

				const updatedTransaction: Transaction = {
					...updatedData,
					updatedAt: now
				};

				await db.transactions.update(tx.id, updatedTransaction);
				updatedRows.push({ tx: updatedTransaction, patch });
				result.success += 1;
			} catch (error) {
				result.failed += 1;
				result.errors.push({
					id: tx.id,
					reason: error instanceof Error ? error.message : 'Unknown bulk date shift error'
				});
			}
		}

		for (const tx of targets) {
			if (tx.accountId) accountIds.add(tx.accountId);
			if (tx.type === 'transfer' && tx.transferDetails?.toAccountId) {
				accountIds.add(tx.transferDetails.toAccountId);
			}
		}

		for (const accountId of accountIds) {
			await accountService.recalculateAccountBalance(accountId);
		}
		if (accountIds.size > 0) {
			balanceProjectionService.clearCacheForAccounts(Array.from(accountIds));
		}

		for (const { tx, patch } of updatedRows) {
			await crossRouteSyncService.onTransactionUpdated(tx, patch);
		}

		return result;
	}

	/** `YYYY-MM-DD` from a date input → ISO string (local noon). */
	private calendarDateInputToIso(dateInput: string): string {
		const trimmed = dateInput.trim();
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
		if (!m) {
			throw new Error('Invalid date (use YYYY-MM-DD)');
		}
		const y = parseInt(m[1], 10);
		const mo = parseInt(m[2], 10) - 1;
		const da = parseInt(m[3], 10);
		const d = new Date(y, mo, da, 12, 0, 0, 0);
		if (Number.isNaN(d.getTime())) {
			throw new Error('Invalid calendar date');
		}
		return d.toISOString();
	}

	/**
	 * Set cleared and/or planned date to the same calendar day for every selected row.
	 * `calendarDate` must be `YYYY-MM-DD`. Recalculates conversions when dates drive FX.
	 */
	async bulkSetTransactionDates(
		ids: string[],
		calendarDate: string,
		applyTo: 'cleared' | 'planned' | 'both'
	): Promise<BulkOperationResult> {
		const iso = this.calendarDateInputToIso(calendarDate);

		const uniqueIds = [...new Set(ids)];
		const result: BulkOperationResult = { success: 0, failed: 0, errors: [] };

		if (uniqueIds.length === 0) {
			return result;
		}

		const now = new Date().toISOString();
		const targets = await db.transactions.where('id').anyOf(uniqueIds).toArray();
		const targetById = new Map(targets.map((tx) => [tx.id, tx]));
		const accountIds = new Set<string>();
		const updatedRows: Array<{
			tx: Transaction;
			patch: Partial<Pick<Transaction, 'clearedDate' | 'plannedDate'>>;
		}> = [];

		for (const id of uniqueIds) {
			if (!targetById.has(id)) {
				result.failed += 1;
				result.errors.push({ id, reason: 'Transaction not found' });
			}
		}

		for (const tx of targets) {
			try {
				const patch: Partial<Pick<Transaction, 'clearedDate' | 'plannedDate'>> = {};
				if (applyTo === 'cleared' || applyTo === 'both') {
					patch.clearedDate = iso;
				}
				if (applyTo === 'planned' || applyTo === 'both') {
					patch.plannedDate = iso;
				}

				let updatedData: Transaction = { ...tx, ...patch };
				const needsRecalculation =
					(patch.clearedDate !== undefined || patch.plannedDate !== undefined) &&
					updatedData.accountAmount === undefined;

				if (needsRecalculation) {
					const accountId = updatedData.accountId || tx.accountId;
					if (accountId) {
						const conversions = await this.calculateCurrencyConversions(updatedData, accountId);
						updatedData = { ...updatedData, ...conversions };
					}
					if (
						updatedData.type === 'transfer' &&
						updatedData.transferDetails &&
						updatedData.transferDetails.toAccountAmount === undefined
					) {
						const transferConversions =
							await this.calculateTransferDestinationConversion(updatedData);
						updatedData = { ...updatedData, ...transferConversions };
					}
				}

				const updatedTransaction: Transaction = {
					...updatedData,
					updatedAt: now
				};

				await db.transactions.update(tx.id, updatedTransaction);
				updatedRows.push({ tx: updatedTransaction, patch });
				result.success += 1;
			} catch (error) {
				result.failed += 1;
				result.errors.push({
					id: tx.id,
					reason: error instanceof Error ? error.message : 'Unknown bulk set date error'
				});
			}
		}

		for (const tx of targets) {
			if (tx.accountId) accountIds.add(tx.accountId);
			if (tx.type === 'transfer' && tx.transferDetails?.toAccountId) {
				accountIds.add(tx.transferDetails.toAccountId);
			}
		}

		for (const accountId of accountIds) {
			await accountService.recalculateAccountBalance(accountId);
		}
		if (accountIds.size > 0) {
			balanceProjectionService.clearCacheForAccounts(Array.from(accountIds));
		}

		for (const { tx, patch } of updatedRows) {
			await crossRouteSyncService.onTransactionUpdated(tx, patch);
		}

		return result;
	}

	/**
	 * Append, prepend, literal find/replace, or set entire notes or reference.
	 */
	async bulkMutateNotesOrReference(
		ids: string[],
		options: {
			field: 'notes' | 'reference';
			mode: 'append' | 'prepend' | 'replace' | 'set';
			text: string;
			find?: string;
		}
	): Promise<BulkOperationResult> {
		const { field, mode, text, find } = options;
		const trimmedFind = find?.trim() ?? '';

		if (mode === 'replace') {
			if (!trimmedFind) {
				throw new Error('Find text cannot be empty for replace mode');
			}
		} else if (mode === 'set') {
			// text may be empty (clear field)
		} else if (!text.trim()) {
			throw new Error('Enter text to append or prepend');
		}

		const uniqueIds = [...new Set(ids)];
		const result: BulkOperationResult = { success: 0, failed: 0, errors: [] };

		if (uniqueIds.length === 0) {
			return result;
		}

		const now = new Date().toISOString();
		const targets = await db.transactions.where('id').anyOf(uniqueIds).toArray();
		const targetById = new Map(targets.map((tx) => [tx.id, tx]));
		const updatedTransactions: Transaction[] = [];

		for (const id of uniqueIds) {
			if (!targetById.has(id)) {
				result.failed += 1;
				result.errors.push({ id, reason: 'Transaction not found' });
			}
		}

		await db.transaction('rw', db.transactions, async () => {
			for (const tx of targets) {
				try {
					const current = (field === 'notes' ? tx.notes : tx.reference) ?? '';
					let next = current;

					if (mode === 'set') {
						next = text;
					} else if (mode === 'append') {
						const t = text;
						if (!t) continue;
						const sep = field === 'notes' && current ? '\n' : '';
						next = current + sep + t;
					} else if (mode === 'prepend') {
						const t = text;
						if (!t) continue;
						const sep = field === 'notes' && current ? '\n' : '';
						next = t + sep + current;
					} else {
						if (!current.includes(trimmedFind)) {
							continue;
						}
						next = current.split(trimmedFind).join(text);
					}

					if (next === current) {
						continue;
					}

					const updatedTransaction: Transaction = {
						...tx,
						...(field === 'notes' ? { notes: next } : { reference: next }),
						updatedAt: now
					};
					await db.transactions.update(tx.id, updatedTransaction);
					updatedTransactions.push(updatedTransaction);
					result.success += 1;
				} catch (error) {
					result.failed += 1;
					result.errors.push({
						id: tx.id,
						reason: error instanceof Error ? error.message : 'Unknown bulk notes/reference error'
					});
				}
			}
		});

		for (const tx of updatedTransactions) {
			const syncPatch = field === 'notes' ? { notes: tx.notes } : { reference: tx.reference };
			await crossRouteSyncService.onTransactionUpdated(tx, syncPatch);
		}

		return result;
	}

	/**
	 * Apply a fixed delta, percent change, or set every row's `amount` to the same value (income / expense / adjustment only).
	 * Drops cached conversion fields so `accountAmount` is recomputed from exchange rates. Transfers are rejected per row.
	 */
	async bulkAdjustTransactionAmounts(
		ids: string[],
		options: { mode: 'fixed' | 'percent' | 'absolute'; value: number }
	): Promise<BulkOperationResult> {
		const { mode, value } = options;
		if (!Number.isFinite(value)) {
			throw new Error('Amount value must be a finite number');
		}
		if (mode !== 'absolute' && value === 0) {
			throw new Error(
				mode === 'fixed'
					? 'Fixed adjustment must be a non-zero finite number'
					: 'Percent adjustment must be a non-zero finite number'
			);
		}

		const uniqueIds = [...new Set(ids)];
		const result: BulkOperationResult = { success: 0, failed: 0, errors: [] };

		if (uniqueIds.length === 0) {
			return result;
		}

		const now = new Date().toISOString();
		const targets = await db.transactions.where('id').anyOf(uniqueIds).toArray();
		const targetById = new Map(targets.map((tx) => [tx.id, tx]));
		const accountIds = new Set<string>();
		const updatedTransactions: Transaction[] = [];

		for (const id of uniqueIds) {
			if (!targetById.has(id)) {
				result.failed += 1;
				result.errors.push({ id, reason: 'Transaction not found' });
			}
		}

		// No Dexie transaction wrapper: calculateCurrencyConversions touches other stores.
		for (const tx of targets) {
			try {
				if (tx.type === 'transfer') {
					result.failed += 1;
					result.errors.push({
						id: tx.id,
						reason: 'Bulk amount change does not apply to transfers'
					});
					continue;
				}

				const baseAmount = tx.amount;
				if (typeof baseAmount !== 'number' || !Number.isFinite(baseAmount)) {
					result.failed += 1;
					result.errors.push({ id: tx.id, reason: 'Transaction has no valid amount' });
					continue;
				}

				const newAmount =
					mode === 'absolute'
						? value
						: mode === 'fixed'
							? baseAmount + value
							: baseAmount * (1 + value / 100);
				if (!Number.isFinite(newAmount)) {
					result.failed += 1;
					result.errors.push({ id: tx.id, reason: 'Adjusted amount is not a valid number' });
					continue;
				}
				if (newAmount === baseAmount) {
					continue;
				}

				const { accountAmount: _acc, currencyConversion: _conv, ...txBase } = tx;
				let updatedData: Transaction = {
					...txBase,
					amount: newAmount,
					updatedAt: now
				};

				const accountId = updatedData.accountId;
				if (accountId) {
					const conversions = await this.calculateCurrencyConversions(updatedData, accountId);
					updatedData = { ...updatedData, ...conversions };
				}

				await db.transactions.update(tx.id, updatedData);
				updatedTransactions.push(updatedData);
				result.success += 1;
			} catch (error) {
				result.failed += 1;
				result.errors.push({
					id: tx.id,
					reason: error instanceof Error ? error.message : 'Unknown bulk amount error'
				});
			}
		}

		for (const tx of updatedTransactions) {
			if (tx.accountId) accountIds.add(tx.accountId);
		}

		for (const accountId of accountIds) {
			await accountService.recalculateAccountBalance(accountId);
		}
		if (accountIds.size > 0) {
			balanceProjectionService.clearCacheForAccounts(Array.from(accountIds));
		}

		for (const tx of updatedTransactions) {
			await crossRouteSyncService.onTransactionUpdated(tx, {
				amount: tx.amount,
				accountAmount: tx.accountAmount,
				currencyConversion: tx.currencyConversion
			});
		}

		return result;
	}

	/**
	 * Set transaction currency for non-transfer rows. Clears cached conversion so amounts are recomputed.
	 */
	async bulkSetTransactionCurrency(ids: string[], currency: string): Promise<BulkOperationResult> {
		const trimmed = currency.trim();
		if (!trimmed) {
			throw new Error('Currency code cannot be empty');
		}

		const uniqueIds = [...new Set(ids)];
		const result: BulkOperationResult = { success: 0, failed: 0, errors: [] };

		if (uniqueIds.length === 0) {
			return result;
		}

		const now = new Date().toISOString();
		const targets = await db.transactions.where('id').anyOf(uniqueIds).toArray();
		const targetById = new Map(targets.map((tx) => [tx.id, tx]));
		const accountIds = new Set<string>();
		const updatedTransactions: Transaction[] = [];

		for (const id of uniqueIds) {
			if (!targetById.has(id)) {
				result.failed += 1;
				result.errors.push({ id, reason: 'Transaction not found' });
			}
		}

		// No Dexie transaction wrapper: calculateCurrencyConversions touches other stores.
		for (const tx of targets) {
			try {
				if (tx.type === 'transfer') {
					result.failed += 1;
					result.errors.push({
						id: tx.id,
						reason: 'Bulk currency change does not apply to transfers'
					});
					continue;
				}

				if (tx.currency === trimmed) {
					continue;
				}

				const { accountAmount: _acc, currencyConversion: _conv, ...txBase } = tx;
				let updatedData: Transaction = {
					...txBase,
					currency: trimmed,
					updatedAt: now
				};

				const accountId = updatedData.accountId;
				if (accountId) {
					const conversions = await this.calculateCurrencyConversions(updatedData, accountId);
					updatedData = { ...updatedData, ...conversions };
				}

				await db.transactions.update(tx.id, updatedData);
				updatedTransactions.push(updatedData);
				result.success += 1;
			} catch (error) {
				result.failed += 1;
				result.errors.push({
					id: tx.id,
					reason: error instanceof Error ? error.message : 'Unknown bulk currency error'
				});
			}
		}

		for (const tx of updatedTransactions) {
			if (tx.accountId) accountIds.add(tx.accountId);
		}

		for (const accountId of accountIds) {
			await accountService.recalculateAccountBalance(accountId);
		}
		if (accountIds.size > 0) {
			balanceProjectionService.clearCacheForAccounts(Array.from(accountIds));
		}

		for (const tx of updatedTransactions) {
			await crossRouteSyncService.onTransactionUpdated(tx, {
				currency: tx.currency,
				accountAmount: tx.accountAmount,
				currencyConversion: tx.currencyConversion
			});
		}

		return result;
	}

	/**
	 * Bulk delete transactions (soft delete)
	 */
	async bulkDeleteTransactions(ids: string[]): Promise<BulkOperationResult> {
		const uniqueIds = [...new Set(ids)];
		const result: BulkOperationResult = { success: 0, failed: 0, errors: [] };

		if (uniqueIds.length === 0) {
			return result;
		}

		const now = new Date().toISOString();
		const targets = await db.transactions.where('id').anyOf(uniqueIds).toArray();
		const targetById = new Map(targets.map((tx) => [tx.id, tx]));
		const accountIds = new Set<string>();
		const deletedIds: string[] = [];

		for (const id of uniqueIds) {
			if (!targetById.has(id)) {
				result.failed += 1;
				result.errors.push({ id, reason: 'Transaction not found' });
			}
		}

		for (const tx of targets) {
			if (tx.accountId) accountIds.add(tx.accountId);
			if (tx.type === 'transfer' && tx.transferDetails?.toAccountId) {
				accountIds.add(tx.transferDetails.toAccountId);
			}
		}

		await db.transaction('rw', db.transactions, async () => {
			for (const tx of targets) {
				try {
					await db.transactions.update(tx.id, {
						deletedAt: now,
						updatedAt: now
					});
					deletedIds.push(tx.id);
					result.success += 1;
				} catch (error) {
					result.failed += 1;
					result.errors.push({
						id: tx.id,
						reason: error instanceof Error ? error.message : 'Unknown bulk delete error'
					});
				}
			}
		});

		for (const accountId of accountIds) {
			await accountService.recalculateAccountBalance(accountId);
		}

		if (accountIds.size > 0) {
			balanceProjectionService.clearCacheForAccounts(Array.from(accountIds));
		}

		for (const id of deletedIds) {
			await crossRouteSyncService.onTransactionDeleted(id);
		}

		return result;
	}

	/**
	 * Get all transactions (excludes undefined from soft-delete reading hook)
	 */
	async getAllTransactions(): Promise<Transaction[]> {
		const arr = await db.transactions.toArray();
		return arr.filter((t): t is Transaction => t != null);
	}

	/**
	 * Get transactions by account
	 */
	async getTransactionsByAccount(accountId: string): Promise<Transaction[]> {
		const arr = await db.transactions.where('accountId').equals(accountId).toArray();
		return arr.filter((t): t is Transaction => t != null);
	}

	/**
	 * Get transactions by category
	 */
	async getTransactionsByCategory(categoryId: string): Promise<Transaction[]> {
		const arr = await db.transactions.where('categoryId').equals(categoryId).toArray();
		return arr.filter((t): t is Transaction => t != null);
	}

	/**
	 * Get transactions by date range
	 */
	async getTransactionsByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
		try {
			const arr = await db.transactions.where('clearedDate').between(startDate, endDate).toArray();
			return arr.filter((t): t is Transaction => t != null);
		} catch (error) {
			console.error('[TransactionService] Error in getTransactionsByDateRange:', error);
			throw error;
		}
	}

	/**
	 * Get transactions by status
	 */
	async getTransactionsByStatus(status: Transaction['status']): Promise<Transaction[]> {
		try {
			const arr = await db.transactions.where('status').equals(status).toArray();
			return arr.filter((t): t is Transaction => t != null);
		} catch (error) {
			console.error('[TransactionService] Error in getTransactionsByStatus:', error);
			throw error;
		}
	}

	/**
	 * Get planned transactions whose plannedDate falls within the range (inclusive).
	 * Used for Plan Allowance week view projected spending.
	 */
	async getPlannedTransactionsByDateRange(
		startDate: string,
		endDate: string
	): Promise<Transaction[]> {
		try {
			const arr = await db.transactions
				.where('[plannedDate+status]')
				.between([startDate, 'planned'], [endDate, 'planned'], true, true)
				.toArray();
			return arr.filter((t): t is Transaction => t != null && !t.deletedAt);
		} catch (error) {
			console.error('[TransactionService] Error in getPlannedTransactionsByDateRange:', error);
			return [];
		}
	}

	// ============================================================================
	// TRANSACTION GROUP MANAGEMENT (formerly split transactions)
	// ============================================================================

	/**
	 * Create a new transaction group
	 */
	async createTransactionGroup(
		groupTransactions: Array<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
		groupName?: string
	): Promise<string> {
		if (groupTransactions.length === 0) {
			throw new Error('At least one transaction is required');
		}

		// Validate the group transactions
		const validation = validateNewGroupTransaction(groupTransactions);
		if (!validation.isValid) {
			throw new Error(`Invalid transaction group: ${validation.errors.join(', ')}`);
		}

		const groupId = await db.createTransactionGroup(groupTransactions, groupName);

		// Update account balances for affected accounts (filter out null accountIds)
		const accountIds = new Set(
			groupTransactions
				.map((tx) => tx.accountId)
				.filter((id): id is string => id !== undefined && id !== null)
		);

		// Also check for transfer destinations
		for (const tx of groupTransactions) {
			if (tx.type === 'transfer' && tx.transferDetails?.toAccountId) {
				accountIds.add(tx.transferDetails.toAccountId);
			}
		}

		for (const accountId of accountIds) {
			await accountService.recalculateAccountBalance(accountId);
		}

		// Clear balance projection cache for affected accounts
		if (accountIds.size > 0) {
			balanceProjectionService.clearCacheForAccounts(Array.from(accountIds));
		}

		const savedGroup = await db.transactions.where('groupId').equals(groupId).toArray();
		for (const t of savedGroup) {
			if (t.status === 'cleared') {
				merchantProfileService.onTransactionSaved(t).catch((err) =>
					console.warn('merchantProfileService.onTransactionSaved failed', err)
				);
			}
		}

		return groupId;
	}

	/**
	 * Update a transaction group
	 */
	async updateTransactionGroup(
		groupId: string,
		updates: {
			sharedFields?: Partial<
				Pick<
					Transaction,
					| 'type'
					| 'status'
					| 'currency'
					| 'categoryId'
					| 'plannedDate'
					| 'clearedDate'
					| 'recurrenceRule'
					| 'parentRecurrenceId'
					| 'reference'
					| 'notes'
					| 'importSource'
					| 'toAccountId'
					| 'groupName'
				>
			>;
			individualUpdates?: Array<{
				id: string;
				amount?: number;
				description?: string;
				accountId?: string;
			}>;
		}
	): Promise<void> {
		await db.updateTransactionGroup(groupId, updates);

		// Update account balances for affected accounts
		const accountIds = new Set<string>();

		// Get existing transactions to check for transfers
		const existingTransactions = await db.getGroupTransactions(groupId);
		for (const tx of existingTransactions) {
			if (tx.accountId) {
				accountIds.add(tx.accountId);
			}
			if (tx.type === 'transfer' && tx.transferDetails?.toAccountId) {
				accountIds.add(tx.transferDetails.toAccountId);
			}
		}

		if (updates.individualUpdates) {
			for (const update of updates.individualUpdates) {
				if (update.accountId) {
					accountIds.add(update.accountId);
				}
			}
		}

		for (const accountId of accountIds) {
			await accountService.recalculateAccountBalance(accountId);
		}

		// Clear balance projection cache for affected accounts
		if (accountIds.size > 0) {
			balanceProjectionService.clearCacheForAccounts(Array.from(accountIds));
		}
	}

	/**
	 * Delete a transaction group
	 */
	async deleteTransactionGroup(groupId: string): Promise<void> {
		const transactions = await db.getGroupTransactions(groupId);
		const accountIds = new Set(transactions.map((tx) => tx.accountId));

		// Also include transfer destinations
		for (const tx of transactions) {
			if (tx.type === 'transfer' && tx.transferDetails?.toAccountId) {
				accountIds.add(tx.transferDetails.toAccountId);
			}
		}

		await db.deleteTransactionGroup(groupId);

		// Update account balances for affected accounts (filter out null accountIds)
		const validAccountIds = Array.from(accountIds).filter(
			(id): id is string => id !== undefined && id !== null
		);
		for (const accountId of validAccountIds) {
			await accountService.recalculateAccountBalance(accountId);
		}

		// Clear balance projection cache for affected accounts
		if (validAccountIds.length > 0) {
			balanceProjectionService.clearCacheForAccounts(validAccountIds);
		}
	}

	/**
	 * Get transactions in a group
	 */
	async getGroupTransactions(groupId: string): Promise<Transaction[]> {
		return await db.getGroupTransactions(groupId);
	}

	/**
	 * Add transaction to group
	 */
	async addTransactionToGroup(transactionId: string, groupId: string): Promise<void> {
		await db.addTransactionToGroup(transactionId, groupId);

		const transaction = await db.transactions.get(transactionId);
		const affectedAccountIds: string[] = [];
		if (transaction) {
			if (transaction.accountId) {
				await accountService.recalculateAccountBalance(transaction.accountId);
				affectedAccountIds.push(transaction.accountId);
			}
			// Handle transfers
			if (transaction.type === 'transfer' && transaction.transferDetails?.toAccountId) {
				const toAccountId = transaction.transferDetails.toAccountId;
				if (!affectedAccountIds.includes(toAccountId)) {
					await accountService.recalculateAccountBalance(toAccountId);
					affectedAccountIds.push(toAccountId);
				}
			}
		}

		// Clear balance projection cache for affected accounts
		if (affectedAccountIds.length > 0) {
			balanceProjectionService.clearCacheForAccounts(affectedAccountIds);
		}
	}

	/**
	 * Remove transaction from group
	 */
	async removeTransactionFromGroup(transactionId: string): Promise<void> {
		const transaction = await db.transactions.get(transactionId);
		if (transaction) {
			await db.removeTransactionFromGroup(transactionId);
			const affectedAccountIds: string[] = [];
			if (transaction.accountId) {
				await accountService.recalculateAccountBalance(transaction.accountId);
				affectedAccountIds.push(transaction.accountId);
			}
			// Handle transfers
			if (transaction.type === 'transfer' && transaction.transferDetails?.toAccountId) {
				const toAccountId = transaction.transferDetails.toAccountId;
				if (!affectedAccountIds.includes(toAccountId)) {
					await accountService.recalculateAccountBalance(toAccountId);
					affectedAccountIds.push(toAccountId);
				}
			}

			// Clear balance projection cache for affected accounts
			if (affectedAccountIds.length > 0) {
				balanceProjectionService.clearCacheForAccounts(affectedAccountIds);
			}
		}
	}

	// ============================================================================
	// TRANSFER MANAGEMENT
	// ============================================================================

	/**
	 * Create a transfer between accounts
	 */
	async createTransfer(data: {
		fromAccountId: string;
		toAccountId: string;
		amount: number;
		currency: string;
		description?: string;
		categoryId?: string;
		feeAmount?: number;
		feeCategoryId?: string;
	}): Promise<{ fromTransaction: Transaction; toTransaction: Transaction }> {
		const transferId = generateUUID();

		// Create from transaction (negative amount)
		const fromTransaction = await this.createTransaction({
			type: 'transfer',
			status: 'cleared',
			accountId: data.fromAccountId,
			amount: -data.amount,
			currency: data.currency,
			description: data.description || `Transfer to ${data.toAccountId}`,
			categoryId: data.categoryId,
			groupId: transferId,
			groupName: 'Transfer',
			transferDetails: {
				toAccountId: data.toAccountId,
				transferAmount: data.amount,
				feeAmount: data.feeAmount || 0,
				feeCategoryId: data.feeCategoryId,
				feeDeductionMethod: 'from-transfer-amount'
			},
			clearedDate: new Date().toISOString()
		});

		// Create to transaction (positive amount)
		const toTransaction = await this.createTransaction({
			type: 'transfer',
			status: 'cleared',
			accountId: data.toAccountId,
			amount: data.amount,
			currency: data.currency,
			description: data.description || `Transfer from ${data.fromAccountId}`,
			categoryId: data.categoryId,
			groupId: transferId,
			groupName: 'Transfer',
			transferDetails: {
				toAccountId: data.fromAccountId,
				transferAmount: data.amount,
				feeAmount: data.feeAmount || 0,
				feeCategoryId: data.feeCategoryId,
				feeDeductionMethod: 'from-transfer-amount'
			},
			clearedDate: new Date().toISOString()
		});

		return { fromTransaction, toTransaction };
	}

	// ============================================================================
	// UTILITY METHODS
	// ============================================================================

	/**
	 * Get transaction statistics (converted to main currency).
	 * Resolves currency from account when transaction.currency is missing.
	 */
	async getTransactionStatistics(): Promise<{
		totalTransactions: number;
		totalIncome: number;
		totalExpenses: number;
		totalTransfers: number;
		averageTransactionAmount: number;
	}> {
		const [rawTransactions, accounts] = await Promise.all([
			db.transactions.toArray(),
			db.getActiveAccounts()
		]);
		const transactions = rawTransactions.filter((t): t is Transaction => t != null);
		const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
		const { userService, exchangeRateService } = await import('$lib/core/services');
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';
		const stats = {
			totalTransactions: transactions.length,
			totalIncome: 0,
			totalExpenses: 0,
			totalTransfers: 0,
			averageTransactionAmount: 0
		};
		let totalAmount = 0;

		for (const t of transactions) {
			const currency = t.currency || accountMap[t.accountId || '']?.currency || mainCurrency;
			const amount = t.amount || 0;
			const dateStr = t.clearedDate || t.plannedDate || t.createdAt;
			let convertedAmount = amount;
			if (currency !== mainCurrency && dateStr) {
				const converted = await exchangeRateService.convertAmount(
					amount,
					currency,
					mainCurrency,
					dateStr ? new Date(dateStr) : undefined
				);
				if (converted != null) convertedAmount = converted;
			}
			totalAmount += Math.abs(convertedAmount);
			if (t.type === 'income') stats.totalIncome += convertedAmount;
			else if (t.type === 'expense') stats.totalExpenses += convertedAmount;
			else if (t.type === 'transfer') stats.totalTransfers += Math.abs(convertedAmount);
		}
		stats.averageTransactionAmount =
			stats.totalTransactions > 0 ? totalAmount / stats.totalTransactions : 0;
		return stats;
	}

	/**
	 * Get income/expenses/net for a list of transactions, converted to main currency.
	 * Used by the transactions page for filtered summary and per-date-group totals.
	 * @param accountMap - Map of accountId -> { currency } to resolve currency when t.currency is missing
	 */
	async getTransactionStatisticsForTransactions(
		transactions: Array<{
			type?: string;
			amount?: number;
			totalAmount?: number;
			isGroup?: boolean;
			accountId?: string;
			currency?: string;
			clearedDate?: string;
			plannedDate?: string;
			createdAt?: string;
			transferDetails?: unknown;
		}>,
		accountMap: Record<string, { currency?: string }>,
		mainCurrency: string
	): Promise<{ income: number; expenses: number; net: number }> {
		const { exchangeRateService } = await import('$lib/core/services');
		let income = 0,
			expenses = 0,
			net = 0;

		// Check if we have any exchange rates at all (to avoid spam logging)
		const hasAnyRates = (await db.exchangeRates.filter((r) => !r.deletedAt).count()) > 0;
		let warnedAboutMissingRates = false;

		for (const t of transactions) {
			const amount = t.isGroup ? (t.totalAmount ?? 0) : (t.amount ?? 0);
			const currency = t.currency || accountMap[t.accountId || '']?.currency || mainCurrency;
			const dateStr = t.clearedDate || t.plannedDate || t.createdAt;
			let convertedAmount = amount;
			if (currency !== mainCurrency && dateStr) {
				const c = await exchangeRateService.convertAmount(
					amount,
					currency,
					mainCurrency,
					new Date(dateStr)
				);
				if (c != null) {
					convertedAmount = c;
				} else if (!warnedAboutMissingRates) {
					// Only warn once per batch to avoid spam
					if (!hasAnyRates) {
						console.warn(
							`Exchange rates not found. Please go to Settings > Currency and click "Update from API" to fetch rates.`
						);
					} else {
						console.warn(
							`Exchange rate not found for ${currency}->${mainCurrency}. Using original amount.`
						);
					}
					warnedAboutMissingRates = true;
				}
			}
			const txForImpact = { ...t, amount };
			const impact = calculateTransactionImpact(txForImpact as Transaction, t.accountId);
			let convertedImpact = impact;
			if (currency !== mainCurrency && dateStr) {
				const c = await exchangeRateService.convertAmount(
					impact,
					currency,
					mainCurrency,
					new Date(dateStr)
				);
				if (c != null) {
					convertedImpact = c;
				}
				// Don't warn again for impact conversion
			}
			if (t.type === 'income') income += convertedAmount;
			else if (t.type === 'expense') expenses -= convertedAmount; // Store expenses as negative
			// Note: We still calculate impact for potential future use, but net is now income + expenses
		}
		// Net is simply the sum of income and expenses (where expenses is negative)
		net = income + expenses;
		return { income, expenses, net };
	}

	/**
	 * Get transactions by type
	 */
	async getTransactionsByType(type: Transaction['type']): Promise<Transaction[]> {
		const arr = await db.transactions.where('type').equals(type).toArray();
		return arr.filter((t): t is Transaction => t != null);
	}

	/**
	 * Search transactions
	 */
	async searchTransactions(query: string): Promise<Transaction[]> {
		const arr = await db.transactions.toArray();
		const valid = arr.filter((t): t is Transaction => t != null);
		const lowerQuery = query.toLowerCase();
		return valid.filter(
			(transaction) =>
				transaction.description?.toLowerCase().includes(lowerQuery) ||
				transaction.reference?.toLowerCase().includes(lowerQuery) ||
				transaction.notes?.toLowerCase().includes(lowerQuery)
		);
	}
}

export const transactionService = new TransactionService();
