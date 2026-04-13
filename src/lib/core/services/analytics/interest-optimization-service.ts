/**
 * Interest Optimization Service
 *
 * Provides interest calculation, optimization recommendations, and alerts
 * to help users maximize interest earnings and minimize interest costs.
 *
 * Features:
 * - Interest calculation engine (compound interest, daily/monthly/annual)
 * - Interest optimization recommendations
 * - Interest rate tracking and updates
 * - Automatic balance optimization
 * - Interest alerts and opportunities
 */

import { accountService } from '../core/account-service';
import { transactionService } from '../core/transaction-service';
import { insightsService } from './insights-service';
import { balanceProjectionService } from './balance-projection-service';
import type { Account, Transaction } from '$lib/core/db';
import { generateUUID } from '$lib/core/db';
import { addDays, addMonths, addYears, differenceInDays, startOfDay, parseISO } from 'date-fns';
import { formatTransactionAmount, formatPercentage } from '$lib/utils/currency-utils';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Interest calculation result for a single account
 */
export interface InterestCalculation {
	accountId: string;
	accountName: string;
	accountType: Account['type'];
	currentBalance: number;
	interestRate: number; // Annual percentage rate
	compoundingFrequency: 'daily' | 'monthly' | 'quarterly' | 'annually';

	// Calculated values
	dailyInterest: number;
	monthlyInterest: number;
	annualInterest: number;

	// Projected values
	projected30Days: number;
	projected90Days: number;
	projected1Year: number;

	// Cost/earnings
	isEarning: boolean; // true for savings (earning), false for credit/loans (costing)
	currency: string;
}

/**
 * Interest optimization analysis
 */
export interface InterestOptimizationAnalysis {
	accountId: string;
	accountName: string;
	currentInterest: InterestCalculation;
	optimizationOpportunities: InterestOpportunity[];
	recommendedActions: InterestRecommendation[];
	projectedSavings?: number; // For debt accounts (interest cost savings)
	projectedEarnings?: number; // For savings accounts (interest earnings)
}

/**
 * Interest opportunity (potential optimization)
 */
export interface InterestOpportunity {
	id: string;
	type:
		| 'balance_transfer'
		| 'rate_increase'
		| 'balance_optimization'
		| 'debt_paydown'
		| 'savings_deposit';
	priority: 'low' | 'medium' | 'high' | 'urgent';
	title: string;
	description: string;
	estimatedValue: number; // Annual value in currency
	estimatedMonthlyValue: number;
	actionable: boolean;
	accountId?: string;
	accountName?: string;
	targetAccountId?: string;
	targetAccountName?: string;
	metadata: Record<string, any>;
}

/**
 * Interest optimization recommendation
 */
export interface InterestRecommendation {
	id: string;
	type: 'transfer' | 'paydown' | 'deposit' | 'rate_negotiation' | 'account_switch';
	priority: 'low' | 'medium' | 'high' | 'urgent';
	title: string;
	description: string;
	recommendedAction: string;
	estimatedAnnualValue: number;
	estimatedMonthlyValue: number;
	accountId?: string;
	accountName?: string;
	targetAccountId?: string;
	targetAccountName?: string;
	actionable: boolean;
	metadata: Record<string, any>;
}

/**
 * Aggregate interest analysis
 */
export interface AggregateInterestAnalysis {
	totalAnnualEarnings: number; // From savings accounts
	totalAnnualCosts: number; // From credit/loan accounts
	netAnnualInterest: number; // Earnings - Costs
	savingsAccounts: InterestCalculation[];
	debtAccounts: InterestCalculation[];
	optimizationPotential: number; // Potential annual savings/earnings
	recommendations: InterestRecommendation[];
}

/**
 * Interest rate history entry
 */
export interface InterestRateHistory {
	accountId: string;
	rate: number;
	effectiveDate: Date;
	notes?: string;
}

// ============================================================================
// INTEREST CALCULATION ENGINE
// ============================================================================

/**
 * Calculate compound interest
 *
 * @param principal - Initial balance
 * @param rate - Annual interest rate (as decimal, e.g., 0.05 for 5%)
 * @param time - Time period in years
 * @param compoundingFrequency - How often interest compounds
 * @returns Final amount after interest
 */
