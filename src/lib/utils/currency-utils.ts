import type { Currency, CurrencyInfo } from '$lib/core/db';
import { CURRENCY_REGISTRY } from '$lib/core/db';

/**
 * Validate currency code format
 */
export function isValidCurrencyCode(code: string): boolean {
    return /^[A-Z]{3}$/.test(code);
}

/**
 * Validate amount for a specific currency
 */
export function validateAmount(amount: number | undefined | null, currencyCode: string, allowNegative: boolean = false): { isValid: boolean; error?: string } {
    if (amount === undefined || amount === null) {
        return { isValid: false, error: 'Amount is required' };
    }

    if (typeof amount !== 'number' || isNaN(amount)) {
        return { isValid: false, error: 'Amount must be a valid number' };
    }

    if (amount < 0 && !allowNegative) {
        return { isValid: false, error: 'Amount cannot be negative' };
    }

    // Check decimal places based on currency (use absolute value for decimal validation)
    const currencyInfo = getCurrencyInfo(currencyCode);
    if (currencyInfo) {
        const decimalPlaces = getDecimalPlaces(Math.abs(amount));
        if (decimalPlaces > currencyInfo.decimalPlaces) {
            return { 
                isValid: false, 
                error: `${currencyInfo.name} supports maximum ${currencyInfo.decimalPlaces} decimal places` 
            };
        }
    }

    return { isValid: true };
}

/**
 * Get decimal places in a number
 */
export function getDecimalPlaces(num: number): number {
    if (Math.floor(num) === num) return 0;
    return num.toString().split('.')[1]?.length || 0;
}

/**
 * Get currency information from the unified registry
 */
export function getCurrencyInfo(code: string): CurrencyInfo | null {
    return CURRENCY_REGISTRY.get(code) || null;
}

/**
 * Format amount according to currency rules with proper symbol placement and decimal places
 */
export function formatAmount(amount: number | undefined | null, currencyCode: string): string {
    if (amount === undefined || amount === null || isNaN(amount)) {
        return '0.00';
    }

    const currencyInfo = getCurrencyInfo(currencyCode);
    if (!currencyInfo) {
        return amount.toFixed(2);
    }

    const formattedAmount = amount.toFixed(currencyInfo.decimalPlaces);
    const symbol = currencyInfo.symbol;
    const placement = currencyInfo.placement || 'before';

    return placement === 'before' 
        ? `${symbol}${formattedAmount}`
        : `${formattedAmount}${symbol}`;
}

/**
 * Format amount with sign for transaction display (e.g., +$100.00, -€50.00)
 * Note: Zero amounts will not show a sign
 */
export function formatTransactionAmount(amount: number | undefined | null, currencyCode: string, showSign: boolean = true): string {
    if (amount === undefined || amount === null || isNaN(amount)) {
        // Format zero with the provided currency, not hardcoded USD
        const currencyInfo = getCurrencyInfo(currencyCode);
        if (currencyInfo) {
            const formattedZero = (0).toFixed(currencyInfo.decimalPlaces);
            const symbol = currencyInfo.symbol;
            const placement = currencyInfo.placement || 'before';
            return placement === 'before' ? `${symbol}${formattedZero}` : `${formattedZero}${symbol}`;
        }
        return '0.00'; // Fallback if currency not found
    }

    const currencyInfo = getCurrencyInfo(currencyCode);
    if (!currencyInfo) {
        const sign = showSign && amount !== 0 ? (amount > 0 ? '+' : '') : '';
        return `${sign}${amount.toFixed(2)}`;
    }

    const absAmount = Math.abs(amount);
    const formattedAmount = absAmount.toFixed(currencyInfo.decimalPlaces);
    const symbol = currencyInfo.symbol;
    const placement = currencyInfo.placement || 'before';
    const sign = showSign && amount !== 0 ? (amount > 0 ? '+' : '-') : '';

    if (placement === 'before') {
        return `${sign}${symbol}${formattedAmount}`;
    } else {
        return `${sign}${formattedAmount}${symbol}`;
    }
}

/**
 * Enhanced formatting options for currency amounts
 */
export interface FormatOptions {
    /** Whether to show the sign (+/-) */
    showSign?: boolean;
    /** Whether to show the plus sign for positive amounts */
    showPlus?: boolean;
    /** Whether to use absolute value (no sign) */
    absolute?: boolean;
    /** Custom sign to use instead of +/- */
    customSign?: string;
    /** Whether to use compact notation (e.g., 1K, 1M) */
    compact?: boolean;
    /** Whether to use parentheses for negative amounts (accounting style) */
    accountingStyle?: boolean;
}

/**
 * Enhanced currency formatting function with comprehensive options
 */
