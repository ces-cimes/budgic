/**
 * Emergency Fund Management Service
 *
 * Provides emergency fund calculation, tracking, recommendations, and alerts
 * to help users maintain adequate emergency reserves.
 */

import { accountService } from '../core/account-service';
import { transactionService } from '../core/transaction-service';
import { userService } from '../core/user-service';
import { exchangeRateService } from '../core/exchange-rate-service';
import { formatAmount, formatPercentage } from '$lib/utils/currency-utils';
import type { Account, Transaction } from '$lib/core/db';

/**
 * Emergency fund sizing factors
 */
export interface EmergencyFundFactors {
	// Base calculation
	monthlyEssentialExpenses: number;
	targetMonths: number; // 3-6 months recommended

	// Multiplicative factors
	incomeStabilityMultiplier: number; // ×1.2 if irregular income
	jobTypeMultiplier: number; // ×1.25 if contractor/seasonal

	// Additive factors
	dependentsAdjustment: number; // +15% per dependent
	healthAdjustment: number; // +10-30% based on medical needs
	insuranceGapsAdjustment: number; // +$1000-5000 based on deductibles
}

/**
 * Emergency fund status
 */
export type EmergencyFundStatus = 'optimal' | 'adequate' | 'low' | 'critical' | 'depleted';

/**
 * Emergency fund analysis
 */
export interface EmergencyFundAnalysis {
	currency: string;
	currentBalance: number;
	targetAmount: number;
	percentageAchieved: number;
	monthsCovered: number;
	status: EmergencyFundStatus;
	recommendedMonthlyContribution: number;
	monthsToTarget: number;
	emergencyFundAccounts: Array<{
		accountId: string;
		accountName: string;
		balance: number;
		percentage: number;
	}>;
	partialUsage?: {
		amountUsed: number;
		percentageUsed: number;
		recoveryTimeline: number; // months to rebuild
	};
	factors: EmergencyFundFactors;
}

/**
 * Emergency fund recommendation
 */
export interface EmergencyFundRecommendation {
	id: string;
	type: 'contribute' | 'rebalance' | 'rebuild' | 'optimize_location';
	priority: 'low' | 'medium' | 'high' | 'urgent';
	title: string;
	description: string;
	recommendedAction: string;
	estimatedImpact: {
		monthsToTarget?: number;
		improvement?: number;
	};
	actionable: boolean;
	metadata: Record<string, any>;
}

/**
 * Emergency Fund Management Service
 */
class EmergencyFundService {
	/**
	 * Calculate monthly essential expenses from transaction history
	 */
	private async calculateMonthlyEssentialExpenses(
		transactions: Transaction[],
		mainCurrency: string
	): Promise<number> {
		// Get expenses from last 3 months
		const now = new Date();
		const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

		const essentialExpenses = transactions
			.filter((t) => {
				if (t.type !== 'expense') return false;
				if (t.status !== 'cleared') return false;
				if (!t.clearedDate) return false;

				const date = new Date(t.clearedDate);
				return date >= threeMonthsAgo;
			})
			.filter((t) => {
				// Only include essential categories (survival and security tiers)
				// This is a simplified check - in a real implementation, you'd check category waterfallTier
				return true; // For now, include all expenses
			});

		let totalExpenses = 0;
		for (const tx of essentialExpenses) {
			const amount = Math.abs(tx.amount || 0);
			const transactionCurrency = tx.currency || mainCurrency;

			let convertedAmount = amount;
			if (transactionCurrency !== mainCurrency) {
				const converted = await exchangeRateService.convertAmount(
					amount,
					transactionCurrency,
					mainCurrency,
					tx.clearedDate ? new Date(tx.clearedDate) : undefined
				);
				if (converted !== null) {
					convertedAmount = converted;
				}
			}

			totalExpenses += convertedAmount;
		}

		// Average over the number of months we have data for
		const monthsOfData = Math.max(
			1,
			Math.ceil((now.getTime() - threeMonthsAgo.getTime()) / (1000 * 60 * 60 * 24 * 30))
		);
		return totalExpenses / monthsOfData;
	}