function calculateCompoundInterest(
	principal: number,
	rate: number,
	time: number,
	compoundingFrequency: 'daily' | 'monthly' | 'quarterly' | 'annually' = 'daily'
): number {
	const n =
		compoundingFrequency === 'daily'
			? 365
			: compoundingFrequency === 'monthly'
				? 12
				: compoundingFrequency === 'quarterly'
					? 4
					: 1;

	return principal * Math.pow(1 + rate / n, n * time);
}

/**
 * Calculate interest for a period
 *
 * @param balance - Current balance
 * @param rate - Annual interest rate (as percentage, e.g., 5 for 5%)
 * @param days - Number of days
 * @param compoundingFrequency - Compounding frequency
 * @returns Interest amount
 */
function calculateInterestForPeriod(
	balance: number,
	rate: number,
	days: number,
	compoundingFrequency: 'daily' | 'monthly' | 'quarterly' | 'annually' = 'daily'
): number {
	if (balance === 0 || rate === 0) return 0;

	const rateDecimal = rate / 100;
	const years = days / 365;
	const finalAmount = calculateCompoundInterest(balance, rateDecimal, years, compoundingFrequency);
	return finalAmount - balance;
}

/**
 * Calculate daily interest
 */
function calculateDailyInterest(balance: number, annualRate: number): number {
	if (balance === 0 || annualRate === 0) return 0;
	return (balance * annualRate) / 100 / 365;
}

/**
 * Calculate monthly interest
 */
function calculateMonthlyInterest(balance: number, annualRate: number): number {
	if (balance === 0 || annualRate === 0) return 0;
	return (balance * annualRate) / 100 / 12;
}

/**
 * Calculate annual interest
 */
function calculateAnnualInterest(balance: number, annualRate: number): number {
	if (balance === 0 || annualRate === 0) return 0;
	return (balance * annualRate) / 100;
}

// ============================================================================
// INTEREST OPTIMIZATION SERVICE
// ============================================================================

class InterestOptimizationService {
	private rateHistory: Map<string, InterestRateHistory[]> = new Map();

	/**
	 * Calculate interest for a single account
	 */
	async calculateInterest(accountId: string): Promise<InterestCalculation | null> {
		const account = await accountService.getAccount(accountId);
		if (!account) return null;

		// Get interest rate from metadata
		let interestRate = 0;
		let compoundingFrequency: 'daily' | 'monthly' | 'quarterly' | 'annually' = 'daily';
		let isEarning = false;

		if (account.type === 'savings') {
			interestRate = account.metadata?.interestRate || 0;
			isEarning = true;
			// Savings accounts typically compound daily
			compoundingFrequency = 'daily';
		} else if (account.type === 'credit') {
			interestRate = account.metadata?.apr || 0;
			isEarning = false;
			// Credit cards typically compound daily
			compoundingFrequency = 'daily';
		} else if (account.type === 'checking') {
			// Some checking accounts have interest
			interestRate = account.metadata?.interestRate || 0;
			isEarning = interestRate > 0;
			compoundingFrequency = 'daily';
		}

		if (interestRate === 0) {
			return null; // No interest to calculate
		}

		const currentBalance = Math.abs(account.currentBalance);
		const dailyInterest = calculateDailyInterest(currentBalance, interestRate);
		const monthlyInterest = calculateMonthlyInterest(currentBalance, interestRate);
		const annualInterest = calculateAnnualInterest(currentBalance, interestRate);

		// Projected values
		const projected30Days = calculateInterestForPeriod(
			currentBalance,
			interestRate,
			30,
			compoundingFrequency
		);
		const projected90Days = calculateInterestForPeriod(
			currentBalance,
			interestRate,
			90,
			compoundingFrequency
		);
		const projected1Year = calculateInterestForPeriod(
			currentBalance,
			interestRate,
			365,
			compoundingFrequency
		);

		return {
			accountId: account.id,
			accountName: account.name,
			accountType: account.type,
			currentBalance,
			interestRate,
			compoundingFrequency,
			dailyInterest,
			monthlyInterest,
			annualInterest,
			projected30Days,
			projected90Days,
			projected1Year,
			isEarning,
			currency: account.currency
		};
	}

