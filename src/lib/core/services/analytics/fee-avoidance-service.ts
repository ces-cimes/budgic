/**
 * Fee Avoidance Service
 *
 * Detects potential banking fees and provides recommendations to avoid them.
 * Integrates with account metadata and balance projections to proactively
 * prevent overdraft fees, minimum balance violations, and other account fees.
 *
 * Features:
 * - Fee detection based on account metadata
 * - Proactive fee avoidance recommendations
 * - Transaction optimization suggestions
 * - Integration with balance projections
 * - Automatic transaction adjustment recommendations
 */

import { db, generateUUID } from '$lib/core/db';
import type { Account, Transaction, AccountMetadata } from '$lib/core/db';
import { balanceProjectionService } from './balance-projection-service';
import type { AccountProjection, DailyBalanceProjection } from './balance-projection-service';
import { accountService } from '../core/account-service';
import { transactionService } from '../core/transaction-service';
import { insightsService } from './insights-service';
import {
	getBufferAmount,
	isBelowMinimumBalance,
	wouldTriggerOverdraft
} from '$lib/utils/account-metadata-utils';
import { addDays, format, parseISO, differenceInDays, isBefore, isAfter } from 'date-fns';
import { z } from 'zod';

// ============================================================================
// TYPE DEFINITIONS & SCHEMAS
// ============================================================================

/**
 * Fee type enumeration
 */
export const FeeType = z.enum([
	'overdraft', // Overdraft fee
	'minimum_balance', // Minimum balance fee
	'insufficient_funds', // NSF fee
	'late_payment', // Late payment fee (credit)
	'transfer_limit', // Transfer limit exceeded
	'maintenance', // Monthly maintenance fee
	'foreign_transaction', // Foreign transaction fee
	'atm', // ATM fee
	'other' // Other fees
]);

export type FeeType = z.infer<typeof FeeType>;

/**
 * Detected fee risk
 */
export interface FeeRisk {
	id: string;
	accountId: string;
	accountName: string;
	feeType: FeeType;
	likelihood: 'low' | 'medium' | 'high' | 'imminent';
	estimatedAmount: number;
	currency: string;
	detectedAt: Date;
	occurrenceDate: Date | null; // When the fee is likely to occur
	daysUntilOccurrence: number | null;
	triggerCondition: string; // What will trigger the fee
	currentValue: number; // Current value of the condition
	thresholdValue: number; // Threshold that triggers the fee
	confidence: number; // 0-100
	metadata: Record<string, any>;
}

/**
 * Fee avoidance recommendation
 */
export interface FeeAvoidanceRecommendation {
	id: string;
	feeRiskId: string;
	accountId: string;
	accountName: string;
	type:
		| 'transfer'
		| 'reschedule'
		| 'cancel'
		| 'adjust_buffer'
		| 'increase_income'
		| 'reduce_spending';
	priority: 'low' | 'medium' | 'high' | 'urgent';
	title: string;
	description: string;
	actionable: boolean;
	actionText?: string;
	actionUrl?: string;
	estimatedSavings: number;
	effort: 'low' | 'medium' | 'high';
	confidence: number; // 0-100
	transactionIds?: string[]; // Transactions involved
	suggestedTransactionChanges?: TransactionAdjustment[];
	metadata: Record<string, any>;
	createdAt: Date;
	expiresAt?: Date;
}

/**
 * Transaction adjustment suggestion
 */
export interface TransactionAdjustment {
	transactionId: string;
	currentDate: Date;
	suggestedDate: Date;
	reason: string;
	impact: number; // Financial impact
	confidence: number;
}

/**
 * Fee avoidance strategy
 */
export interface FeeAvoidanceStrategy {
	accountId: string;
	totalPotentialSavings: number;
	recommendations: FeeAvoidanceRecommendation[];
	risks: FeeRisk[];
	autoAdjustableTransactions: TransactionAdjustment[];
	requiresUserAction: boolean;
}

/**
 * Fee detection options
 */
export interface FeeDetectionOptions {
	accountIds?: string[];
	daysAhead?: number; // How far ahead to look (default 90)
	minConfidence?: number; // Minimum confidence threshold (default 60)
	includeAllRisks?: boolean; // Include low-risk items (default false)
}

// ============================================================================
// FEE AVOIDANCE SERVICE
// ============================================================================

