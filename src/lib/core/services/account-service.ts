import { persistentStore } from '$lib/core/persistence.svelte';
import { 
    createAccount, 
    validateAccountArray 
} from '../models/types';
import type { Account } from '$lib/core/models/types';
import { transactionService } from './transaction-service';

class AccountService {
    // Persistent store for accounts
    private _store = persistentStore<Account[], 'id'>(
        'accounts',
        [
            createAccount({ 
                name: 'Checking', 
                type: 'debit'
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

    // Get all accounts
    get accounts() {
        return this._store.value;
    }

    // Create a new account
    async createAccount(accountData: Partial<Account>) {
        const newAccount = createAccount(accountData);
        await this._store.addItem(newAccount);
        return newAccount;
    }

    // Update account balance based on transactions
    async updateAccountBalance(accountId: string) {
        const account = this._store.value.find(a => a.id === accountId);
        if (!account) throw new Error('Account not found');

        // Get all transactions for this account
        const transactions = await transactionService.getTransactionsByAccount(accountId);

        // Calculate new balance
        const newBalance = transactions.reduce((total, transaction) => {
            if (transaction.type === 'income') {
                return total + (transaction.actualAmount || transaction.plannedAmount || 0);
            } else if (transaction.type === 'expense') {
                return total - (transaction.actualAmount || transaction.plannedAmount || 0);
            }
            return total;
        }, 0);
    }

    // Get account by ID
    getAccountById(id: string) {
        return this._store.getItem(id);
    }

    // Delete an account and its associated transactions
    async deleteAccount(accountId: string) {
        // First, delete all associated transactions
        await transactionService.deleteTransactionsByAccount(accountId);

        // Then remove the account
        await this._store.removeItem(accountId);
    }
}

export const accountService = new AccountService();