/**
 * Enhanced Allowance Calculation Utilities
 * Implements three calculation methods with weighted combination:
 * 1. Historical Pattern-Based (6-month average + standard deviation)
 * 2. Buffer-Based (available funds - planned expenses - buffer - safety margin)
 * 3. Velocity-Adjusted (current spending rate vs historical)
 */

import type { Account, Transaction } from '$lib/core/db';
import { db, expenseCountsTowardAllowanceAnalytics } from '$lib/core/db';
import type { AllowanceProjection } from '$lib/core/services/core/budget-service';
import { getBufferAmount, calculateRecommendedBuffer } from './account-metadata-utils';
import { transactionService } from '$lib/core/services';
import { accountService } from '$lib/core/services';

/**
 * Allowance calculation result
 */
export interface AllowanceCalculation {
	/** Daily safe allowance amount */
	dailySafe: number;
	/** Monthly allowance amount */
	monthly: number;
	/** Remaining allowance for the period */
	remaining: number;
	/** Currency code */
	currency: string;
	/** Days remaining in period */
	daysRemaining: number;
	/** Method weights used in calculation */
	methodWeights: MethodWeights;
	/** Individual method results */
	methodResults: {
		historical?: number;
		buffer: number;
		velocity: number;
	};
	/** Spent so far in current period */
	spentSoFar: number;
	/** Projected balance at end of period */
	projectedBalance: number;
	/** Confidence score (0-1) */
	confidence: number;
}

/**
 * Method weights for combining calculation methods
 */
export interface MethodWeights {
	historical: number;
	buffer: number;
	velocity: number;
}

/**
 * Allowance category types
 */
export type AllowanceCategory = 'essential' | 'discretionary' | 'buffer';

/**
 * Enhanced allowance result with categories
 */
export interface EnhancedAllowance {
	/** Essential unplanned expenses allowance */
	essential: AllowanceCalculation;
	/** Discretionary spending allowance */
	discretionary: AllowanceCalculation;
	/** Pure buffer allowance (safety margin) */
	buffer: AllowanceCalculation;
	/** Total combined allowance */
	total: AllowanceCalculation;
	/** Period start date */
	periodStart: Date;
	/** Period end date */
	periodEnd: Date;
	/** Recommendations for allowance adjustments */
	recommendations: AllowanceRecommendation[];
	/** Phase 5 — forward three-layer projection (optional until loaded) */
	projection?: AllowanceProjection | null;
}

/**
 * Allowance recommendation
 */
export interface AllowanceRecommendation {
	type: 'increase' | 'decrease' | 'maintain' | 'warning';
	message: string;
	severity: 'low' | 'medium' | 'high';
	actionable: boolean;
	metadata?: Record<string, any>;
}

/**
 * Historical spending data for a period
 */
interface HistoricalSpendingData {
	average: number;
	stdDev: number;
	monthsOfData: number;
	hasEnoughData: boolean; // 3+ months required
}

type ReimbursementAllowanceMode = 'conservative' | 'optimistic';

function applyReimbursementAllowanceMode(
	transactions: Transaction[],
	mode: ReimbursementAllowanceMode
): Transaction[] {
	if (mode !== 'optimistic') return transactions;
	return transactions.map((tx) => {
		if (tx.type !== 'expense' || !tx.reimbursements?.length) return tx;
		const openExpected = tx.reimbursements
			.filter((entry) => entry.direction === 'lending' && entry.status === 'expecting')
			.reduce((sum, entry) => sum + entry.amount, 0);
		if (openExpected <= 0) return tx;
		const currentAmount = Math.abs(tx.amount || 0);
		const adjustedAmount = Math.max(0, currentAmount - openExpected);
		const signedAmount = tx.amount != null && tx.amount < 0 ? -adjustedAmount : adjustedAmount;
		return {
			...tx,
			amount: signedAmount
		};
	});
}

/**
 * Calculate enhanced allowance for an account
 */
