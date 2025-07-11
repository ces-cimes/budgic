import { isWithinInterval, isAfter, isBefore } from 'date-fns';
import { dateUtils } from './date-utils';
import type { Transaction } from '../core/db';

export function createTransactionFilters() {
    return {
        /**
         * Filter transactions within the current week
         */
        isInCurrentWeek: (transaction: Transaction) => {
            return transaction.clearedDate 
                ? dateUtils.isDateInCurrentWeek(transaction.clearedDate)
                : false;
        },

        // Status filters with clear naming
        /**
         * Filter for all cleared transactions (both 'cleared' and 'unpending' statuses)
         */
        isCleared: (transaction: Transaction) => 
            transaction.status === 'cleared',

        /**
         * Filter for pending transactions that haven't been cleared yet
         */
        isPendingPlan: (transaction: Transaction) => 
            transaction.status === 'pending',

        /**
         * Filter for cancelled transactions
         */
        isCancelled: (transaction: Transaction) => 
            transaction.status === 'cancelled',

        /**
         * Filter future pending transactions (plannedDate is in future)
         */
        isUpcoming: (transaction: Transaction) => {
            if (transaction.status !== 'pending' || !transaction.plannedDate) return false;
            return isAfter(new Date(transaction.plannedDate), new Date());
        },

        /**
         * Filter overdue pending transactions (plannedDate is in past but not cleared)
         */
        isOverdue: (transaction: Transaction) => {
            if (transaction.status !== 'pending' || !transaction.plannedDate) return false;
            return isBefore(new Date(transaction.plannedDate), new Date());
        },

        /**
         * Filter transactions by category type (expense, income, saving)
         */
        byCategoryType: (type: 'expense' | 'income') => 
            (transaction: Transaction & { category?: { type: string } }) => 
                transaction.category?.type === type,

        /**
         * Filter transactions with variance (planned vs cleared difference)
         */
        hasVariance: (transaction: Transaction) => 
            transaction.status === 'cleared' && 
            transaction.plannedAmount !== undefined && 
            transaction.amount !== undefined,

        /**
         * Filter transactions with positive variance (spent less than planned)
         */
        isUnderBudget: (transaction: Transaction) => {
            if (transaction.status !== 'cleared' || 
                transaction.plannedAmount === undefined || 
                transaction.amount === undefined) {
                return false;
            }
            return transaction.amount < transaction.plannedAmount;
        },

        /**
         * Filter transactions with negative variance (spent more than planned)
         */
        isOverBudget: (transaction: Transaction) => {
            if (transaction.status !== 'cleared' || 
                transaction.plannedAmount === undefined || 
                transaction.amount === undefined) {
                return false;
            }
            return transaction.amount > transaction.plannedAmount;
        },

        /**
         * Filter by account ID
         */
        byAccountId: (accountId: string) => 
            (transaction: Transaction) => transaction.accountId === accountId,

        /**
         * Filter by what tag
         */
        byWhatTag: (whatTag: string) => 
            (transaction: Transaction) => transaction.whatTag === whatTag,

        /**
         * Filter transactions within a date range
         */
        byDateRange: (startDate: Date, endDate: Date) => 
            (transaction: Transaction) => {
                if (!transaction.clearedDate) return false;
                const date = new Date(transaction.clearedDate);
                return isWithinInterval(date, { start: startDate, end: endDate });
            },

        /**
         * Filter transactions above a certain amount
         * Uses amount for cleared transactions, plannedAmount for pending
         */
        aboveAmount: (amount: number) => (transaction: Transaction) => {
            const amountToCompare = transaction.status === 'cleared' 
                ? transaction.amount 
                : transaction.plannedAmount;
            return amountToCompare !== undefined && amountToCompare > amount;
        },

        /**
         * Filter transactions below a certain amount
         * Uses amount for cleared transactions, plannedAmount for pending
         */
        belowAmount: (amount: number) => (transaction: Transaction) => {
            const amountToCompare = transaction.status === 'cleared' 
                ? transaction.amount 
                : transaction.plannedAmount;
            return amountToCompare !== undefined && amountToCompare < amount;
        },

        /**
         * Filter transactions with recurrence
         */
        isRecurring: (transaction: Transaction) => 
            transaction.recurrenceRule !== undefined,

        /**
         * Compose multiple filters
         */
        compose: (...filters: Array<(item: Transaction) => boolean>) => 
            (item: Transaction) => filters.every(filter => filter(item))
    };
}

export const transactionFilters = createTransactionFilters();