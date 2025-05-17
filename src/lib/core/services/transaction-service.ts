import { persistentStore } from '$lib/core/persistence.svelte';
import { createTransaction, validateTransactionArray, TransactionSchema } from '$lib/core/models/types';
import type { Transaction, Category } from '$lib/core/models/types';
import { transactionFilters } from '$lib/utils/filters';
import { accountService } from './account-service';
import { categoryService } from './category-service';
import { balanceService } from './balance-service';
import { z } from 'zod';

class TransactionService {
    // Lazy-loaded transaction store
    private _store: ReturnType<typeof persistentStore<Transaction[], 'id'>> | null = null;

    // Initialize store (called lazily)
    private async initStore() {
        if (this._store) return this._store;

        // Test validation before creating store
        const storedValue = localStorage.getItem('transactions');
        if (storedValue) {
            try {
                const parsed = JSON.parse(storedValue);
                if (!validateTransactionArray(parsed)) {
                    console.error('Stored data failed validation:', parsed);
                    // Handle corrupt data (see option 2 below)
                }
            } catch (e) {
                console.error('Failed to parse stored data', e);
            }
        }
        
        // Create the store first before any other operations
        this._store = persistentStore<Transaction[], 'id'>(
            'transactions',
            [], // Start with an empty array, we'll populate it after
            {
                isCollection: true,
                idKey: 'id',
                validate: validateTransactionArray
            }
        );
        
        // If store is empty, populate with sample data
        if (this._store.value.length === 0) {
            await this.populateSampleData();
        }
        
        return this._store;
    }
    
    // Separate method to populate sample data to avoid recursion
    private async populateSampleData() {
        if (!this._store) return;
        
        // Get or create a sample account
        let sampleAccount = accountService.accounts[0];
        if (!sampleAccount) {
            sampleAccount = await accountService.createAccount({
                name: 'Checking',
                type: 'checking'
            });
        }

        let sampleCategory = categoryService.categories;
        if (!sampleCategory) {
            sampleCategory = [
                await categoryService.createCategory({
                    name: 'Groceries',
                    type: 'expense'
                }),
                await categoryService.createCategory({
                    name: 'Work',
                    type: 'income'
                })
            ];
        }
        
        // Create sample transactions
        const sampleTransactions = [
            this.createTransactionObject({
                accountId: sampleAccount.id,
                categoryId: sampleCategory[1].id,
                clearedAmount: 50000,
                type: 'payment',
                status: 'cleared',
                clearedDate: new Date().toISOString(),
                description: 'Test 1'
            }),
            this.createTransactionObject({
                accountId: sampleAccount.id,
                categoryId: sampleCategory[0].id,
                pendingAmount: 1060,
                type: 'payment',
                status: 'cancelled',
                pendingDate: new Date().toISOString(),
                description: 'Test 2'
            }),
            this.createTransactionObject({
                accountId: sampleAccount.id,
                toAccountId: sampleAccount.id,
                categoryId: sampleCategory[0].id,
                pendingAmount: 200,
                type: 'transfer',
                status: 'pending',
                pendingDate: new Date().toISOString(),
                description: 'Test 3'
            }),
            this.createTransactionObject({
                accountId: sampleAccount.id,
                categoryId: sampleCategory[0].id,
                clearedAmount: 35000,
                type: 'adjustment',
                status: 'cleared',
                clearedDate: new Date().toISOString(),
                description: 'Test 4'
            })
        ];
        
        // // Add the sample transactions to the store
        // for (const transaction of sampleTransactions) {
        //     await this._store.addItem(transaction);
        // }
    }
    
    // Helper method to create transaction objects without modifying the store
    private async createTransactionObject(transactionData: Partial<Transaction> & {
        // Common fields
        type: 'payment' | 'transfer' | 'adjustment';
        accountId: string;
        currency?: string;
        description?: string;
        reference?: string;
        
        // Status-specific fields
        status: 'pending' | 'cleared' | 'cancelled';
        pendingAmount?: number;
        pendingDate?: string;
        clearedAmount?: number;
        clearedDate?: string;
        
        // Payment fields
        categoryId?: string;
        
        // Transfer fields
        toAccountId?: string;
        
        // Recurrence
        recurrenceRule?: string;
    }) {
        await this.createNewTransaction(transactionData);
    }

    async getAllTransactions() { 
        const store = await this.initStore();
        return store.value;
    }

