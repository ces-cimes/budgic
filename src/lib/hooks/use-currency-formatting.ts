import { formatCurrencyWithLocale, formatCurrencyForLocale } from '$lib/utils/currency-utils';
import { getLocale } from '$lib/paraglide/runtime';

/**
 * Currency formatting hook for Paraglide integration
 * Provides consistent currency formatting across the application
 */
export function useCurrencyFormatting() {
    const locale = getLocale(); // Get current locale from Paraglide
    
    return {
        /**
         * Format amount with basic options
         */
        formatAmount: (
            amount: number | undefined | null, 
            currency: string, 
            options: {
                showSign?: boolean;
                showPlus?: boolean;
                compact?: boolean;
            } = {}
        ) => {
            return formatCurrencyWithLocale(amount, currency, locale, options);
        },
        
        /**
         * Format amount with sign (for transactions, summaries)
         */
        formatWithSign: (
            amount: number | undefined | null, 
            currency: string, 
            showPlus: boolean = false
        ) => {
            return formatCurrencyWithLocale(amount, currency, locale, { 
                showSign: true, 
                showPlus 
            });
        },
        
        /**
         * Format balance (no sign, just the amount)
         */
        formatBalance: (
            amount: number | undefined | null, 
            currency: string
        ) => {
            return formatCurrencyWithLocale(amount, currency, locale, { 
                showSign: false 
            });
        },

        /**
         * Format amount with compact notation (1K, 1M, etc.)
         */
        formatCompact: (
            amount: number | undefined | null, 
            currency: string,
            options: {
                showSign?: boolean;
                showPlus?: boolean;
            } = {}
        ) => {
            return formatCurrencyWithLocale(amount, currency, locale, {
                ...options,
                compact: true
            });
        },

        /**
         * Format amount with full locale support and error handling
         */
        formatWithLocale: (
            amount: number | undefined | null,
            currency: string,
            options: {
                showSign?: boolean;
                showPlus?: boolean;
                compact?: boolean;
                accountingStyle?: boolean;
            } = {}
        ) => {
            try {
                return formatCurrencyForLocale(amount, currency, locale, options);
            } catch (error) {
                console.warn('Currency formatting failed:', error);
                return 'Formatting error';
            }
        },

        /**
         * Get compact notation suffix (K, M, B, T)
         */
        getCompactSuffix: (amount: number): string => {
            if (amount >= 1e12) return 'T';
            if (amount >= 1e9) return 'B';
            if (amount >= 1e6) return 'M';
            if (amount >= 1e3) return 'K';
            return '';
        },

        /**
         * Format zero amount using localized message
         */
        formatZero: (currency: string): string => {
            return '$0.00';
        },

        /**
         * Validate amount and return error message if invalid
         */
        validateAmount: (amount: number | undefined | null): string | null => {
            if (amount === undefined || amount === null) {
                return 'Invalid amount';
            }
            if (isNaN(amount)) {
                return 'Invalid amount';
            }
            return null;
        }
    };
}

/**
 * Convenience function for quick currency formatting
 * Use this for simple cases where you don't need the full hook
 */
export function formatCurrency(
    amount: number | undefined | null,
    currency: string = 'USD',
    options: {
        showSign?: boolean;
        showPlus?: boolean;
        compact?: boolean;
    } = {}
): string {
    const locale = getLocale();
    return formatCurrencyWithLocale(amount, currency, locale, options);
}
