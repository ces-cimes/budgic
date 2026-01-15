import type { FlexibilityTier } from '$lib/core/db';

/**
 * Flexibility tier utilities for transaction optimization
 * Defines how flexible a transaction's date can be for optimization
 */

export interface FlexibilityTierInfo {
	value: FlexibilityTier;
	name: string;
	description: string;
	daysRange: string;
	icon: string;
	examples: string[];
}

export const FLEXIBILITY_TIERS: FlexibilityTierInfo[] = [
	{
		value: 'fixed',
		name: 'Fixed',
		description: 'Cannot be moved - must occur on scheduled date',
		daysRange: '0 days',
		icon: '🔒',
		examples: ['Rent/mortgage payments', 'Fixed appointments', 'Contractual obligations', 'Non-negotiable dates']
	},
	{
		value: 'semi-fixed',
		name: 'Semi-Fixed',
		description: 'Limited flexibility - can move ±1-2 days from scheduled date',
		daysRange: '±1-2 days',
		icon: '⚡',
		examples: ['Utility bills', 'Insurance premiums', 'Credit card payments', 'Loan payments']
	},
	{
		value: 'flexible-constrained',
		name: 'Flexible-Constrained',
		description: 'Moderate flexibility - can move ±3-7 days from scheduled date',
		daysRange: '±3-7 days',
		icon: '📅',
		examples: ['Groceries', 'Gas/fuel', 'Regular shopping', 'Routine services']
	},
	{
		value: 'flexible',
		name: 'Flexible',
		description: 'High flexibility - can move ±14-30 days from scheduled date',
		daysRange: '±14-30 days',
		icon: '🔄',
		examples: ['Entertainment', 'Dining out', 'Hobby purchases', 'Optional services']
	},
	{
		value: 'deferrable',
		name: 'Deferrable',
		description: 'Can be postponed to next period - 30+ days flexibility',
		daysRange: '30+ days',
		icon: '⏭️',
		examples: ['Discretionary shopping', 'Non-essential purchases', 'Optional upgrades', 'Luxury items']
	}
];

/**
 * Get flexibility tier information by value
 */
export function getFlexibilityTierInfo(tier: FlexibilityTier): FlexibilityTierInfo | undefined {
	return FLEXIBILITY_TIERS.find(t => t.value === tier);
}

/**
 * Get flexibility tier name
 */
export function getFlexibilityTierName(tier: FlexibilityTier): string {
	const info = getFlexibilityTierInfo(tier);
	return info?.name || 'Unknown';
}

/**
 * Get flexibility tier description
 */
export function getFlexibilityTierDescription(tier: FlexibilityTier): string {
	const info = getFlexibilityTierInfo(tier);
	return info?.description || 'No description available';
}

/**
 * Get flexibility tier days range
 */
export function getFlexibilityTierDaysRange(tier: FlexibilityTier): string {
	const info = getFlexibilityTierInfo(tier);
	return info?.daysRange || 'Unknown';
}

/**
 * Get flexibility tier icon
 */
export function getFlexibilityTierIcon(tier: FlexibilityTier): string {
	const info = getFlexibilityTierInfo(tier);
	return info?.icon || '📋';
}

/**
 * Get maximum days a transaction can be moved based on flexibility tier
 * Returns the maximum absolute days (positive number)
 */
export function getMaxFlexibilityDays(tier: FlexibilityTier | undefined): number {
	if (!tier) return 0;
	
	switch (tier) {
		case 'fixed':
			return 0;
		case 'semi-fixed':
			return 2;
		case 'flexible-constrained':
			return 7;
		case 'flexible':
			return 30;
		case 'deferrable':
			return 999; // Effectively unlimited (next period)
		default:
			return 0;
	}
}

/**
 * Validate if a date movement is allowed based on flexibility tier
 * @param tier The flexibility tier
 * @param originalDate The original scheduled date
 * @param newDate The proposed new date
 * @returns Validation result with isValid flag and optional error message
 */