    // Create a new transaction
    async createNewTransaction(transactionData: Partial<Transaction> & {
        // Common fields
        type: 'payment' | 'transfer' | 'adjustment';
        accountId: string;
        currency?: string;
        description?: string;
        reference?: string;
        
        // Status-specific fields
        status: 'pending' | 'cleared' | 'cancelled';
        pendingAmount?: number;
        pendingDate?: string;
        clearedAmount?: number;
        clearedDate?: string;
        
        // Payment fields
        categoryId?: string;
        
        // Transfer fields
        toAccountId?: string;
        
        // Recurrence
        recurrenceRule?: string;
    }) {
        // Verify account exists (this can't be in the schema as it needs external service)
        const account = accountService.getAccountById(transactionData.accountId);
        if (!account) {
            throw new Error(`Account with ID ${transactionData.accountId} not found`);
        }
        
        // For transfers, verify destination account exists
        if (transactionData.type === 'transfer' && transactionData.toAccountId) {
            const toAccount = accountService.getAccountById(transactionData.toAccountId);
            if (!toAccount) {
                throw new Error(`Destination account with ID ${transactionData.toAccountId} not found`);
            }
        }
    
        // // Validate against schema (includes all our business rules)
        // const validationResult = TransactionSchema.safeParse(transactionData);
        // if (!validationResult.success) {
        //     // Format the error messages nicely
        //     const errors = validationResult.error.errors.map(err => 
        //         `${err.path.join('.')}: ${err.message}`
        //     );
        //     throw new Error(`Invalid transaction data:\n${errors.join('\n')}`);
        // }
    
        const store = await this.initStore();

        // Create the appropriate transaction based on status and recurrence
        let newTransaction: Transaction = createTransaction(transactionData);

        await store.addItem(newTransaction);
        
        // Clear balance cache for this account
        balanceService.clearCache();
        
        return newTransaction;
    }
    // Update transaction status
    async updateTransactionStatus(id: string, status: Transaction['status']): Promise<void> {
        const store = await this.initStore();
        const transaction = store.value.find(t => t.id === id);
        if (!transaction) throw new Error('Transaction not found');
        
        await store.updateItem(id, { status });
        balanceService.clearCache();
    }

    // Get transactions by account (updated to return Transaction[])
    async getTransactionsByAccount(accountId: string): Promise<Transaction[]> {
        const store = await this.initStore();
        return store.findBy(transactionFilters.byAccountId(accountId));
    }

    // Get transactions by category
    async getTransactionsByCategory(categoryId: string): Promise<Transaction[]> {
        const store = await this.initStore();
        return store.findBy(transactionFilters.byCategoryId(categoryId));
    }

    // Get cleared transactions
    async getClearedTransactions() {
        const store = await this.initStore();
        return store.findBy(transactionFilters.isCleared);
    }

    // Get future transactions
    async getFutureTransactions() {
        const store = await this.initStore();
        return store.findBy(transactionFilters.isUpcoming);
    }

    // Get transactions for current week
    async getCurrentWeekTransactions() {
        const store = await this.initStore();
        return store.findBy(transactionFilters.isInCurrentWeek);
    }

    // Get pending transactions (status = 'pending')
    async getPendingTransactions(): Promise<Transaction[]> {
        const store = await this.initStore();
        return store.findBy(t => t.status === 'pending');
    }

    // Get savings allocations (bucket tracking)
    async getSavingsAllocations(savingsAccountId: string): Promise<{ category: Category; amount: number }[]> {
        const transactions = await this.getTransactionsByAccount(savingsAccountId);
        const categoryMap = new Map<string, number>();

        // Sum amounts by category
        for (const tx of transactions) {
            if (!tx.categoryId) continue;
            
            const currentAmount = categoryMap.get(tx.categoryId) || 0;
            const amount = tx.clearedAmount || tx.pendingAmount || 0;
            categoryMap.set(tx.categoryId, currentAmount + amount);
        }

        // Convert to result format
        const results: { category: Category; amount: number }[] = [];
        for (const [categoryId, amount] of categoryMap) {
            const category = await categoryService.getCategoryById(categoryId);
            if (category) {
                results.push({ category, amount });
            }
        }

        return results;
    }

    // Batch update transactions
    async batchUpdateTransactions(updates: Array<{id: string, data: Partial<Transaction>}>) {
        const store = await this.initStore();
        const result = await store.batchUpdate(updates);
        
        // Clear balance cache for affected accounts
        const transactions = await this.getAllTransactions();
        const affectedAccountIds = updates
            .map(update => transactions.find(t => t.id === update.id)?.accountId)
            .filter(id => id) as string[];
        
        balanceService.clearCache();
        
        return result;
    }

    // Delete a specific transaction
    async deleteTransaction(transactionId: string) {
        const store = await this.initStore();
        const transaction = store.value.find(t => t.id === transactionId);
        
        await store.removeItem(transactionId);
        
        if (transaction) {
            balanceService.clearCache();
        }
    }

    // Delete all transactions for a specific account
    async deleteTransactionsByAccount(accountId: string) {
        const store = await this.initStore();
        const transactions = await this.getTransactionsByAccount(accountId);
        const transactionIds = transactions.map(t => t.id);
        await store.batchRemove(transactionIds);
        
        balanceService.clearCache();
    }

    // Get total income, expenses or savings
    async getTotalByType(type: 'income' | 'expense') {
        const store = await this.initStore();
        const filteredTransactions = await store.findBy(transactionFilters.byCategoryType(type));
        
        return filteredTransactions.reduce((total, transaction) => {
            return total + (transaction.clearedAmount || transaction.pendingAmount || 0);
        }, 0);
    }
}

export const transactionService = new TransactionService();