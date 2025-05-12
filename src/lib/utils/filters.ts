import { addDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { dateUtils } from './utils';

export function createTransactionFilters() {
    return {
        /**
         * Filter transactions within the current week
         */
        isInCurrentWeek: (transaction: { date: string }) => {
            return dateUtils.isDateInCurrentWeek(transaction.date);
        },

        /**
         * Filter completed transactions
         */
        isCompletedTransaction: (reverse: boolean = false) => 
            (transaction: { isCompleted: boolean }) => { return reverse !== transaction.isCompleted;
        },

        /**
         * Filter future transactions
         */
        isFutureTransaction: (transaction: { date: string }) => {
            return new Date(transaction.date) > new Date();
        },

        /**
         * Filter by transaction type
         */
        byType: (type: 'expense' | 'income' | 'saving') => 
            (transaction: { type: string }) => transaction.type === type,

        /**
         * Filter by account ID
         */
        byAccountId: (accountId: string) => 
            (transaction: { accountId: string }) => transaction.accountId === accountId,

        /**
         * Compose multiple filters
         */
        compose: (...filters: Array<(item: any) => boolean>) => 
            (item: any) => filters.every(filter => filter(item))
    };
}

export const transactionFilters = createTransactionFilters();