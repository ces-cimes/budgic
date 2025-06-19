import { persistentStore } from '$lib/core/persistence.svelte';
import { createAccount, validateAccount } from '../models/types';
import type { Account } from '$lib/core/models/types';
import type { CollectionStore } from '$lib/core/persistence.svelte';
import { transactionService } from './transaction-service.svelte';
import { categoryService } from './category-service';

class AccountService {
    private _store = persistentStore<Account>(
        'accounts',
        [],
        {
            isCollection: true,
            idKey: 'id',
            validate: (data: unknown): data is Account => {
                const result = validateAccount(data);
                if (!result) {
                    console.error('[AccountService] Invalid account item:', data);
                }
                return result;
            },
            onError: (error) => console.error('[AccountService] Persistence error:', error)
        }
    ) as CollectionStore<Account>;

    // Public interface
    public get ready() {
        return this._store.ready;
    }

    public isLoading() {
        return this._store.getIsLoading();
    }
    
    private get store(): CollectionStore<Account> {
        return this._store;
    }

    async load() {
        await this._store.loadMore();
    }

    async getAccounts(): Promise<Account[]> {
        await this.ready;
        const accounts = this.store.getValue().filter(
            (account: Account) => !account.isDeleted
        );
        console.debug("[AccountService] Loaded accounts:", accounts);
        return accounts;
    }

    // Update all method calls similarly
    async createAccount(accountData: Partial<Account>) {
        const newAccount = createAccount(accountData);
        await this.store.addItem(newAccount);
        return newAccount;
    }

    async updateAccount(id: string, updates: Partial<Account>): Promise<void> {
        await this.store.updateItem(id, updates);
    }

    // Soft-delete an account by setting isDeleted flag
    async deleteAccount(id: string): Promise<void> {
        await this.store.ready;
        await this.updateAccount(id, { isDeleted: true });
        console.debug('[AccountService] Account soft-deleted successfully: ', id);
    }

    // Get account by ID (including soft-deleted ones)
    async getAccountById(id: string) {
        await this.store.ready;
        const account = await this.store.getItem(id);
        
        if (account) {
            console.debug('[AccountService] Found account:', account);
        } else {
            console.debug('[AccountService] Account not found for ID:', id);
        }
        
        return account;
    }

    // Get accounts by type (excluding soft-deleted ones)
    async getAccountsByType(type: Account['type']): Promise<Account[]> {
        await this.store.ready;
        console.debug('[AccountService] Getting accounts by type:', type);
        const accounts = await this.getAccounts();
        const filteredAccounts = accounts.filter(account => account.type === type);
        console.debug('[AccountService] Found', filteredAccounts.length, 'accounts of type', type);
        return filteredAccounts;
    }

    // Get account balance
    async getAccountBalance(accountId: string, includePending: boolean = false): Promise<number> {
        await this.store.ready;
        console.debug('[AccountService] Getting balance for account:', accountId, 'includePending:', includePending);
        const account = this.getAccountById(accountId);
        
        if (!account) {
            console.error('[AccountService] Account not found for balance check:', accountId);
            throw new Error('Account not found');
        }

        console.debug('[AccountService] Retrieving transactions for account...');
        const transactions = await transactionService.getTransactionsByAccount(accountId);
        console.debug('[AccountService] Found', transactions.length, 'transactions for account');

        // Filter out pending transactions if includePending is false
        const relevantTransactions = includePending 
            ? transactions 
            : transactions.filter(t => t.status !== 'pending');
        
        console.debug('[AccountService] Using', relevantTransactions.length, 'transactions for balance calculation');

        console.debug('[AccountService] Calculating balance...');
        const balance = await relevantTransactions.reduce(async (totalPromise, transaction) => {
            const total = await totalPromise;

            if (!transaction.categoryId) {
                console.debug('[AccountService] Transaction has no category, skipping:', transaction.id);
                return total;
            }

            const category = await categoryService.getCategoryById(transaction.categoryId);
            const amount = transaction.clearedAmount || transaction.pendingAmount || 0;
            
            if (category?.type === 'income') {
                console.debug('[AccountService] Adding income amount:', amount, 'for transaction:', transaction.id);
                return total + amount;
            }
            if (category?.type === 'expense') {
                console.debug('[AccountService] Subtracting expense amount:', amount, 'for transaction:', transaction.id);
                return total - amount;
            }
            
            console.debug('[AccountService] No category type matched, skipping transaction:', transaction.id);
            return total;
        }, Promise.resolve(0));

        console.debug('[AccountService] Final balance calculated:', balance);
        return balance;
    }
}

export const accountService = new AccountService();