class FeeAvoidanceService {
	private detectionCache = new Map<string, { risks: FeeRisk[]; timestamp: number }>();
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	public get ready() {
		return db.isOpen();
	}

	public isLoading() {
		return !this.ready;
	}

	// ============================================================================
	// FEE DETECTION
	// ============================================================================

	/**
	 * Detect potential fees across all accounts
	 */
	async detectFeeRisks(options: FeeDetectionOptions = {}): Promise<FeeRisk[]> {
		const { accountIds, daysAhead = 90, minConfidence = 60, includeAllRisks = false } = options;

		// Check cache
		const cacheKey = JSON.stringify({ accountIds, daysAhead });
		const cached = this.detectionCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			return this.filterRisksByConfidence(cached.risks, minConfidence, includeAllRisks);
		}

		// Get accounts to analyze
		const accounts = accountIds
			? await Promise.all(accountIds.map((id) => accountService.getAccount(id)))
			: await accountService.getAccounts();

		const validAccounts = accounts.filter((a): a is Account => a !== null && a.isActive);

		// Get balance projections for all accounts
		const projections = await balanceProjectionService.generateProjections({
			accountIds: validAccounts.map((a) => a.id),
			daysAhead
		});

		// Detect fees for each account
		const allRisks: FeeRisk[] = [];
		for (const projection of projections) {
			const account = validAccounts.find((a) => a.id === projection.accountId);
			if (!account) continue;

			const accountRisks = await this.detectAccountFeeRisks(account, projection);
			allRisks.push(...accountRisks);
		}

		// Sort by urgency and likelihood
		const sortedRisks = allRisks.sort((a, b) => {
			const urgencyOrder = { imminent: 4, high: 3, medium: 2, low: 1 };
			const urgencyDiff = urgencyOrder[b.likelihood] - urgencyOrder[a.likelihood];
			if (urgencyDiff !== 0) return urgencyDiff;

			// Sort by days until occurrence
			if (a.daysUntilOccurrence !== null && b.daysUntilOccurrence !== null) {
				return a.daysUntilOccurrence - b.daysUntilOccurrence;
			}

			return b.confidence - a.confidence;
		});

		// Cache results
		this.detectionCache.set(cacheKey, {
			risks: sortedRisks,
			timestamp: Date.now()
		});