export async function calculateEnhancedAllowance(
	account: Account,
	periodStart?: Date,
	periodEnd?: Date
): Promise<EnhancedAllowance> {
	const now = new Date();
	const start = periodStart || new Date(now.getFullYear(), now.getMonth(), 1);
	const end = periodEnd || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

	// Get all transactions for historical analysis
	const allTransactions = await transactionService.getTransactionsByAccount(account.id);
	const preferences = await db.userPreferences.toCollection().first();
	const reimbursementAllowanceMode: ReimbursementAllowanceMode =
		preferences?.reimbursementAllowanceMode === 'optimistic' ? 'optimistic' : 'conservative';
	const adjustedTransactions = applyReimbursementAllowanceMode(
		allTransactions,
		reimbursementAllowanceMode
	);
	const clearedTransactions = adjustedTransactions.filter((t) => t.status === 'cleared');

	// Calculate days elapsed and remaining
	const daysElapsed = Math.max(
		0,
		Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
	);
	const daysRemaining = Math.max(
		1,
		Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
	);

	// Get planned transactions for buffer calculation
	const plannedTransactions = adjustedTransactions.filter(
		(t) => (t.status === 'planned' || t.status === 'pending') && t.plannedDate
	);

	const categories = await db.getActiveCategories();
	const tierByCategoryId = new Map(categories.map((c) => [c.id, c.waterfallTier]));

	// Calculate historical spending data
	const historicalData = calculateHistoricalSpending(clearedTransactions, start, tierByCategoryId);

	// Calculate method weights based on data availability
	const methodWeights = calculateMethodWeights(
		historicalData.hasEnoughData,
		daysElapsed,
		daysRemaining
	);

	// Calculate spent so far in current period
	const spentSoFar = calculateSpentSoFar(clearedTransactions, start, now, tierByCategoryId);

	// Calculate buffer amount
	const bufferTransactions = clearedTransactions
		.filter((t) => t.amount !== undefined)
		.map((t) => ({
			amount: t.amount!,
			clearedDate: t.clearedDate,
			type: t.type
		}));
	const bufferAmount = await calculateRecommendedBuffer(account, bufferTransactions);

	// Calculate total allowance using all three methods
	const totalAllowance = await calculateTotalAllowance(
		account,
		historicalData,
		plannedTransactions,
		spentSoFar,
		daysElapsed,
		daysRemaining,
		bufferAmount,
		methodWeights,
		start,
		now
	);

	// Split into categories (simplified: 60% essential, 30% discretionary, 10% buffer)
	const essential = calculateCategoryAllowance(totalAllowance, 0.6, 'essential');
	const discretionary = calculateCategoryAllowance(totalAllowance, 0.3, 'discretionary');
	const bufferCategory = calculateCategoryAllowance(totalAllowance, 0.1, 'buffer');

	// Generate recommendations
	const recommendations = generateAllowanceRecommendations(
		totalAllowance,
		account,
		historicalData,
		spentSoFar,
		daysElapsed,
		daysRemaining
	);

	return {
		essential,
		discretionary,
		buffer: bufferCategory,
		total: totalAllowance,
		periodStart: start,
		periodEnd: end,
		recommendations
	};
}

/**
 * Calculate total allowance using weighted combination of three methods
 */
