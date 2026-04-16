import {
	db,
	generateUUID,
	isAnalyticsTier,
	transactionAutomationCountsInAnalytics
} from '$lib/core/db';
import type { Category, Transaction } from '$lib/core/db';
import type { AnalyticsTier } from '$lib/core/db';

interface BudgetAllocation {
	categoryId: string;
	categoryName: string;
	allocatedAmount: number;
	spentAmount: number;
	remainingAmount: number;
	percentageUsed: number;
	waterfallTier: Category['waterfallTier'];
	priority: number;
}

interface BudgetSummary {
	totalAllocated: number;
	totalSpent: number;
	totalRemaining: number;
	allocations: BudgetAllocation[];
	byTier: Record<
		AnalyticsTier,
		{
			allocated: number;
			spent: number;
			remaining: number;
		}
	>;
}

class BudgetService {
	public get ready() {
		return Promise.resolve();
	}

	public isLoading() {
		return false;
	}

	// ============================================================================
	// BUDGET MANAGEMENT
	// ============================================================================

	/**
	 * Get budget summary for all categories (converted to main currency)
	 */
	async getBudgetSummary(): Promise<BudgetSummary> {
		const categories = await db.getActiveCategories();
		const transactions = await db.transactions.toArray();

		const allocations: BudgetAllocation[] = [];
		let totalAllocated = 0;
		let totalSpent = 0;

		// Calculate budget allocations for each category
		for (const category of categories) {
			if (category.budgetAmount && category.budgetAmount > 0) {
				const spentAmount = await this.calculateCategorySpending(category.id, transactions);
				const remainingAmount = category.budgetAmount - spentAmount;
				const percentageUsed =
					category.budgetAmount > 0 ? (spentAmount / category.budgetAmount) * 100 : 0;

				allocations.push({
					categoryId: category.id,
					categoryName: category.name,
					allocatedAmount: category.budgetAmount,
					spentAmount,
					remainingAmount,
					percentageUsed,
					waterfallTier: category.waterfallTier,
					priority: category.priority
				});

				totalAllocated += category.budgetAmount;
				totalSpent += spentAmount;
			}
		}

		// Calculate by tier
		const byTier: Record<
			AnalyticsTier,
			{ allocated: number; spent: number; remaining: number }
		> = {
			survival: { allocated: 0, spent: 0, remaining: 0 },
			security: { allocated: 0, spent: 0, remaining: 0 },
			growth: { allocated: 0, spent: 0, remaining: 0 },
			lifestyle: { allocated: 0, spent: 0, remaining: 0 }
		};

		allocations.forEach((allocation) => {
			const tier = allocation.waterfallTier;
			if (!isAnalyticsTier(tier)) {
				return;
			}
			byTier[tier].allocated += allocation.allocatedAmount;
			byTier[tier].spent += allocation.spentAmount;
			byTier[tier].remaining += allocation.remainingAmount;
		});

		return {
			totalAllocated,
			totalSpent,
			totalRemaining: totalAllocated - totalSpent,
			allocations,
			byTier
		};
	}