		return this.filterRisksByConfidence(sortedRisks, minConfidence, includeAllRisks);
	}

	/**
	 * Detect fee risks for a specific account
	 */
	private async detectAccountFeeRisks(
		account: Account,
		projection: AccountProjection
	): Promise<FeeRisk[]> {
		const risks: FeeRisk[] = [];

		// Detect overdraft fee risks
		risks.push(...this.detectOverdraftRisks(account, projection));

		// Detect minimum balance fee risks
		risks.push(...this.detectMinimumBalanceRisks(account, projection));

		// Detect insufficient funds risks
		risks.push(...this.detectInsufficientFundsRisks(account, projection));

		// Detect late payment risks (credit cards)
		if (account.type === 'credit') {
			risks.push(...(await this.detectLatePaymentRisks(account, projection)));
		}

		// Detect transfer limit risks (savings accounts)
		if (account.type === 'savings') {
			risks.push(...(await this.detectTransferLimitRisks(account)));
		}

		return this.deduplicateAccountRisks(risks);
	}

	/**
	 * One liquidity-class risk per account per calendar day (avoids triple-counting overdraft/NSF/min).
	 */
	private deduplicateAccountRisks(risks: FeeRisk[]): FeeRisk[] {
		const liquidityTypes = new Set<FeeType>([
			'overdraft',
			'insufficient_funds',
			'minimum_balance'
		]);
		const liquidityPriority: Partial<Record<FeeType, number>> = {
			overdraft: 3,
			insufficient_funds: 2,
			minimum_balance: 1
		};

		const liquidityByDay = new Map<string, FeeRisk>();
		const other: FeeRisk[] = [];

		for (const risk of risks) {
			if (!liquidityTypes.has(risk.feeType)) {
				other.push(risk);
				continue;
			}
			if (risk.occurrenceDate == null) {
				other.push(risk);
				continue;
			}
			const dayKey = format(risk.occurrenceDate, 'yyyy-MM-dd');
			const key = `${risk.accountId}:${dayKey}`;
			const existing = liquidityByDay.get(key);
			const priority = liquidityPriority[risk.feeType] ?? 0;
			const existingPriority = existing ? (liquidityPriority[existing.feeType] ?? 0) : -1;
			if (!existing || priority > existingPriority) {
				liquidityByDay.set(key, risk);
			}
		}

		return [...other, ...liquidityByDay.values()];
	}

	/**
	 * Detect overdraft fee risks
	 */
	private detectOverdraftRisks(account: Account, projection: AccountProjection): FeeRisk[] {
		if (account.type !== 'checking' || !account.metadata?.overdraftFee) {
			return [];
		}

		const risks: FeeRisk[] = [];
		const overdraftLimit = account.metadata.overdraftLimit || 0;
		const minimumBalance = account.metadata.minimumBalance || 0;
		const overdraftThreshold = minimumBalance - overdraftLimit;

		for (const daily of projection.projections) {
			if (daily.balance < overdraftThreshold) {
				const daysUntil = differenceInDays(daily.date, new Date());
				const likelihood = this.calculateLikelihood(daysUntil, 80);

				risks.push({
					id: generateUUID(),
					accountId: account.id,
					accountName: account.name,
					feeType: 'overdraft',
					likelihood,
					estimatedAmount: account.metadata.overdraftFee,
					currency: account.currency,
					detectedAt: new Date(),
					occurrenceDate: daily.date,
					daysUntilOccurrence: daysUntil,
					triggerCondition: 'Balance below overdraft threshold',
					currentValue: daily.balance,
					thresholdValue: overdraftThreshold,
					confidence: 85,
					metadata: {
						projectedBalance: daily.balance,
						overdraftLimit,
						minimumBalance,
						transactions: daily.transactions.map((t) => t.id)
					}
				});

				// Only report the first occurrence
				break;
			}
		}

		return risks;
	}

	/**
	 * Detect minimum balance fee risks
	 */
	private detectMinimumBalanceRisks(account: Account, projection: AccountProjection): FeeRisk[] {
		if (!account.metadata?.minimumBalance) {
			return [];
		}

		const risks: FeeRisk[] = [];
		const minimumBalance = account.metadata.minimumBalance;

		// Count consecutive days below minimum
		let consecutiveDaysBelow = 0;
		let firstViolationDate: Date | null = null;

		for (const daily of projection.projections) {
			// Maintenance-fee scenario only when balance is low but not already negative
			if (daily.balance >= 0 && daily.balance < minimumBalance) {
				consecutiveDaysBelow++;
				if (!firstViolationDate) {
					firstViolationDate = daily.date;
				}
			} else {
				consecutiveDaysBelow = 0;
				firstViolationDate = null;
			}

			// Many banks charge if below minimum for 1+ days in a month
			if (consecutiveDaysBelow >= 1 && firstViolationDate) {
				const daysUntil = differenceInDays(firstViolationDate, new Date());
				const likelihood = this.calculateLikelihood(daysUntil, 75);

				// Estimate fee (typically $10-15, use 10 as conservative)
				const estimatedFee = 10;

				risks.push({
					id: generateUUID(),
					accountId: account.id,
					accountName: account.name,
					feeType: 'minimum_balance',
					likelihood,
					estimatedAmount: estimatedFee,
					currency: account.currency,
					detectedAt: new Date(),
					occurrenceDate: firstViolationDate,
					daysUntilOccurrence: daysUntil,
					triggerCondition: 'Balance below minimum',
					currentValue: daily.balance,
					thresholdValue: minimumBalance,
					confidence: 75,
					metadata: {
						projectedBalance: daily.balance,
						minimumBalance,
						consecutiveDays: consecutiveDaysBelow
					}
				});

				// Only report once per account
				break;
			}
		}

		return risks;
	}

	/**
	 * Detect insufficient funds risks
	 */
	private detectInsufficientFundsRisks(
		account: Account,
		projection: AccountProjection
	): FeeRisk[] {
		const risks: FeeRisk[] = [];

		for (const daily of projection.projections) {
			// Check if any transaction would cause NSF
			if (daily.balance < 0 && account.type === 'checking') {
				const daysUntil = differenceInDays(daily.date, new Date());
				const likelihood = this.calculateLikelihood(daysUntil, 90);

				// NSF fee typically $30-35
				const estimatedFee = account.metadata?.overdraftFee || 35;

				risks.push({
					id: generateUUID(),
					accountId: account.id,
					accountName: account.name,
					feeType: 'insufficient_funds',
					likelihood,
					estimatedAmount: estimatedFee,
					currency: account.currency,
					detectedAt: new Date(),
					occurrenceDate: daily.date,
					daysUntilOccurrence: daysUntil,
					triggerCondition: 'Insufficient funds for transaction',
					currentValue: daily.balance,
					thresholdValue: 0,
					confidence: 90,
					metadata: {
						projectedBalance: daily.balance,
						transactions: daily.transactions.map((t) => t.id)
					}
				});

				// Only report the first occurrence
				break;
			}
		}

		return risks;
	}

	/**
	 * Detect late payment risks for credit cards
	 */
	private async detectLatePaymentRisks(
		account: Account,
		projection: AccountProjection
	): Promise<FeeRisk[]> {
		if (!account.metadata?.paymentDueDate) {
			return [];
		}

		const risks: FeeRisk[] = [];
		const today = new Date();
		const dueDay = parseInt(account.metadata.paymentDueDate);

		// Calculate next payment due date
		let nextDueDate = new Date(today.getFullYear(), today.getMonth(), dueDay);
		if (today.getDate() >= dueDay) {
			nextDueDate = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
		}

		// Get recent transactions to check if payment is scheduled
		const transactions = await transactionService.getTransactionsByAccount(account.id);
		const plannedPayments = transactions.filter(
			(tx) =>
				tx.type === 'income' &&
				tx.status === 'planned' &&
				tx.plannedDate &&
				parseISO(tx.plannedDate).getTime() === nextDueDate.getTime()
		);

		// If no payment scheduled and balance is negative (debt exists)
		if (plannedPayments.length === 0 && account.currentBalance < 0) {
			const daysUntil = differenceInDays(nextDueDate, today);
			const likelihood = daysUntil <= 7 ? 'imminent' : daysUntil <= 14 ? 'high' : 'medium';

			// Late payment fee typically $25-40
			const lateFee = 35;

			risks.push({
				id: generateUUID(),
				accountId: account.id,
				accountName: account.name,
				feeType: 'late_payment',
				likelihood,
				estimatedAmount: lateFee,
				currency: account.currency,
				detectedAt: new Date(),
				occurrenceDate: nextDueDate,
				daysUntilOccurrence: daysUntil,
				triggerCondition: 'No payment scheduled before due date',
				currentValue: 0, // No payment scheduled
				thresholdValue: 1, // At least 1 payment needed
				confidence: 85,
				metadata: {
					currentBalance: account.currentBalance,
					minimumPayment: account.metadata.minimumPayment || 0,
					paymentDueDate: nextDueDate.toISOString()
				}
			});
		}

		return risks;
	}

	/**
	 * Detect transfer limit risks for savings accounts
	 */
	private async detectTransferLimitRisks(account: Account): Promise<FeeRisk[]> {
		if (!account.metadata?.transferLimit) {
			return [];
		}

		const risks: FeeRisk[] = [];
		const transferLimit = account.metadata.transferLimit;

		// Count transfers this month
		const today = new Date();
		const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
		const transactions = await transactionService.getTransactionsByAccount(account.id);

		const monthlyTransfers = transactions.filter(
			(tx) =>
				tx.type === 'transfer' && tx.clearedDate && parseISO(tx.clearedDate) >= startOfMonth
		);

		const transferCount = monthlyTransfers.length;

		if (transferCount >= transferLimit - 1) {
			const likelihood = transferCount >= transferLimit ? 'high' : 'medium';

			// Excess transfer fee typically $10
			const transferFee = 10;

			risks.push({
				id: generateUUID(),
				accountId: account.id,
				accountName: account.name,
				feeType: 'transfer_limit',
				likelihood,
				estimatedAmount: transferFee,
				currency: account.currency,
				detectedAt: new Date(),
				occurrenceDate: null,
				daysUntilOccurrence: null,
				triggerCondition: 'Transfer limit reached or exceeded',
				currentValue: transferCount,
				thresholdValue: transferLimit,
				confidence: 95,
				metadata: {
					transferCount,
					transferLimit,
					monthlyTransfers: monthlyTransfers.map((t) => t.id)
				}
			});
		}

		return risks;
	}

	// ============================================================================
	// FEE AVOIDANCE RECOMMENDATIONS
	// ============================================================================

	/**
	 * Generate fee avoidance recommendations for detected risks
	 */
	async generateFeeAvoidanceRecommendations(
		options: FeeDetectionOptions = {}
	): Promise<FeeAvoidanceRecommendation[]> {
		const risks = await this.detectFeeRisks(options);

		if (risks.length === 0) {
			return [];
		}

		const recommendations: FeeAvoidanceRecommendation[] = [];

		for (const risk of risks) {
			const riskRecommendations = await this.generateRecommendationsForRisk(risk);
			recommendations.push(...riskRecommendations);
		}

		// Sort by priority and estimated savings
		return recommendations.sort((a, b) => {
			const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
			const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
			if (priorityDiff !== 0) return priorityDiff;
			return b.estimatedSavings - a.estimatedSavings;
		});
	}

	/**
	 * Generate recommendations for a specific fee risk
	 */
	private async generateRecommendationsForRisk(
		risk: FeeRisk
	): Promise<FeeAvoidanceRecommendation[]> {
		const recommendations: FeeAvoidanceRecommendation[] = [];

		switch (risk.feeType) {
			case 'overdraft':
			case 'insufficient_funds':
				recommendations.push(...(await this.generateOverdraftRecommendations(risk)));
				break;
			case 'minimum_balance':
				recommendations.push(...(await this.generateMinimumBalanceRecommendations(risk)));
				break;
			case 'late_payment':
				recommendations.push(...(await this.generateLatePaymentRecommendations(risk)));
				break;
			case 'transfer_limit':
				recommendations.push(...(await this.generateTransferLimitRecommendations(risk)));
				break;
		}

		return recommendations;
	}

	/**
	 * Generate recommendations for overdraft risks
	 */
	private async generateOverdraftRecommendations(
		risk: FeeRisk
	): Promise<FeeAvoidanceRecommendation[]> {
		const recommendations: FeeAvoidanceRecommendation[] = [];
		const account = await accountService.getAccount(risk.accountId);
		if (!account) return recommendations;

		// Recommendation 1: Transfer funds from another account
		const otherAccounts = (await accountService.getAccounts()).filter(
			(a) =>
				a.id !== risk.accountId &&
				a.isActive &&
				a.currentBalance > 0 &&
				a.currency === account.currency
		);

		if (otherAccounts.length > 0) {
			const amountNeeded = Math.abs(risk.currentValue - risk.thresholdValue) + 50; // Add buffer
			const sourceAccount = otherAccounts.find((a) => a.currentBalance >= amountNeeded);

			if (sourceAccount) {
				recommendations.push({
					id: generateUUID(),
					feeRiskId: risk.id,
					accountId: risk.accountId,
					accountName: risk.accountName,
					type: 'transfer',
					priority: risk.likelihood === 'imminent' ? 'urgent' : 'high',
					title: 'Transfer Funds to Avoid Overdraft',
					description: `Transfer ${this.formatCurrency(amountNeeded, account.currency)} from ${sourceAccount.name} to avoid overdraft fee`,
					actionable: true,
					actionText: 'Create Transfer',
					actionUrl: `/transactions/add?type=transfer&from=${sourceAccount.id}&to=${account.id}&amount=${amountNeeded}`,
					estimatedSavings: risk.estimatedAmount,
					effort: 'low',
					confidence: 90,
					metadata: {
						sourceAccountId: sourceAccount.id,
						transferAmount: amountNeeded
					},
					createdAt: new Date(),
					expiresAt: risk.occurrenceDate || undefined
				});
			}
		}

		// Recommendation 2: Reschedule transactions
		if (risk.metadata.transactions && Array.isArray(risk.metadata.transactions)) {
			const adjustments = await this.generateTransactionAdjustments(
				risk.accountId,
				risk.metadata.transactions,
				risk.occurrenceDate || new Date()
			);

			if (adjustments.length > 0) {
				recommendations.push({
					id: generateUUID(),
					feeRiskId: risk.id,
					accountId: risk.accountId,
					accountName: risk.accountName,
					type: 'reschedule',
					priority: 'medium',
					title: 'Reschedule Transactions',
					description: `Reschedule ${adjustments.length} transaction(s) to avoid overdraft`,
					actionable: true,
					actionText: 'View Suggestions',
					actionUrl: `/accounts/${account.id}`,
					estimatedSavings: risk.estimatedAmount,
					effort: 'medium',
					confidence: 75,
					transactionIds: adjustments.map((a) => a.transactionId),
					suggestedTransactionChanges: adjustments,
					metadata: {
						adjustmentCount: adjustments.length
					},
					createdAt: new Date(),
					expiresAt: risk.occurrenceDate || undefined
				});
			}
		}

		// Recommendation 3: Adjust buffer amount
		recommendations.push({
			id: generateUUID(),
			feeRiskId: risk.id,
			accountId: risk.accountId,
			accountName: risk.accountName,
			type: 'adjust_buffer',
			priority: 'low',
			title: 'Increase Account Buffer',
			description: 'Consider increasing your account buffer to prevent future overdrafts',
			actionable: true,
			actionText: 'Adjust Buffer',
			actionUrl: `/accounts/${account.id}`,
			estimatedSavings: risk.estimatedAmount,
			effort: 'low',
			confidence: 60,
			metadata: {
				currentBuffer: getBufferAmount(account),
				suggestedBuffer:
					getBufferAmount(account) +
					Math.abs(risk.currentValue - risk.thresholdValue) +
					100
			},
			createdAt: new Date()
		});

		return recommendations;
	}

	/**
	 * Generate recommendations for minimum balance risks
	 */
	private async generateMinimumBalanceRecommendations(
		risk: FeeRisk
	): Promise<FeeAvoidanceRecommendation[]> {
		const recommendations: FeeAvoidanceRecommendation[] = [];
		const account = await accountService.getAccount(risk.accountId);
		if (!account) return recommendations;

		const amountNeeded = risk.thresholdValue - risk.currentValue;

		// Recommendation: Transfer funds to meet minimum
		const otherAccounts = (await accountService.getAccounts()).filter(
			(a) =>
				a.id !== risk.accountId &&
				a.isActive &&
				a.currentBalance >= amountNeeded &&
				a.currency === account.currency
		);

		if (otherAccounts.length > 0) {
			recommendations.push({
				id: generateUUID(),
				feeRiskId: risk.id,
				accountId: risk.accountId,
				accountName: risk.accountName,
				type: 'transfer',
				priority: 'medium',
				title: 'Maintain Minimum Balance',
				description: `Transfer ${this.formatCurrency(amountNeeded, account.currency)} to maintain minimum balance requirement`,
				actionable: true,
				actionText: 'Create Transfer',
				actionUrl: `/transactions/add?type=transfer&to=${account.id}&amount=${amountNeeded}`,
				estimatedSavings: risk.estimatedAmount,
				effort: 'low',
				confidence: 85,
				metadata: {
					amountNeeded,
					minimumBalance: risk.thresholdValue
				},
				createdAt: new Date(),
				expiresAt: risk.occurrenceDate || undefined
			});
		}

		return recommendations;
	}

	/**
	 * Generate recommendations for late payment risks
	 */
	private async generateLatePaymentRecommendations(
		risk: FeeRisk
	): Promise<FeeAvoidanceRecommendation[]> {
		const recommendations: FeeAvoidanceRecommendation[] = [];
		const account = await accountService.getAccount(risk.accountId);
		if (!account) return recommendations;

		const minimumPayment =
			account.metadata?.minimumPayment || Math.abs(account.currentBalance) * 0.02;

		recommendations.push({
			id: generateUUID(),
			feeRiskId: risk.id,
			accountId: risk.accountId,
			accountName: risk.accountName,
			type: 'transfer',
			priority: risk.likelihood === 'imminent' ? 'urgent' : 'high',
			title: 'Schedule Credit Card Payment',
			description: `Schedule a payment of at least ${this.formatCurrency(minimumPayment, account.currency)} before ${format(risk.occurrenceDate || new Date(), 'MMM d')}`,
			actionable: true,
			actionText: 'Schedule Payment',
			actionUrl: `/transactions/add?type=income&account=${account.id}&amount=${minimumPayment}`,
			estimatedSavings: risk.estimatedAmount,
			effort: 'low',
			confidence: 95,
			metadata: {
				minimumPayment,
				dueDate: risk.occurrenceDate
			},
			createdAt: new Date(),
			expiresAt: risk.occurrenceDate || undefined
		});

		return recommendations;
	}

	/**
	 * Generate recommendations for transfer limit risks
	 */
	private async generateTransferLimitRecommendations(
		risk: FeeRisk
	): Promise<FeeAvoidanceRecommendation[]> {
		const recommendations: FeeAvoidanceRecommendation[] = [];

		recommendations.push({
			id: generateUUID(),
			feeRiskId: risk.id,
			accountId: risk.accountId,
			accountName: risk.accountName,
			type: 'reduce_spending',
			priority: 'medium',
			title: 'Transfer Limit Approaching',
			description: `You've made ${risk.currentValue} of ${risk.thresholdValue} allowed transfers this month`,
			actionable: true,
			actionText: 'View Transfers',
			actionUrl: `/accounts/${risk.accountId}`,
			estimatedSavings: risk.estimatedAmount,
			effort: 'low',
			confidence: 90,
			metadata: {
				transferCount: risk.currentValue,
				transferLimit: risk.thresholdValue
			},
			createdAt: new Date()
		});

		return recommendations;
	}

	// ============================================================================
	// TRANSACTION OPTIMIZATION
	// ============================================================================

	/**
	 * Generate transaction adjustment suggestions
	 */
	private async generateTransactionAdjustments(
		accountId: string,
		transactionIds: string[],
		targetDate: Date
	): Promise<TransactionAdjustment[]> {
		const adjustments: TransactionAdjustment[] = [];

		for (const txId of transactionIds) {
			const transaction = await db.transactions.get(txId);
			if (!transaction || transaction.status !== 'planned') continue;

			const currentDate = transaction.plannedDate
				? parseISO(transaction.plannedDate)
				: new Date();

			// Suggest moving transaction later if it's causing the issue
			if (transaction.type === 'expense' && isBefore(currentDate, targetDate)) {
				const suggestedDate = addDays(targetDate, 3); // Move 3 days after problem date

				adjustments.push({
					transactionId: transaction.id,
					currentDate,
					suggestedDate,
					reason: 'Avoid overdraft by delaying expense',
					impact: Math.abs(transaction.amount || 0),
					confidence: 80
				});
			}
		}

		return adjustments;
	}

	/**
	 * Automatically apply transaction adjustments (with user permission)
	 */
	async applyTransactionAdjustments(adjustments: TransactionAdjustment[]): Promise<{
		applied: number;
		failed: number;
		errors: string[];
	}> {
		let applied = 0;
		let failed = 0;
		const errors: string[] = [];

		for (const adjustment of adjustments) {
			try {
				const transaction = await db.transactions.get(adjustment.transactionId);
				if (!transaction) {
					errors.push(`Transaction ${adjustment.transactionId} not found`);
					failed++;
					continue;
				}

				// Update the transaction's planned date
				await db.transactions.update(adjustment.transactionId, {
					plannedDate: adjustment.suggestedDate.toISOString(),
					updatedAt: new Date().toISOString()
				});

				applied++;
			} catch (error) {
				errors.push(`Failed to adjust transaction ${adjustment.transactionId}: ${error}`);
				failed++;
			}
		}

		// Clear projection cache after adjustments
		balanceProjectionService.clearCache();

		return { applied, failed, errors };
	}

	// ============================================================================
	// FEE AVOIDANCE STRATEGY
	// ============================================================================

	/**
	 * Generate complete fee avoidance strategy for an account
	 */
	async generateFeeAvoidanceStrategy(accountId: string): Promise<FeeAvoidanceStrategy> {
		const risks = await this.detectFeeRisks({ accountIds: [accountId] });
		const recommendations = await this.generateFeeAvoidanceRecommendations({
			accountIds: [accountId]
		});

		// Find auto-adjustable transactions
		const autoAdjustable: TransactionAdjustment[] = [];
		for (const recommendation of recommendations) {
			if (recommendation.suggestedTransactionChanges) {
				autoAdjustable.push(...recommendation.suggestedTransactionChanges);
			}
		}

		const totalPotentialSavings = risks.reduce((sum, risk) => sum + risk.estimatedAmount, 0);
		const requiresUserAction = recommendations.some((r) => r.actionable);

		return {
			accountId,
			totalPotentialSavings,
			recommendations,
			risks,
			autoAdjustableTransactions: autoAdjustable,
			requiresUserAction
		};
	}

	/**
	 * Generate strategies for all accounts
	 */
	async generateAllFeeAvoidanceStrategies(): Promise<FeeAvoidanceStrategy[]> {
		const accounts = await accountService.getAccounts();
		const strategies: FeeAvoidanceStrategy[] = [];

		for (const account of accounts) {
			if (!account.isActive) continue;

			const strategy = await this.generateFeeAvoidanceStrategy(account.id);
			if (strategy.risks.length > 0 || strategy.recommendations.length > 0) {
				strategies.push(strategy);
			}
		}

		return strategies.sort((a, b) => b.totalPotentialSavings - a.totalPotentialSavings);
	}

	// ============================================================================
	// ALERTS & INSIGHTS
	// ============================================================================

	/**
	 * Create insights for fee risks
	 */
	async createFeeAvoidanceInsights(): Promise<void> {
		const risks = await this.detectFeeRisks();

		for (const risk of risks) {
			// Only create insights for high-risk items
			if (risk.likelihood === 'high' || risk.likelihood === 'imminent') {
				await insightsService.createInsight({
					type: 'savings_opportunity',
					severity: risk.likelihood === 'imminent' ? 'alert' : 'warning',
					title: `${this.getFeeTypeLabel(risk.feeType)} Risk Detected`,
					message: `${risk.accountName}: ${risk.triggerCondition}`,
					percentage: Math.round(risk.confidence),
					amount: risk.estimatedAmount,
					confidence: risk.confidence,
					actionable: true,
					actionText: 'View Recommendations',
					actionUrl: `/accounts/${risk.accountId}`,
					metadata: {
						feeType: risk.feeType,
						accountId: risk.accountId,
						occurrenceDate: risk.occurrenceDate?.toISOString(),
						daysUntil: risk.daysUntilOccurrence
					}
				});
			}
		}
	}

	// ============================================================================
	// HELPER METHODS
	// ============================================================================

	/**
	 * Calculate likelihood based on days until occurrence and base confidence
	 */
	private calculateLikelihood(
		daysUntil: number,
		baseConfidence: number
	): 'low' | 'medium' | 'high' | 'imminent' {
		if (daysUntil <= 3) return 'imminent';
		if (daysUntil <= 7) return 'high';
		if (daysUntil <= 14) return 'medium';
		return baseConfidence > 75 ? 'medium' : 'low';
	}

	/**
	 * Filter risks by confidence threshold
	 */
	private filterRisksByConfidence(
		risks: FeeRisk[],
		minConfidence: number,
		includeAll: boolean
	): FeeRisk[] {
		if (includeAll) return risks;
		return risks.filter((r) => r.confidence >= minConfidence);
	}

	/**
	 * Get human-readable label for fee type
	 */
	private getFeeTypeLabel(feeType: FeeType): string {
		const labels: Record<FeeType, string> = {
			overdraft: 'Overdraft Fee',
			minimum_balance: 'Minimum Balance Fee',
			insufficient_funds: 'Insufficient Funds Fee',
			late_payment: 'Late Payment Fee',
			transfer_limit: 'Transfer Limit Fee',
			maintenance: 'Maintenance Fee',
			foreign_transaction: 'Foreign Transaction Fee',
			atm: 'ATM Fee',
			other: 'Fee'
		};
		return labels[feeType];
	}

	/**
	 * Format currency for display
	 */
	private formatCurrency(amount: number, currency: string): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}

	/**
	 * Clear detection cache
	 */
	clearCache(): void {
		this.detectionCache.clear();
		balanceProjectionService.clearCache();
	}

	/**
	 * Clear cache for specific accounts
	 */
	clearCacheForAccounts(accountIds: string[]): void {
		// Clear all cache entries that involve these accounts
		for (const [key, value] of this.detectionCache.entries()) {
			const cacheData = JSON.parse(key);
			if (
				cacheData.accountIds &&
				cacheData.accountIds.some((id: string) => accountIds.includes(id))
			) {
				this.detectionCache.delete(key);
			}
		}
		balanceProjectionService.clearCacheForAccounts(accountIds);
	}
}

export const feeAvoidanceService = new FeeAvoidanceService();
