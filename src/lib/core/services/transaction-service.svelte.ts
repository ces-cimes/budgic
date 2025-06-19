import { persistentStore, type CollectionStore } from '$lib/core/persistence.svelte';
import { createTransaction, validateTransaction } from '$lib/core/models/types';
import type { Transaction, Category } from '$lib/core/models/types';
import { transactionFilters } from '$lib/utils/filters';
import { accountService } from './account-service';
import { categoryService } from './category-service';
import { balanceService } from './balance-service';
import { tick } from 'svelte';

class TransactionService {
    private _store = persistentStore<Transaction>(
        'transactions',
        [],
        {
            isCollection: true,
            idKey: 'id',
            validate: (data: unknown): data is Transaction => {
                const result = validateTransaction(data);
                if (!result) {
                    console.error('[TransactionService] Invalid transaction item:', data);
                }
                return result;
            },
            onError: (error) => console.error('[TransactionService] Persistence error:', error)
        }
    ) as CollectionStore<Transaction>;

    public get ready() {
        return this._store.ready;
    }

    public isLoading() {
        return this._store.getIsLoading();
    }

    private get store(): CollectionStore<Transaction> {
        return this._store;
    }

    async getTransactions(): Promise<Transaction[]> {
        await this.ready;
        const transactions = this.store.getValue().filter(
            (transaction: Transaction) => !transaction.isDeleted
        );
        return transactions;
    }

    getTransactionsSync(): Transaction[] {
        return this.store.getValue().filter((t: Transaction) => !t.isDeleted);
    }

    async createNewTransaction(transactionData: Partial<Transaction> & {
        type: 'payment' | 'transfer' | 'adjustment';
        accountId: string;
        status: 'pending' | 'cleared' | 'cancelled';
    }): Promise<Transaction> {
        // Validate account exists
        const account = await accountService.getAccountById(transactionData.accountId);
        if (!account) {
            throw new Error(`Account ${transactionData.accountId} not found`);
        }

        // Validate transfer destination
        if (transactionData.type === 'transfer' && transactionData.toAccountId) {
            const toAccount = await accountService.getAccountById(transactionData.toAccountId);
            if (!toAccount) {
                throw new Error(`Destination account ${transactionData.toAccountId} not found`);
            }
        }

        const newTransaction = createTransaction(transactionData);
        await this.store.addItem(newTransaction);
        balanceService.clearCache();
        return newTransaction;
    }

    async updateTransactionStatus(id: string, status: Transaction['status']): Promise<void> {
        await this.ready;
        await this.store.updateItem(id, { status });
        balanceService.clearCache();
    }

    async getTransactionsByAccount(accountId: string): Promise<Transaction[]> {
        return this.store.findBy(
            transactionFilters.byAccountId(accountId)
        );
    }

    async getTransactionsByCategory(categoryId: string): Promise<Transaction[]> {
        await this.ready;
        const transactions = await this.store.findBy(transactionFilters.byCategoryId(categoryId));
        return transactions;
    }

    async getClearedTransactions() {
        await this.ready;
        const transactions = await this.store.findBy(transactionFilters.isCleared);
        return transactions;
    }

    async getFutureTransactions() {
        await this.ready;
        const transactions = await this.store.findBy(transactionFilters.isUpcoming);
        return transactions;
    }

    async getCurrentWeekTransactions() {
        await this.ready;
        const transactions = await this.store.findBy(transactionFilters.isInCurrentWeek);
        return transactions;
    }

    async getPendingTransactions(): Promise<Transaction[]> {
        await this.ready;
        const transactions = await this.store.findBy(t => t.status === 'pending');
        return transactions;
    }

    async getSavingsAllocations(savingsAccountId: string): Promise<{ category: Category; amount: number }[]> {
        await this.ready;
        const transactions = await this.getTransactionsByAccount(savingsAccountId);
        
        const categoryMap = new Map<string, number>();
        for (const tx of transactions) {
            if (!tx.categoryId) continue;
            
            const currentAmount = categoryMap.get(tx.categoryId) || 0;
            const amount = tx.clearedAmount || tx.pendingAmount || 0;
            categoryMap.set(tx.categoryId, currentAmount + amount);
        }

        const results: { category: Category; amount: number }[] = [];
        for (const [categoryId, amount] of categoryMap) {
            const category = await categoryService.getCategoryById(categoryId);
            if (category) {
                results.push({ category, amount });
            }
        }

        return results;
    }

    async batchUpdateTransactions(updates: Array<{id: string, data: Partial<Transaction>}>) {
        await this.ready;
        const result = await this.store.batchUpdate(updates);
        const transactions = this.store.getValue();
        
        const affectedAccountIds = updates
            .map(update => transactions.find(t => t.id === update.id)?.accountId)
            .filter(id => id) as string[];
        
        balanceService.clearCache();
        
        return result;
    }

    async deleteTransaction(transactionId: string): Promise<void> {
        await this.ready;
        await this.store.removeItem(transactionId);
        balanceService.clearCache();
    }

    async deleteTransactionsByAccount(accountId: string) {
        await this.ready;
        const transactions = await this.getTransactionsByAccount(accountId);
        
        const transactionIds = transactions.map(t => t.id);
        await this.store.batchRemove(transactionIds);
        
        balanceService.clearCache();
    }

    async getTotalByType(type: 'income' | 'expense') {
        await this.ready;
        const filteredTransactions = await this.store.findBy(transactionFilters.byCategoryType(type));
        
        const total = filteredTransactions.reduce((total, transaction) => {
            return total + (transaction.clearedAmount || transaction.pendingAmount || 0);
        }, 0);
        
        return total;
    }
}

export const transactionService = new TransactionService();