async function calculateTotalAllowance(
	account: Account,
	historicalData: HistoricalSpendingData,
	plannedTransactions: Transaction[],
	spentSoFar: number,
	daysElapsed: number,
	daysRemaining: number,
	bufferAmount: number,
	methodWeights: MethodWeights,
	periodStart: Date,
	now: Date
): Promise<AllowanceCalculation> {
	// Method 1: Historical Pattern-Based
	let historicalAllowance: number | undefined;
	if (historicalData.hasEnoughData) {
		// Average + 1 standard deviation for safety margin
		historicalAllowance = historicalData.average + historicalData.stdDev;
	}

	// Method 2: Buffer-Based
	const bufferAllowance = calculateBufferBasedAllowance(
		account,
		plannedTransactions,
		bufferAmount,
		now
	);

	// Method 3: Velocity-Adjusted
	const velocityAllowance = calculateVelocityAdjustedAllowance(
		historicalData,
		spentSoFar,
		daysElapsed,
		daysRemaining,
		historicalAllowance,
		bufferAllowance
	);

	// Combine methods with weights
	let combinedDaily: number;
	let totalWeight = methodWeights.buffer + methodWeights.velocity;

	if (historicalAllowance !== undefined && methodWeights.historical > 0) {
		totalWeight += methodWeights.historical;
		combinedDaily =
			((historicalAllowance / 30.44) * methodWeights.historical +
				(bufferAllowance / daysRemaining) * methodWeights.buffer +
				velocityAllowance * methodWeights.velocity) /
			totalWeight;
	} else {
		combinedDaily =
			((bufferAllowance / daysRemaining) * methodWeights.buffer +
				velocityAllowance * methodWeights.velocity) /
			totalWeight;
	}

	// Calculate monthly and remaining
	const monthly = combinedDaily * 30.44;
	const remaining = Math.max(0, monthly - spentSoFar);

	// Calculate projected balance
	const projectedBalance = account.currentBalance - (monthly - remaining);

	// Calculate confidence (higher with more historical data and more days elapsed)
	const confidence = Math.min(
		1.0,
		(historicalData.hasEnoughData ? 0.4 : 0.2) +
			methodWeights.buffer * 0.3 +
			methodWeights.velocity * 0.3 +
			(daysElapsed > 7 ? 0.2 : (daysElapsed / 7) * 0.2)
	);

	return {
		dailySafe: Math.max(0, combinedDaily),
		monthly,
		remaining,
		currency: account.currency,
		daysRemaining,
		methodWeights,
		methodResults: {
			historical: historicalAllowance,
			buffer: bufferAllowance,
			velocity: velocityAllowance * daysRemaining
		},
		spentSoFar,
		projectedBalance,
		confidence
	};
}

/**
 * Calculate historical spending data
 */
function calculateHistoricalSpending(
	transactions: Transaction[],
	periodStart: Date,
	tierByCategoryId: Map<string, string | undefined>
): HistoricalSpendingData {
	const sixMonthsAgo = new Date(periodStart);
	sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

	// Filter expenses from last 6 months
	const historicalExpenses = transactions
		.filter((t) => {
			if (!t.clearedDate) return false;
			const tier = t.categoryId ? tierByCategoryId.get(t.categoryId) : undefined;
			if (!expenseCountsTowardAllowanceAnalytics(t, tier)) return false;
			const date = new Date(t.clearedDate);
			return date >= sixMonthsAgo && date < periodStart;
		})
		.map((t) => Math.abs(t.amount || 0));

	if (historicalExpenses.length === 0) {
		return {
			average: 0,
			stdDev: 0,
			monthsOfData: 0,
			hasEnoughData: false
		};
	}

	// Group by month to calculate monthly averages
	const monthlyTotals = new Map<string, number>();
	historicalExpenses.forEach((amount, index) => {
		const transaction = transactions.find((t) => {
			const tier = t.categoryId ? tierByCategoryId.get(t.categoryId) : undefined;
			return expenseCountsTowardAllowanceAnalytics(t, tier) && Math.abs(t.amount || 0) === amount;
		});
		if (transaction?.clearedDate) {
			const date = new Date(transaction.clearedDate);
			const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
			monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + amount);
		}
	});

	const monthlyValues = Array.from(monthlyTotals.values());
	const monthsOfData = monthlyValues.length;

	if (monthsOfData === 0) {
		return {
			average: 0,
			stdDev: 0,
			monthsOfData: 0,
			hasEnoughData: false
		};
	}

	// Calculate average
	const average = monthlyValues.reduce((sum, val) => sum + val, 0) / monthsOfData;

	// Calculate standard deviation
	const variance =
		monthlyValues.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / monthsOfData;
	const stdDev = Math.sqrt(variance);

	return {
		average,
		stdDev,
		monthsOfData,
		hasEnoughData: monthsOfData >= 3
	};
}

/**
 * Calculate buffer-based allowance
 */
function calculateBufferBasedAllowance(
	account: Account,
	plannedTransactions: Transaction[],
	bufferAmount: number,
	now: Date
): number {
	// Find next major expense (largest planned expense in next 30 days)
	const thirtyDaysFromNow = new Date(now);
	thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

	const upcomingPlanned = plannedTransactions
		.filter((t) => {
			if (!t.plannedDate) return false;
			const date = new Date(t.plannedDate);
			return date >= now && date <= thirtyDaysFromNow;
		})
		.map((t) => Math.abs(t.amount || 0));

	const nextMajorExpense = upcomingPlanned.length > 0 ? Math.max(...upcomingPlanned) : 0;
	const totalPlannedExpenses = upcomingPlanned.reduce((sum, amt) => sum + amt, 0);

	// Calculate available funds after buffer and planned expenses
	const availableFunds = account.currentBalance - bufferAmount - totalPlannedExpenses;

	// Add safety margin (10% of planned expenses)
	const safetyMargin = totalPlannedExpenses * 0.1;

	// Buffer allowance = available funds - safety margin
	return Math.max(0, availableFunds - safetyMargin);
}

