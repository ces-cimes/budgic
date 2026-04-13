/**
 * Category utility functions
 */

import { db, generateUUID, type Category } from '$lib/core/db';

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
	// Use 'lifestyle' tier with lowest priority since it's a catch-all
	const uncategorizedCategory: Category = {
		id: generateUUID(),
		name: UNCATEGORIZED_NAME,
		type: 'expense',
		waterfallTier: 'lifestyle',
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
