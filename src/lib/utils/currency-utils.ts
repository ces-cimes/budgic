import type { Currency, CurrencyInfo } from '$lib/core/db';

/**
 * Validate currency code format
 */
export function isValidCurrencyCode(code: string): boolean {
    return /^[A-Z]{3}$/.test(code);
}

/**
 * Validate amount for a specific currency
 */
export function validateAmount(amount: number, currencyCode: string): { isValid: boolean; error?: string } {
    if (typeof amount !== 'number' || isNaN(amount)) {
        return { isValid: false, error: 'Amount must be a valid number' };
    }

    if (amount < 0) {
        return { isValid: false, error: 'Amount cannot be negative' };
    }

    // Check decimal places based on currency
    const currencyInfo = getCurrencyInfo(currencyCode);
    if (currencyInfo) {
        const decimalPlaces = getDecimalPlaces(amount);
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
 * Format amount according to currency rules
 */
export function formatAmount(amount: number, currencyCode: string): string {
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
 * Get currency information
 */
export function getCurrencyInfo(code: string): CurrencyInfo | null {
    // This would typically come from a currency database
    // For now, return common currencies
    const currencies: Record<string, CurrencyInfo> = {
        'USD': { code: 'USD', name: 'US Dollar', symbol: '$', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true },
        'EUR': { code: 'EUR', name: 'Euro', symbol: '€', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true },
        'GBP': { code: 'GBP', name: 'British Pound', symbol: '£', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true },
        'JPY': { code: 'JPY', name: 'Japanese Yen', symbol: '¥', placement: 'before', decimalPlaces: 0, isSystem: true, isActive: true },
        'CAD': { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true },
        'AUD': { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true },
        'CHF': { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true },
        'CNY': { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true },
        'INR': { code: 'INR', name: 'Indian Rupee', symbol: '₹', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true },
        'BRL': { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true }
    };

    return currencies[code] || null;
}

/**
 * Convert amount between currencies (basic implementation)
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