export function formatCurrencyAmount(
    amount: number | undefined | null, 
    currencyCode: string, 
    options: FormatOptions = {}
): string {
    const {
        showSign = false,
        showPlus = false,
        absolute = false,
        customSign,
        compact = false,
        accountingStyle = false
    } = options;

    if (amount === undefined || amount === null || isNaN(amount)) {
        amount = 0;
    }

    const currencyInfo = getCurrencyInfo(currencyCode);
    if (!currencyInfo) {
        return formatBasicAmount(amount, { showSign, showPlus, absolute, customSign, compact, accountingStyle });
    }

    const absAmount = Math.abs(amount);
    let formattedAmount: string;

    if (compact && absAmount >= 1000) {
        formattedAmount = formatCompactAmount(absAmount, currencyInfo.decimalPlaces);
    } else {
        formattedAmount = absAmount.toFixed(currencyInfo.decimalPlaces);
    }

    const symbol = currencyInfo.symbol;
    const placement = currencyInfo.placement || 'before';

    // Determine the sign - NO SIGN for zero amounts
    let sign = '';
    if (!absolute && amount !== 0) {
        if (customSign) {
            sign = customSign;
        } else if (accountingStyle && amount < 0) {
            sign = ''; // Will use parentheses instead
        } else if (showSign) {
            sign = amount > 0 ? (showPlus ? '+' : '') : '-';
        }
    }

    // Format the amount with symbol
    let result: string;
    if (placement === 'before') {
        result = `${symbol}${formattedAmount}`;
    } else {
        result = `${formattedAmount}${symbol}`;
    }

    // Apply sign or accounting style
    if (accountingStyle && amount < 0) {
        return `(${result})`;
    } else {
        return `${sign}${result}`;
    }
}

/**
 * Format amount for summary displays (totals, balances, etc.)
 * Automatically handles sign placement and provides consistent formatting
 */
export function formatSummaryAmount(
    amount: number | undefined | null, 
    currencyCode: string, 
    options: { showPlus?: boolean; compact?: boolean } = {}
): string {
    return formatCurrencyAmount(amount, currencyCode, {
        showSign: true,
        showPlus: options.showPlus || false,
        compact: options.compact || false
    });
}

/**
 * Format amount for transaction lists with consistent sign placement
 */
export function formatTransactionListAmount(
    amount: number | undefined | null, 
    currencyCode: string, 
    options: { showPlus?: boolean } = {}
): string {
    return formatCurrencyAmount(amount, currencyCode, {
        showSign: true,
        showPlus: options.showPlus || false
    });
}

/**
 * Format amount for balance displays (no sign, just the amount)
 */
export function formatBalanceAmount(
    amount: number | undefined | null, 
    currencyCode: string, 
    options: { compact?: boolean } = {}
): string {
    return formatCurrencyAmount(amount, currencyCode, {
        showSign: false,
        compact: options.compact || false
    });
}

/**
 * Helper function for basic amount formatting without currency info
 */
function formatBasicAmount(
    amount: number, 
    options: FormatOptions
): string {
    const { showSign, showPlus, absolute, customSign, compact, accountingStyle } = options;
    
    const absAmount = Math.abs(amount);
    let formattedAmount: string;

    if (compact && absAmount >= 1000) {
        formattedAmount = formatCompactAmount(absAmount, 2);
    } else {
        formattedAmount = absAmount.toFixed(2);
    }

    let sign = '';
    if (!absolute && amount !== 0) {
        if (customSign) {
            sign = customSign;
        } else if (accountingStyle && amount < 0) {
            return `(${formattedAmount})`;
        } else if (showSign) {
            sign = amount > 0 ? (showPlus ? '+' : '') : '-';
        }
    }

    return `${sign}${formattedAmount}`;
}

/**
 * Format large amounts in compact notation (1K, 1M, 1B, etc.)
 * Uses Paraglide messages for localized suffixes
 */
function formatCompactAmount(amount: number, decimalPlaces: number): string {
    if (amount >= 1e12) {
        const compactAmount = (amount / 1e12).toFixed(decimalPlaces);
        return `${compactAmount}T`;
    }
    if (amount >= 1e9) {
        const compactAmount = (amount / 1e9).toFixed(decimalPlaces);
        return `${compactAmount}B`;
    }
    if (amount >= 1e6) {
        const compactAmount = (amount / 1e6).toFixed(decimalPlaces);
        return `${compactAmount}M`;
    }
    if (amount >= 1e3) {
        const compactAmount = (amount / 1e3).toFixed(decimalPlaces);
        return `${compactAmount}K`;
    }

    return amount.toFixed(decimalPlaces);
}

/**
 * Get user's main currency from preferences
 * Returns USD as last resort fallback only
 */
export async function getUserMainCurrency(): Promise<string> {
    try {
        const { userService } = await import('$lib/core/services');
        const preferences = await userService.getUserPreferences();
        return preferences?.currency || 'USD'; // Last resort fallback
    } catch (error) {
        console.warn('Failed to get user main currency:', error);
        return 'USD'; // Last resort fallback
    }
}

