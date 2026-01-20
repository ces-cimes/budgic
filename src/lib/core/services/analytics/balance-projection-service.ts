/**
 * Balance Projection Service
 * 
 * Provides daily balance projections based on scheduled transactions,
 * recurring transactions, and account metadata (buffer management).
 * 
 * This service enables forward-looking balance calculations to help users
 * anticipate future account balances and avoid low balance situations.
 */

import { db, generateUUID, calculateTransactionImpact } from '$lib/core/db';
import type { Account, Transaction } from '$lib/core/db';
import { accountService } from '../core/account-service';
import { transactionService } from '../core/transaction-service';
import { getBufferAmount, getBufferStatus, type BufferStatus } from '$lib/utils/account-metadata-utils';
import { addDays, startOfDay, isAfter, isBefore, format, parseISO } from 'date-fns';

/**
 * Cache for projections to avoid recalculating on every call
 */
interface ProjectionCacheEntry {
	projections: AccountProjection[];
	timestamp: number;
	options: ProjectionOptions;
	accountIds: Set<string>; // Track which accounts are in this cache entry
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const projectionCache = new Map<string, ProjectionCacheEntry>();

/**
 * Daily balance projection for a single account
 */
export interface DailyBalanceProjection {
	date: Date;
	balance: number;
	bufferAmount: number;
	bufferStatus: BufferStatus;
	transactions: ProjectedTransaction[];
	isLowBalance: boolean;
	isBelowBuffer: boolean;
}

/**
 * Projected transaction (from scheduled or recurring transactions)
 */
export interface ProjectedTransaction {
	id: string; // Original transaction ID or generated for recurring
	date: Date;
	amount: number;
	type: Transaction['type'];
	description?: string;
	categoryId?: string;
	accountId: string;
	isRecurring: boolean;
	originalTransactionId?: string; // For recurring transactions
}

/**
 * Projection result for an account
 */
export interface AccountProjection {
	accountId: string;
	accountName: string;
	currency: string;
	startBalance: number;
	projections: DailyBalanceProjection[];
	lowBalanceDays: number;
	belowBufferDays: number;
	minimumBalance: number;
	minimumBalanceDate: Date | null;
}

/**
 * Projection options
 */
export interface ProjectionOptions {
	startDate?: Date;
	endDate?: Date;
	daysAhead?: number; // Default 90 days
	includeRecurring?: boolean; // Default true
	includePlanned?: boolean; // Default true
	accountIds?: string[]; // If not provided, projects all active accounts
}

/**
 * Low balance alert
 */
export interface LowBalanceAlert {
	accountId: string;
	accountName: string;
	date: Date;
	projectedBalance: number;
	bufferAmount: number;
	severity: 'warning' | 'critical';
	message: string;
}

class BalanceProjectionService {
	/**
	 * Generate daily balance projections for accounts
	 * Uses caching to avoid expensive recalculations
	 */
	async generateProjections(options: ProjectionOptions = {}): Promise<AccountProjection[]> {
		const {
			startDate = startOfDay(new Date()),
			daysAhead = 90,
			includeRecurring = true,
			includePlanned = true,
			accountIds
		} = options;

		// Create cache key
		const cacheKey = JSON.stringify({
			accountIds: accountIds?.sort(),
			daysAhead,
			includeRecurring,
			includePlanned,
			startDate: startDate.toISOString().split('T')[0] // Date only, no time
		});

		// Check cache
		const cached = projectionCache.get(cacheKey);
		const now = Date.now();
		if (cached && (now - cached.timestamp) < CACHE_TTL) {
			return cached.projections;
		}

		const endDate = options.endDate || addDays(startDate, daysAhead);

		// Get accounts to project
		const accounts = accountIds
			? await Promise.all(accountIds.map(id => accountService.getAccount(id)))
			: await accountService.getAccounts();
		
		const validAccounts = accounts.filter((a): a is Account => a !== null && a.isActive);

		// Generate projections for each account
		const projections = await Promise.all(
			validAccounts.map(account => this.projectAccount(account, startDate, endDate, {
				includeRecurring,
				includePlanned
			}))
		);

		// Cache results with account IDs for targeted invalidation
		const accountIdsSet = new Set(validAccounts.map(a => a.id));
		projectionCache.set(cacheKey, {
			projections,
			timestamp: now,
			options,
			accountIds: accountIdsSet
		});

		// Clean up old cache entries (keep only last 10)
		if (projectionCache.size > 10) {
			const entries = Array.from(projectionCache.entries());
			entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
			projectionCache.clear();
			entries.slice(0, 10).forEach(([key, value]) => {
				projectionCache.set(key, value);
			});
		}

		return projections;
	}