/**
 * Calculate velocity-adjusted allowance
 */
function calculateVelocityAdjustedAllowance(
	historicalData: HistoricalSpendingData,
	spentSoFar: number,
	daysElapsed: number,
	daysRemaining: number,
	historicalAllowance: number | undefined,
	bufferAllowance: number
): number {
	if (daysElapsed === 0) {
		// No spending data yet, use buffer allowance
		return bufferAllowance / daysRemaining;
	}

	// Calculate current spending rate
	const currentRate = spentSoFar / daysElapsed;

	// Project spending to end of period
	const projectedPeriodEnd = currentRate * (daysElapsed + daysRemaining);

	if (historicalAllowance !== undefined && historicalData.hasEnoughData) {
		// If projecting over historical average, adjust down
		if (projectedPeriodEnd > historicalData.average) {
			// Try to stay within historical average
			return Math.max(0, (historicalData.average - spentSoFar) / daysRemaining);
		} else {
			// On track, use historical pattern
			return (historicalAllowance - spentSoFar) / daysRemaining;
		}
	} else {
		// No historical data, use buffer allowance
		return bufferAllowance / daysRemaining;
	}
}

/**
 * Calculate method weights based on data availability and period progress
 */
function calculateMethodWeights(
	hasHistorical: boolean,
	daysElapsed: number,
	daysRemaining: number
): MethodWeights {
	const totalDays = daysElapsed + daysRemaining;
	const periodProgress = daysElapsed / totalDays;

	let weights: MethodWeights = {
		historical: hasHistorical ? 0.4 : 0,
		buffer: 0.4,
		velocity: 0.2
	};

	// Adjust velocity weight based on period progress
	// Higher weight mid-period when we have more spending data
	if (periodProgress > 0.3) {
		// After 30% of period
		weights.velocity = 0.3;
		weights.buffer = 0.3;
		if (hasHistorical) {
			weights.historical = 0.4;
		} else {
			weights.buffer = 0.5;
			weights.velocity = 0.5;
		}
	} else {
		// Early in period
		weights.velocity = 0.1;
		weights.buffer = hasHistorical ? 0.5 : 0.6;
		if (hasHistorical) {
			weights.historical = 0.4;
		}
	}

	return weights;
}

/**
 * Calculate spent so far in current period
 */
function calculateSpentSoFar(
	transactions: Transaction[],
	periodStart: Date,
	now: Date,
	tierByCategoryId: Map<string, string | undefined>
): number {
	return transactions
		.filter((t) => {
			if (!t.clearedDate) return false;
			const tier = t.categoryId ? tierByCategoryId.get(t.categoryId) : undefined;
			if (!expenseCountsTowardAllowanceAnalytics(t, tier)) return false;
			const date = new Date(t.clearedDate);
			return date >= periodStart && date <= now;
		})
		.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
}

/**
 * Calculate historical spending with currency conversion
 */
