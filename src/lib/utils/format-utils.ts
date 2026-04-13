import { formatPercentage as formatPercentageWithOptions } from '$lib/utils/currency-utils';

/**
 * Format number with short notation (K, M, B)
 */
export function formatNumberShort(num: number): string {
	if (num >= 1000000000) {
		return (num / 1000000000).toFixed(1).toLocaleString() + 'B';
	}
	if (num >= 1000000) {
		return (num / 1000000).toFixed(1).toLocaleString() + 'M';
	}
	if (num >= 1000) {
		return (num / 1000).toFixed(1).toLocaleString() + 'K';
	}
	return num.toString();
}

/**
 * Format currency amount with proper decimal places
 */
export function formatCurrencyAmount(amount: number, decimalPlaces: number = 2): string {
	return amount.toFixed(decimalPlaces);
}

/**
 * Format percentage with proper decimal places. Trims trailing zeros (Design Bible: 72% not 72.0%).
 * Delegates to currency-utils.formatPercentage for consistent behavior.
 */
export function formatPercentage(value: number, decimalPlaces: number = 1): string {
	return formatPercentageWithOptions(value, { maxDecimals: decimalPlaces });
}

/**
 * Format large numbers with commas
 */
export function formatNumberWithCommas(num: number): string {
	return num.toLocaleString();
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