	/**
	 * Clear projection cache for specific accounts
	 * This is more efficient than clearing the entire cache
	 */
	clearCacheForAccounts(accountIds: string[]): void {
		if (accountIds.length === 0) return;

		const accountIdsSet = new Set(accountIds);
		
		// Remove cache entries that include any of the affected accounts
		for (const [key, entry] of projectionCache.entries()) {
			// Check if any of the affected accounts are in this cache entry
			const hasAffectedAccount = Array.from(entry.accountIds).some(id => accountIdsSet.has(id));
			if (hasAffectedAccount) {
				projectionCache.delete(key);
			}
		}
	}

	/**
	 * Clear all projection cache (useful when transactions change globally)
	 */
	clearCache(): void {
		projectionCache.clear();
	}

	/**
	 * Project balance for a single account
	 */
	private async projectAccount(
		account: Account,
		startDate: Date,
		endDate: Date,
		options: { includeRecurring: boolean; includePlanned: boolean }
	): Promise<AccountProjection> {
		const bufferAmount = getBufferAmount(account);
		let currentBalance = account.currentBalance;
		const projections: DailyBalanceProjection[] = [];
		const projectedTransactions = new Map<string, ProjectedTransaction[]>();

		// Get all transactions that affect this account
		const allTransactions = await transactionService.getTransactionsByAccount(account.id);
		
		// Get cleared transactions up to start date (to establish starting balance)
		const clearedUpToStart = allTransactions.filter(tx => {
			if (tx.status !== 'cleared' || !tx.clearedDate) return false;
			const txDate = parseISO(tx.clearedDate);
			return isBefore(txDate, startDate) || txDate.getTime() === startDate.getTime();
		});

		// Recalculate starting balance from cleared transactions
		// This ensures we start from the correct balance
		currentBalance = account.initialBalance;
		for (const tx of clearedUpToStart) {
			currentBalance += this.getTransactionImpact(tx, account.id);
		}

		// Get planned transactions in the projection period
		if (options.includePlanned) {
			const plannedTransactions = allTransactions.filter(tx => {
				if (tx.status !== 'planned' || !tx.plannedDate) return false;
				const txDate = parseISO(tx.plannedDate);
				return !isBefore(txDate, startDate) && !isAfter(txDate, endDate);
			});

			for (const tx of plannedTransactions) {
				const txDate = parseISO(tx.plannedDate!);
				const dateKey = format(txDate, 'yyyy-MM-dd');
				if (!projectedTransactions.has(dateKey)) {
					projectedTransactions.set(dateKey, []);
				}
				projectedTransactions.get(dateKey)!.push({
					id: tx.id,
					date: txDate,
					amount: tx.amount || 0,
					type: tx.type,
					description: tx.description,
					categoryId: tx.categoryId,
					accountId: account.id,
					isRecurring: false
				});
			}
		}

		// Generate recurring transactions
		if (options.includeRecurring) {
			const recurringTransactions = allTransactions.filter(
				tx => tx.recurrenceRule && (tx.status === 'planned' || tx.status === 'cleared')
			);

			for (const tx of recurringTransactions) {
				const recurringDates = this.expandRecurringTransaction(tx, startDate, endDate);
				for (const recDate of recurringDates) {
					const dateKey = format(recDate, 'yyyy-MM-dd');
					if (!projectedTransactions.has(dateKey)) {
						projectedTransactions.set(dateKey, []);
					}
					projectedTransactions.get(dateKey)!.push({
						id: `${tx.id}-${format(recDate, 'yyyy-MM-dd')}`,
						date: recDate,
						amount: tx.amount || tx.plannedAmount || 0,
						type: tx.type,
						description: tx.description,
						categoryId: tx.categoryId,
						accountId: account.id,
						isRecurring: true,
						originalTransactionId: tx.id
					});
				}
			}
		}

		// Generate daily projections
		let minBalance = currentBalance;
		let minBalanceDate: Date | null = null;
		let lowBalanceDays = 0;
		let belowBufferDays = 0;

		const currentDate = new Date(startDate);
		while (!isAfter(currentDate, endDate)) {
			const dateKey = format(currentDate, 'yyyy-MM-dd');
			const dayTransactions = projectedTransactions.get(dateKey) || [];

			// Apply transactions for this day
			for (const tx of dayTransactions) {
				currentBalance += this.getProjectedTransactionImpact(tx, account.id);
			}

			const bufferStatus = this.calculateBufferStatus(currentBalance, bufferAmount);
			const isLowBalance = this.isLowBalance(currentBalance, account);
			const isBelowBuffer = currentBalance < bufferAmount;

			if (isLowBalance) lowBalanceDays++;
			if (isBelowBuffer) belowBufferDays++;

			if (currentBalance < minBalance) {
				minBalance = currentBalance;
				minBalanceDate = new Date(currentDate);
			}

			projections.push({
				date: new Date(currentDate),
				balance: currentBalance,
				bufferAmount,
				bufferStatus,
				transactions: dayTransactions,
				isLowBalance,
				isBelowBuffer
			});

			currentDate.setDate(currentDate.getDate() + 1);
		}

		return {
			accountId: account.id,
			accountName: account.name,
			currency: account.currency,
			startBalance: account.currentBalance,
			projections,
			lowBalanceDays,
			belowBufferDays,
			minimumBalance: minBalance,
			minimumBalanceDate: minBalanceDate
		};
	}