	/**
	 * Set budget amount for a category
	 */
	async setCategoryBudget(categoryId: string, amount: number): Promise<void> {
		const category = await db.categories.get(categoryId);
		if (!category) {
			throw new Error(`Category ${categoryId} not found`);
		}

		await db.categories.update(categoryId, {
			budgetAmount: amount,
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Get budget for a specific category
	 */
	async getCategoryBudget(categoryId: string): Promise<BudgetAllocation | null> {
		const category = await db.categories.get(categoryId);
		if (!category || !category.budgetAmount) {
			return null;
		}

		const transactions = await db.transactions.toArray();
		const spentAmount = await this.calculateCategorySpending(categoryId, transactions);
		const remainingAmount = category.budgetAmount - spentAmount;
		const percentageUsed =
			category.budgetAmount > 0 ? (spentAmount / category.budgetAmount) * 100 : 0;

		return {
			categoryId: category.id,
			categoryName: category.name,
			allocatedAmount: category.budgetAmount,
			spentAmount,
			remainingAmount,
			percentageUsed,
			waterfallTier: category.waterfallTier,
			priority: category.priority
		};
	}

	/**
	 * Get budget recommendations based on spending patterns
	 */
	async getBudgetRecommendations(): Promise<
		{
			categoryId: string;
			categoryName: string;
			currentSpending: number;
			recommendedBudget: number;
			reasoning: string;
		}[]
	> {
		const categories = await db.getActiveCategories();
		const transactions = await db.transactions.toArray();
		const recommendations: {
			categoryId: string;
			categoryName: string;
			currentSpending: number;
			recommendedBudget: number;
			reasoning: string;
		}[] = [];

		// Calculate average spending over last 3 months
		const threeMonthsAgo = new Date();
		threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
		const recentTransactions = transactions.filter(
			(tx: Transaction) => tx.clearedDate && new Date(tx.clearedDate) >= threeMonthsAgo
		);

		// Get user's main currency
		const { userService, exchangeRateService } = await import('$lib/core/services');
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';

		for (const category of categories) {
			const categoryTransactions = recentTransactions.filter(
				(tx: Transaction) =>
					tx.categoryId === category.id &&
					(tx.type !== 'expense' || transactionAutomationCountsInAnalytics(tx))
			);

			// Convert all amounts to main currency
			let totalSpending = 0;
			for (const tx of categoryTransactions) {
				if (tx.type === 'expense') {
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
						} else {
							console.warn(
								`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${tx.id}`
							);
						}
					}

					totalSpending += convertedAmount;
				}
			}

			const averageMonthlySpending = totalSpending / 3;
			const recommendedBudget = averageMonthlySpending * 1.1; // 10% buffer

			if (averageMonthlySpending > 0) {
				recommendations.push({
					categoryId: category.id,
					categoryName: category.name,
					currentSpending: averageMonthlySpending,
					recommendedBudget,
					reasoning: `Based on ${categoryTransactions.length} transactions over the last 3 months`
				});
			}
		}

		return recommendations.sort((a, b) => b.currentSpending - a.currentSpending);
	}

	/**
	 * Get budget alerts (over budget categories)
	 */
	async getBudgetAlerts(): Promise<
		{
			categoryId: string;
			categoryName: string;
			allocatedAmount: number;
			spentAmount: number;
			overageAmount: number;
			percentageOver: number;
		}[]
	> {
		const budgetSummary = await this.getBudgetSummary();
		const alerts: {
			categoryId: string;
			categoryName: string;
			allocatedAmount: number;
			spentAmount: number;
			overageAmount: number;
			percentageOver: number;
		}[] = [];

		budgetSummary.allocations.forEach((allocation) => {
			if (allocation.spentAmount > allocation.allocatedAmount) {
				alerts.push({
					categoryId: allocation.categoryId,
					categoryName: allocation.categoryName,
					allocatedAmount: allocation.allocatedAmount,
					spentAmount: allocation.spentAmount,
					overageAmount: allocation.spentAmount - allocation.allocatedAmount,
					percentageOver: allocation.percentageUsed - 100
				});
			}
		});

		return alerts.sort((a, b) => b.percentageOver - a.percentageOver);
	}

	/**
	 * Get waterfall budget progress
	 */
	async getWaterfallProgress(): Promise<
		{
			tier: Category['waterfallTier'];
			totalAllocated: number;
			totalSpent: number;
			remaining: number;
			percentageUsed: number;
			categories: BudgetAllocation[];
		}[]
	> {
		const budgetSummary = await this.getBudgetSummary();
		const tierProgress: {
			tier: Category['waterfallTier'];
			totalAllocated: number;
			totalSpent: number;
			remaining: number;
			percentageUsed: number;
			categories: BudgetAllocation[];
		}[] = [];

		const tiers = ['survival', 'security', 'growth', 'lifestyle'] as const;

		tiers.forEach((tier) => {
			const tierCategories = budgetSummary.allocations.filter((a) => a.waterfallTier === tier);
			const tierData = budgetSummary.byTier[tier];

			tierProgress.push({
				tier,
				totalAllocated: tierData.allocated,
				totalSpent: tierData.spent,
				remaining: tierData.remaining,
				percentageUsed: tierData.allocated > 0 ? (tierData.spent / tierData.allocated) * 100 : 0,
				categories: tierCategories.sort((a, b) => a.priority - b.priority)
			});
		});

		return tierProgress;
	}

	/**
	 * Get all budget categories (for compatibility with old interface)
	 */
	async getBudgetCategories(): Promise<Category[]> {
		return await db.getActiveCategories();
	}

	/**
	 * Update a budget category (for compatibility with old interface)
	 */
	async updateBudgetCategory(categoryId: string, updates: Partial<Category>): Promise<void> {
		const category = await db.categories.get(categoryId);
		if (!category) {
			throw new Error(`Category ${categoryId} not found`);
		}

		await db.categories.update(categoryId, {
			...updates,
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Create a new category
	 */
	async createCategory(categoryData: {
		name: string;
		type: Category['type'];
		waterfallTier?: Category['waterfallTier'];
		priority: number;
		budgetAmount?: number;
		color?: string;
		description?: string;
		isActive?: boolean;
	}): Promise<Category> {
		const category: Category = {
			id: generateUUID(),
			name: categoryData.name,
			type: categoryData.type,
			waterfallTier: categoryData.waterfallTier ?? 'unclassified',
			priority: categoryData.priority,
			budgetAmount: categoryData.budgetAmount,
			color: categoryData.color,
			description: categoryData.description,
			isActive: categoryData.isActive ?? true,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};

		await db.categories.add(category);
		return category;
	}

	// ============================================================================
	// PRIVATE METHODS
	// ============================================================================

	/**
	 * Calculate spending for a category
	 */
	private calculateCategorySpending(categoryId: string, transactions: Transaction[]): number {
		return transactions
			.filter(
				(tx) =>
					tx.categoryId === categoryId &&
					tx.type === 'expense' &&
					tx.status === 'cleared' &&
					transactionAutomationCountsInAnalytics(tx)
			)
			.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
	}
}

export const budgetService = new BudgetService();
