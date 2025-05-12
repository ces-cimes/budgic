import { persistentStore } from '$lib/core/persistence.svelte';
import { createTransaction, validateTransactionArray } from '$lib/core/models/types';
import type { Transaction } from '$lib/core/models/types';
import { transactionFilters } from '$lib/utils/filters';
import { accountService } from './account-service';
import { balanceService } from './balance-service';

class TransactionService {
    // Lazy-loaded transaction store
    private _store: ReturnType<typeof persistentStore<Transaction[], 'id'>> | null = null;

    // Initialize store (called lazily)
    private async initStore() {
        if (!this._store) {
            // Get or create a sample account
            let sampleAccount = accountService.accounts[0];
            if (!sampleAccount) {
                sampleAccount = await accountService.createAccount({
                    name: 'Checking',
                    type: 'debit'
                });
            }
            
            this._store = persistentStore<Transaction[], 'id'>(
                'transactions',
                [
                    createTransaction({
                        accountId: sampleAccount.id,
                        type: 'expense',
                        category: 'Initial Setup',
                        plannedAmount: 0
                    })
                ],
                {
                    isCollection: true,
                    idKey: 'id',
                    validate: validateTransactionArray
                }
            );
        }
        return this._store;
    }

    async getAllTransactions() { 
        const store = await this.initStore();
        return store.value;
    }

    // Create a new transaction
    async createTransaction(transactionData: Partial<Transaction> & { accountId: string }) {
        // Verify account exists
        const account = accountService.getAccountById(transactionData.accountId);
        if (!account) {
            throw new Error(`Account with ID ${transactionData.accountId} not found`);
        }

        const store = await this.initStore();
        const newTransaction = createTransaction(transactionData);
        await store.addItem(newTransaction);
        
        // Clear balance cache for this account
        balanceService.clearCache();
        
        return newTransaction;
    }

    // Get transactions by account
    async getTransactionsByAccount(accountId: string = '') {
        const store = await this.initStore();
        return accountId === '' 
            ? store.value 
            : store.findBy(transactionFilters.byAccountId(accountId));
    }

    // Get complete transactions
    async getCompletedTransactions(reverse: boolean = false) {
        const store = await this.initStore();
        return store.findBy(transactionFilters.isCompletedTransaction(reverse));
    }

    // Get future transactions
    async getFutureTransactions() {
        const store = await this.initStore();
        return store.findBy(transactionFilters.isFutureTransaction);
    }

    // Get transactions for current week
    async getCurrentWeekTransactions() {
        const store = await this.initStore();
        return store.findBy(transactionFilters.isInCurrentWeek);
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

    // Get total income or expenses
    async getTotalByType(type: 'income' | 'expense') {
        const store = await this.initStore();
        const filteredTransactions = await store.findBy(transactionFilters.byType(type));
        
        return filteredTransactions.reduce((total, transaction) => {
            return total + (transaction.actualAmount || transaction.plannedAmount || 0);
        }, 0);
    }
}

export const transactionService = new TransactionService();