async function calculateHistoricalSpendingWithConversion(
	transactions: Transaction[],
	periodStart: Date,
	mainCurrency: string,
	tierByCategoryId: Map<string, string | undefined>
): Promise<HistoricalSpendingData> {
	const { exchangeRateService } = await import('$lib/core/services');
	const sixMonthsAgo = new Date(periodStart);
	sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

	// Filter expenses from last 6 months and convert to main currency
	const historicalExpenses: number[] = [];
	for (const t of transactions) {
		if (!t.clearedDate) continue;
		const tier = t.categoryId ? tierByCategoryId.get(t.categoryId) : undefined;
		if (!expenseCountsTowardAllowanceAnalytics(t, tier)) continue;
		const date = new Date(t.clearedDate);
		if (date < sixMonthsAgo || date >= periodStart) continue;

		const amount = Math.abs(t.amount || 0);
		const transactionCurrency = t.currency || mainCurrency;

		// Convert to main currency
		let convertedAmount = amount;
		if (transactionCurrency !== mainCurrency) {
			const converted = await exchangeRateService.convertAmount(
				amount,
				transactionCurrency,
				mainCurrency,
				date // Use transaction date for historical conversion
			);
			if (converted !== null) {
				convertedAmount = converted;
			} else {
				console.warn(
					`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${t.id}`
				);
			}
		}

		historicalExpenses.push(convertedAmount);
	}

	if (historicalExpenses.length === 0) {
		return {
			average: 0,
			stdDev: 0,
			monthsOfData: 0,
			hasEnoughData: false
		};
	}

	// Group by month to calculate monthly averages
	const monthlyTotals = new Map<string, number>();
	for (const t of transactions) {
		if (!t.clearedDate) continue;
		const tier = t.categoryId ? tierByCategoryId.get(t.categoryId) : undefined;
		if (!expenseCountsTowardAllowanceAnalytics(t, tier)) continue;
		const date = new Date(t.clearedDate);
		if (date < sixMonthsAgo || date >= periodStart) continue;

		const amount = Math.abs(t.amount || 0);
		const transactionCurrency = t.currency || mainCurrency;

		// Convert to main currency
		let convertedAmount = amount;
		if (transactionCurrency !== mainCurrency) {
			const converted = await exchangeRateService.convertAmount(
				amount,
				transactionCurrency,
				mainCurrency,
				date
			);
			if (converted !== null) {
				convertedAmount = converted;
			}
		}

		const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
		monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + convertedAmount);
	}

	const monthlyValues = Array.from(monthlyTotals.values());
	const monthsOfData = monthlyValues.length;

	if (monthsOfData === 0) {
		return {
			average: 0,
			stdDev: 0,
			monthsOfData: 0,
			hasEnoughData: false
		};
	}

	// Calculate average
	const average = monthlyValues.reduce((sum, val) => sum + val, 0) / monthsOfData;

	// Calculate standard deviation
	const variance =
		monthlyValues.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / monthsOfData;
	const stdDev = Math.sqrt(variance);

	return {
		average,
		stdDev,
		monthsOfData,
		hasEnoughData: monthsOfData >= 3
	};
}

/**
 * Calculate spent so far in current period with currency conversion
 */
async function calculateSpentSoFarWithConversion(
	transactions: Transaction[],
	periodStart: Date,
	now: Date,
	mainCurrency: string,
	tierByCategoryId: Map<string, string | undefined>
): Promise<number> {
	const { exchangeRateService } = await import('$lib/core/services');
	let total = 0;

	for (const t of transactions) {
		if (!t.clearedDate) continue;
		const tier = t.categoryId ? tierByCategoryId.get(t.categoryId) : undefined;
		if (!expenseCountsTowardAllowanceAnalytics(t, tier)) continue;
		const date = new Date(t.clearedDate);
		if (date < periodStart || date > now) continue;

		const amount = Math.abs(t.amount || 0);
		const transactionCurrency = t.currency || mainCurrency;

		// Convert to main currency
		let convertedAmount = amount;
		if (transactionCurrency !== mainCurrency) {
			const converted = await exchangeRateService.convertAmount(
				amount,
				transactionCurrency,
				mainCurrency,
				date
			);
			if (converted !== null) {
				convertedAmount = converted;
			} else {
				console.warn(
					`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${t.id}`
				);
			}
		}

		total += convertedAmount;
	}

	return total;
}

/**
 * Calculate category-specific allowance
 */
function calculateCategoryAllowance(
	total: AllowanceCalculation,
	percentage: number,
	category: AllowanceCategory
): AllowanceCalculation {
	return {
		...total,
		dailySafe: total.dailySafe * percentage,
		monthly: total.monthly * percentage,
		remaining: total.remaining * percentage
	};
}

/**
 * Generate allowance recommendations
 */
