import type { FilterState } from '../TransactionList.svelte';

/**
 * Count the number of active filters (excluding search query and basic toggles)
 */
export function getActiveFilterCount(filters: FilterState): number {
	let count = 0;
	
	// Status filter
	if (filters.statuses && filters.statuses.length > 0) {
		count++;
	}
	
	// Category filter
	if (filters.categoryIds && filters.categoryIds.length > 0) {
		count++;
	}
	if (filters.categoryType) {
		count++;
	}
	if (filters.waterfallTier && filters.waterfallTier.length > 0) {
		count++;
	}
	
	// Account filter
	if (filters.accountIds && filters.accountIds.length > 0) {
		count++;
	}
	if (filters.accountTypes && filters.accountTypes.length > 0) {
		count++;
	}
	
	// Amount filter
	if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
		count++;
	}
	
	// Date range filter (only if different from basic month filter)
	if (filters.dateRange) {
		count++;
	}
	if (filters.dateType) {
		count++;
	}
	
	// Type filter
	if (filters.types && filters.types.length > 0) {
		count++;
	}
	
	// Recurring filter
	if (filters.recurring !== undefined) {
		count++;
	}
	
	// Grouped filter
	if (filters.grouped !== undefined) {
		count++;
	}
	
	// Variance filters
	if (filters.hasVariance !== undefined) {
		count++;
	}
	if (filters.underBudget !== undefined) {
		count++;
	}
	if (filters.overBudget !== undefined) {
		count++;
	}
	
	// Confidence filter
	if (filters.confidence && filters.confidence.length > 0) {
		count++;
	}
	
	// Currency filter
	if (filters.currencies && filters.currencies.length > 0) {
		count++;
	}
	
	// Import source filter
	if (filters.importSource) {
		count++;
	}
	if (filters.hasNotes !== undefined) {
		count++;
	}
	if (filters.hasReference !== undefined) {
		count++;
	}
	
	return count;
}

/**
 * Clear all advanced filters (keeps search query and basic toggles)
 */
export function clearAdvancedFilters(filters: FilterState): FilterState {
	return {
		...filters,
		statuses: undefined,
		categoryIds: undefined,
		categoryType: undefined,
		waterfallTier: undefined,
		accountIds: undefined,
		accountTypes: undefined,
		minAmount: undefined,
		maxAmount: undefined,
		dateRange: undefined,
		dateType: undefined,
		types: undefined,
		recurring: undefined,
		grouped: undefined,
		hasVariance: undefined,
		underBudget: undefined,
		overBudget: undefined,
		confidence: undefined,
		currencies: undefined,
		importSource: undefined,
		hasNotes: undefined,
		hasReference: undefined,
	};
}
