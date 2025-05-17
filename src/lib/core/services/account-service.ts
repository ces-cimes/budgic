import { persistentStore } from '$lib/core/persistence.svelte';
import { createAccount, validateAccountArray } from '../models/types';
import type { Account } from '$lib/core/models/types';
import { categoryService } from './category-service';
import { transactionService } from './transaction-service';

class AccountService {
    // Persistent store for accounts
    private _store = persistentStore<Account[], 'id'>(
        'accounts',
        [
            createAccount({ 
                name: 'black T-Bank', 
                type: 'checking'
            }),
            createAccount({ 
                name: 'Savings', 
                type: 'savings'
            })
        ],
        {
            isCollection: true,
            idKey: 'id',
            validate: validateAccountArray
        }
    );

    // Get all accounts (excluding soft-deleted ones)
    get accounts() {
        return this._store.value.filter(account => !account.isDeleted);
    }

    // Create a new account
    async createAccount(accountData: Partial<Account>) {
        const newAccount = createAccount(accountData);
        await this._store.addItem(newAccount);
        return newAccount;
    }

    // Update an existing account
    async updateAccount(id: string, updates: Partial<Account>): Promise<void> {
        const account = await this.getAccountById(id);
        if (!account) throw new Error('Account not found');
        
        const updatedAccount = { ...account, ...updates };
        await this._store.updateItem(id, updatedAccount);
    }

    // Soft-delete an account by setting isDeleted flag
    async deleteAccount(id: string): Promise<void> {
        await this.updateAccount(id, { isDeleted: true });
    }

    // Get account by ID (including soft-deleted ones)
    getAccountById(id: string) {
        return this._store.getItem(id);
    }

    // Get accounts by type (excluding soft-deleted ones)
    getAccountsByType(type: Account['type']): Account[] {
        return this.accounts.filter(account => account.type === type);
    }

    // Get account balance
    async getAccountBalance(accountId: string, includePending: boolean = false): Promise<number> {
        const account = this.getAccountById(accountId);
        if (!account) throw new Error('Account not found');

        // Get all transactions for this account
        const transactions = await transactionService.getTransactionsByAccount(accountId);

        // Filter out pending transactions if includePending is false
        const relevantTransactions = includePending 
            ? transactions 
            : transactions.filter(t => t.status !== 'pending');

        // Calculate new balance
        const balance = await relevantTransactions.reduce(async (totalPromise, transaction) => {
            const total = await totalPromise;

            if (!transaction.categoryId) return total;

            const category = await categoryService.getCategoryById(transaction.categoryId);
            const amount = transaction.actualAmount || transaction.plannedAmount || 0;
            
            if (category?.type === 'income') return total + amount;
            if (category?.type === 'expense') return total - amount;
            return total;
        }, Promise.resolve(0));

        return balance;
    }
}

export const accountService = new AccountService();