	/**
	 * Expand a recurring transaction into future dates
	 */
	private expandRecurringTransaction(
		transaction: Transaction,
		startDate: Date,
		endDate: Date
	): Date[] {
		if (!transaction.recurrenceRule) return [];

		const baseDate = transaction.plannedDate
			? parseISO(transaction.plannedDate)
			: transaction.clearedDate
			? parseISO(transaction.clearedDate)
			: new Date();

		const dates: Date[] = [];
		let currentDate = new Date(baseDate);

		// If base date is before start, advance to first occurrence in range
		if (isBefore(currentDate, startDate)) {
			currentDate = this.getNextRecurrenceDate(currentDate, transaction.recurrenceRule, startDate);
		}

		// Generate occurrences until end date
		while (!isAfter(currentDate, endDate)) {
			dates.push(new Date(currentDate));
			currentDate = this.getNextRecurrenceDate(currentDate, transaction.recurrenceRule);
		}

		return dates;
	}

	/**
	 * Get next recurrence date based on rule
	 */
	private getNextRecurrenceDate(
		currentDate: Date,
		rule: string,
		minimumDate?: Date
	): Date {
		const nextDate = new Date(currentDate);

		switch (rule.toLowerCase()) {
			case 'daily':
				nextDate.setDate(nextDate.getDate() + 1);
				break;
			case 'weekly':
				nextDate.setDate(nextDate.getDate() + 7);
				break;
			case 'biweekly':
				nextDate.setDate(nextDate.getDate() + 14);
				break;
			case 'monthly':
				nextDate.setMonth(nextDate.getMonth() + 1);
				break;
			case 'quarterly':
				nextDate.setMonth(nextDate.getMonth() + 3);
				break;
			case 'yearly':
				nextDate.setFullYear(nextDate.getFullYear() + 1);
				break;
			default:
				// Default to monthly for unknown rules
				nextDate.setMonth(nextDate.getMonth() + 1);
		}

		// If minimum date is provided, ensure we don't go before it
		if (minimumDate && isBefore(nextDate, minimumDate)) {
			return this.getNextRecurrenceDate(minimumDate, rule);
		}

		return nextDate;
	}

	/**
	 * Get transaction impact on account balance
	 */
	private getTransactionImpact(transaction: Transaction, accountId: string): number {
		return calculateTransactionImpact(transaction, accountId);
	}