	/**
	 * Get emergency fund factors from user preferences or defaults
	 */
	private async getEmergencyFundFactors(
		monthlyEssentialExpenses: number
	): Promise<EmergencyFundFactors> {
		const preferences = await userService.getUserPreferences();

		// Get factors from preferences
		const targetMonths = preferences?.emergencyFundTargetMonths || 6;
		const incomeStability = preferences?.emergencyFundIncomeStability || 'stable';
		const jobType = preferences?.emergencyFundJobType || 'regular';
		const dependents = preferences?.emergencyFundDependents || 0;
		const healthNeeds = preferences?.emergencyFundHealthNeeds || 'none';
		const insuranceGaps = preferences?.emergencyFundInsuranceGaps || 0;

		// Calculate multipliers
		const incomeStabilityMultiplier = incomeStability === 'irregular' ? 1.2 : 1.0;
		const jobTypeMultiplier = jobType === 'contractor' || jobType === 'seasonal' ? 1.25 : 1.0;

		// Calculate adjustments
		const dependentsAdjustment = dependents * 15; // 15% per dependent

		let healthAdjustment = 0;
		switch (healthNeeds) {
			case 'low':
				healthAdjustment = 10;
				break;
			case 'medium':
				healthAdjustment = 20;
				break;
			case 'high':
				healthAdjustment = 30;
				break;
		}

		return {
			monthlyEssentialExpenses,
			targetMonths,
			incomeStabilityMultiplier,
			jobTypeMultiplier,
			dependentsAdjustment,
			healthAdjustment,
			insuranceGapsAdjustment: insuranceGaps
		};
	}

	/**
	 * Calculate target emergency fund amount
	 */
	private calculateTargetEmergencyFund(factors: EmergencyFundFactors): number {
		// Base calculation
		const base = factors.monthlyEssentialExpenses * factors.targetMonths;

		// Apply multiplicative factors
		const afterMultiplicative =
			base * factors.incomeStabilityMultiplier * factors.jobTypeMultiplier;

		// Apply additive factors
		const dependentsAmount = base * (factors.dependentsAdjustment / 100);
		const healthAmount = base * (factors.healthAdjustment / 100);

		// Final target
		const target =
			afterMultiplicative + dependentsAmount + healthAmount + factors.insuranceGapsAdjustment;

		return Math.max(0, target);
	}

	/**
	 * Get accounts designated for emergency fund
	 */
	private async getEmergencyFundAccounts(accounts: Account[]): Promise<Account[]> {
		// Check if accounts have emergency fund designation in metadata
		return accounts.filter((acc) => {
			// Check metadata for emergency fund designation
			if (acc.metadata?.isEmergencyFund === true) {
				return acc.isActive;
			}
			// Fallback: if no designation, use savings accounts
			return acc.type === 'savings' && acc.isActive;
		});
	}

	/**
	 * Calculate current emergency fund balance
	 */
	private async calculateCurrentEmergencyFundBalance(
		emergencyFundAccounts: Account[],
		mainCurrency: string
	): Promise<number> {
		let totalBalance = 0;

		for (const account of emergencyFundAccounts) {
			const balance = account.currentBalance;
			const accountCurrency = account.currency;

			if (accountCurrency === mainCurrency) {
				totalBalance += balance;
			} else {
				const converted = await exchangeRateService.convertAmount(
					balance,
					accountCurrency,
					mainCurrency
				);
				if (converted !== null) {
					totalBalance += converted;
				}
			}
		}

		return totalBalance;
	}

	/**
	 * Determine emergency fund status
	 */
	private getEmergencyFundStatus(
		currentBalance: number,
		targetAmount: number,
		monthsCovered: number
	): EmergencyFundStatus {
		if (currentBalance <= 0) return 'depleted';
		if (currentBalance < targetAmount * 0.25) return 'critical';
		if (currentBalance < targetAmount * 0.5) return 'low';
		if (currentBalance < targetAmount * 0.75) return 'adequate';
		return 'optimal';
	}

