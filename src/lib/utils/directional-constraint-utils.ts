import type { DirectionalConstraint, FlexibilityTier } from '$lib/core/db';
import { validateFlexibilityMovement, getMaxFlexibilityDays } from './flexibility-tier-utils';

/**
 * Directional constraint utilities for transaction optimization
 */

export interface DirectionalConstraintInfo {
	value: DirectionalConstraint;
	name: string;
	description: string;
	icon: string;
	examples: string[];
}

export const DIRECTIONAL_CONSTRAINTS: DirectionalConstraintInfo[] = [
	{
		value: 'none',
		name: 'No Constraint',
		description: 'Transaction date can be moved forward or backward freely',
		icon: '↔️',
		examples: ['Flexible expenses', 'Discretionary purchases', 'Optional services']
	},
	{
		value: 'forward-only',
		name: 'Forward Only',
		description: 'Transaction date can only be moved forward (to a later date)',
		icon: '→',
		examples: ['Subscription renewals', 'Auto-renewing services', 'Future commitments']
	},
	{
		value: 'backward-only',
		name: 'Backward Only',
		description: 'Transaction date can only be moved backward (to an earlier date)',
		icon: '←',
		examples: ['Bill payments', 'Due date payments', 'Time-sensitive obligations']
	},
	{
		value: 'fixed',
		name: 'Fixed Date',
		description: 'Transaction date cannot be moved (must occur on scheduled date)',
		icon: '🔒',
		examples: ['Fixed appointments', 'Contractual obligations', 'Non-negotiable dates']
	}
];

/**
 * Get constraint information by value
 */
export function getConstraintInfo(constraint: DirectionalConstraint): DirectionalConstraintInfo | undefined {
	return DIRECTIONAL_CONSTRAINTS.find(c => c.value === constraint);
}

/**
 * Get constraint name
 */
export function getConstraintName(constraint: DirectionalConstraint): string {
	const info = getConstraintInfo(constraint);
	return info?.name || 'Unknown';
}

/**
 * Get constraint description
 */
export function getConstraintDescription(constraint: DirectionalConstraint): string {
	const info = getConstraintInfo(constraint);
	return info?.description || 'No description available';
}

/**
 * Validate if a date movement is allowed based on directional constraint
 * @param constraint The directional constraint
 * @param originalDate The original scheduled date
 * @param newDate The proposed new date
 * @returns Validation result with isValid flag and optional error message
 */
export function validateDateMovement(
	constraint: DirectionalConstraint | undefined,
	originalDate: Date,
	newDate: Date
): { isValid: boolean; error?: string } {
	// No constraint means any movement is allowed
	if (!constraint || constraint === 'none') {
		return { isValid: true };
	}

	// Fixed constraint means no movement is allowed
	if (constraint === 'fixed') {
		const originalTime = originalDate.getTime();
		const newTime = newDate.getTime();
		if (originalTime !== newTime) {
			return { 
				isValid: false, 
				error: 'This transaction has a fixed date and cannot be moved' 
			};
		}
		return { isValid: true };
	}

	// Calculate time difference in milliseconds
	const timeDiff = newDate.getTime() - originalDate.getTime();
	const daysDiff = Math.round(timeDiff / (1000 * 60 * 60 * 24));

	// Forward-only: new date must be >= original date
	if (constraint === 'forward-only') {
		if (daysDiff < 0) {
			return { 
				isValid: false, 
				error: 'This transaction can only be moved forward (to a later date)' 
			};
		}
		return { isValid: true };
	}

	// Backward-only: new date must be <= original date
	if (constraint === 'backward-only') {
		if (daysDiff > 0) {
			return { 
				isValid: false, 
				error: 'This transaction can only be moved backward (to an earlier date)' 
			};
		}
		return { isValid: true };
	}

	return { isValid: true };
}

/**
 * Validate if a date movement is allowed based on both directional constraint and flexibility tier
 * This is the combined validation function that should be used for optimization
 * @param constraint The directional constraint
 * @param flexibilityTier The flexibility tier
 * @param originalDate The original scheduled date
 * @param newDate The proposed new date
 * @returns Validation result with isValid flag, optional error message, and days moved
 */
export function validateDateMovementWithFlexibility(
	constraint: DirectionalConstraint | undefined,
	flexibilityTier: FlexibilityTier | undefined,
	originalDate: Date,
	newDate: Date
): { isValid: boolean; error?: string; daysMoved: number } {
	// First check directional constraint
	const constraintValidation = validateDateMovement(constraint, originalDate, newDate);
	if (!constraintValidation.isValid) {
		const timeDiff = newDate.getTime() - originalDate.getTime();
		const daysMoved = Math.round(timeDiff / (1000 * 60 * 60 * 24));
		return {
			isValid: false,
			error: constraintValidation.error,
			daysMoved
		};
	}

	// Then check flexibility tier
	const flexibilityValidation = validateFlexibilityMovement(flexibilityTier, originalDate, newDate);
	if (!flexibilityValidation.isValid) {
		return flexibilityValidation;
	}

	// Both validations passed
	return {
		isValid: true,
		daysMoved: flexibilityValidation.daysMoved
	};
}

/**
 * Get the effective maximum days a transaction can be moved considering both constraints
 * Returns the minimum of directional constraint limit and flexibility tier limit
 */
export function getEffectiveMaxDays(
	constraint: DirectionalConstraint | undefined,
	flexibilityTier: FlexibilityTier | undefined
): number {
	// If constraint is fixed, no movement allowed
	if (constraint === 'fixed') {
		return 0;
	}

	// Get flexibility tier limit
	const flexibilityMax = getMaxFlexibilityDays(flexibilityTier);
	
	// For forward-only or backward-only, the limit is still the flexibility tier
	// (the direction is handled separately in validation)
	return flexibilityMax;
}

/**
 * Suggest a directional constraint based on transaction type and category
 */
export function suggestConstraint(
	type: 'income' | 'expense' | 'transfer' | 'adjustment',
	categoryName?: string,
	isRecurring?: boolean
): DirectionalConstraint {
	// Income is typically flexible
	if (type === 'income') {
		return 'none';
	}

	// Transfers are typically flexible
	if (type === 'transfer') {
		return 'none';
	}

	// Recurring subscriptions are typically forward-only
	if (isRecurring && categoryName) {
		const lowerName = categoryName.toLowerCase();
		if (lowerName.includes('subscription') || lowerName.includes('renewal') || 
		    lowerName.includes('service')) {
			return 'forward-only';
		}
	}

	// Bill payments are typically backward-only
	if (categoryName) {
		const lowerName = categoryName.toLowerCase();
		if (lowerName.includes('bill') || lowerName.includes('payment') || 
		    lowerName.includes('due') || lowerName.includes('utility')) {
			return 'backward-only';
		}
	}

	// Fixed appointments or contracts
	if (categoryName) {
		const lowerName = categoryName.toLowerCase();
		if (lowerName.includes('appointment') || lowerName.includes('contract') || 
		    lowerName.includes('fixed')) {
			return 'fixed';
		}
	}

	// Default: no constraint
	return 'none';
}

