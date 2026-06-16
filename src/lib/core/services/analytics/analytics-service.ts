import { db, isAnalyticsTier, transactionAutomationCountsInAnalytics } from '$lib/core/db';
import type { Transaction, Account, Category } from '$lib/core/db';
import { userService, exchangeRateService } from '../core';
import { performanceMonitor } from '../core/performance-monitor';
import {
	absAnalyticsTierPortion,
	categoryIdsWithSpendShare,
	effectiveAmountForCategory,
	shouldIncludeClearedExpenseInAnalyticsSpend
} from '$lib/utils/category-utils';

interface SpendingAnalysis {
	totalSpent: number;
	averageMonthlySpending: number;
	topCategories: {
		categoryId: string;
		categoryName: string;
		amount: number;
		percentage: number;
	}[];
	spendingTrend: 'increasing' | 'decreasing' | 'stable';
	monthlyBreakdown: {
		month: string;
		amount: number;
	}[];
}

interface IncomeAnalysis {
	totalIncome: number;
	averageMonthlyIncome: number;
	incomeSources: {
		accountId: string;
		accountName: string;
		amount: number;
		percentage: number;
	}[];
	incomeTrend: 'increasing' | 'decreasing' | 'stable';
	monthlyBreakdown: {
		month: string;
		amount: number;
	}[];
}

interface FinancialHealthScore {
	score: number; // 0-100
	components: {
		spendingControl: number;
		savingsRate: number;
		debtToIncome: number;
		emergencyFund: number;
		goalProgress: number;
	};
	recommendations: string[];
}

interface TrendData {
	period: string;
	income: number;
	expenses: number;
	net: number;
}

class AnalyticsService {
	public get ready() {
		return Promise.resolve();
	}

	public isLoading() {
		return false;
	}

	// ============================================================================
	// SPENDING ANALYSIS
	// ============================================================================

	/**
	 * Get comprehensive spending analysis (converted to main currency)
	 */
	async getSpendingAnalysis(months: number = 12): Promise<SpendingAnalysis> {
		return performanceMonitor.monitor('AnalyticsService', 'getSpendingAnalysis', () =>
			this._getSpendingAnalysis(months)
		);
	}

	private async _getSpendingAnalysis(months: number): Promise<SpendingAnalysis> {
		const categories = await db.getActiveCategories();
		const categoryMap = new Map(categories.map((c) => [c.id, c]));

		// Get user's main currency
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';

		const cutoffDate = new Date();
		cutoffDate.setMonth(cutoffDate.getMonth() - months);
		// Use the indexed clearedDate column to avoid a full table scan.
		// Only transactions with a clearedDate value inside the window are returned.
		const rawTransactions = await db.transactions
			.where('clearedDate')
			.aboveOrEqual(cutoffDate.toISOString())
			.toArray();

		const recentTransactions = rawTransactions
			.filter((tx) => tx != null)
			.filter((tx) => {
				if (!(tx.type === 'expense' && tx.status === 'cleared' && tx.clearedDate)) {
					return false;
				}
				return shouldIncludeClearedExpenseInAnalyticsSpend(tx, categoryMap);
			});

		// Convert all amounts to main currency
		let totalSpent = 0;
		const categorySpending = new Map<string, { name: string; amount: number }>();

		for (const tx of recentTransactions) {
			const amount = absAnalyticsTierPortion(tx, categoryMap);
			const transactionCurrency = tx.currency || mainCurrency;

			// Convert to main currency
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
				} else {
					console.warn(
						`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${tx.id}`
					);
				}
			}

			totalSpent += convertedAmount;