	/**
	 * Analyze emergency fund status
	 */
	async analyzeEmergencyFund(): Promise<EmergencyFundAnalysis | null> {
		try {
			// Get user preferences for currency
			const preferences = await userService.getUserPreferences();
			const mainCurrency = preferences?.currency || 'USD';

			// Get all accounts
			const accounts = await accountService.getAccounts();

			// Get emergency fund accounts
			const emergencyFundAccounts = await this.getEmergencyFundAccounts(accounts);

			if (emergencyFundAccounts.length === 0) {
				// No emergency fund accounts designated
				return null;
			}

			// Get all transactions
			const transactions = await transactionService.getAllTransactions();

			// Calculate monthly essential expenses
			const monthlyEssentialExpenses = await this.calculateMonthlyEssentialExpenses(
				transactions,
				mainCurrency
			);

			if (monthlyEssentialExpenses === 0) {
				// No expense data available
				return null;
			}

			// Get emergency fund factors
			const factors = await this.getEmergencyFundFactors(monthlyEssentialExpenses);

			// Calculate target emergency fund
			const targetAmount = this.calculateTargetEmergencyFund(factors);

			// Calculate current emergency fund balance
			const currentBalance = await this.calculateCurrentEmergencyFundBalance(
				emergencyFundAccounts,
				mainCurrency
			);

			// Calculate metrics
			const percentageAchieved = targetAmount > 0 ? (currentBalance / targetAmount) * 100 : 0;
			const monthsCovered =
				monthlyEssentialExpenses > 0 ? currentBalance / monthlyEssentialExpenses : 0;
			const status = this.getEmergencyFundStatus(currentBalance, targetAmount, monthsCovered);

			// Calculate recommended monthly contribution
			const deficit = Math.max(0, targetAmount - currentBalance);
			const monthsToTarget =
				deficit > 0 && monthlyEssentialExpenses > 0
					? Math.ceil(deficit / (monthlyEssentialExpenses * 0.1)) // Assume 10% of expenses can be saved
					: 0;
			const recommendedMonthlyContribution = monthsToTarget > 0 ? deficit / monthsToTarget : 0;

			// Get account breakdown
			const accountBreakdown = await Promise.all(
				emergencyFundAccounts.map(async (acc) => {
					const balance = acc.currentBalance;
					const accountCurrency = acc.currency;

					let convertedBalance = balance;
					if (accountCurrency !== mainCurrency) {
						const converted = await exchangeRateService.convertAmount(
							balance,
							accountCurrency,
							mainCurrency
						);
						if (converted !== null) {
							convertedBalance = converted;
						}
					}

					return {
						accountId: acc.id,
						accountName: acc.name,
						balance: convertedBalance,
						percentage: currentBalance > 0 ? (convertedBalance / currentBalance) * 100 : 0
					};
				})
			);

			return {
				currency: mainCurrency,
				currentBalance,
				targetAmount,
				percentageAchieved,
				monthsCovered,
				status,
				recommendedMonthlyContribution,
				monthsToTarget,
				emergencyFundAccounts: accountBreakdown,
				factors
			};
		} catch (error) {
			console.error('Error analyzing emergency fund:', error);
			return null;
		}
	}

