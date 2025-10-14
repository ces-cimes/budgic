import { describe, test, expect, beforeEach } from 'vitest';
import { 
    formatCurrencyAmount, 
    formatSummaryAmount, 
    formatTransactionListAmount,
    formatBalanceAmount,
    formatCurrencyWithLocale,
    formatCurrencyForLocale,
    formatTransactionAmount,
    formatMainCurrencyAmount
} from '$lib/utils/currency-utils';
import { useCurrencyFormatting } from '$lib/hooks/use-currency-formatting';

describe('Currency Formatting', () => {
    describe('Zero Amount Handling', () => {
        test('zero amounts should not show signs', () => {
            expect(formatSummaryAmount(0, 'USD')).toBe('$0.00');
            expect(formatSummaryAmount(0, 'USD', { showPlus: true })).toBe('$0.00');
            expect(formatTransactionListAmount(0, 'USD')).toBe('$0.00');
            expect(formatTransactionListAmount(0, 'USD', { showPlus: true })).toBe('$0.00');
        });

        test('zero amounts with different currencies', () => {
            expect(formatSummaryAmount(0, 'EUR')).toBe('€0.00');
            expect(formatSummaryAmount(0, 'GBP')).toBe('£0.00');
            expect(formatSummaryAmount(0, 'JPY')).toBe('¥0');
        });
    });

    describe('Sign Placement', () => {
        test('positive amounts with showPlus', () => {
            expect(formatSummaryAmount(100, 'USD', { showPlus: true })).toBe('+$100.00');
            expect(formatSummaryAmount(100, 'EUR', { showPlus: true })).toBe('+€100.00');
        });

        test('positive amounts without showPlus', () => {
            expect(formatSummaryAmount(100, 'USD')).toBe('$100.00');
            expect(formatSummaryAmount(100, 'EUR')).toBe('€100.00');
        });

        test('negative amounts always show minus', () => {
            expect(formatSummaryAmount(-100, 'USD')).toBe('-$100.00');
            expect(formatSummaryAmount(-100, 'EUR')).toBe('-€100.00');
        });
    });

    describe('Compact Notation', () => {
        test('thousands formatting', () => {
            expect(formatCurrencyAmount(1000, 'USD', { compact: true })).toBe('1K');
            expect(formatCurrencyAmount(1500, 'USD', { compact: true })).toBe('1.5K');
        });

        test('millions formatting', () => {
            expect(formatCurrencyAmount(1000000, 'USD', { compact: true })).toBe('1M');
            expect(formatCurrencyAmount(1500000, 'USD', { compact: true })).toBe('1.5M');
        });

        test('billions formatting', () => {
            expect(formatCurrencyAmount(1000000000, 'USD', { compact: true })).toBe('1B');
            expect(formatCurrencyAmount(1500000000, 'USD', { compact: true })).toBe('1.5B');
        });

        test('trillions formatting', () => {
            expect(formatCurrencyAmount(1000000000000, 'USD', { compact: true })).toBe('1T');
            expect(formatCurrencyAmount(1500000000000, 'USD', { compact: true })).toBe('1.5T');
        });
    });

    describe('Accounting Style', () => {
        test('negative amounts in parentheses', () => {
            expect(formatCurrencyAmount(-100, 'USD', { accountingStyle: true })).toBe('($100.00)');
            expect(formatCurrencyAmount(-1000, 'USD', { accountingStyle: true })).toBe('($1,000.00)');
        });

        test('positive amounts normal', () => {
            expect(formatCurrencyAmount(100, 'USD', { accountingStyle: true })).toBe('$100.00');
            expect(formatCurrencyAmount(1000, 'USD', { accountingStyle: true })).toBe('$1,000.00');
        });

        test('zero amounts normal', () => {
            expect(formatCurrencyAmount(0, 'USD', { accountingStyle: true })).toBe('$0.00');
        });
    });

    describe('Currency Placement', () => {
        test('before placement currencies', () => {
            expect(formatCurrencyAmount(100, 'USD')).toBe('$100.00');
            expect(formatCurrencyAmount(100, 'EUR')).toBe('€100.00');
            expect(formatCurrencyAmount(100, 'GBP')).toBe('£100.00');
        });

        test('after placement currencies', () => {
            // Note: Most currencies in the registry use 'before' placement
            // This test would need currencies with 'after' placement to be meaningful
            expect(formatCurrencyAmount(100, 'USD')).toBe('$100.00');
        });
    });

    describe('Decimal Places', () => {
        test('USD has 2 decimal places', () => {
            expect(formatCurrencyAmount(100, 'USD')).toBe('$100.00');
            expect(formatCurrencyAmount(100.5, 'USD')).toBe('$100.50');
        });

        test('JPY has 0 decimal places', () => {
            expect(formatCurrencyAmount(100, 'JPY')).toBe('¥100');
            expect(formatCurrencyAmount(100.5, 'JPY')).toBe('¥101'); // Rounded
        });

        test('BTC has 8 decimal places', () => {
            expect(formatCurrencyAmount(1, 'BTC')).toBe('₿1.00000000');
            expect(formatCurrencyAmount(0.5, 'BTC')).toBe('₿0.50000000');
        });
    });

    describe('Edge Cases', () => {
        test('null and undefined amounts', () => {
            expect(formatCurrencyAmount(null, 'USD')).toBe('$0.00');
            expect(formatCurrencyAmount(undefined, 'USD')).toBe('$0.00');
            expect(formatCurrencyAmount(NaN, 'USD')).toBe('$0.00');
        });

        test('very small amounts', () => {
            expect(formatCurrencyAmount(0.01, 'USD')).toBe('$0.01');
            expect(formatCurrencyAmount(0.001, 'USD')).toBe('$0.00'); // Rounded to 2 decimal places
        });

        test('very large amounts', () => {
            expect(formatCurrencyAmount(999999999999, 'USD')).toBe('$999,999,999,999.00');
        });

        test('unknown currency codes', () => {
            expect(formatCurrencyAmount(100, 'UNKNOWN')).toBe('100.00');
            expect(formatCurrencyAmount(100, 'UNKNOWN', { showSign: true })).toBe('100.00');
        });
    });

    describe('Legacy Functions', () => {
        test('formatTransactionAmount', () => {
            expect(formatTransactionAmount(100, 'USD')).toBe('+$100.00');
            expect(formatTransactionAmount(-100, 'USD')).toBe('-$100.00');
            expect(formatTransactionAmount(0, 'USD')).toBe('$0.00');
            expect(formatTransactionAmount(100, 'USD', false)).toBe('$100.00');
        });

        test('formatMainCurrencyAmount', () => {
            expect(formatMainCurrencyAmount(100, 'USD')).toBe('$100.00');
            expect(formatMainCurrencyAmount(0, 'USD')).toBe('$0.00');
        });
    });

    describe('Locale Support', () => {
        test('formatCurrencyWithLocale with different locales', () => {
            expect(formatCurrencyWithLocale(1000, 'USD', 'en-US')).toBe('$1,000.00');
            expect(formatCurrencyWithLocale(1000, 'EUR', 'de-DE')).toBe('1.000,00 €');
            expect(formatCurrencyWithLocale(1000, 'EUR', 'fr-FR')).toBe('1 000,00 €');
        });

        test('formatCurrencyForLocale with sign options', () => {
            expect(formatCurrencyForLocale(100, 'USD', 'en-US', { showSign: true })).toBe('$100.00');
            expect(formatCurrencyForLocale(-100, 'USD', 'en-US', { showSign: true })).toBe('-$100.00');
            expect(formatCurrencyForLocale(0, 'USD', 'en-US', { showSign: true })).toBe('$0.00');
        });
    });

    describe('Currency Formatting Hook', () => {
        test('useCurrencyFormatting provides all methods', () => {
            const format = useCurrencyFormatting();
            
            expect(typeof format.formatAmount).toBe('function');
            expect(typeof format.formatWithSign).toBe('function');
            expect(typeof format.formatBalance).toBe('function');
            expect(typeof format.formatCompact).toBe('function');
            expect(typeof format.formatWithLocale).toBe('function');
            expect(typeof format.getCompactSuffix).toBe('function');
            expect(typeof format.formatZero).toBe('function');
            expect(typeof format.validateAmount).toBe('function');
        });

        test('hook methods work correctly', () => {
            const format = useCurrencyFormatting();
            
            expect(format.formatBalance(100, 'USD')).toBe('$100.00');
            expect(format.formatWithSign(100, 'USD')).toBe('$100.00');
            expect(format.formatWithSign(100, 'USD', true)).toBe('+$100.00');
            expect(format.formatZero('USD')).toBe('$0.00');
        });

        test('validation works correctly', () => {
            const format = useCurrencyFormatting();
            
            expect(format.validateAmount(100)).toBeNull();
            expect(format.validateAmount(null)).toBeTruthy();
            expect(format.validateAmount(undefined)).toBeTruthy();
            expect(format.validateAmount(NaN)).toBeTruthy();
        });
    });

    describe('Performance', () => {
        test('formatting large numbers of amounts', () => {
            const start = performance.now();
            
            for (let i = 0; i < 1000; i++) {
                formatCurrencyAmount(i, 'USD');
            }
            
            const end = performance.now();
            expect(end - start).toBeLessThan(100); // Should be fast
        });
    });
});