	/**
	 * Analyze interest optimization for a single account
	 */
	async analyzeAccount(accountId: string): Promise<InterestOptimizationAnalysis | null> {
		const interestCalc = await this.calculateInterest(accountId);
		if (!interestCalc) return null;

		const opportunities = await this.findOpportunities(accountId, interestCalc);
		const recommendations = await this.generateRecommendations(
			accountId,
			interestCalc,
			opportunities
		);

		// Calculate projected savings/earnings
		let projectedSavings: number | undefined;
		let projectedEarnings: number | undefined;

		if (!interestCalc.isEarning) {
			// For debt accounts, calculate potential savings from paydown
			projectedSavings = recommendations
				.filter((r) => r.type === 'paydown')
				.reduce((sum, r) => sum + r.estimatedAnnualValue, 0);
		} else {
			// For savings accounts, calculate potential earnings from deposits
			projectedEarnings = recommendations
				.filter((r) => r.type === 'deposit')
				.reduce((sum, r) => sum + r.estimatedAnnualValue, 0);
		}

		return {
			accountId,
			accountName: interestCalc.accountName,
			currentInterest: interestCalc,
			optimizationOpportunities: opportunities,
			recommendedActions: recommendations,
			projectedSavings,
			projectedEarnings
		};
	}

	/**
	 * Analyze aggregate interest across all accounts
	 */
	async analyzeAggregate(): Promise<AggregateInterestAnalysis | null> {
		const accounts = await accountService.getAccounts();
		const savingsAccounts: InterestCalculation[] = [];
		const debtAccounts: InterestCalculation[] = [];

		let totalAnnualEarnings = 0;
		let totalAnnualCosts = 0;

		// Calculate interest for all accounts
		for (const account of accounts) {
			const interest = await this.calculateInterest(account.id);
			if (!interest) continue;

			if (interest.isEarning) {
				savingsAccounts.push(interest);
				totalAnnualEarnings += interest.annualInterest;
			} else {
				debtAccounts.push(interest);
				totalAnnualCosts += interest.annualInterest;
			}
		}

		if (savingsAccounts.length === 0 && debtAccounts.length === 0) {
			return null;
		}

		// Generate aggregate recommendations
		const recommendations = await this.generateAggregateRecommendations(
			savingsAccounts,
			debtAccounts
		);

		// Calculate optimization potential
		const optimizationPotential = recommendations.reduce(
			(sum, rec) => sum + rec.estimatedAnnualValue,
			0
		);

		return {
			totalAnnualEarnings,
			totalAnnualCosts,
			netAnnualInterest: totalAnnualEarnings - totalAnnualCosts,
			savingsAccounts,
			debtAccounts,
			optimizationPotential,
			recommendations
		};
	}