	/**
	 * Generate emergency fund recommendations
	 */
	async generateRecommendations(): Promise<EmergencyFundRecommendation[]> {
		const analysis = await this.analyzeEmergencyFund();
		if (!analysis) {
			return [];
		}

		const recommendations: EmergencyFundRecommendation[] = [];

		// Contribution recommendations
		if (analysis.currentBalance < analysis.targetAmount) {
			if (analysis.status === 'critical' || analysis.status === 'depleted') {
				recommendations.push({
					id: 'emergency-fund-urgent-contribute',
					type: 'contribute',
					priority: 'urgent',
					title: 'Urgent: Build Emergency Fund',
					description: `Your emergency fund is ${analysis.status === 'depleted' ? 'depleted' : 'critically low'}. You have ${analysis.monthsCovered.toFixed(1)} months of expenses covered, but need ${formatAmount(analysis.targetAmount, analysis.currency)} for adequate protection.`,
					recommendedAction: `Contribute ${formatAmount(analysis.recommendedMonthlyContribution, analysis.currency)} per month to reach your target in ${analysis.monthsToTarget} months.`,
					estimatedImpact: {
						monthsToTarget: analysis.monthsToTarget,
						improvement: analysis.percentageAchieved
					},
					actionable: true,
					metadata: {
						currentBalance: analysis.currentBalance,
						targetAmount: analysis.targetAmount,
						recommendedContribution: analysis.recommendedMonthlyContribution
					}
				});
			} else if (analysis.status === 'low') {
				recommendations.push({
					id: 'emergency-fund-contribute',
					type: 'contribute',
					priority: 'high',
					title: 'Increase Emergency Fund Contributions',
					description: `Your emergency fund is below target. You have ${analysis.monthsCovered.toFixed(1)} months covered, but should aim for ${analysis.factors.targetMonths.toFixed(0)} months.`,
					recommendedAction: `Contribute ${formatAmount(analysis.recommendedMonthlyContribution, analysis.currency)} per month to reach your target.`,
					estimatedImpact: {
						monthsToTarget: analysis.monthsToTarget,
						improvement: analysis.percentageAchieved
					},
					actionable: true,
					metadata: {
						currentBalance: analysis.currentBalance,
						targetAmount: analysis.targetAmount
					}
				});
			}
		}

		// Rebuild recommendations if partially used
		if (analysis.partialUsage && analysis.partialUsage.percentageUsed > 0) {
			recommendations.push({
				id: 'emergency-fund-rebuild',
				type: 'rebuild',
				priority: 'high',
				title: 'Rebuild Emergency Fund',
				description: `Your emergency fund has been used (${formatPercentage(analysis.partialUsage.percentageUsed, { maxDecimals: 0 })} depleted). Prioritize rebuilding to restore your financial safety net.`,
				recommendedAction: `Rebuild over ${analysis.partialUsage.recoveryTimeline} months by contributing ${formatAmount(analysis.targetAmount * 0.1, analysis.currency)} per month.`,
				estimatedImpact: {
					monthsToTarget: analysis.partialUsage.recoveryTimeline
				},
				actionable: true,
				metadata: {
					amountUsed: analysis.partialUsage.amountUsed,
					percentageUsed: analysis.partialUsage.percentageUsed
				}
			});
		}

		// Location optimization recommendations
		if (analysis.emergencyFundAccounts.length > 0) {
			// Check if emergency fund is in high-interest accounts
			const hasLowInterest = analysis.emergencyFundAccounts.some((acc) => {
				// This would check account interest rates - simplified for now
				return false;
			});

			if (hasLowInterest) {
				recommendations.push({
					id: 'emergency-fund-optimize-location',
					type: 'optimize_location',
					priority: 'low',
					title: 'Optimize Emergency Fund Location',
					description:
						'Consider moving your emergency fund to a high-yield savings account to earn more interest while maintaining liquidity.',
					recommendedAction:
						'Review account interest rates and consider transferring to higher-yield accounts.',
					estimatedImpact: {},
					actionable: true,
					metadata: {}
				});
			}
		}

		return recommendations;
	}