function generateAllowanceRecommendations(
	allowance: AllowanceCalculation,
	account: Account,
	historicalData: HistoricalSpendingData,
	spentSoFar: number,
	daysElapsed: number,
	daysRemaining: number
): AllowanceRecommendation[] {
	const recommendations: AllowanceRecommendation[] = [];

	// Check if spending is on track
	const projectedSpending = (spentSoFar / daysElapsed) * (daysElapsed + daysRemaining);
	const spendingRatio = projectedSpending / allowance.monthly;

	if (spendingRatio > 1.2) {
		// Spending 20%+ over allowance
		recommendations.push({
			type: 'warning',
			message: `You're spending ${((spendingRatio - 1) * 100).toFixed(0)}% above your allowance. Consider reducing discretionary spending.`,
			severity: 'high',
			actionable: true,
			metadata: { spendingRatio, projectedSpending, allowance: allowance.monthly }
		});
	} else if (spendingRatio > 1.0) {
		recommendations.push({
			type: 'warning',
			message: "You're slightly over your allowance. Monitor spending closely.",
			severity: 'medium',
			actionable: true,
			metadata: { spendingRatio }
		});
	} else if (spendingRatio < 0.8 && daysElapsed > 7) {
		// Spending well under allowance after first week
		recommendations.push({
			type: 'maintain',
			message: "You're spending below your allowance. Great job staying on track!",
			severity: 'low',
			actionable: false,
			metadata: { spendingRatio }
		});
	}

	// Check if allowance is too low based on historical data
	if (historicalData.hasEnoughData && allowance.monthly < historicalData.average * 0.8) {
		recommendations.push({
			type: 'increase',
			message: `Your allowance is ${((1 - allowance.monthly / historicalData.average) * 100).toFixed(0)}% below your historical average. Consider increasing it if your income allows.`,
			severity: 'medium',
			actionable: true,
			metadata: {
				historicalAverage: historicalData.average,
				currentAllowance: allowance.monthly
			}
		});
	}

	// Check buffer status
	const bufferAmount = getBufferAmount(account);
	if (account.currentBalance < bufferAmount) {
		recommendations.push({
			type: 'warning',
			message: `Your account balance is below the recommended buffer of ${bufferAmount.toFixed(2)}. Reduce spending to rebuild your buffer.`,
			severity: 'high',
			actionable: true,
			metadata: { bufferAmount, currentBalance: account.currentBalance }
		});
	}

	return recommendations;
}

/**
 * Calculate enhanced allowance across all accounts (global allowance)
 */