	/**
	 * Find optimization opportunities for an account
	 */
	private async findOpportunities(
		accountId: string,
		interestCalc: InterestCalculation
	): Promise<InterestOpportunity[]> {
		const opportunities: InterestOpportunity[] = [];
		const account = await accountService.getAccount(accountId);
		if (!account) return opportunities;

		// For debt accounts (credit cards, loans)
		if (!interestCalc.isEarning && interestCalc.interestRate > 0) {
			// High interest debt paydown opportunity
			if (interestCalc.interestRate > 15) {
				opportunities.push({
					id: generateUUID(),
					type: 'debt_paydown',
					priority: interestCalc.interestRate > 25 ? 'urgent' : 'high',
					title: `High Interest Debt: ${account.name}`,
					description: `This account has a ${formatPercentage(interestCalc.interestRate, { maxDecimals: 2 })} APR, costing you ${formatTransactionAmount(interestCalc.annualInterest, account.currency)} annually.`,
					estimatedValue: interestCalc.annualInterest,
					estimatedMonthlyValue: interestCalc.monthlyInterest,
					actionable: true,
					accountId: account.id,
					accountName: account.name,
					metadata: {
						currentRate: interestCalc.interestRate,
						currentBalance: interestCalc.currentBalance,
						annualCost: interestCalc.annualInterest
					}
				});
			}

			// Balance transfer opportunity (if other accounts have lower rates)
			const allAccounts = await accountService.getAccounts();
			const lowerRateAccounts = allAccounts.filter((acc) => {
				if (acc.id === accountId || acc.type !== 'credit') return false;
				const otherRate = acc.metadata?.apr || 0;
				return otherRate > 0 && otherRate < interestCalc.interestRate;
			});

			if (lowerRateAccounts.length > 0) {
				const bestOption = lowerRateAccounts.reduce((best, acc) => {
					const rate = acc.metadata?.apr || 0;
					return rate < (best.metadata?.apr || Infinity) ? acc : best;
				});

				const savingsRate = interestCalc.interestRate - (bestOption.metadata?.apr || 0);
				const annualSavings = (interestCalc.currentBalance * savingsRate) / 100;

				if (annualSavings > 100) {
					// Only suggest if savings > $100/year
					opportunities.push({
						id: generateUUID(),
						type: 'balance_transfer',
						priority: annualSavings > 500 ? 'high' : 'medium',
						title: `Balance Transfer Opportunity`,
						description: `Transfer balance to ${bestOption.name} (${formatPercentage(bestOption.metadata?.apr || 0, { maxDecimals: 2 })} APR) could save ${formatTransactionAmount(annualSavings, account.currency)} annually.`,
						estimatedValue: annualSavings,
						estimatedMonthlyValue: annualSavings / 12,
						actionable: true,
						accountId: account.id,
						accountName: account.name,
						targetAccountId: bestOption.id,
						targetAccountName: bestOption.name,
						metadata: {
							currentRate: interestCalc.interestRate,
							targetRate: bestOption.metadata?.apr || 0,
							potentialSavings: annualSavings
						}
					});
				}
			}
		}

		// For savings accounts
		if (interestCalc.isEarning && interestCalc.interestRate > 0) {
			// Low interest rate opportunity (could move to higher rate account)
			const allAccounts = await accountService.getAccounts();
			const higherRateAccounts = allAccounts.filter((acc) => {
				if (acc.id === accountId || acc.type !== 'savings') return false;
				const otherRate = acc.metadata?.interestRate || 0;
				return otherRate > interestCalc.interestRate;
			});

			if (higherRateAccounts.length > 0) {
				const bestOption = higherRateAccounts.reduce((best, acc) => {
					const rate = acc.metadata?.interestRate || 0;
					return rate > (best.metadata?.interestRate || 0) ? acc : best;
				});

				const rateIncrease = (bestOption.metadata?.interestRate || 0) - interestCalc.interestRate;
				const annualEarningsIncrease = (interestCalc.currentBalance * rateIncrease) / 100;

				if (annualEarningsIncrease > 50) {
					// Only suggest if increase > $50/year
					opportunities.push({
						id: generateUUID(),
						type: 'rate_increase',
						priority: annualEarningsIncrease > 200 ? 'high' : 'medium',
						title: `Higher Interest Rate Available`,
						description: `Moving funds to ${bestOption.name} (${formatPercentage(bestOption.metadata?.interestRate || 0, { maxDecimals: 2 })} APY) could earn ${formatTransactionAmount(annualEarningsIncrease, account.currency)} more annually.`,
						estimatedValue: annualEarningsIncrease,
						estimatedMonthlyValue: annualEarningsIncrease / 12,
						actionable: true,
						accountId: account.id,
						accountName: account.name,
						targetAccountId: bestOption.id,
						targetAccountName: bestOption.name,
						metadata: {
							currentRate: interestCalc.interestRate,
							targetRate: bestOption.metadata?.interestRate || 0,
							potentialIncrease: annualEarningsIncrease
						}
					});
				}
			}

			// Balance optimization (deposit more to earn more)
			if (interestCalc.currentBalance < 10000) {
				const potentialDeposit = 10000 - interestCalc.currentBalance;
				const additionalEarnings = (potentialDeposit * interestCalc.interestRate) / 100;

				opportunities.push({
					id: generateUUID(),
					type: 'savings_deposit',
					priority: 'low',
					title: `Increase Savings Balance`,
					description: `Depositing ${formatTransactionAmount(potentialDeposit, account.currency)} more could earn an additional ${formatTransactionAmount(additionalEarnings, account.currency)} annually.`,
					estimatedValue: additionalEarnings,
					estimatedMonthlyValue: additionalEarnings / 12,
					actionable: true,
					accountId: account.id,
					accountName: account.name,
					metadata: {
						currentBalance: interestCalc.currentBalance,
						recommendedBalance: 10000,
						additionalEarnings
					}
				});
			}
		}

		return opportunities;
	}

