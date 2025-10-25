import type { Transaction } from '$lib/core/db';

export type TransactionOrGroup = {
    type: 'single' | 'group';
    id: string;
    transactions: Transaction[];
    // For single transactions, this is the transaction itself
    // For groups, this is the representative transaction (first one)
    representative: Transaction;
    // Total amount for the group
    totalAmount: number;
    // Common fields across all transactions in the group
    commonFields: {
        accountId: string;
        clearedDate?: string;
        plannedDate?: string;
        groupName?: string;
        groupId?: string;
    };
};

/**
 * Groups transactions by groupId, returning a mixed list of single transactions and groups
 */
export function groupTransactions(transactions: Transaction[]): TransactionOrGroup[] {
    const groups = new Map<string, Transaction[]>();
    const singles: Transaction[] = [];

    // Separate transactions into groups and singles
    for (const transaction of transactions) {
        if (transaction.groupId) {
            if (!groups.has(transaction.groupId)) {
                groups.set(transaction.groupId, []);
            }
            groups.get(transaction.groupId)!.push(transaction);
        } else {
            singles.push(transaction);
        }
    }

    const result: TransactionOrGroup[] = [];

    // Add single transactions
    for (const transaction of singles) {
        result.push({
            type: 'single',
            id: transaction.id,
            transactions: [transaction],
            representative: transaction,
            totalAmount: Math.abs(transaction.amount),
            commonFields: {
                accountId: transaction.accountId,
                clearedDate: transaction.clearedDate,
                plannedDate: transaction.plannedDate
            }
        });
    }

    // Add transaction groups
    for (const [groupId, groupTransactions] of groups) {
        if (groupTransactions.length === 0) continue;

        // Sort by amount descending to make the largest transaction the representative
        const sorted = [...groupTransactions].sort((a, b) => Math.abs(b.amount || 0) - Math.abs(a.amount || 0));
        const representative = sorted[0];

        // Calculate total amount (sum of actual amounts, not absolute values)
        const totalAmount = groupTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

        // Get common fields (all transactions in a group should have the same values)
        const commonFields = {
            accountId: representative.accountId,
            clearedDate: representative.clearedDate,
            plannedDate: representative.plannedDate,
            groupName: representative.groupName,
            groupId: representative.groupId
        };

        result.push({
            type: 'group',
            id: groupId,
            transactions: sorted,
            representative,
            totalAmount,
            commonFields
        });
    }

    return result;
}

/**
 * Normalize fields for a group of transactions to ensure consistency
 * This ensures all transactions in a group share the same metadata
 */
export function normalizeGroupFields(transactions: Transaction[], groupName?: string): Transaction[] {
    if (transactions.length === 0) return transactions;

    // Find the most common date (or the earliest if all different)
    const dates = transactions.map(t => t.clearedDate || t.plannedDate).filter(Boolean);
    const normalizedDate = dates.length > 0 ? dates[0] : undefined;

    // Find the most common account (should be the same for all)
    const accountId = transactions[0].accountId;

    // Normalize all transactions in the group
    return transactions.map(transaction => ({
        ...transaction,
        clearedDate: normalizedDate,
        plannedDate: normalizedDate,
        groupName: groupName || transaction.groupName || 'Transaction Group',
        accountId // Ensure all transactions have the same account
    }));
}

/**
 * Calculate total amount for a group of transactions
 */
export function calculateTotalAmount(transactions: Transaction[]): number {
    return transactions.reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
}

/**
 * Check if transaction is a group transaction
 */
export function isGroupTransaction(transaction: Transaction): boolean {
    return Boolean(transaction.groupId);
}

/**
 * Check if transaction is an income transaction
 */
export function isIncomeTransaction(transaction: Transaction): boolean {
    return (transaction.amount || 0) > 0;
}

/**
 * Check if transaction is an expense transaction
 */
export function isExpenseTransaction(transaction: Transaction): boolean {
    return (transaction.amount || 0) < 0;
}

/**
 * Get transaction type based on amount
 */
export function getTransactionType(transaction: Transaction): 'income' | 'expense' | 'transfer' | 'adjustment' {
    if (transaction.type) return transaction.type;
    return (transaction.amount || 0) > 0 ? 'income' : 'expense';
}

/**
 * Check if transaction is overdue (planned date is in the past)
 */
export function isTransactionOverdue(transaction: Transaction): boolean {
    if (!transaction.plannedDate || transaction.status === 'cleared') return false;
    return new Date(transaction.plannedDate) < new Date();
}

/**
 * Check if transaction is in the future
 */
export function isTransactionInFuture(transaction: Transaction): boolean {
    if (!transaction.plannedDate) return false;
    return new Date(transaction.plannedDate) > new Date();
}

/**
 * Get transaction confidence level
 */
export function getTransactionConfidence(transaction: Transaction): 'confirmed' | 'likely' | 'maybe' {
    if (transaction.confidence === 'confirmed') return 'confirmed';
    if (transaction.confidence === 'expected' || transaction.amount > 0) return 'likely';
    return 'maybe';
} 