			for (const cid of categoryIdsWithSpendShare(tx)) {
				const sliceAbs = Math.abs(effectiveAmountForCategory(tx, cid));
				if (sliceAbs === 0) continue;
				const category = categories.find((c) => c.id === cid);
				const categoryName = category?.name || 'Uncategorized';
				if (!isAnalyticsTier(category?.waterfallTier)) {
					continue;
				}
				let convertedSlice = sliceAbs;
				if (transactionCurrency !== mainCurrency) {
					const cvt = await exchangeRateService.convertAmount(
						sliceAbs,
						transactionCurrency,
						mainCurrency,
						tx.clearedDate ? new Date(tx.clearedDate) : undefined
					);
					if (cvt !== null) convertedSlice = cvt;
				}
				const current = categorySpending.get(cid) || { name: categoryName, amount: 0 };
				current.amount += convertedSlice;
				categorySpending.set(cid, current);
			}
		}

		const averageMonthlySpending = totalSpent / months;

		const topCategories = Array.from(categorySpending.entries())
			.map(([categoryId, data]) => ({
				categoryId,
				categoryName: data.name,
				amount: data.amount,
				percentage: totalSpent > 0 ? (data.amount / totalSpent) * 100 : 0
			}))
			.sort((a, b) => b.amount - a.amount)
			.slice(0, 10);

		// Calculate spending trend
		const monthlySpending = await this.calculateMonthlyBreakdownWithConversion(
			recentTransactions,
			months,
			mainCurrency,
			(tx) => absAnalyticsTierPortion(tx, categoryMap)
		);
		const spendingTrend = this.calculateTrend(monthlySpending.map((m) => m.amount));

		return {
			totalSpent,
			averageMonthlySpending,
			topCategories,
			spendingTrend,
			monthlyBreakdown: monthlySpending
		};
	}

	/**
	 * Get spending analysis for a specific category (converted to main currency)
	 */
	async getCategorySpendingAnalysis(
		categoryId: string,
		months: number = 12
	): Promise<{
		categoryName: string;
		totalSpent: number;
		averageMonthlySpending: number;
		transactionCount: number;
		monthlyBreakdown: { month: string; amount: number }[];
		trend: 'increasing' | 'decreasing' | 'stable';
	}> {
		const transactions = await db.transactions.toArray();
		const category = await db.categories.get(categoryId);

		// Get user's main currency
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';

		const cutoffDate = new Date();
		cutoffDate.setMonth(cutoffDate.getMonth() - months);

		// First filter out null/undefined transactions, then apply other filters
		const categoryTransactions = transactions
			.filter((tx: Transaction) => tx != null) // Remove null/undefined transactions
			.filter(
				(tx: Transaction) =>
					tx.type === 'expense' &&
					tx.status === 'cleared' &&
					tx.clearedDate &&
					new Date(tx.clearedDate) >= cutoffDate &&
					transactionAutomationCountsInAnalytics(tx) &&
					Math.abs(effectiveAmountForCategory(tx, categoryId)) > 1e-9
			);

		// Convert all amounts to main currency
		let totalSpent = 0;
		for (const tx of categoryTransactions) {
			const amount = Math.abs(effectiveAmountForCategory(tx, categoryId));
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
				} else {
					console.warn(
						`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${tx.id}`
					);
				}
			}

			totalSpent += convertedAmount;
		}

		const averageMonthlySpending = totalSpent / months;
		const monthlyBreakdown = await this.calculateMonthlyBreakdownWithConversion(
			categoryTransactions,
			months,
			mainCurrency,
			(tx) => Math.abs(effectiveAmountForCategory(tx, categoryId))
		);
		const trend = this.calculateTrend(monthlyBreakdown.map((m) => m.amount));

		return {
			categoryName: category?.name || 'Unknown Category',
			totalSpent,
			averageMonthlySpending,
			transactionCount: categoryTransactions.length,
			monthlyBreakdown,
			trend
		};
	}

	// ============================================================================
	// INCOME ANALYSIS
	// ============================================================================

	/**
	 * Get comprehensive income analysis (converted to main currency)
	 */
	async getIncomeAnalysis(months: number = 12): Promise<IncomeAnalysis> {
		const transactions = await db.transactions.toArray();
		const accounts = await db.getActiveAccounts();

		// Get user's main currency
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';

		const cutoffDate = new Date();
		cutoffDate.setMonth(cutoffDate.getMonth() - months);

		// First filter out null/undefined transactions, then apply other filters
		const recentTransactions = transactions
			.filter((tx: Transaction) => tx != null) // Remove null/undefined transactions
			.filter(
				(tx: Transaction) =>
					tx.type === 'income' &&
					tx.status === 'cleared' &&
					tx.clearedDate &&
					new Date(tx.clearedDate) >= cutoffDate &&
					transactionAutomationCountsInAnalytics(tx)
			);

		// Convert all amounts to main currency
		let totalIncome = 0;
		const accountIncome = new Map<string, { name: string; amount: number }>();

		for (const tx of recentTransactions) {
			const amount = tx.amount || 0;
			const transactionCurrency = tx.currency || mainCurrency;

			// Convert to main currency
			let convertedAmount = amount;
			if (transactionCurrency !== mainCurrency) {
				const converted = await exchangeRateService.convertAmount(
					Math.abs(amount),
					transactionCurrency,
					mainCurrency,
					tx.clearedDate ? new Date(tx.clearedDate) : undefined
				);
				if (converted !== null) {
					// Preserve sign
					convertedAmount = amount < 0 ? -converted : converted;
				} else {
					console.warn(
						`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${tx.id}`
					);
				}
			}

			totalIncome += convertedAmount;

			// Only process if accountId exists
			const accountId = tx.accountId;
			if (accountId) {
				const account = accounts.find((a) => a.id === accountId);
				const accountName = account?.name || 'Unknown Account';
				const current = accountIncome.get(accountId) || { name: accountName, amount: 0 };
				current.amount += convertedAmount;
				accountIncome.set(accountId, current);
			}
		}

		const averageMonthlyIncome = totalIncome / months;

		const incomeSources = Array.from(accountIncome.entries())
			.map(([accountId, data]) => ({
				accountId,
				accountName: data.name,
				amount: data.amount,
				percentage: totalIncome > 0 ? (data.amount / totalIncome) * 100 : 0
			}))
			.sort((a, b) => b.amount - a.amount);

		// Calculate income trend
		const monthlyIncome = await this.calculateMonthlyBreakdownWithConversion(
			recentTransactions,
			months,
			mainCurrency
		);
		const incomeTrend = this.calculateTrend(monthlyIncome.map((m) => m.amount));

		return {
			totalIncome,
			averageMonthlyIncome,
			incomeSources,
			incomeTrend,
			monthlyBreakdown: monthlyIncome
		};
	}

	// ============================================================================
	// FINANCIAL HEALTH
	// ============================================================================

	/**
	 * Calculate financial health score
	 */
	async getFinancialHealthScore(): Promise<FinancialHealthScore> {
		const accounts = await db.getActiveAccounts();
		const transactions = await db.transactions.toArray();

		// Calculate components
		const spendingControl = await this.calculateSpendingControlScore(transactions);
		const savingsRate = await this.calculateSavingsRateScore(transactions);
		const debtToIncome = await this.calculateDebtToIncomeScore(accounts, transactions);
		const emergencyFund = await this.calculateEmergencyFundScore(accounts, transactions);
		const goalProgress = await this.calculateGoalProgressScore();

		const score = Math.round(
			(spendingControl + savingsRate + debtToIncome + emergencyFund + goalProgress) / 5
		);

		const recommendations = this.generateRecommendations({
			spendingControl,
			savingsRate,
			debtToIncome,
			emergencyFund,
			goalProgress
		});

		return {
			score,
			components: {
				spendingControl,
				savingsRate,
				debtToIncome,
				emergencyFund,
				goalProgress
			},
			recommendations
		};
	}

	// ============================================================================
	// TREND ANALYSIS
	// ============================================================================

	/**
	 * Get financial trends over time (converted to main currency)
	 */
	async getFinancialTrends(months: number = 12): Promise<TrendData[]> {
		const transactions = await db.transactions.toArray();
		const categories = await db.getActiveCategories();
		const categoryMap = new Map(categories.map((c) => [c.id, c]));

		// Get user's main currency
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';

		const cutoffDate = new Date();
		cutoffDate.setMonth(cutoffDate.getMonth() - months);

		// First filter out null/undefined transactions, then apply other filters
		const recentTransactions = transactions
			.filter((tx: Transaction) => tx != null) // Remove null/undefined transactions
			.filter(
				(tx: Transaction) =>
					tx.status === 'cleared' &&
					tx.clearedDate &&
					new Date(tx.clearedDate) >= cutoffDate
			);

		const monthlyData = new Map<string, { income: number; expenses: number }>();

		// Convert all amounts to main currency
		for (const tx of recentTransactions) {
			const month = new Date(tx.clearedDate!).toISOString().substring(0, 7); // YYYY-MM
			const current = monthlyData.get(month) || { income: 0, expenses: 0 };

			const amount = tx.amount || 0;
			const transactionCurrency = tx.currency || mainCurrency;

			// Convert to main currency
			let convertedAmount = amount;
			if (transactionCurrency !== mainCurrency) {
				const converted = await exchangeRateService.convertAmount(
					Math.abs(amount),
					transactionCurrency,
					mainCurrency,
					tx.clearedDate ? new Date(tx.clearedDate) : undefined
				);
				if (converted !== null) {
					// Preserve sign
					convertedAmount = amount < 0 ? -converted : converted;
				} else {
					console.warn(
						`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${tx.id}`
					);
				}
			}

			if (tx.type === 'income' && transactionAutomationCountsInAnalytics(tx)) {
				current.income += convertedAmount;
			} else if (tx.type === 'expense') {
				if (shouldIncludeClearedExpenseInAnalyticsSpend(tx, categoryMap)) {
					const portion = absAnalyticsTierPortion(tx, categoryMap);
					let convPortion = portion;
					if (transactionCurrency !== mainCurrency) {
						const cvt = await exchangeRateService.convertAmount(
							portion,
							transactionCurrency,
							mainCurrency,
							tx.clearedDate ? new Date(tx.clearedDate) : undefined
						);
						if (cvt !== null) convPortion = cvt;
					}
					current.expenses += convPortion;
				}
			}

			monthlyData.set(month, current);
		}

		return Array.from(monthlyData.entries())
			.map(([period, data]) => ({
				period,
				income: data.income,
				expenses: data.expenses,
				net: data.income - data.expenses
			}))
			.sort((a, b) => a.period.localeCompare(b.period));
	}

	// ============================================================================
	// PRIVATE METHODS
	// ============================================================================

	/**
	 * Calculate monthly breakdown for transactions
	 */
	private calculateMonthlyBreakdown(
		transactions: Transaction[],
		months: number
	): { month: string; amount: number }[] {
		const monthlyData = new Map<string, number>();

		// Filter out null/undefined transactions before processing
		transactions
			.filter((tx) => tx != null && tx.clearedDate) // Remove null/undefined transactions and those without clearedDate
			.forEach((tx) => {
				const month = new Date(tx.clearedDate!).toISOString().substring(0, 7);
				const current = monthlyData.get(month) || 0;
				monthlyData.set(month, current + Math.abs(tx.amount || 0));
			});

		return Array.from(monthlyData.entries())
			.map(([month, amount]) => ({ month, amount }))
			.sort((a, b) => a.month.localeCompare(b.month));
	}

	/**
	 * Calculate monthly breakdown for transactions with currency conversion
	 */
	private async calculateMonthlyBreakdownWithConversion(
		transactions: Transaction[],
		months: number,
		mainCurrency: string,
		expenseMagnitude?: (tx: Transaction) => number
	): Promise<{ month: string; amount: number }[]> {
		const monthlyData = new Map<string, number>();

		// Filter out null/undefined transactions before processing
		for (const tx of transactions.filter((tx) => tx != null && tx.clearedDate)) {
			const month = new Date(tx.clearedDate!).toISOString().substring(0, 7);
			const current = monthlyData.get(month) || 0;

			const amount =
				tx.type === 'expense' && expenseMagnitude !== undefined
					? expenseMagnitude(tx)
					: Math.abs(tx.amount || 0);
			const transactionCurrency = tx.currency || mainCurrency;

			// Convert to main currency
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
				} else {
					console.warn(
						`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${tx.id}`
					);
				}
			}

			monthlyData.set(month, current + convertedAmount);
		}

		return Array.from(monthlyData.entries())
			.map(([month, amount]) => ({ month, amount }))
			.sort((a, b) => a.month.localeCompare(b.month));
	}

	/**
	 * Calculate trend from array of values
	 */
	private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
		if (values.length < 2) return 'stable';

		const firstHalf = values.slice(0, Math.floor(values.length / 2));
		const secondHalf = values.slice(Math.floor(values.length / 2));

		const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
		const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

		const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

		if (changePercent > 5) return 'increasing';
		if (changePercent < -5) return 'decreasing';
		return 'stable';
	}

	/**
	 * Calculate spending control score (0-100) - converted to main currency
	 */
	private async calculateSpendingControlScore(transactions: Transaction[]): Promise<number> {
		// Get user's main currency
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';
		const categories = await db.getActiveCategories();
		const categoryMap = new Map(categories.map((c) => [c.id, c]));

		// Simple implementation - can be enhanced with more sophisticated logic
		// First filter out null/undefined transactions, then apply other filters
		const recentTransactions = transactions
			.filter((tx) => tx != null) // Remove null/undefined transactions
			.filter((tx) => {
				if (
					!(
						tx.type === 'expense' &&
						tx.status === 'cleared' &&
						tx.clearedDate &&
						new Date(tx.clearedDate) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
					)
				) {
					return false;
				}
				return shouldIncludeClearedExpenseInAnalyticsSpend(tx, categoryMap);
			});

		// Convert all amounts to main currency
		let totalSpending = 0;
		for (const tx of recentTransactions) {
			const amount = absAnalyticsTierPortion(tx, categoryMap);
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
				} else {
					console.warn(
						`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${tx.id}`
					);
				}
			}

			totalSpending += convertedAmount;
		}

		// Simple scoring based on spending amount (this should be more sophisticated)
		if (totalSpending < 1000) return 90;
		if (totalSpending < 2000) return 70;
		if (totalSpending < 3000) return 50;
		return 30;
	}

	/**
	 * Calculate savings rate score (0-100) - converted to main currency
	 */
	private async calculateSavingsRateScore(transactions: Transaction[]): Promise<number> {
		// Get user's main currency
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';
		const categories = await db.getActiveCategories();
		const categoryMap = new Map(categories.map((c) => [c.id, c]));

		// First filter out null/undefined transactions, then apply other filters
		const recentTransactions = transactions
			.filter((tx) => tx != null) // Remove null/undefined transactions
			.filter((tx) => {
				if (
					!(
						tx.status === 'cleared' &&
						tx.clearedDate &&
						new Date(tx.clearedDate) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
					)
				) {
					return false;
				}
				if (tx.type === 'income') {
					return transactionAutomationCountsInAnalytics(tx);
				}
				if (tx.type === 'expense') {
					return shouldIncludeClearedExpenseInAnalyticsSpend(tx, categoryMap);
				}
				return false;
			});

		// Convert all amounts to main currency
		let totalIncome = 0;
		let totalExpenses = 0;

		for (const tx of recentTransactions) {
			const transactionCurrency = tx.currency || mainCurrency;

			if (tx.type === 'income') {
				const amount = tx.amount || 0;
				let convertedAmount = amount;
				if (transactionCurrency !== mainCurrency) {
					const converted = await exchangeRateService.convertAmount(
						Math.abs(amount),
						transactionCurrency,
						mainCurrency,
						tx.clearedDate ? new Date(tx.clearedDate) : undefined
					);
					if (converted !== null) {
						convertedAmount = amount < 0 ? -converted : converted;
					} else {
						console.warn(
							`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${tx.id}`
						);
					}
				}
				totalIncome += convertedAmount;
			} else if (tx.type === 'expense') {
				const portion = absAnalyticsTierPortion(tx, categoryMap);
				let convertedPortion = portion;
				if (transactionCurrency !== mainCurrency) {
					const converted = await exchangeRateService.convertAmount(
						portion,
						transactionCurrency,
						mainCurrency,
						tx.clearedDate ? new Date(tx.clearedDate) : undefined
					);
					if (converted !== null) {
						convertedPortion = converted;
					} else {
						console.warn(
							`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${tx.id}`
						);
					}
				}
				totalExpenses += convertedPortion;
			}
		}

		if (totalIncome === 0) return 0;

		const savingsRate = ((totalIncome - totalExpenses) / totalIncome) * 100;

		if (savingsRate >= 20) return 100;
		if (savingsRate >= 15) return 80;
		if (savingsRate >= 10) return 60;
		if (savingsRate >= 5) return 40;
		return 20;
	}

	/**
	 * Calculate debt-to-income ratio score (0-100) - converted to main currency
	 */
	private async calculateDebtToIncomeScore(
		accounts: Account[],
		transactions: Transaction[]
	): Promise<number> {
		// Get user's main currency
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';

		// Simple implementation - assumes credit accounts are debt
		const creditAccounts = accounts.filter((acc) => acc.type === 'credit');

		// Convert all debt to main currency
		let totalDebt = 0;
		for (const acc of creditAccounts) {
			const debt = Math.abs(acc.currentBalance);
			if (acc.currency === mainCurrency) {
				totalDebt += debt;
			} else {
				const converted = await exchangeRateService.convertAmount(
					debt,
					acc.currency,
					mainCurrency
				);
				if (converted !== null) {
					totalDebt += converted;
				} else {
					console.warn(
						`Failed to convert debt from ${acc.currency} to ${mainCurrency} for account ${acc.name}`
					);
					totalDebt += debt;
				}
			}
		}

		// Convert all income to main currency
		let recentIncome = 0;
		// Filter out null/undefined transactions before processing
		for (const tx of transactions.filter((tx) => tx != null)) {
			if (
				tx.type === 'income' &&
				tx.status === 'cleared' &&
				transactionAutomationCountsInAnalytics(tx)
			) {
				const amount = tx.amount || 0;
				const transactionCurrency = tx.currency || mainCurrency;

				let convertedAmount = amount;
				if (transactionCurrency !== mainCurrency) {
					const converted = await exchangeRateService.convertAmount(
						Math.abs(amount),
						transactionCurrency,
						mainCurrency,
						tx.clearedDate ? new Date(tx.clearedDate) : undefined
					);
					if (converted !== null) {
						convertedAmount = amount < 0 ? -converted : converted;
					} else {
						console.warn(
							`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${tx.id}`
						);
					}
				}

				recentIncome += convertedAmount;
			}
		}

		if (recentIncome === 0) return 50; // Neutral if no income data

		const debtToIncomeRatio = totalDebt / recentIncome;

		if (debtToIncomeRatio <= 0.1) return 100;
		if (debtToIncomeRatio <= 0.2) return 80;
		if (debtToIncomeRatio <= 0.3) return 60;
		if (debtToIncomeRatio <= 0.4) return 40;
		return 20;
	}

	/**
	 * Calculate emergency fund score (0-100) - converted to main currency
	 */
	private async calculateEmergencyFundScore(
		accounts: Account[],
		transactions: Transaction[]
	): Promise<number> {
		// Get user's main currency
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';
		const categories = await db.getActiveCategories();
		const categoryMap = new Map(categories.map((c) => [c.id, c]));

		const savingsAccounts = accounts.filter((acc) => acc.type === 'savings');

		// Convert all savings to main currency
		let totalSavings = 0;
		for (const acc of savingsAccounts) {
			const savings = acc.currentBalance;
			if (acc.currency === mainCurrency) {
				totalSavings += savings;
			} else {
				const converted = await exchangeRateService.convertAmount(
					savings,
					acc.currency,
					mainCurrency
				);
				if (converted !== null) {
					totalSavings += converted;
				} else {
					console.warn(
						`Failed to convert savings from ${acc.currency} to ${mainCurrency} for account ${acc.name}`
					);
					totalSavings += savings;
				}
			}
		}

		// Convert all expenses to main currency
		let totalExpenses = 0;
		// Filter out null/undefined transactions before processing
		for (const tx of transactions.filter((tx) => tx != null)) {
			if (tx.type === 'expense' && tx.status === 'cleared') {
				if (!shouldIncludeClearedExpenseInAnalyticsSpend(tx, categoryMap)) {
					continue;
				}
				const amount = absAnalyticsTierPortion(tx, categoryMap);
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
					} else {
						console.warn(
							`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${tx.id}`
						);
					}
				}

				totalExpenses += convertedAmount;
			}
		}

		const monthlyExpenses = totalExpenses / 3; // Approximate monthly expenses

		if (monthlyExpenses === 0) return 50;

		const emergencyFundMonths = totalSavings / monthlyExpenses;

		if (emergencyFundMonths >= 6) return 100;
		if (emergencyFundMonths >= 4) return 80;
		if (emergencyFundMonths >= 3) return 60;
		if (emergencyFundMonths >= 2) return 40;
		return 20;
	}

	/**
	 * Calculate goal progress score (0-100)
	 */
	private async calculateGoalProgressScore(): Promise<number> {
		const goals = await db.getActiveGoals();
		if (goals.length === 0) return 50; // Neutral if no goals

		// Simple implementation - can be enhanced with actual goal progress calculation
		const completedGoals = goals.filter((g) => g.status === 'completed').length;
		return Math.round((completedGoals / goals.length) * 100);
	}

	/**
	 * Generate recommendations based on health score components
	 */
	private generateRecommendations(components: {
		spendingControl: number;
		savingsRate: number;
		debtToIncome: number;
		emergencyFund: number;
		goalProgress: number;
	}): string[] {
		const recommendations: string[] = [];

		if (components.spendingControl < 60) {
			recommendations.push(
				'Consider tracking your expenses more closely and setting spending limits'
			);
		}

		if (components.savingsRate < 60) {
			recommendations.push(
				'Try to increase your savings rate by reducing expenses or increasing income'
			);
		}

		if (components.debtToIncome < 60) {
			recommendations.push(
				'Focus on paying down high-interest debt to improve your financial health'
			);
		}

		if (components.emergencyFund < 60) {
			recommendations.push('Build an emergency fund with 3-6 months of expenses');
		}

		if (components.goalProgress < 60) {
			recommendations.push('Set specific financial goals and track your progress regularly');
		}

		return recommendations;
	}
}

export const analyticsService = new AnalyticsService();
