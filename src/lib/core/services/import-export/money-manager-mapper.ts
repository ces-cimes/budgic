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
 * Convert Money Manager date to ISO datetime
 * 
 * Priority order:
 * 1. ZDATE (timestamp in milliseconds) - authoritative transaction time
 * 2. UTIME (timestamp in milliseconds) - fallback if ZDATE not available
 * 3. WDATE (date string YYYY-MM-DD) - last resort, uses UTC to avoid timezone issues
 * 
 * @param zdate - MM ZDATE timestamp (milliseconds) - primary source for transaction time
 * @param utime - MM UTIME timestamp (milliseconds) - fallback for transaction time
 * @param wdate - MM WDATE date string (YYYY-MM-DD) - last resort fallback
 * @returns ISO datetime string
 */
export function mapDate(zdate?: string | number, utime?: string | number, wdate?: string): string {
	// Priority 1: Use ZDATE if available (authoritative transaction timestamp)
	if (zdate && zdate !== 'null' && zdate !== '0' && zdate !== '') {
		const timestamp = typeof zdate === 'string' ? parseInt(zdate, 10) : zdate;
		if (!isNaN(timestamp) && timestamp > 0) {
			return new Date(timestamp).toISOString();
		}
	}

	// Priority 2: Use UTIME as fallback (last update timestamp, but close to transaction time)
	if (utime && utime !== 'null' && utime !== '0' && utime !== '') {
		const timestamp = typeof utime === 'string' ? parseInt(utime, 10) : utime;
		if (!isNaN(timestamp) && timestamp > 0) {
			return new Date(timestamp).toISOString();
		}
	}

	// Priority 3: Parse WDATE as UTC date (avoids timezone shifts)
	if (wdate && wdate !== 'null' && wdate.trim() !== '') {
		// MM uses "YYYY-MM-DD" format - parse as UTC to avoid timezone issues
		const dateMatch = wdate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (dateMatch) {
			const [, year, month, day] = dateMatch;
			// Use Date.UTC to create date in UTC, avoiding local timezone shifts
			const date = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)));
			// Set to noon UTC to avoid midnight edge cases and ensure consistent ordering
			date.setUTCHours(12, 0, 0, 0);
			return date.toISOString();
		}

		// Fallback: try to parse as UTC date string
		const parsed = new Date(wdate + 'T00:00:00.000Z');
		if (!isNaN(parsed.getTime())) {
			parsed.setUTCHours(12, 0, 0, 0);
			return parsed.toISOString();
		}
	}

	// Last resort: current date
	return new Date().toISOString();
}

/**
 * Convert Money Manager amount to Budgic amount
 * 
 * IMPORTANT: MM CSV exports already contain amounts with correct signs in IN_ZMONEY.
 * This function simply parses and returns the amount as-is, preserving the original sign.
 * 
 * @param zmoney - MM amount (string or number) - should be from IN_ZMONEY field
 * @param doType - MM transaction type (kept for backward compatibility, not used)
 * @returns Budgic amount (preserves original sign from CSV)
 */
export function mapAmount(zmoney: string | number, doType?: string | number): number {
	const amount = typeof zmoney === 'string' ? parseFloat(zmoney) : zmoney;
	
	if (isNaN(amount)) {
		return 0;
	}
	
	// MM CSV exports already have correct signs in IN_ZMONEY
	// Just return the amount as-is - no conversion needed
	return amount;
}

/**
 * Extract ISO currency code from Money Manager currency uid
 * 
 * For INOUTCOME transactions, the currencyUid format is BASE_TARGET where:
 * - BASE is typically the account's base currency
 * - TARGET is the actual transaction currency (what we need)
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
	
	// Fallback: extract from uid format
	// For INOUTCOME transactions: format is BASE_TARGET (e.g., "RUB_USD")
	// We need the TARGET (second part) which is the actual transaction currency
	const parts = currencyUid.split('_');
	if (parts.length >= 2) {
		// Return the second ISO code (transaction currency), not the first (base currency)
		return parts[1]; // Return target/transaction currency
	}
	
	// If only one part, use it (fallback for edge cases)
	if (parts.length === 1 && parts[0]) {
		return parts[0];
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