	/**
	 * Get projected transaction impact
	 */
	private getProjectedTransactionImpact(tx: ProjectedTransaction, accountId: string): number {
		if (tx.accountId !== accountId) return 0;

		switch (tx.type) {
			case 'income':
				return tx.amount;
			case 'expense':
				return -tx.amount;
			case 'transfer':
				// For transfers, we need to check if this is the source or destination
				// For now, assume negative for source account (simplified)
				return -tx.amount;
			case 'adjustment':
				return tx.amount;
			default:
				return 0;
		}
	}

	/**
	 * Calculate buffer status for a balance
	 */
	private calculateBufferStatus(balance: number, bufferAmount: number): BufferStatus {
		if (bufferAmount === 0) return 'optimal';

		const ratio = balance / bufferAmount;

		if (ratio >= 1.5) return 'optimal';
		if (ratio >= 1.0) return 'comfort';
		if (ratio >= 0.5) return 'warning';
		return 'critical';
	}

	/**
	 * Check if balance is low (below minimum balance or buffer)
	 */
	private isLowBalance(balance: number, account: Account): boolean {
		const buffer = getBufferAmount(account);
		const minimum = account.metadata?.minimumBalance || 0;
		return balance < Math.max(buffer, minimum);
	}

	/**
	 * Generate low balance alerts from projections
	 * Uses cached projections if available
	 * Only returns one alert per account (the earliest/most severe)
	 */
	async generateLowBalanceAlerts(
		options: ProjectionOptions = {}
	): Promise<LowBalanceAlert[]> {
		// Use cached projections to avoid duplicate calculations
		const projections = await this.generateProjections(options);
		const alerts: LowBalanceAlert[] = [];
		const accountAlerts = new Map<string, LowBalanceAlert>();

		for (const projection of projections) {
			// Skip accounts without buffers (bufferAmount = 0 means no buffer requirement)
			if (projection.projections.length === 0 || projection.projections[0].bufferAmount === 0) {
				continue;
			}

			// Find the earliest below-buffer day for this account
			let earliestAlert: LowBalanceAlert | null = null;
			
			for (const daily of projection.projections) {
				if (daily.isBelowBuffer && daily.bufferAmount > 0) {
					const severity = daily.bufferStatus === 'critical' ? 'critical' : 'warning';
					const alert: LowBalanceAlert = {
						accountId: projection.accountId,
						accountName: projection.accountName,
						date: daily.date,
						projectedBalance: daily.balance,
						bufferAmount: daily.bufferAmount,
						severity,
						message: `Balance will be ${Math.abs(daily.balance - daily.bufferAmount).toFixed(2)} below buffer on ${format(daily.date, 'MMM d, yyyy')}`
					};

					// Keep only the earliest alert per account (or most severe if same date)
					if (!earliestAlert || 
						daily.date.getTime() < earliestAlert.date.getTime() ||
						(severity === 'critical' && earliestAlert.severity === 'warning')) {
						earliestAlert = alert;
					}
				}
			}

			// Only add one alert per account
			if (earliestAlert) {
				accountAlerts.set(projection.accountId, earliestAlert);
			}
		}

		// Convert map to array and sort by date and severity
		return Array.from(accountAlerts.values()).sort((a, b) => {
			if (a.severity !== b.severity) {
				return a.severity === 'critical' ? -1 : 1;
			}
			return a.date.getTime() - b.date.getTime();
		});
	}

	/**
	 * Get projection summary for an account
	 */
	async getProjectionSummary(
		accountId: string,
		daysAhead: number = 90
	): Promise<{
		minimumBalance: number;
		minimumBalanceDate: Date | null;
		lowBalanceDays: number;
		belowBufferDays: number;
		willGoBelowBuffer: boolean;
	}> {
		const projections = await this.generateProjections({
			accountIds: [accountId],
			daysAhead
		});

		const projection = projections[0];
		if (!projection) {
			return {
				minimumBalance: 0,
				minimumBalanceDate: null,
				lowBalanceDays: 0,
				belowBufferDays: 0,
				willGoBelowBuffer: false
			};
		}

		return {
			minimumBalance: projection.minimumBalance,
			minimumBalanceDate: projection.minimumBalanceDate,
			lowBalanceDays: projection.lowBalanceDays,
			belowBufferDays: projection.belowBufferDays,
			willGoBelowBuffer: projection.belowBufferDays > 0
		};
	}
}

export const balanceProjectionService = new BalanceProjectionService();
