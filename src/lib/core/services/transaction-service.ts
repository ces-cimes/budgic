import { db, validateSplitTransaction, validateNewSplitTransaction, generateUUID } from '$lib/core/db';
import type { Transaction, WhatTagType, WhyTagType } from '$lib/core/db';
import { transactionFilters } from '$lib/utils/filters';
import { groupTransactions, normalizeGroupFields } from '$lib/utils/transaction-utils';
import { accountService } from './account-service';
import { tagService } from './tag-service';
import { currencyService } from './currency-service';
import { validationService } from './validation-service';
import { userActionsService, PrivacyUtils } from './user-actions-service';
import { insightsService } from './insights-service';
import { analyticsCoreService } from './analytics-core-service';
import { budgetService } from './budget-service';

// Import the type from transaction-utils
import type { TransactionOrGroup } from '$lib/utils/transaction-utils';

// Re-export for convenience
export type { TransactionOrGroup };
import { dateUtils } from '$lib/utils/date-utils';
import { validateAmount, isValidCurrencyCode, getCurrencyInfo } from '$lib/utils/currency-utils';

class TransactionService {
    public get ready() {
        return db.isOpen();
    }

    public isLoading() {
        return !this.ready;
    }



    // ============================================================================
    // SPLIT TRANSACTION MANAGEMENT
    // ============================================================================

    /**
     * Create a new split transaction group
     */
    async createSplitTransactionGroup(
        splitTransactions: Array<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
        splitName?: string
    ): Promise<string> {
        // Enhanced validation
        if (splitTransactions.length === 0) {
            throw new Error('At least one split transaction is required');
        }

        // Validate the split transactions for creation
        const validation = validationService.validateSplitTransactionCreation(splitTransactions);
        if (!validation.isValid) {
            throw new Error(`Invalid split transaction group: ${validation.errors.join(', ')}`);
        }

        // Enhanced split sum validation
        const splitSumValidation = validationService.validateSplitSum(splitTransactions as Transaction[]);
        if (!splitSumValidation.isValid) {
            throw new Error(`Split sum validation failed: ${splitSumValidation.errors.join(', ')}`);
        }

        const splitId = await db.createSplitTransactionGroup(splitTransactions, splitName);
        
        // Invalidate balance cache for affected accounts
        const accountIds = new Set(splitTransactions.map(tx => tx.accountId));
        for (const accountId of accountIds) {
            accountService.clearBalanceCache(accountId);
        }
        
        return splitId;
    }

    /**
     * Update a split transaction group
     */
    async updateSplitTransactionGroup(
        splitId: string,
        updates: {
            sharedFields?: Partial<Pick<Transaction, 
                'type' | 'status' | 'currency' | 'whatTag' | 'budgetCategoryId' | 'plannedDate' | 'clearedDate' | 'recurrenceRule' | 'parentRecurrenceId' |
                'reference' | 'notes' | 'importSource' | 'toAccountId' | 'splitName'
            >>;
            individualUpdates?: Array<{
                id: string;
                amount?: number;
                description?: string;
                accountId?: string;
            }>;
        }
    ): Promise<void> {
        await db.updateSplitTransactionGroup(splitId, updates);
        
        // Invalidate balance cache for affected accounts
        const accountIds = new Set<string>();
        
        // Add accounts from individual updates
        if (updates.individualUpdates) {
            for (const update of updates.individualUpdates) {
                if (update.accountId) {
                    accountIds.add(update.accountId);
                }
            }
        }
        
        // If we can't determine specific accounts, clear all cache
        if (accountIds.size === 0) {
            accountService.clearBalanceCache();
        } else {
            for (const accountId of accountIds) {
                accountService.clearBalanceCache(accountId);
            }
        }
    }

    /**
     * Delete an entire split transaction group
     */
    async deleteSplitTransactionGroup(splitId: string): Promise<void> {
        // Get the split transactions to determine affected accounts
        const splitTransactions = await this.getTransactionsBySplit(splitId, true) as Transaction[];
        const accountIds = new Set<string>();
        
        // Collect all affected accounts
        for (const tx of splitTransactions) {
            accountIds.add(tx.accountId);
            // For transfers, also invalidate destination account cache
            if (tx.type === 'transfer' && tx.toAccountId) {
                accountIds.add(tx.toAccountId);
            }
        }
        
        try {
            await db.deleteSplitTransactionGroup(splitId);
            
            // Invalidate balance cache for all affected accounts
            for (const accountId of accountIds) {
                accountService.clearBalanceCache(accountId);
            }
        } catch (error) {
            // If deletion fails, still clear cache to ensure consistency
            for (const accountId of accountIds) {
                accountService.clearBalanceCache(accountId);
            }
            throw error;
        }
    }