	/**
	 * Detect if a transaction is an emergency expense
	 */
	async detectEmergencyTransaction(transaction: Transaction): Promise<boolean> {
		// Only check unplanned transactions
		if (transaction.status === 'planned') {
			return false;
		}

		// Only check expenses
		if (transaction.type !== 'expense') {
			return false;
		}

		const amount = Math.abs(transaction.amount || 0);

		// Get all transactions for comparison
		const allTransactions = await transactionService.getAllTransactions();
		const unplannedExpenses = allTransactions.filter(
			(t) => t.type === 'expense' && t.status === 'cleared' && t.id !== transaction.id
		);

		// Rule 1: Amount > 2× largest historical unplanned expense
		if (unplannedExpenses.length > 0) {
			const largestExpense = Math.max(...unplannedExpenses.map((t) => Math.abs(t.amount || 0)));
			if (amount > largestExpense * 2) {
				return true;
			}
		}

		// Rule 2: Amount > 50% of monthly total allowances
		try {
			const { calculateGlobalAllowance } = await import('$lib/core/services/core/budget-service');
			const globalAllowance = await calculateGlobalAllowance();
			const monthlyAllowance = globalAllowance.total.monthly || 0;

			if (monthlyAllowance > 0 && amount > monthlyAllowance * 0.5) {
				return true;
			}
		} catch (error) {
			// If allowance calculation fails, skip this rule
			console.warn('Failed to calculate allowance for emergency detection:', error);
		}

		// Rule 3: Category matches emergency categories
		// Check if transaction category is in emergency-related categories
		// This would require checking category waterfallTier or specific emergency categories
		// For now, we'll check if the transaction description contains emergency keywords
		const emergencyKeywords = [
			'emergency',
			'urgent',
			'medical',
			'hospital',
			'repair',
			'breakdown',
			'accident'
		];
		const description = (transaction.description || '').toLowerCase();
		if (emergencyKeywords.some((keyword) => description.includes(keyword))) {
			return true;
		}

		return false;
	}

	/**
	 * Handle emergency transaction
	 * This should be called when a transaction is created/updated to detect emergencies
	 */
	async handleEmergencyTransaction(transaction: Transaction): Promise<{
		isEmergency: boolean;
		recoveryPlan?: {
			recommendedMonthlyContribution: number;
			monthsToRebuild: number;
			reducedAllowances: boolean;
		};
	}> {
		const isEmergency = await this.detectEmergencyTransaction(transaction);

		if (!isEmergency) {
			return { isEmergency: false };
		}

		// Get current emergency fund analysis
		const analysis = await this.analyzeEmergencyFund();
		if (!analysis) {
			return { isEmergency: true };
		}

		// Calculate impact on emergency fund
		const transactionAmount = Math.abs(transaction.amount || 0);
		const newBalance = Math.max(0, analysis.currentBalance - transactionAmount);
		const percentageUsed =
			analysis.currentBalance > 0 ? (transactionAmount / analysis.currentBalance) * 100 : 0;

		// Generate recovery plan
		const deficit = Math.max(0, analysis.targetAmount - newBalance);
		const recommendedMonthlyContribution =
			deficit > 0 && analysis.factors.monthlyEssentialExpenses > 0
				? Math.max(
						deficit / 6, // Rebuild over 6 months
						analysis.factors.monthlyEssentialExpenses * 0.1 // Minimum 10% of monthly expenses
					)
				: 0;
		const monthsToRebuild =
			recommendedMonthlyContribution > 0 ? Math.ceil(deficit / recommendedMonthlyContribution) : 0;

		// Recovery plan suggests reduced allowances if emergency fund is significantly depleted
		const reducedAllowances = percentageUsed > 25 || newBalance < analysis.targetAmount * 0.5;

		// Update analysis with partial usage tracking
		// Note: In a real implementation, we'd store this in the database
		// For now, this is calculated on-the-fly

		return {
			isEmergency: true,
			recoveryPlan: {
				recommendedMonthlyContribution,
				monthsToRebuild,
				reducedAllowances
			}
		};
	}

	/**
	 * Get emergency fund status for buffer integration
	 * Returns a multiplier to make buffer calculations more conservative when emergency fund is low
	 */
	async getEmergencyFundBufferMultiplier(): Promise<number> {
		const analysis = await this.analyzeEmergencyFund();
		if (!analysis) {
			return 1.0; // No emergency fund, no adjustment
		}

		// If emergency fund is low, increase buffer requirements
		switch (analysis.status) {
			case 'depleted':
			case 'critical':
				return 1.5; // 50% more conservative buffer
			case 'low':
				return 1.25; // 25% more conservative buffer
			case 'adequate':
				return 1.1; // 10% more conservative buffer
			case 'optimal':
			default:
				return 1.0; // No adjustment needed
		}
	}
}

export const emergencyFundService = new EmergencyFundService();