	/**
	 * Generate optimization recommendations
	 */
	private async generateRecommendations(
		accountId: string,
		interestCalc: InterestCalculation,
		opportunities: InterestOpportunity[]
	): Promise<InterestRecommendation[]> {
		const recommendations: InterestRecommendation[] = [];
		const account = await accountService.getAccount(accountId);
		if (!account) return recommendations;

		// Convert opportunities to recommendations
		for (const opp of opportunities) {
			if (opp.type === 'debt_paydown') {
				recommendations.push({
					id: generateUUID(),
					type: 'paydown',
					priority: opp.priority,
					title: `Pay Down High Interest Debt`,
					description: opp.description,
					recommendedAction: `Pay down ${account.name} balance to reduce interest costs.`,
					estimatedAnnualValue: opp.estimatedValue,
					estimatedMonthlyValue: opp.estimatedMonthlyValue,
					accountId: account.id,
					accountName: account.name,
					actionable: true,
					metadata: opp.metadata
				});
			} else if (opp.type === 'balance_transfer') {
				recommendations.push({
					id: generateUUID(),
					type: 'transfer',
					priority: opp.priority,
					title: `Consider Balance Transfer`,
					description: opp.description,
					recommendedAction: `Transfer balance from ${account.name} to ${opp.targetAccountName} to save on interest.`,
					estimatedAnnualValue: opp.estimatedValue,
					estimatedMonthlyValue: opp.estimatedMonthlyValue,
					accountId: account.id,
					accountName: account.name,
					targetAccountId: opp.targetAccountId,
					targetAccountName: opp.targetAccountName,
					actionable: true,
					metadata: opp.metadata
				});
			} else if (opp.type === 'rate_increase') {
				recommendations.push({
					id: generateUUID(),
					type: 'account_switch',
					priority: opp.priority,
					title: `Switch to Higher Rate Account`,
					description: opp.description,
					recommendedAction: `Move funds from ${account.name} to ${opp.targetAccountName} to earn more interest.`,
					estimatedAnnualValue: opp.estimatedValue,
					estimatedMonthlyValue: opp.estimatedMonthlyValue,
					accountId: account.id,
					accountName: account.name,
					targetAccountId: opp.targetAccountId,
					targetAccountName: opp.targetAccountName,
					actionable: true,
					metadata: opp.metadata
				});
			} else if (opp.type === 'savings_deposit') {
				recommendations.push({
					id: generateUUID(),
					type: 'deposit',
					priority: opp.priority,
					title: `Increase Savings Balance`,
					description: opp.description,
					recommendedAction: `Deposit more funds into ${account.name} to maximize interest earnings.`,
					estimatedAnnualValue: opp.estimatedValue,
					estimatedMonthlyValue: opp.estimatedMonthlyValue,
					accountId: account.id,
					accountName: account.name,
					actionable: true,
					metadata: opp.metadata
				});
			}
		}

		return recommendations.sort((a, b) => {
			const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
			return priorityOrder[b.priority] - priorityOrder[a.priority];
		});
	}