export function validateFlexibilityMovement(
	tier: FlexibilityTier | undefined,
	originalDate: Date,
	newDate: Date
): { isValid: boolean; error?: string; daysMoved: number } {
	// No tier means no flexibility
	if (!tier) {
		return { isValid: false, error: 'No flexibility tier set', daysMoved: 0 };
	}

	// Fixed tier means no movement is allowed
	if (tier === 'fixed') {
		const originalTime = originalDate.getTime();
		const newTime = newDate.getTime();
		const daysMoved = Math.round((newTime - originalTime) / (1000 * 60 * 60 * 24));
		if (originalTime !== newTime) {
			return { 
				isValid: false, 
				error: 'This transaction has a fixed date and cannot be moved',
				daysMoved
			};
		}
		return { isValid: true, daysMoved: 0 };
	}

	// Calculate time difference in days
	const timeDiff = newDate.getTime() - originalDate.getTime();
	const daysMoved = Math.round(timeDiff / (1000 * 60 * 60 * 24));
	const absDaysMoved = Math.abs(daysMoved);
	const maxDays = getMaxFlexibilityDays(tier);

	// Check if movement exceeds tier limits
	if (absDaysMoved > maxDays) {
		return { 
			isValid: false, 
			error: `This transaction can only be moved up to ${maxDays} days (${getFlexibilityTierDaysRange(tier)})`,
			daysMoved
		};
	}

	return { isValid: true, daysMoved };
}

/**
 * Suggest a flexibility tier based on transaction type, category, and directional constraint
 * This integrates with directional constraints to provide intelligent suggestions
 */
export function suggestFlexibilityTier(
	type: 'income' | 'expense' | 'transfer' | 'adjustment',
	categoryName?: string,
	directionalConstraint?: 'none' | 'forward-only' | 'backward-only' | 'fixed'
): FlexibilityTier {
	// If directional constraint is fixed, flexibility must be fixed
	if (directionalConstraint === 'fixed') {
		return 'fixed';
	}

	// Income is typically flexible
	if (type === 'income') {
		return 'flexible';
	}

	// Transfers are typically flexible-constrained
	if (type === 'transfer') {
		return 'flexible-constrained';
	}

	// Adjustments are typically flexible
	if (type === 'adjustment') {
		return 'flexible';
	}

	// For expenses, suggest based on category name patterns
	if (type === 'expense' && categoryName) {
		const lowerName = categoryName.toLowerCase();

		// Fixed expenses (rent, mortgage, fixed contracts)
		if (lowerName.includes('rent') || lowerName.includes('mortgage') || 
		    lowerName.includes('lease') || lowerName.includes('contract') ||
		    lowerName.includes('fixed')) {
			return 'fixed';
		}

		// Semi-fixed expenses (bills, utilities, insurance, loans)
		if (lowerName.includes('utility') || lowerName.includes('bill') || 
		    lowerName.includes('insurance') || lowerName.includes('premium') ||
		    lowerName.includes('loan') || lowerName.includes('debt') ||
		    lowerName.includes('payment') || lowerName.includes('due')) {
			return 'semi-fixed';
		}

		// Flexible-constrained expenses (groceries, gas, regular shopping)
		if (lowerName.includes('grocery') || lowerName.includes('food') || 
		    lowerName.includes('gas') || lowerName.includes('fuel') ||
		    lowerName.includes('shopping') || lowerName.includes('store')) {
			return 'flexible-constrained';
		}

		// Flexible expenses (entertainment, dining, services)
		if (lowerName.includes('entertainment') || lowerName.includes('dining') || 
		    lowerName.includes('restaurant') || lowerName.includes('service') ||
		    lowerName.includes('subscription') || lowerName.includes('streaming')) {
			return 'flexible';
		}

		// Deferrable expenses (discretionary, luxury, optional)
		if (lowerName.includes('hobby') || lowerName.includes('luxury') || 
		    lowerName.includes('optional') || lowerName.includes('discretionary') ||
		    lowerName.includes('upgrade') || lowerName.includes('non-essential')) {
			return 'deferrable';
		}
	}

	// Default: flexible-constrained for expenses
	return 'flexible-constrained';
}

/**
 * Get suggested flexibility tier considering both category patterns and directional constraints
 * This ensures consistency between flexibility tier and directional constraints
 */
export function suggestFlexibilityTierWithConstraint(
	type: 'income' | 'expense' | 'transfer' | 'adjustment',
	categoryName?: string,
	directionalConstraint?: 'none' | 'forward-only' | 'backward-only' | 'fixed'
): FlexibilityTier {
	// First get base suggestion
	let suggested = suggestFlexibilityTier(type, categoryName, directionalConstraint);

	// If directional constraint is fixed, override to fixed
	if (directionalConstraint === 'fixed') {
		return 'fixed';
	}

	// If directional constraint is forward-only or backward-only, 
	// ensure flexibility tier is at least semi-fixed (allows some movement)
	if ((directionalConstraint === 'forward-only' || directionalConstraint === 'backward-only') 
	    && suggested === 'fixed') {
		return 'semi-fixed';
	}

	return suggested;
}

