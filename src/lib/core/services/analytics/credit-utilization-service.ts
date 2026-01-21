/**
 * Credit Utilization Optimization Service
 * 
 * Provides credit utilization analysis, optimization recommendations, and alerts
 * to help users maintain optimal credit utilization for better credit scores.
 */

import { accountService } from '../core/account-service';
import { transactionService } from '../core/transaction-service';
import type { Account, Transaction } from '$lib/core/db';
import {
	getCreditUtilization,
	getCreditUtilizationStatus,
	getAggregateCreditUtilization,
	getRecommendedPaymentForTargetUtilization,
	getAvailableCredit,
	type CreditUtilizationStatus
} from '$lib/utils/account-metadata-utils';

/**
 * Credit utilization analysis for a single account
 */
export interface CreditUtilizationAnalysis {
	accountId: string;
	accountName: string;
	utilization: number;
	status: CreditUtilizationStatus;
	currentDebt: number;
	creditLimit: number;
	availableCredit: number;
	recommendedPayment?: number;
	recommendedPaymentForTarget?: number;
	targetUtilization: number;
	daysUntilStatementClose?: number;
	daysUntilPaymentDue?: number;
	daysUntilReporting?: number;
}

/**
 * Aggregate credit utilization analysis
 */
export interface AggregateCreditUtilizationAnalysis {
	totalUtilization: number;
	totalDebt: number;
	totalCreditLimit: number;
	accountCount: number;
	status: CreditUtilizationStatus;
	accounts: CreditUtilizationAnalysis[];
}

/**
 * Credit utilization optimization recommendation
 */
export interface CreditUtilizationRecommendation {
	id: string;
	type: 'payment' | 'redistribution' | 'limit_increase' | 'new_account';
	priority: 'low' | 'medium' | 'high' | 'urgent';
	title: string;
	description: string;
	accountId?: string;
	accountName?: string;
	recommendedAction: string;
	estimatedImpact: {
		utilizationImprovement: number;
		creditScoreImpact?: 'positive' | 'neutral' | 'negative';
		estimatedScorePoints?: number;
	};
	actionable: boolean;
	metadata: Record<string, any>;
}

/**
 * Credit Utilization Optimization Service
 */