/**
 * Format amount for general display using user's main currency
 * Note: This function now requires currency parameter - use getUserMainCurrency() to get it
 */
export function formatMainCurrencyAmount(amount: number | undefined | null, mainCurrencyCode: string): string {
    return formatAmount(amount, mainCurrencyCode);
}

/**
 * Localization-friendly currency formatting
 * This function is designed to work with Paraglide and other i18n systems
 * by using consistent formatting regardless of locale
 */
export function formatCurrencyForLocale(
    amount: number | undefined | null,
    currencyCode: string,
    locale: string = 'en-US',
    options: FormatOptions = {}
): string {
    if (amount === undefined || amount === null || isNaN(amount)) {
        amount = 0;
    }

    const currencyInfo = getCurrencyInfo(currencyCode);
    if (!currencyInfo) {
        // Fallback to basic formatting without locale-specific features
        return formatBasicAmount(amount, options);
    }

    // Use our consistent custom formatting instead of Intl.NumberFormat
    // This ensures consistent currency display regardless of user's locale
    try {
        return formatCurrencyAmount(amount, currencyCode, options);
    } catch (error) {
        console.error('Currency formatting failed:', error);
        return 'Formatting error';
    }
}

/**
 * Format currency amount with proper locale support for Paraglide integration
 * This is the recommended function for use with your localization system
 */
export function formatCurrencyWithLocale(
    amount: number | undefined | null,
    currencyCode: string,
    locale: string = 'en-US',
    options: {
        showSign?: boolean;
        showPlus?: boolean;
        compact?: boolean;
    } = {}
): string {
    return formatCurrencyForLocale(amount, currencyCode, locale, {
        showSign: options.showSign || false,
        showPlus: options.showPlus || false,
        compact: options.compact || false
    });
}

/**
 * Convert amount between currencies (basic implementation)
 * @deprecated Use exchangeRateService.convertAmount() instead for automatic rate lookup
 */
export function convertCurrency(
	amount: number, 
	fromCurrency: string, 
	toCurrency: string, 
	exchangeRate: number
): number {
	if (fromCurrency === toCurrency) return amount;
	return amount * exchangeRate;
}

/**
 * Convert amount to user's main currency using exchange rate service
 * This is the recommended function for converting amounts in calculations
 */
export async function convertToMainCurrency(
	amount: number,
	fromCurrency: string,
	mainCurrency?: string
): Promise<number> {
	if (amount === 0) return 0;
	
	// Get main currency if not provided
	if (!mainCurrency) {
		mainCurrency = await getUserMainCurrency();
	}
	
	// Same currency, no conversion needed
	if (fromCurrency === mainCurrency) {
		return amount;
	}
	
	// Use exchange rate service for conversion
	const { exchangeRateService } = await import('$lib/core/services');
	const converted = await exchangeRateService.convertAmount(amount, fromCurrency, mainCurrency);
	
	// If conversion fails, return original amount (better than 0 or null)
	if (converted === null) {
		console.warn(`Failed to convert ${amount} ${fromCurrency} to ${mainCurrency}, using original amount`);
		return amount;
	}
	
	return converted;
}

/**
 * Parse currency string to number
 */
export function parseCurrencyString(value: string, currencyCode: string): number | null {
    const currencyInfo = getCurrencyInfo(currencyCode);
    if (!currencyInfo) return null;

    // Remove currency symbol and placement
    let cleanedValue = value.replace(/[^\d.,-]/g, '');
    
    // Handle different decimal separators
    if (cleanedValue.includes(',') && cleanedValue.includes('.')) {
        // European format: 1.234,56
        cleanedValue = cleanedValue.replace('.', '').replace(',', '.');
    } else if (cleanedValue.includes(',')) {
        // Could be either thousands separator or decimal separator
        // Assume it's decimal separator if there are only 1-2 digits after comma
        const parts = cleanedValue.split(',');
        if (parts[1] && parts[1].length <= 2) {
            cleanedValue = cleanedValue.replace(',', '.');
        } else {
            cleanedValue = cleanedValue.replace(/,/g, '');
        }
    }

    const parsed = parseFloat(cleanedValue);
    return isNaN(parsed) ? null : parsed;
}

/**
 * Get currency display information
 */
export function getCurrencyDisplayInfo(code: string): {
    symbol: string;
    placement: 'before' | 'after';
    decimalPlaces: number;
    formattedExample: string;
} | null {
    const currencyInfo = getCurrencyInfo(code);
    if (!currencyInfo) return null;

    const exampleAmount = 1234.56;
    const formattedExample = formatAmount(exampleAmount, code);

    return {
        symbol: currencyInfo.symbol,
        placement: currencyInfo.placement,
        decimalPlaces: currencyInfo.decimalPlaces,
        formattedExample
    };
} 