    /**
     * Get split statistics
     */
    async getSplitStatistics(splitId: string) {
        return await db.getSplitStatistics(splitId);
    }

    /**
     * Add a transaction to an existing split
     */
    async addTransactionToSplit(
        transactionId: string,
        splitId: string,
        splitName?: string
    ): Promise<void> {
        // Get the transaction to determine affected accounts
        const transaction = await db.transactions.get(transactionId);
        
        await db.addTransactionToSplit(transactionId, splitId, splitName);
        
        // Invalidate balance cache for affected accounts
        if (transaction) {
            accountService.clearBalanceCache(transaction.accountId);
            // For transfers, also invalidate destination account cache
            if (transaction.type === 'transfer' && transaction.toAccountId) {
                accountService.clearBalanceCache(transaction.toAccountId);
            }
        }
    }

    /**
     * Remove a transaction from a split (ungroup it)
     */
    async removeTransactionFromSplit(transactionId: string): Promise<void> {
        // Get the transaction to determine affected account
        const transaction = await db.transactions.get(transactionId);
        
        await db.removeTransactionFromSplit(transactionId);
        
        // Invalidate balance cache for affected account
        if (transaction) {
            accountService.clearBalanceCache(transaction.accountId);
        }
    }

    // ============================================================================
    // LEGACY METHODS (for backward compatibility)
    // ============================================================================

    /**
     * @deprecated Use createSplitTransactionGroup instead
     */
    async createTransactionGroup(
        transactions: Array<{ id: string; splitName?: string }>,
        splitName?: string
    ): Promise<string> {
        const splitId = generateUUID();
        const finalSplitName = splitName || 'Split Transaction';
        
        // Get the actual transactions to normalize their fields
        const actualTransactions: Transaction[] = [];
        for (const transaction of transactions) {
            const tx = await db.transactions.get(transaction.id);
            if (tx) {
                actualTransactions.push(tx);
            }
        }
        
        // Normalize the fields for the group
        const normalizedTransactions = normalizeGroupFields(actualTransactions, finalSplitName);
        
        await db.transaction('rw', [db.transactions], async () => {
            for (let i = 0; i < transactions.length; i++) {
                const transaction = transactions[i];
                const normalized = normalizedTransactions[i];
                
                await db.transactions.update(transaction.id, {
                    splitId,
                    splitName: transaction.splitName || finalSplitName,
                    clearedDate: normalized.clearedDate,
                    plannedDate: normalized.plannedDate,
                    accountId: normalized.accountId,
                    updatedAt: new Date().toISOString()
                });
            }
        });
        
        // Invalidate balance cache for affected accounts
        const accountIds = new Set<string>();
        for (const transaction of transactions) {
            const tx = await db.transactions.get(transaction.id);
            if (tx?.accountId) {
                accountIds.add(tx.accountId);
            }
        }
        
        for (const accountId of accountIds) {
            accountService.clearBalanceCache(accountId);
        }
        
        return splitId;
    }

    /**
     * @deprecated Use removeTransactionFromSplit instead
     */
    async ungroupTransactions(transactionIds: string[]): Promise<void> {
        await db.transaction('rw', [db.transactions], async () => {
            for (const transactionId of transactionIds) {
                await db.transactions.update(transactionId, {
                    splitId: undefined,
                    splitName: undefined,
                    updatedAt: new Date().toISOString()
                });
            }
        });
        
        // Invalidate balance cache for affected accounts
        for (const transactionId of transactionIds) {
            const tx = await db.transactions.get(transactionId);
            if (tx?.accountId) {
                accountService.clearBalanceCache(tx.accountId);
            }
        }
    }

    async getTransactions(separateSplits: boolean = false): Promise<TransactionOrGroup[] | Transaction[]> {
        const transactions = await db.getActiveTransactions();
        
        if (separateSplits) {
            return transactions;
        }
        
        return groupTransactions(transactions);
    }

    getTransactionsSync(): Transaction[] {
        // Note: This is now async-only with Dexie, but keeping for compatibility
        // You may want to update callers to use the async version
        throw new Error('getTransactionsSync is not supported with Dexie. Use getTransactions() instead.');
    }

