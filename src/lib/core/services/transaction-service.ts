import { db, validateTransactionGroup, validateNewGroupTransaction, generateUUID } from '$lib/core/db';
import type { Transaction } from '$lib/core/db';
import { accountService } from './account-service';

class TransactionService {
    public get ready() {
        return db.isOpen();
    }

    public isLoading() {
        return !this.ready;
    }

    // ============================================================================
    // TRANSACTION MANAGEMENT
    // ============================================================================

    /**
     * Create a new transaction
     */
    async createTransaction(data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<Transaction> {
        const transaction: Transaction = {
            id: generateUUID(),
            ...data,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };

        await db.transactions.add(transaction);
        
        // Update account balance
        await accountService.recalculateAccountBalance(transaction.accountId);
        
        return transaction;
    }

    /**
     * Get transaction by ID
     */
    async getTransaction(id: string): Promise<Transaction | null> {
        return await db.transactions.get(id) || null;
    }

    /**
     * Update transaction
     */
    async updateTransaction(id: string, updates: Partial<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>): Promise<Transaction> {
        const transaction = await db.transactions.get(id);
        if (!transaction) {
            throw new Error(`Transaction ${id} not found`);
        }

        const updatedTransaction = {
            ...transaction,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        await db.transactions.update(id, updatedTransaction);
        
        // Update account balance
        await accountService.recalculateAccountBalance(transaction.accountId);
        
        return updatedTransaction;
    }

    /**
     * Delete transaction (soft delete)
     */
    async deleteTransaction(id: string): Promise<void> {
        const transaction = await db.transactions.get(id);
        if (!transaction) {
            throw new Error(`Transaction ${id} not found`);
        }

        await db.softDeleteTransaction(id);
        
        // Update account balance
        await accountService.recalculateAccountBalance(transaction.accountId);
    }

    /**
     * Get all transactions
     */
    async getAllTransactions(): Promise<Transaction[]> {
        return await db.transactions.toArray();
    }

    /**
     * Get transactions by account
     */
    async getTransactionsByAccount(accountId: string): Promise<Transaction[]> {
        return await db.transactions.where('accountId').equals(accountId).toArray();
    }

    /**
     * Get transactions by category
     */
    async getTransactionsByCategory(categoryId: string): Promise<Transaction[]> {
        return await db.transactions.where('categoryId').equals(categoryId).toArray();
    }

    /**
     * Get transactions by date range
     */
    async getTransactionsByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
        return await db.transactions
            .where('clearedDate')
            .between(startDate, endDate)
            .toArray();
    }

    /**
     * Get transactions by status
     */
    async getTransactionsByStatus(status: Transaction['status']): Promise<Transaction[]> {
        return await db.transactions.where('status').equals(status).toArray();
    }

    // ============================================================================
    // TRANSACTION GROUP MANAGEMENT (formerly split transactions)
    // ============================================================================

    /**
     * Create a new transaction group
     */
    async createTransactionGroup(
        groupTransactions: Array<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
        groupName?: string
    ): Promise<string> {
        if (groupTransactions.length === 0) {
            throw new Error('At least one transaction is required');
        }

        // Validate the group transactions
        const validation = validateNewGroupTransaction(groupTransactions);
        if (!validation.isValid) {
            throw new Error(`Invalid transaction group: ${validation.errors.join(', ')}`);
        }

        const groupId = await db.createTransactionGroup(groupTransactions, groupName);
        
        // Update account balances for affected accounts
        const accountIds = new Set(groupTransactions.map(tx => tx.accountId));
        for (const accountId of accountIds) {
            await accountService.recalculateAccountBalance(accountId);
        }
        
        return groupId;
    }

    /**
     * Update a transaction group
     */
    async updateTransactionGroup(
        groupId: string,
        updates: {
            sharedFields?: Partial<Pick<Transaction, 
                'type' | 'status' | 'currency' | 'categoryId' | 'plannedDate' | 'clearedDate' | 'recurrenceRule' | 'parentRecurrenceId' |
                'reference' | 'notes' | 'importSource' | 'toAccountId' | 'groupName'
            >>;
            individualUpdates?: Array<{
                id: string;
                amount?: number;
                description?: string;
                accountId?: string;
            }>;
        }
    ): Promise<void> {
        await db.updateTransactionGroup(groupId, updates);
        
        // Update account balances for affected accounts
        const accountIds = new Set<string>();
        
        if (updates.individualUpdates) {
            for (const update of updates.individualUpdates) {
                if (update.accountId) {
                    accountIds.add(update.accountId);
                }
            }
        }
        
            for (const accountId of accountIds) {
            await accountService.recalculateAccountBalance(accountId);
        }
    }

    /**
     * Delete a transaction group
     */
    async deleteTransactionGroup(groupId: string): Promise<void> {
        const transactions = await db.getGroupTransactions(groupId);
        const accountIds = new Set(transactions.map(tx => tx.accountId));
        
        await db.deleteTransactionGroup(groupId);
        
        // Update account balances for affected accounts
            for (const accountId of accountIds) {
            await accountService.recalculateAccountBalance(accountId);
        }
    }

    /**
     * Get transactions in a group
     */
    async getGroupTransactions(groupId: string): Promise<Transaction[]> {
        return await db.getGroupTransactions(groupId);
    }

    /**
     * Add transaction to group
     */
    async addTransactionToGroup(transactionId: string, groupId: string): Promise<void> {
        await db.addTransactionToGroup(transactionId, groupId);
        
        const transaction = await db.transactions.get(transactionId);
        if (transaction) {
            await accountService.recalculateAccountBalance(transaction.accountId);
        }
    }

    /**
     * Remove transaction from group
     */
    async removeTransactionFromGroup(transactionId: string): Promise<void> {
        const transaction = await db.transactions.get(transactionId);
        if (transaction) {
            await db.removeTransactionFromGroup(transactionId);
            await accountService.recalculateAccountBalance(transaction.accountId);
        }
    }

    // ============================================================================
    // TRANSFER MANAGEMENT
    // ============================================================================

    /**
     * Create a transfer between accounts
     */
    async createTransfer(data: {
        fromAccountId: string;
        toAccountId: string;
        amount: number;
        currency: string;
        description?: string;
        categoryId?: string;
        feeAmount?: number;
        feeCategoryId?: string;
    }): Promise<{ fromTransaction: Transaction; toTransaction: Transaction }> {
        const transferId = generateUUID();
        
        // Create from transaction (negative amount)
        const fromTransaction = await this.createTransaction({
            type: 'transfer',
            status: 'cleared',
            accountId: data.fromAccountId,
            amount: -data.amount,
            currency: data.currency,
            description: data.description || `Transfer to ${data.toAccountId}`,
            categoryId: data.categoryId,
            groupId: transferId,
            groupName: 'Transfer',
            transferDetails: {
                toAccountId: data.toAccountId,
                transferAmount: data.amount,
                feeAmount: data.feeAmount || 0,
                feeCategoryId: data.feeCategoryId
            },
            clearedDate: new Date().toISOString()
        });

        // Create to transaction (positive amount)
        const toTransaction = await this.createTransaction({
            type: 'transfer',
            status: 'cleared',
            accountId: data.toAccountId,
            amount: data.amount,
            currency: data.currency,
            description: data.description || `Transfer from ${data.fromAccountId}`,
            categoryId: data.categoryId,
            groupId: transferId,
            groupName: 'Transfer',
            transferDetails: {
                toAccountId: data.fromAccountId,
                transferAmount: data.amount,
                feeAmount: data.feeAmount || 0,
                feeCategoryId: data.feeCategoryId
            },
            clearedDate: new Date().toISOString()
        });

        return { fromTransaction, toTransaction };
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Get transaction statistics
     */
    async getTransactionStatistics(): Promise<{
        totalTransactions: number;
        totalIncome: number;
        totalExpenses: number;
        totalTransfers: number;
        averageTransactionAmount: number;
    }> {
        const transactions = await db.transactions.toArray();
        
        const stats = {
            totalTransactions: transactions.length,
            totalIncome: 0,
            totalExpenses: 0,
            totalTransfers: 0,
            averageTransactionAmount: 0
        };

        let totalAmount = 0;

        transactions.forEach((transaction: Transaction) => {
            const amount = transaction.amount || 0;
            totalAmount += Math.abs(amount);

            switch (transaction.type) {
                case 'income':
                    stats.totalIncome += amount;
                    break;
                case 'expense':
                    stats.totalExpenses += Math.abs(amount);
                    break;
                case 'transfer':
                    stats.totalTransfers += Math.abs(amount);
                    break;
            }
        });

        stats.averageTransactionAmount = stats.totalTransactions > 0 ? totalAmount / stats.totalTransactions : 0;

        return stats;
    }

    /**
     * Get transactions by type
     */
    async getTransactionsByType(type: Transaction['type']): Promise<Transaction[]> {
        return await db.transactions.where('type').equals(type).toArray();
    }

    /**
     * Search transactions
     */
    async searchTransactions(query: string): Promise<Transaction[]> {
        const transactions = await db.transactions.toArray();
        const lowerQuery = query.toLowerCase();
        
        return transactions.filter((transaction: Transaction) => 
            transaction.description?.toLowerCase().includes(lowerQuery) ||
            transaction.reference?.toLowerCase().includes(lowerQuery) ||
            transaction.notes?.toLowerCase().includes(lowerQuery)
        );
    }
}

export const transactionService = new TransactionService();