	/**
	 * Generate aggregate recommendations across all accounts
	 */
	private async generateAggregateRecommendations(
		savingsAccounts: InterestCalculation[],
		debtAccounts: InterestCalculation[]
	): Promise<InterestRecommendation[]> {
		const recommendations: InterestRecommendation[] = [];

		// Prioritize paying down highest interest debt
		const sortedDebt = [...debtAccounts].sort((a, b) => b.interestRate - a.interestRate);
		if (sortedDebt.length > 0 && sortedDebt[0].interestRate > 15) {
			const topDebt = sortedDebt[0];
			recommendations.push({
				id: generateUUID(),
				type: 'paydown',
				priority: topDebt.interestRate > 25 ? 'urgent' : 'high',
				title: `Prioritize Paying Down High Interest Debt`,
				description: `${topDebt.accountName} has the highest APR at ${formatPercentage(topDebt.interestRate, { maxDecimals: 2 })}, costing ${formatTransactionAmount(topDebt.annualInterest, topDebt.currency)} annually.`,
				recommendedAction: `Focus on paying down ${topDebt.accountName} first to maximize interest savings.`,
				estimatedAnnualValue: topDebt.annualInterest,
				estimatedMonthlyValue: topDebt.monthlyInterest,
				accountId: topDebt.accountId,
				accountName: topDebt.accountName,
				actionable: true,
				metadata: {
					rate: topDebt.interestRate,
					annualCost: topDebt.annualInterest
				}
			});
		}

		// Suggest moving savings to highest rate account
		if (savingsAccounts.length > 1) {
			const sortedSavings = [...savingsAccounts].sort((a, b) => b.interestRate - a.interestRate);
			const highestRate = sortedSavings[0];
			const lowerRateAccounts = sortedSavings.filter(
				(s) => s.interestRate < highestRate.interestRate
			);

			if (lowerRateAccounts.length > 0) {
				const totalLowerRateBalance = lowerRateAccounts.reduce(
					(sum, acc) => sum + acc.currentBalance,
					0
				);
				const rateDiff = highestRate.interestRate - lowerRateAccounts[0].interestRate;
				const potentialIncrease = (totalLowerRateBalance * rateDiff) / 100;

				if (potentialIncrease > 100) {
					recommendations.push({
						id: generateUUID(),
						type: 'account_switch',
						priority: potentialIncrease > 500 ? 'high' : 'medium',
						title: `Consolidate Savings for Better Rates`,
						description: `Moving funds to ${highestRate.accountName} (${formatPercentage(highestRate.interestRate, { maxDecimals: 2 })} APY) could increase earnings by ${formatTransactionAmount(potentialIncrease, highestRate.currency)} annually.`,
						recommendedAction: `Consolidate savings accounts to maximize interest earnings.`,
						estimatedAnnualValue: potentialIncrease,
						estimatedMonthlyValue: potentialIncrease / 12,
						targetAccountId: highestRate.accountId,
						targetAccountName: highestRate.accountName,
						actionable: true,
						metadata: {
							targetRate: highestRate.interestRate,
							potentialIncrease
						}
					});
				}
			}
		}

		return recommendations;
	}