    async createNewTransaction(transactionData: Partial<Transaction> & {
        accountId: string;
        whatTag?: WhatTagType;
        budgetCategoryId?: string; // Unified budget system - replaces whyTag
        payeeId?: string;
        amount: number;
        type: 'income' | 'expense' | 'transfer' | 'adjustment';
        status: 'planned' | 'pending' | 'cleared' | 'cancelled';
        currency?: string;
    }): Promise<Transaction> {
        // Validate transaction data before creation
        const validation = await validationService.validateTransactionCreation(transactionData);
        if (!validation.isValid) {
            throw new Error(`Invalid transaction data: ${validation.errors.join(', ')}`);
        }

        const currency = transactionData.currency || 'USD';

        const newTransaction: Transaction = {
            id: generateUUID(),
            type: transactionData.type,
            status: transactionData.status,
            confidence: transactionData.confidence,
            accountId: transactionData.accountId,
            amount: transactionData.amount,
            currency,
            whatTag: transactionData.whatTag,
            budgetCategoryId: transactionData.budgetCategoryId,
            payeeId: transactionData.payeeId,
            description: transactionData.description,
            plannedDate: transactionData.plannedDate,
            plannedAmount: transactionData.plannedAmount,
            clearedDate: transactionData.clearedDate,
            bankTransactionId: transactionData.bankTransactionId,
            splitId: transactionData.splitId,
            splitName: transactionData.splitName,
            toAccountId: transactionData.toAccountId,
            recurrenceRule: transactionData.recurrenceRule,
            parentRecurrenceId: transactionData.parentRecurrenceId,
            reference: transactionData.reference,
            notes: transactionData.notes,
            importSource: transactionData.importSource,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };
        
        await db.transactions.add(newTransaction);
        
        // Invalidate balance cache for the account
        accountService.clearBalanceCache(transactionData.accountId);
        
        // Track budget spending for expenses (unified budget system)
        if (transactionData.type === 'expense' && transactionData.budgetCategoryId) {
            try {
                await budgetService.trackTransactionSpending(newTransaction);
            } catch (error) {
                console.warn('Failed to track budget spending:', error);
                // Don't fail transaction creation if budget tracking fails
            }
        }
        
        // Process income through waterfall system
        if (transactionData.type === 'income') {
            try {
                await budgetService.processIncome(transactionData.amount);
            } catch (error) {
                console.warn('Failed to process income through waterfall system:', error);
                // Don't fail transaction creation if income processing fails
            }
        }
        
        // Track user action if tracking is enabled - now uses unified insights service
        try {
            // Use unified insights service for anomaly detection
            		const anomalies = await insightsService.detectAnomalies();
            const recentAnomalies = anomalies.filter(a => 
                new Date(a.date).getTime() > Date.now() - 24 * 60 * 60 * 1000
            );
            
            if (recentAnomalies.length > 0) {
                console.log('Recent anomalies detected:', recentAnomalies);
            }
            
            // Use analytics core service for spending analysis
            const analysis = await analyticsCoreService.analyzeTransactions(
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                new Date().toISOString()
            );
            
            // Check if this transaction is unusual based on analytics
            const avgTransactionAmount = analysis.totalSpending / Math.max(analysis.transactionCount, 1);
            if (Math.abs(newTransaction.amount) > avgTransactionAmount * 2) {
                console.log('Unusual transaction amount detected:', newTransaction.amount);
            }
            
        } catch (error) {
            // Don't fail transaction creation if analytics fail
            console.warn('Failed to analyze transaction:', error);
        }
        
        return newTransaction;
    }

    async updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
        // Validate transaction data before update
        const validation = await validationService.validateTransactionUpdate(id, updates);
        if (!validation.isValid) {
            throw new Error(`Invalid transaction update: ${validation.errors.join(', ')}`);
        }

        // Get the original transaction to determine affected accounts
        const originalTransaction = await db.transactions.get(id);
        if (!originalTransaction) {
            throw new Error(`Transaction ${id} not found`);
        }

        await db.transactions.update(id, {
            ...updates,
            updatedAt: new Date().toISOString()
        });

        // Invalidate balance cache for affected accounts
        const accountIds = new Set<string>();
        accountIds.add(originalTransaction.accountId);
        
        // If account is being changed, also invalidate the new account
        if (updates.accountId && updates.accountId !== originalTransaction.accountId) {
            accountService.clearBalanceCache(updates.accountId);
        }
        
        // For transfers, also invalidate destination account cache
        if (originalTransaction.type === 'transfer' && originalTransaction.toAccountId) {
            accountIds.add(originalTransaction.toAccountId);
        }
        if (updates.toAccountId && updates.toAccountId !== originalTransaction.toAccountId) {
            accountService.clearBalanceCache(updates.toAccountId);
        }