class CreditUtilizationService {
	/**
	 * Analyze credit utilization for a single account
	 */
	async analyzeAccount(accountId: string): Promise<CreditUtilizationAnalysis | null> {
		const account = await accountService.getAccount(accountId);
		if (!account || account.type !== 'credit') {
			return null;
		}

		const utilization = getCreditUtilization(account);
		if (utilization === null) {
			return null;
		}

		const status = getCreditUtilizationStatus(utilization);
		if (status === null) {
			return null;
		}

		const currentDebt = Math.abs(Math.min(0, account.currentBalance));
		const creditLimit = account.metadata?.creditLimit || 0;
		const availableCredit = getAvailableCredit(account) || 0;

		// Calculate recommended payment to reach 30% utilization (optimal for credit score)
		const recommendedPaymentForTarget = getRecommendedPaymentForTargetUtilization(account, 30);

		// Calculate days until statement close and payment due
		let daysUntilStatementClose: number | undefined;
		let daysUntilPaymentDue: number | undefined;
		let daysUntilReporting: number | undefined;

		if (account.metadata?.statementCloseDate) {
			const today = new Date();
			const currentDay = today.getDate();
			const statementDay = parseInt(account.metadata.statementCloseDate) || 1;
			let nextClose = new Date(today.getFullYear(), today.getMonth(), statementDay);
			if (currentDay >= statementDay) {
				nextClose = new Date(today.getFullYear(), today.getMonth() + 1, statementDay);
			}
			daysUntilStatementClose = Math.ceil((nextClose.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
		}

		if (account.metadata?.paymentDueDate) {
			const today = new Date();
			const currentDay = today.getDate();
			const dueDay = parseInt(account.metadata.paymentDueDate) || 1;
			let nextDue = new Date(today.getFullYear(), today.getMonth(), dueDay);
			if (currentDay >= dueDay) {
				nextDue = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
			}
			daysUntilPaymentDue = Math.ceil((nextDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
		}

		if (account.metadata?.creditBureauReportingDate) {
			const today = new Date();
			const currentDay = today.getDate();
			const reportingDay = parseInt(account.metadata.creditBureauReportingDate) || 1;
			let nextReporting = new Date(today.getFullYear(), today.getMonth(), reportingDay);
			if (currentDay >= reportingDay) {
				nextReporting = new Date(today.getFullYear(), today.getMonth() + 1, reportingDay);
			}
			daysUntilReporting = Math.ceil((nextReporting.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
		}

		return {
			accountId: account.id,
			accountName: account.name,
			utilization,
			status,
			currentDebt,
			creditLimit,
			availableCredit,
			recommendedPaymentForTarget,
			targetUtilization: 30, // Optimal utilization for credit score
			daysUntilStatementClose,
			daysUntilPaymentDue,
			daysUntilReporting
		};
	}

	/**
	 * Analyze aggregate credit utilization across all credit accounts
	 */
	async analyzeAggregate(): Promise<AggregateCreditUtilizationAnalysis | null> {
		const accounts = await accountService.getAccounts();
		const creditAccounts = accounts.filter(acc => acc.type === 'credit');

		if (creditAccounts.length === 0) {
			return null;
		}

		const aggregate = getAggregateCreditUtilization(creditAccounts);
		if (!aggregate) {
			return null;
		}

		const status = getCreditUtilizationStatus(aggregate.utilization);
		if (status === null) {
			return null;
		}

		// Analyze each account
		const accountAnalyses: CreditUtilizationAnalysis[] = [];
		for (const account of creditAccounts) {
			const analysis = await this.analyzeAccount(account.id);
			if (analysis) {
				accountAnalyses.push(analysis);
			}
		}

		return {
			totalUtilization: aggregate.utilization,
			totalDebt: aggregate.totalDebt,
			totalCreditLimit: aggregate.totalCreditLimit,
			accountCount: aggregate.accountCount,
			status,
			accounts: accountAnalyses
		};
	}

	/**
	 * Generate optimization recommendations
	 */
	async generateRecommendations(): Promise<CreditUtilizationRecommendation[]> {
		const recommendations: CreditUtilizationRecommendation[] = [];
		const aggregate = await this.analyzeAggregate();

		if (!aggregate) {
			return recommendations;
		}

		// Analyze each account for recommendations
		for (const accountAnalysis of aggregate.accounts) {
			// High utilization recommendations
			if (accountAnalysis.utilization > 80) {
				recommendations.push({
					id: `credit-util-urgent-${accountAnalysis.accountId}`,
					type: 'payment',
					priority: 'urgent',
					title: `Critical: High Credit Utilization on ${accountAnalysis.accountName}`,
					description: `Your credit utilization is ${accountAnalysis.utilization.toFixed(1)}%, which significantly impacts your credit score.`,
					accountId: accountAnalysis.accountId,
					accountName: accountAnalysis.accountName,
					recommendedAction: `Pay down ${accountAnalysis.recommendedPaymentForTarget ? 
						new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(accountAnalysis.recommendedPaymentForTarget) 
						: 'your balance'} to reach optimal utilization.`,
					estimatedImpact: {
						utilizationImprovement: accountAnalysis.utilization - 30,
						creditScoreImpact: 'positive',
						estimatedScorePoints: 20 - 40
					},
					actionable: true,
					metadata: {
						currentUtilization: accountAnalysis.utilization,
						targetUtilization: 30,
						recommendedPayment: accountAnalysis.recommendedPaymentForTarget
					}
				});
			} else if (accountAnalysis.utilization > 50) {
				recommendations.push({
					id: `credit-util-high-${accountAnalysis.accountId}`,
					type: 'payment',
					priority: 'high',
					title: `High Credit Utilization on ${accountAnalysis.accountName}`,
					description: `Your credit utilization is ${accountAnalysis.utilization.toFixed(1)}%, which may negatively impact your credit score.`,
					accountId: accountAnalysis.accountId,
					accountName: accountAnalysis.accountName,
					recommendedAction: `Consider paying down ${accountAnalysis.recommendedPaymentForTarget ? 
						new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(accountAnalysis.recommendedPaymentForTarget) 
						: 'your balance'} to improve your credit score.`,
					estimatedImpact: {
						utilizationImprovement: accountAnalysis.utilization - 30,
						creditScoreImpact: 'positive',
						estimatedScorePoints: 10 - 25
					},
					actionable: true,
					metadata: {
						currentUtilization: accountAnalysis.utilization,
						targetUtilization: 30
					}
				});
			} else if (accountAnalysis.utilization > 30) {
				recommendations.push({
					id: `credit-util-medium-${accountAnalysis.accountId}`,
					type: 'payment',
					priority: 'medium',
					title: `Moderate Credit Utilization on ${accountAnalysis.accountName}`,
					description: `Your credit utilization is ${accountAnalysis.utilization.toFixed(1)}%. Reducing it to below 30% can improve your credit score.`,
					accountId: accountAnalysis.accountId,
					accountName: accountAnalysis.accountName,
					recommendedAction: `Consider paying down ${accountAnalysis.recommendedPaymentForTarget ? 
						new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(accountAnalysis.recommendedPaymentForTarget) 
						: 'your balance'} to reach optimal utilization.`,
					estimatedImpact: {
						utilizationImprovement: accountAnalysis.utilization - 30,
						creditScoreImpact: 'positive',
						estimatedScorePoints: 5 - 15
					},
					actionable: true,
					metadata: {
						currentUtilization: accountAnalysis.utilization,
						targetUtilization: 30
					}
				});
			}

			// Statement timing recommendations
			if (accountAnalysis.daysUntilStatementClose !== undefined && accountAnalysis.daysUntilStatementClose <= 7) {
				if (accountAnalysis.utilization > 30) {
					recommendations.push({
						id: `credit-util-timing-${accountAnalysis.accountId}`,
						type: 'payment',
						priority: accountAnalysis.utilization > 50 ? 'high' : 'medium',
						title: `Pay Before Statement Closes: ${accountAnalysis.accountName}`,
						description: `Your statement closes in ${accountAnalysis.daysUntilStatementClose} day(s). Paying down your balance now will improve the utilization reported to credit bureaus.`,
						accountId: accountAnalysis.accountId,
						accountName: accountAnalysis.accountName,
						recommendedAction: `Make a payment of ${accountAnalysis.recommendedPaymentForTarget ? 
							new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(accountAnalysis.recommendedPaymentForTarget) 
							: 'at least the minimum'} before the statement closes.`,
						estimatedImpact: {
							utilizationImprovement: accountAnalysis.utilization - 30,
							creditScoreImpact: 'positive'
						},
						actionable: true,
						metadata: {
							daysUntilStatementClose: accountAnalysis.daysUntilStatementClose,
							currentUtilization: accountAnalysis.utilization
						}
					});
				}
			}
		}

		// Aggregate recommendations
		if (aggregate.totalUtilization > 50) {
			recommendations.push({
				id: 'credit-util-aggregate-high',
				type: 'redistribution',
				priority: 'high',
				title: 'High Overall Credit Utilization',
				description: `Your overall credit utilization across all accounts is ${aggregate.totalUtilization.toFixed(1)}%, which may negatively impact your credit score.`,
				recommendedAction: 'Consider paying down balances on accounts with highest utilization first, or redistributing debt across accounts.',
				estimatedImpact: {
					utilizationImprovement: aggregate.totalUtilization - 30,
					creditScoreImpact: 'positive',
					estimatedScorePoints: 15 - 30
				},
				actionable: true,
				metadata: {
					totalUtilization: aggregate.totalUtilization,
					accountCount: aggregate.accountCount
				}
			});
		}

		return recommendations.sort((a, b) => {
			const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
			return priorityOrder[b.priority] - priorityOrder[a.priority];
		});
	}

	/**
	 * Optimize credit utilization by suggesting payment amounts
	 * This algorithm suggests optimal payment distribution across accounts
	 */
	async optimizeUtilization(
		availablePaymentAmount: number,
		targetUtilization: number = 30
	): Promise<{
		recommendations: Array<{
			accountId: string;
			accountName: string;
			recommendedPayment: number;
			currentUtilization: number;
			projectedUtilization: number;
			improvement: number;
		}>;
		totalRecommended: number;
		projectedAggregateUtilization: number;
	}> {
		const aggregate = await this.analyzeAggregate();
		if (!aggregate) {
			return {
				recommendations: [],
				totalRecommended: 0,
				projectedAggregateUtilization: 0
			};
		}

		// Sort accounts by utilization (highest first)
		const sortedAccounts = [...aggregate.accounts].sort(
			(a, b) => b.utilization - a.utilization
		);

		const recommendations: Array<{
			accountId: string;
			accountName: string;
			recommendedPayment: number;
			currentUtilization: number;
			projectedUtilization: number;
			improvement: number;
		}> = [];

		let remainingPayment = availablePaymentAmount;

		// Allocate payment to highest utilization accounts first
		for (const account of sortedAccounts) {
			if (remainingPayment <= 0) break;
			if (account.utilization <= targetUtilization) continue;

			const paymentNeeded = getRecommendedPaymentForTargetUtilization(account, targetUtilization);
			if (paymentNeeded === null || paymentNeeded <= 0) continue;

			const paymentAmount = Math.min(remainingPayment, paymentNeeded);
			const newDebt = account.currentDebt - paymentAmount;
			const projectedUtilization = (newDebt / account.creditLimit) * 100;

			recommendations.push({
				accountId: account.accountId,
				accountName: account.accountName,
				recommendedPayment: paymentAmount,
				currentUtilization: account.utilization,
				projectedUtilization,
				improvement: account.utilization - projectedUtilization
			});

			remainingPayment -= paymentAmount;
		}

		// Calculate projected aggregate utilization
		let projectedTotalDebt = aggregate.totalDebt;
		for (const rec of recommendations) {
			projectedTotalDebt -= rec.recommendedPayment;
		}
		const projectedAggregateUtilization = (projectedTotalDebt / aggregate.totalCreditLimit) * 100;

		return {
			recommendations,
			totalRecommended: availablePaymentAmount - remainingPayment,
			projectedAggregateUtilization
		};
	}
}

/**
 * Singleton instance of CreditUtilizationService
 */
export const creditUtilizationService = new CreditUtilizationService();
