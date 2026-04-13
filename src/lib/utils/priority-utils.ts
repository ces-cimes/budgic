/**
 * Priority scoring utilities for transactions
 * Priority scale: 1-10 (higher = more important)
 */

export interface PriorityLevel {
	value: number;
	name: string;
	description: string;
	color: string;
	examples: string[];
}

export const PRIORITY_LEVELS: PriorityLevel[] = [
	{
		value: 1,
		name: 'Very Low',
		description: 'Optional or discretionary spending that can be easily deferred',
		color: 'text-muted-foreground',
		examples: ['Entertainment subscriptions', 'Hobby purchases', 'Non-essential shopping']
	},
	{
		value: 2,
		name: 'Low',
		description: 'Nice-to-have items that can be postponed without major impact',
		color: 'text-muted-foreground',
		examples: ['Dining out', 'Non-urgent purchases', 'Optional upgrades']
	},
	{
		value: 3,
		name: 'Below Average',
		description: 'Minor expenses that can be delayed if needed',
		color: 'text-text-secondary',
		examples: ['Casual shopping', 'Non-essential services', 'Optional maintenance']
	},
	{
		value: 4,
		name: 'Average',
		description: 'Regular expenses with some flexibility',
		color: 'text-text-secondary',
		examples: ['Regular groceries', 'Standard utilities', 'Routine services']
	},
	{
		value: 5,
		name: 'Moderate',
		description: 'Important expenses that should generally be paid on time',
		color: 'text-info',
		examples: ['Monthly bills', 'Regular subscriptions', 'Standard services']
	},
	{
		value: 6,
		name: 'Above Average',
		description: 'Significant expenses that are important to maintain',
		color: 'text-info',
		examples: ['Insurance premiums', 'Important subscriptions', 'Regular maintenance']
	},
	{
		value: 7,
		name: 'High',
		description: 'Critical expenses that should be prioritized',
		color: 'text-warning',
		examples: ['Essential utilities', 'Important bills', 'Critical services']
	},
	{
		value: 8,
		name: 'Very High',
		description: 'Essential expenses that must be paid to maintain basic needs',
		color: 'text-warning',
		examples: ['Rent/mortgage', 'Essential utilities', 'Critical insurance']
	},
	{
		value: 9,
		name: 'Critical',
		description: 'Extremely important expenses with severe consequences if missed',
		color: 'text-alert',
		examples: ['Rent/mortgage payment', 'Critical medical expenses', 'Essential debt payments']
	},
	{
		value: 10,
		name: 'Emergency',
		description: 'Highest priority - must be paid immediately to avoid severe consequences',
		color: 'text-alert',
		examples: ['Emergency medical', 'Critical legal obligations', 'Life-threatening situations']
	}
];

/**
 * Get priority level information by value
 */
export function getPriorityLevel(priority: number): PriorityLevel | undefined {
	return PRIORITY_LEVELS.find((level) => level.value === priority);
}

/**
 * Get priority level name
 */
export function getPriorityName(priority: number): string {
	const level = getPriorityLevel(priority);
	return level?.name || `Priority ${priority}`;
}

/**
 * Get priority level description
 */
export function getPriorityDescription(priority: number): string {
	const level = getPriorityLevel(priority);
	return level?.description || 'No description available';
}

/**
 * Get priority color class
 */
export function getPriorityColor(priority: number): string {
	const level = getPriorityLevel(priority);
	return level?.color || 'text-muted-foreground';
}

/**
 * Get suggested priority based on transaction type and category
 * This is a helper function for auto-suggesting priorities
 */
export function suggestPriority(
	type: 'income' | 'expense' | 'transfer' | 'adjustment',
	categoryName?: string
): number {
	// Income is generally high priority
	if (type === 'income') {
		return 8;
	}

	// Transfers are typically moderate priority
	if (type === 'transfer') {
		return 5;
	}

	// Adjustments are typically low priority
	if (type === 'adjustment') {
		return 3;
	}

	// For expenses, suggest based on category name patterns
	if (type === 'expense' && categoryName) {
		const lowerName = categoryName.toLowerCase();

		// Critical expenses (9-10)
		if (
			lowerName.includes('rent') ||
			lowerName.includes('mortgage') ||
			lowerName.includes('emergency') ||
			lowerName.includes('medical')
		) {
			return 9;
		}

		// Very high priority (8)
		if (
			lowerName.includes('utility') ||
			lowerName.includes('insurance') ||
			lowerName.includes('debt') ||
			lowerName.includes('loan')
		) {
			return 8;
		}

		// High priority (7)
		if (
			lowerName.includes('phone') ||
			lowerName.includes('internet') ||
			lowerName.includes('essential')
		) {
			return 7;
		}

		// Moderate priority (5-6)
		if (
			lowerName.includes('grocery') ||
			lowerName.includes('food') ||
			lowerName.includes('subscription') ||
			lowerName.includes('service')
		) {
			return 6;
		}

		// Low priority (1-4)
		if (
			lowerName.includes('entertainment') ||
			lowerName.includes('hobby') ||
			lowerName.includes('shopping') ||
			lowerName.includes('dining')
		) {
			return 3;
		}
	}

	// Default moderate priority
	return 5;
}