        // Clear cache for all affected accounts
        for (const accountId of accountIds) {
            accountService.clearBalanceCache(accountId);
        }
    }

    async deleteTransaction(id: string): Promise<void> {
        // Get the transaction to determine affected accounts
        const transaction = await db.transactions.get(id);
        if (!transaction) {
            throw new Error(`Transaction ${id} not found`);
        }

        await db.softDeleteTransaction(id);

        // Invalidate balance cache for affected accounts
        accountService.clearBalanceCache(transaction.accountId);
        // For transfers, also invalidate destination account cache
        if (transaction.type === 'transfer' && transaction.toAccountId) {
            accountService.clearBalanceCache(transaction.toAccountId);
        }
    }

    async batchUpdateTransactions(updates: Array<{ id: string; updates: Partial<Transaction> }>): Promise<void> {
        // Validate all updates first
        for (const { id, updates: updateData } of updates) {
            const validation = await validationService.validateTransactionUpdate(id, updateData);
            if (!validation.isValid) {
                throw new Error(`Invalid transaction update for ${id}: ${validation.errors.join(', ')}`);
            }
        }

        // Get all original transactions to determine affected accounts
        const originalTransactions = await Promise.all(
            updates.map(async ({ id }) => await db.transactions.get(id))
        );

        const accountIds = new Set<string>();
        
        // Collect all affected accounts
        for (const transaction of originalTransactions) {
            if (transaction) {
                accountIds.add(transaction.accountId);
                // For transfers, also invalidate destination account cache
                if (transaction.type === 'transfer' && transaction.toAccountId) {
                    accountIds.add(transaction.toAccountId);
                }
            }
        }

        // Add accounts from updates
        for (const { updates: updateData } of updates) {
            if (updateData.accountId) {
                accountIds.add(updateData.accountId);
            }
            if (updateData.toAccountId) {
                accountIds.add(updateData.toAccountId);
            }
        }

        // Perform all updates
        await db.transaction('rw', [db.transactions], async () => {
            for (const { id, updates: updateData } of updates) {
                await db.transactions.update(id, {
                    ...updateData,
                    updatedAt: new Date().toISOString()
                });
            }
        });

        // Clear cache for all affected accounts
        for (const accountId of accountIds) {
            accountService.clearBalanceCache(accountId);
        }
    }

    // ============================================================================
    // TRANSACTION QUERY METHODS
    // ============================================================================

    async getTransactionsBySplit(splitId: string, separateSplits: boolean = false): Promise<Transaction[] | TransactionOrGroup[]> {
        const splitTransactions = await db.getSplitTransactions(splitId);
        
        if (separateSplits) {
            return splitTransactions;
        }
        
        return groupTransactions(splitTransactions);
    }

    async getTransactionsByAccount(accountId: string, separateSplits: boolean = false): Promise<Transaction[] | TransactionOrGroup[]> {
        const transactions = await db.getTransactionsByAccount(accountId);
        
        if (separateSplits) {
            return transactions;
        }
        
        return groupTransactions(transactions);
    }

    async getTransactionsRelatedToAccount(accountId: string): Promise<Transaction[]> {
        // Get all active transactions and filter for those related to the account
        const allTransactions = await db.getActiveTransactions();
        
        // Filter for transactions where account is either source (accountId) or destination (toAccountId)
        const relatedTransactions = allTransactions.filter(transaction => 
            transaction.accountId === accountId || transaction.toAccountId === accountId
        );
        
        // Sort by date (most recent first)
        return relatedTransactions.sort((a, b) => {
            const dateA = a.clearedDate || a.plannedDate || a.createdAt;
            const dateB = b.clearedDate || b.plannedDate || b.createdAt;
            return new Date(dateB).getTime() - new Date(dateA).getTime();
        });
    }

    async getTransactionsByDateRange(startDate: string, endDate: string, separateSplits: boolean = false): Promise<Transaction[] | TransactionOrGroup[]> {
        const transactions = await db.getTransactionsByDateRange(startDate, endDate);
        
        if (separateSplits) {
            return transactions;
        }
        
        return groupTransactions(transactions);
    }

    async getTransactionsByWhatTag(whatTag: WhatTagType, separateSplits: boolean = false): Promise<Transaction[] | TransactionOrGroup[]> {
        const transactions = await db.getTransactionsByWhatTag(whatTag);
        
        if (separateSplits) {
            return transactions;
        }
        
        return groupTransactions(transactions);
    }

    async getTransactionsByBudgetCategory(budgetCategoryId: string, separateSplits: boolean = false): Promise<Transaction[] | TransactionOrGroup[]> {
        const transactions = await db.getTransactionsByBudgetCategory(budgetCategoryId);
        
        if (separateSplits) {
            return transactions;
        }
        
        return groupTransactions(transactions);
    }

    async getTransactionsByPayee(payeeId: string, separateSplits: boolean = false): Promise<Transaction[] | TransactionOrGroup[]> {
        const transactions = await db.getTransactionsByPayee(payeeId);
        
        if (separateSplits) {
            return transactions;
        }
        
        return groupTransactions(transactions);
    }

    async getTransactionsByStatus(status: Transaction['status'], separateSplits: boolean = false): Promise<Transaction[] | TransactionOrGroup[]> {
        const transactions = await db.getTransactionsByStatus(status);
        
        if (separateSplits) {
            return transactions;
        }
        
        return groupTransactions(transactions);
    }

    async getPlannedTransactions(separateSplits: boolean = false): Promise<Transaction[] | TransactionOrGroup[]> {
        return await this.getTransactionsByStatus('planned', separateSplits);
    }

    async getClearedTransactions(separateSplits: boolean = false): Promise<Transaction[] | TransactionOrGroup[]> {
        return await this.getTransactionsByStatus('cleared', separateSplits);
    }

    async getPendingTransactions(separateSplits: boolean = false): Promise<Transaction[] | TransactionOrGroup[]> {
        return await this.getTransactionsByStatus('pending', separateSplits);
    }

    async getCancelledTransactions(separateSplits: boolean = false): Promise<Transaction[] | TransactionOrGroup[]> {
        return await this.getTransactionsByStatus('cancelled', separateSplits);
    }

    // ============================================================================
    // TRANSACTION ANALYSIS METHODS
    // ============================================================================

    async getTransactionById(id: string): Promise<Transaction | null> {
        const transaction = await db.transactions.get(id);
        return transaction || null;
    }

    async getTransactionStats(): Promise<{
        total: number;
        byType: Record<Transaction['type'], number>;
        byStatus: Record<Transaction['status'], number>;
        totalAmount: number;
        averageAmount: number;
    }> {
        const transactions = await db.getActiveTransactions();
        
        const stats = {
            total: transactions.length,
            byType: {
                income: 0,
                expense: 0,
                transfer: 0,
                adjustment: 0
            },
            byStatus: {
                planned: 0,
                pending: 0,
                cleared: 0,
                cancelled: 0
            },
            totalAmount: 0,
            averageAmount: 0
        };

        for (const tx of transactions) {
            stats.byType[tx.type]++;
            stats.byStatus[tx.status]++;
            stats.totalAmount += tx.amount;
        }

        stats.averageAmount = stats.total > 0 ? stats.totalAmount / stats.total : 0;

        return stats;
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    async searchTransactions(query: string, separateSplits: boolean = false): Promise<Transaction[] | TransactionOrGroup[]> {
        const transactions = await db.getActiveTransactions();
        
        const filtered = transactions.filter(tx => 
            tx.description?.toLowerCase().includes(query.toLowerCase()) ||
            tx.whatTag?.toLowerCase().includes(query.toLowerCase()) ||
            tx.budgetCategoryId?.toLowerCase().includes(query.toLowerCase()) ||
            tx.notes?.toLowerCase().includes(query.toLowerCase()) ||
            tx.reference?.toLowerCase().includes(query.toLowerCase()) ||
            Math.abs(tx.amount).toString().includes(query)
        );
        
        if (separateSplits) {
            return filtered;
        }
        
        return groupTransactions(filtered);
    }

    async getRecentTransactions(limit: number = 10, separateSplits: boolean = false): Promise<Transaction[] | TransactionOrGroup[]> {
        const transactions = await db.getActiveTransactions();
        
        // Sort by date (most recent first)
        const sorted = transactions.sort((a, b) => {
            const dateA = new Date(a.clearedDate || a.plannedDate || a.createdAt);
            const dateB = new Date(b.clearedDate || b.plannedDate || b.createdAt);
            return dateB.getTime() - dateA.getTime();
        });
        
        const recent = sorted.slice(0, limit);
        
        if (separateSplits) {
            return recent;
        }
        
        return groupTransactions(recent);
    }
}

// Export singleton instance
export const transactionService = new TransactionService();