/**
 * Money Manager Schema Mapper
 * 
 * Maps Money Manager (Realbyte) CSV data structures to Budgic schema.
 * Handles field transformations, type conversions, and data normalization.
 */

import type { Account, Category, Transaction, Currency } from '$lib/core/db';
import type { CSVFile } from './types';

/**
 * Map Money Manager account type (ZDATA) to Budgic account type
 * 
 * @param zdata - MM account type code (0, 1, 2, 3)
 * @returns Budgic account type
 */
export function mapAccountType(zdata: string | number): Account['type'] {
	const typeCode = typeof zdata === 'string' ? parseInt(zdata, 10) : zdata;
	
	switch (typeCode) {
		case 0:
			return 'cash';
		case 1:
			return 'checking';
		case 2:
			return 'credit';
		case 3:
			return 'investment';
		default:
			return 'checking'; // Default fallback
	}
}

/**
 * Map Money Manager category type to Budgic category type
 * 
 * @param type - MM category type (0=income, 1=expense)
 * @returns Budgic category type
 */
export function mapCategoryType(type: string | number): Category['type'] {
	const typeCode = typeof type === 'string' ? parseInt(type, 10) : type;
	return typeCode === 0 ? 'income' : 'expense';
}

/**
 * Map Money Manager transaction type (DO_TYPE) to Budgic transaction type
 * 
 * @param doType - MM transaction type (0=income, 1=expense, 3=transfer out, 4=transfer in, 7/8=adjustment)
 * @returns Budgic transaction type
 */
export function mapTransactionType(doType: string | number): Transaction['type'] {
	const typeCode = typeof doType === 'string' ? parseInt(doType, 10) : doType;
	
	switch (typeCode) {
		case 0:
			return 'income';
		case 1:
			return 'expense';
		case 3:
		case 4:
			return 'transfer';
		case 7:
		case 8:
			return 'adjustment';
		default:
			return 'expense'; // Default fallback
	}
}

/**
 * Convert Money Manager date format (YYYY-MM-DD) to ISO datetime
 * 
 * @param wdate - MM date string (e.g., "2024-10-15")
 * @returns ISO datetime string
 */
export function mapDate(wdate: string): string {
	if (!wdate || wdate === 'null' || wdate.trim() === '') {
		return new Date().toISOString();
	}
	
	// MM uses "YYYY-MM-DD" format
	const dateMatch = wdate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (dateMatch) {
		const [, year, month, day] = dateMatch;
		return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)).toISOString();
	}
	
	// Fallback: try to parse as-is
	const parsed = new Date(wdate);
	if (!isNaN(parsed.getTime())) {
		return parsed.toISOString();
	}
	
	// Last resort: current date
	return new Date().toISOString();
}

/**
 * Convert Money Manager amount to Budgic amount (with sign handling)
 * 
 * @param zmoney - MM amount string
 * @param doType - MM transaction type (for sign handling)
 * @returns Budgic amount (income positive, expense negative)
 */
export function mapAmount(zmoney: string | number, doType: string | number): number {
	const amount = typeof zmoney === 'string' ? parseFloat(zmoney) : zmoney;
	const typeCode = typeof doType === 'string' ? parseInt(doType, 10) : doType;
	
	if (isNaN(amount)) {
		return 0;
	}
	
	// MM stores: income positive (0), expense positive (1)
	// Budgic uses: income positive, expense negative
	if (typeCode === 1) {
		// Expense: negate
		return -Math.abs(amount);
	} else if (typeCode === 0) {
		// Income: keep positive
		return Math.abs(amount);
	} else if (typeCode === 3) {
		// Transfer out: negative
		return -Math.abs(amount);
	} else if (typeCode === 4) {
		// Transfer in: positive
		return Math.abs(amount);
	} else {
		// Adjustment (7, 8): use as-is (already signed)
		return amount;
	}
}

/**
 * Extract ISO currency code from Money Manager currency uid
 * 
 * @param currencyUid - MM currency uid (e.g., "RUB_RUB", "RUB_USD")
 * @param currencyFile - CURRENCY CSV file for lookup
 * @returns ISO currency code (e.g., "RUB", "USD")
 */
export function extractCurrencyCode(currencyUid: string, currencyFile?: CSVFile): string {
	if (!currencyUid || currencyUid === 'null' || currencyUid.trim() === '') {
		return 'USD'; // Default fallback
	}
	
	// Try to find in currency file first
	if (currencyFile) {
		const currencyRow = currencyFile.rows.find(row => row.uid === currencyUid);
		if (currencyRow && currencyRow.ISO) {
			return currencyRow.ISO;
		}
	}
	
	// Fallback: extract from uid format (e.g., "RUB_RUB" -> "RUB")
	// MM uses format: BASE_SUB or BASE_BASE
	const parts = currencyUid.split('_');
	if (parts.length >= 2) {
		return parts[0]; // Return base currency
	}
	
	return 'USD'; // Default fallback
}

/**
 * Flatten category hierarchy by combining parent and child names
 * 
 * @param categoryName - Child category name
 * @param parentName - Parent category name (if exists)
 * @returns Flattened category name
 */
export function flattenCategoryName(categoryName: string, parentName?: string): string {
	if (!parentName || parentName.trim() === '') {
		return categoryName;
	}
	
	// Combine with separator
	return `${parentName} > ${categoryName}`;
}

/**
 * Parse Money Manager timestamp to ISO datetime
 * 
 * @param utime - MM timestamp (milliseconds since epoch as string)
 * @returns ISO datetime string
 */
export function parseTimestamp(utime: string | number): string {
	if (!utime || utime === 'null' || utime === '0') {
		return new Date().toISOString();
	}
	
	const timestamp = typeof utime === 'string' ? parseInt(utime, 10) : utime;
	
	if (isNaN(timestamp) || timestamp === 0) {
		return new Date().toISOString();
	}
	
	// MM timestamps are in milliseconds
	return new Date(timestamp).toISOString();
}

/**
 * Check if a value is deleted in MM (C_IS_DEL or IS_DEL = 1)
 * 
 * @param isDel - MM deletion flag
 * @returns Whether item is deleted
 */
export function isDeleted(isDel: string | number | null | undefined): boolean {
	if (isDel === null || isDel === undefined || isDel === 'null') {
		return false;
	}
	
	const value = typeof isDel === 'string' ? parseInt(isDel, 10) : isDel;
	return value === 1;
}

/**
 * Get category priority from ORDERSEQ or default
 * 
 * @param orderSeq - MM order sequence
 * @returns Priority number (1-based)
 */
export function getCategoryPriority(orderSeq: string | number | null | undefined): number {
	if (orderSeq === null || orderSeq === undefined || orderSeq === 'null' || orderSeq === '') {
		return 1;
	}
	
	const value = typeof orderSeq === 'string' ? parseInt(orderSeq, 10) : orderSeq;
	return isNaN(value) || value < 1 ? 1 : value;
}