export async function calculateGlobalAllowance(
	periodStart?: Date,
	periodEnd?: Date
): Promise<EnhancedAllowance> {
	const now = new Date();
	const start = periodStart || new Date(now.getFullYear(), now.getMonth(), 1);
	const end = periodEnd || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

	// Get all active accounts
	const accounts = await accountService.getAccounts();
	const activeAccounts = accounts.filter(
		(a) => a.isActive && (a.type === 'checking' || a.type === 'savings')
	);

	if (activeAccounts.length === 0) {
		throw new Error('No active accounts found');
	}

	// Get user's main currency
	const { userService, exchangeRateService } = await import('$lib/core/services');
	const preferences = await userService.getUserPreferences();
	const userCurrency = preferences?.currency || activeAccounts[0]?.currency || 'USD';
	const reimbursementAllowanceMode: ReimbursementAllowanceMode =
		preferences?.reimbursementAllowanceMode === 'optimistic' ? 'optimistic' : 'conservative';

	// Get all transactions across all accounts
	const allTransactions = await transactionService.getAllTransactions();
	const adjustedTransactions = applyReimbursementAllowanceMode(
		allTransactions,
		reimbursementAllowanceMode
	);
	const clearedTransactions = adjustedTransactions.filter((t) => t.status === 'cleared');

	// Calculate days elapsed and remaining
	const daysElapsed = Math.max(
		0,
		Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
	);
	const daysRemaining = Math.max(
		1,
		Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
	);

	// Get planned transactions for buffer calculation
	const plannedTransactions = adjustedTransactions.filter(
		(t) => (t.status === 'planned' || t.status === 'pending') && t.plannedDate
	);

	const categories = await db.getActiveCategories();
	const tierByCategoryId = new Map(categories.map((c) => [c.id, c.waterfallTier]));

	// Calculate historical spending data across all accounts (converted to main currency)
	const historicalData = await calculateHistoricalSpendingWithConversion(
		clearedTransactions,
		start,
		userCurrency,
		tierByCategoryId
	);

	// Calculate method weights based on data availability
	const methodWeights = calculateMethodWeights(
		historicalData.hasEnoughData,
		daysElapsed,
		daysRemaining
	);

	// Calculate spent so far in current period (converted to main currency)
	const spentSoFar = await calculateSpentSoFarWithConversion(
		clearedTransactions,
		start,
		now,
		userCurrency,
		tierByCategoryId
	);

	// Calculate total balance and total buffer across all accounts (converted to main currency)
	let totalBalance = 0;
	for (const account of activeAccounts) {
		if (account.currency === userCurrency) {
			totalBalance += account.currentBalance;
		} else {
			const converted = await exchangeRateService.convertAmount(
				account.currentBalance,
				account.currency,
				userCurrency
			);
			if (converted !== null) {
				totalBalance += converted;
			} else {
				console.warn(
					`Failed to convert ${account.currency} to ${userCurrency} for account ${account.name}`
				);
				totalBalance += account.currentBalance;
			}
		}
	}

	// Calculate total buffer (sum of all account buffers, converted to main currency)
	let totalBufferAmount = 0;
	for (const account of activeAccounts) {
		const accountTransactions = clearedTransactions
			.filter((t) => t.accountId === account.id && t.amount !== undefined)
			.map((t) => ({
				amount: t.amount!,
				clearedDate: t.clearedDate,
				type: t.type
			}));
		const buffer = await calculateRecommendedBuffer(account, accountTransactions);

		// Convert buffer to main currency
		if (account.currency === userCurrency) {
			totalBufferAmount += buffer;
		} else {
			const converted = await exchangeRateService.convertAmount(
				buffer,
				account.currency,
				userCurrency
			);
			if (converted !== null) {
				totalBufferAmount += converted;
			} else {
				console.warn(`Failed to convert buffer from ${account.currency} to ${userCurrency}`);
				totalBufferAmount += buffer;
			}
		}
	}

	// Create a virtual account for calculations
	const virtualAccount: Account = {
		id: 'global',
		name: 'All Accounts',
		type: 'checking',
		currency: userCurrency,
		currentBalance: totalBalance,
		initialBalance: totalBalance,
		isActive: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: null,
		metadata: {
			bufferAmount: totalBufferAmount
		}
	};

	// Calculate total allowance using all three methods
	const totalAllowance = await calculateTotalAllowance(
		virtualAccount,
		historicalData,
		plannedTransactions,
		spentSoFar,
		daysElapsed,
		daysRemaining,
		totalBufferAmount,
		methodWeights,
		start,
		now
	);

	// Split into categories (simplified: 60% essential, 30% discretionary, 10% buffer)
	const essential = calculateCategoryAllowance(totalAllowance, 0.6, 'essential');
	const discretionary = calculateCategoryAllowance(totalAllowance, 0.3, 'discretionary');
	const bufferCategory = calculateCategoryAllowance(totalAllowance, 0.1, 'buffer');

	// Generate recommendations (using virtual account for buffer checks)
	const recommendations = generateAllowanceRecommendations(
		totalAllowance,
		virtualAccount,
		historicalData,
		spentSoFar,
		daysElapsed,
		daysRemaining
	);

	return {
		essential,
		discretionary,
		buffer: bufferCategory,
		total: totalAllowance,
		periodStart: start,
		periodEnd: end,
		recommendations
	};
}

/**
 * Get simple daily allowance (backward compatibility - now uses global calculation)
 */
export async function getSimpleDailyAllowance(accountId?: string): Promise<{
	amount: number;
	currency: string;
	daysRemaining: number;
	projectedBalance: number;
}> {
	// If accountId provided, use account-specific (for backward compatibility)
	if (accountId) {
		const account = await accountService.getAccount(accountId);
		if (account) {
			const enhanced = await calculateEnhancedAllowance(account);
			return {
				amount: enhanced.total.dailySafe,
				currency: enhanced.total.currency,
				daysRemaining: enhanced.total.daysRemaining,
				projectedBalance: enhanced.total.projectedBalance
			};
		}
	}

	// Otherwise use global calculation
	const enhanced = await calculateGlobalAllowance();
	return {
		amount: enhanced.total.dailySafe,
		currency: enhanced.total.currency,
		daysRemaining: enhanced.total.daysRemaining,
		projectedBalance: enhanced.total.projectedBalance
	};
}
