import type { Transaction, Category } from '$lib/core/db';

export interface WaterfallBudget {
	survival: number;
	security: number;
	growth: number;
	lifestyle: number;
}

export interface BudgetAllocation {
	categoryId: string;
	categoryName: string;
	tier: 'survival' | 'security' | 'growth' | 'lifestyle';
	priority: number;
	allocatedAmount: number;
	spentAmount: number;
	remainingAmount: number;
	percentageUsed: number;
}

/**
 * Calculate waterfall budget allocation based on income and categories
 */
export function calculateWaterfallBudget(
	monthlyIncome: number,
	categories: Category[]
): WaterfallBudget {
	// Simplified waterfall percentages
	const survivalPercentage = 0.6; // 60% for survival needs
	const securityPercentage = 0.2; // 20% for security
	const growthPercentage = 0.15; // 15% for growth
	const lifestylePercentage = 0.05; // 5% for lifestyle

	return {
		survival: monthlyIncome * survivalPercentage,
		security: monthlyIncome * securityPercentage,
		growth: monthlyIncome * growthPercentage,
		lifestyle: monthlyIncome * lifestylePercentage
	};
}

/**
 * Allocate budget amounts to categories within each tier
 */
export function allocateBudgetToCategories(
	waterfallBudget: WaterfallBudget,
	categories: Category[],
	transactions: Transaction[]
): BudgetAllocation[] {
	const allocations: BudgetAllocation[] = [];

	// Group categories by tier
	const categoriesByTier = {
		survival: categories.filter((c) => c.waterfallTier === 'survival'),
		security: categories.filter((c) => c.waterfallTier === 'security'),
		growth: categories.filter((c) => c.waterfallTier === 'growth'),
		lifestyle: categories.filter((c) => c.waterfallTier === 'lifestyle')
	};

	// Calculate spent amounts per category
	const spentByCategory = new Map<string, number>();
	transactions.forEach((tx) => {
		if (tx.categoryId && tx.type === 'expense') {
			const spent = spentByCategory.get(tx.categoryId) || 0;
			spentByCategory.set(tx.categoryId, spent + Math.abs(tx.amount || 0));
		}
	});

	// Allocate budget for each tier
	Object.entries(categoriesByTier).forEach(([tier, tierCategories]) => {
		const tierBudget = waterfallBudget[tier as keyof WaterfallBudget];
		const totalPriority = tierCategories.reduce((sum, cat) => sum + cat.priority, 0);

		tierCategories.forEach((category) => {
			const priorityWeight = category.priority / totalPriority;
			const allocatedAmount = tierBudget * priorityWeight;
			const spentAmount = spentByCategory.get(category.id) || 0;
			const remainingAmount = Math.max(0, allocatedAmount - spentAmount);
			const percentageUsed = allocatedAmount > 0 ? (spentAmount / allocatedAmount) * 100 : 0;

			allocations.push({
				categoryId: category.id,
				categoryName: category.name,
				tier: category.waterfallTier,
				priority: category.priority,
				allocatedAmount,
				spentAmount,
				remainingAmount,
				percentageUsed
			});
		});
	});

	return allocations.sort((a, b) => {
		// Sort by tier priority, then by category priority
		const tierOrder = { survival: 1, security: 2, growth: 3, lifestyle: 4 };
		const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
		return tierDiff !== 0 ? tierDiff : a.priority - b.priority;
	});
}

/**
 * Calculate budget health score (0-100)
 */
export function calculateBudgetHealth(allocations: BudgetAllocation[]): number {
	if (allocations.length === 0) return 100;

	const totalAllocated = allocations.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);
	const totalSpent = allocations.reduce((sum, alloc) => sum + alloc.spentAmount, 0);

	if (totalAllocated === 0) return 100;

	const utilizationRate = totalSpent / totalAllocated;

	// Health score based on utilization rate
	// 0-80% utilization = excellent (90-100 score)
	// 80-100% utilization = good (70-90 score)
	// 100-120% utilization = fair (50-70 score)
	// >120% utilization = poor (0-50 score)

	if (utilizationRate <= 0.8) {
		return Math.max(90, 100 - utilizationRate * 12.5);
	} else if (utilizationRate <= 1.0) {
		return Math.max(70, 90 - (utilizationRate - 0.8) * 100);
	} else if (utilizationRate <= 1.2) {
		return Math.max(50, 70 - (utilizationRate - 1.0) * 100);
	} else {
		return Math.max(0, 50 - (utilizationRate - 1.2) * 250);
	}
}

/**
 * Get budget recommendations based on current spending patterns
 */
export function getBudgetRecommendations(allocations: BudgetAllocation[]): string[] {
	const recommendations: string[] = [];

	// Check for overspending
	const overspentCategories = allocations.filter((alloc) => alloc.percentageUsed > 100);
	if (overspentCategories.length > 0) {
		recommendations.push(
			`Consider reducing spending in: ${overspentCategories.map((c) => c.categoryName).join(', ')}`
		);
	}

	// Check for underutilized categories
	const underutilizedCategories = allocations.filter(
		(alloc) => alloc.percentageUsed < 50 && alloc.allocatedAmount > 100
	);
	if (underutilizedCategories.length > 0) {
		recommendations.push(
			`You have unused budget in: ${underutilizedCategories.map((c) => c.categoryName).join(', ')}`
		);
	}

	// Check tier balance
	const tierTotals = allocations.reduce(
		(acc, alloc) => {
			acc[alloc.tier] = (acc[alloc.tier] || 0) + alloc.spentAmount;
			return acc;
		},
		{} as Record<string, number>
	);

	const totalSpent = Object.values(tierTotals).reduce((sum, amount) => sum + amount, 0);
	if (totalSpent > 0) {
		const survivalPercentage = (tierTotals.survival || 0) / totalSpent;
		if (survivalPercentage > 0.8) {
			recommendations.push('Consider allocating more to security and growth categories');
		}
	}

	return recommendations;
}