	/**
	 * Optimize balance distribution for maximum interest benefit
	 *
	 * This algorithm suggests optimal balance distribution across accounts
	 * to maximize earnings and minimize costs.
	 */
	async optimizeBalanceDistribution(
		availableFunds: number,
		options: {
			prioritizeDebtPaydown?: boolean;
			maximizeSavings?: boolean;
			targetAccounts?: string[];
		} = {}
	): Promise<{
		recommendations: Array<{
			accountId: string;
			accountName: string;
			recommendedAmount: number;
			action: 'paydown' | 'deposit' | 'transfer';
			estimatedAnnualValue: number;
			priority: 'low' | 'medium' | 'high' | 'urgent';
		}>;
		totalEstimatedValue: number;
	}> {
		const aggregate = await this.analyzeAggregate();
		if (!aggregate) {
			return { recommendations: [], totalEstimatedValue: 0 };
		}

		const recommendations: Array<{
			accountId: string;
			accountName: string;
			recommendedAmount: number;
			action: 'paydown' | 'deposit' | 'transfer';
			estimatedAnnualValue: number;
			priority: 'low' | 'medium' | 'high' | 'urgent';
		}> = [];

		let remainingFunds = availableFunds;

		// Prioritize debt paydown if requested or if high interest debt exists
		if (options.prioritizeDebtPaydown !== false && aggregate.debtAccounts.length > 0) {
			const sortedDebt = [...aggregate.debtAccounts].sort(
				(a, b) => b.interestRate - a.interestRate
			);

			for (const debt of sortedDebt) {
				if (remainingFunds <= 0) break;
				if (options.targetAccounts && !options.targetAccounts.includes(debt.accountId)) continue;

				// Pay down high interest debt first
				if (debt.interestRate > 10) {
					const paydownAmount = Math.min(remainingFunds, debt.currentBalance);
					const annualSavings = (paydownAmount * debt.interestRate) / 100;

					recommendations.push({
						accountId: debt.accountId,
						accountName: debt.accountName,
						recommendedAmount: paydownAmount,
						action: 'paydown',
						estimatedAnnualValue: annualSavings,
						priority: debt.interestRate > 20 ? 'urgent' : debt.interestRate > 15 ? 'high' : 'medium'
					});

					remainingFunds -= paydownAmount;
				}
			}
		}

		// Then maximize savings if requested
		if (
			options.maximizeSavings !== false &&
			remainingFunds > 0 &&
			aggregate.savingsAccounts.length > 0
		) {
			const sortedSavings = [...aggregate.savingsAccounts].sort(
				(a, b) => b.interestRate - a.interestRate
			);
			const bestSavings = sortedSavings[0];

			if (options.targetAccounts && options.targetAccounts.includes(bestSavings.accountId)) {
				const depositAmount = remainingFunds;
				const annualEarnings = (depositAmount * bestSavings.interestRate) / 100;

				recommendations.push({
					accountId: bestSavings.accountId,
					accountName: bestSavings.accountName,
					recommendedAmount: depositAmount,
					action: 'deposit',
					estimatedAnnualValue: annualEarnings,
					priority: bestSavings.interestRate > 4 ? 'high' : 'medium'
				});
			}
		}

		const totalEstimatedValue = recommendations.reduce(
			(sum, rec) => sum + rec.estimatedAnnualValue,
			0
		);

		return {
			recommendations,
			totalEstimatedValue
		};
	}

	/**
	 * Track interest rate change
	 */
	async trackRateChange(accountId: string, newRate: number, notes?: string): Promise<void> {
		const history = this.rateHistory.get(accountId) || [];
		history.push({
			accountId,
			rate: newRate,
			effectiveDate: new Date(),
			notes
		});
		this.rateHistory.set(accountId, history);
	}

	/**
	 * Get interest rate history for an account
	 */
	getRateHistory(accountId: string): InterestRateHistory[] {
		return this.rateHistory.get(accountId) || [];
	}

	/**
	 * Create interest optimization insights
	 */
	async createInterestInsights(): Promise<void> {
		const aggregate = await this.analyzeAggregate();
		if (!aggregate) return;

		// Create insights for high interest debt
		for (const debt of aggregate.debtAccounts) {
			if (debt.interestRate > 20 && debt.annualInterest > 500) {
				await insightsService.createInsight({
					type: 'savings_opportunity',
					severity: 'alert',
					title: `High Interest Cost: ${debt.accountName}`,
					message: `This account is costing you ${formatTransactionAmount(debt.annualInterest, debt.currency)} annually in interest. Consider paying it down.`,
					amount: debt.annualInterest,
					actionable: true,
					actionText: 'View Recommendations',
					actionUrl: `/accounts/${debt.accountId}`,
					metadata: {
						accountId: debt.accountId,
						interestRate: debt.interestRate,
						annualCost: debt.annualInterest
					}
				});
			}
		}

		// Create insights for optimization opportunities
		if (aggregate.optimizationPotential > 200) {
			await insightsService.createInsight({
				type: 'savings_opportunity',
				severity: 'warning',
				title: 'Interest Optimization Opportunity',
				message: `You could save or earn ${formatTransactionAmount(aggregate.optimizationPotential, 'USD')} annually by optimizing your account balances.`,
				amount: aggregate.optimizationPotential,
				actionable: true,
				actionText: 'View Recommendations',
				actionUrl: '/insights?tab=optimize',
				metadata: {
					optimizationPotential: aggregate.optimizationPotential
				}
			});
		}
	}
}

/**
 * Singleton instance of InterestOptimizationService
 */
export const interestOptimizationService = new InterestOptimizationService();
