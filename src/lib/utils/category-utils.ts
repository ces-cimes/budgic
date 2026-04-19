/**
 * Category utility functions
 */

import {
	ANALYTICS_TIERS,
	db,
	generateUUID,
	transactionAutomationCountsInAnalytics,
	type Category,
	type Transaction
} from '$lib/core/db';

/** Category ids that receive a non-zero share of this transaction's amount */
export function categoryIdsWithSpendShare(tx: Transaction): string[] {
	if (tx.categoryWeights?.length) {
		return tx.categoryWeights.map((w) => w.categoryId);
	}
	return tx.categoryId ? [tx.categoryId] : [];
}

/** Signed sum of amounts on analytics tiers only (excludes unclassified slice). */
export function signedSumAnalyticsTierAmounts(
	tx: Transaction,
	categories: Map<string, Category>
): number {
	const ta = tierAmounts(tx, categories);
	let s = 0;
	for (const t of ANALYTICS_TIERS) {
		s += ta[t] ?? 0;
	}
	return s;
}

/** Absolute spend magnitude attributed to analytics tiers (for expense analytics totals). */
export function absAnalyticsTierPortion(tx: Transaction, categories: Map<string, Category>): number {
	return Math.abs(signedSumAnalyticsTierAmounts(tx, categories));
}

/** Cleared expense with automation rule and at least some amount on survival–lifestyle tiers */
export function shouldIncludeClearedExpenseInAnalyticsSpend(
	tx: Transaction,
	categories: Map<string, Category>
): boolean {
	if (tx.type !== 'expense' || tx.status !== 'cleared') return false;
	if (!transactionAutomationCountsInAnalytics(tx)) return false;
	return absAnalyticsTierPortion(tx, categories) > 1e-9;
}

/**
 * Phase 9 — signed amount attributed to a category (soft split or legacy single categoryId).
 */
export function effectiveAmountForCategory(tx: Transaction, categoryId: string): number {
	const base = tx.amount ?? 0;
	if (!tx.categoryWeights?.length) {
		return tx.categoryId === categoryId ? base : 0;
	}
	const entry = tx.categoryWeights.find((w) => w.categoryId === categoryId);
	return entry ? base * entry.weight : 0;
}

/**
 * Phase 9 — per-waterfall-tier signed amounts for one transaction.
 */
export function tierAmounts(tx: Transaction, categories: Map<string, Category>): Record<string, number> {
	const result: Record<string, number> = {};
	const base = tx.amount ?? 0;
	const addToTier = (tier: string, amount: number) => {
		result[tier] = (result[tier] ?? 0) + amount;
	};
	if (!tx.categoryWeights?.length) {
		const tier = categories.get(tx.categoryId ?? '')?.waterfallTier ?? 'unclassified';
		addToTier(tier, base);
		return result;
	}
	for (const { categoryId, weight } of tx.categoryWeights) {
		const tier = categories.get(categoryId)?.waterfallTier ?? 'unclassified';
		addToTier(tier, base * weight);
	}
	return result;
}

/** Absolute spend magnitude for a category from a transaction (for expense analytics). */
export function effectiveAbsExpenseAmountForCategory(tx: Transaction, categoryId: string): number {
	if (tx.type !== 'expense') return 0;
	return Math.abs(effectiveAmountForCategory(tx, categoryId));
}

/**
 * Get or create the "Uncategorized" system category for expenses
 * This category is used when users don't select a category for expense transactions
 */
export async function getOrCreateUncategorizedCategory(): Promise<Category> {
	const UNCATEGORIZED_NAME = 'Uncategorized';

	// Try to find existing uncategorized category
	const existing = await db.categories
		.filter(
			(cat) =>
				cat.name.toLowerCase() === UNCATEGORIZED_NAME.toLowerCase() &&
				cat.type === 'expense' &&
				!cat.deletedAt
		)
		.first();

	if (existing) {
		return existing;
	}

	// Create the uncategorized category if it doesn't exist
	// Catch-all until the user assigns a real tier
	const uncategorizedCategory: Category = {
		id: generateUUID(),
		name: UNCATEGORIZED_NAME,
		type: 'expense',
		waterfallTier: 'unclassified',
		priority: 999, // Lowest priority
		budgetAmount: undefined, // No budget allocation by default
		color: '#8A8F98', // Muted gray color
		description: 'Transactions that have not been categorized yet',
		isActive: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: null
	};

	await db.categories.add(uncategorizedCategory);
	return uncategorizedCategory;
}

/**
 * Check if a category is the "Uncategorized" system category
 */
export function isUncategorizedCategory(category: Category | null | undefined): boolean {
	if (!category) return false;
	return category.name.toLowerCase() === 'uncategorized' && category.type === 'expense';
}

const UNCATEGORIZED_INCOME_NAME = 'Uncategorized';

/**
 * Get or create the "Uncategorized" system category for income
 * Mirrors expense uncategorized: unclassified tier until the user assigns a real category.
 */
export async function getOrCreateUncategorizedIncomeCategory(): Promise<Category> {
	const existing = await db.categories
		.filter(
			(cat) =>
				cat.name.toLowerCase() === UNCATEGORIZED_INCOME_NAME.toLowerCase() &&
				cat.type === 'income' &&
				!cat.deletedAt
		)
		.first();

	if (existing) {
		return existing;
	}

	const uncategorizedIncome: Category = {
		id: generateUUID(),
		name: UNCATEGORIZED_INCOME_NAME,
		type: 'income',
		waterfallTier: 'unclassified',
		priority: 999,
		budgetAmount: undefined,
		color: '#8A8F98',
		description: 'Income that has not been categorized yet',
		isActive: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: null
	};

	await db.categories.add(uncategorizedIncome);
	return uncategorizedIncome;
}

export function isUncategorizedIncomeCategory(category: Category | null | undefined): boolean {
	if (!category) return false;
	return category.name.toLowerCase() === 'uncategorized' && category.type === 'income';
}
