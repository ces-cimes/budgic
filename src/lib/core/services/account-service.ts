import { db, generateUUID, calculateTransferImpact } from '$lib/core/db';
import type { Account } from '$lib/core/db';
import { validationService } from './validation-service';
import { accountCache } from './caching-service';

// Using centralized caching service

class AccountService {
    // Public interface
    public get ready() {
        return Promise.resolve();
    }

    public isLoading() {
        return false;
    }

    async load() {
        // No-op with Dexie as data is loaded on-demand
    }

    // ============================================================================
    // CACHE MANAGEMENT
    // ============================================================================

    /**
     * Clear balance cache for a specific account or all accounts
     */
    clearBalanceCache(accountId?: string): void {
        if (accountId) {
            accountCache.delete(`balance_${accountId}`);
        } else {
            // Clear all balance-related cache entries
            const keys = accountCache.keys();
            for (const key of keys) {
                if (key.startsWith('balance_')) {
                    accountCache.delete(key);
                }
            }
        }
    }

    /**
     * Get cached balance if available and not expired
     */
    private getCachedBalance(accountId: string): number | null {
        return accountCache.get(`balance_${accountId}`) || null;
    }

    /**
     * Set cached balance for an account
     */
    private setCachedBalance(accountId: string, balance: number): void {
        accountCache.set(`balance_${accountId}`, balance, 5 * 60 * 1000); // 5 minutes TTL
    }

    async getAccounts(): Promise<Account[]> {
        return await db.getActiveAccounts();
    }

    // Update all method calls similarly
    async createAccount(accountData: Partial<Account>): Promise<Account> {
        // Validate account data before creation
        const validation = await validationService.validateAccountCreation(accountData);
        if (!validation.isValid) {
            throw new Error(`Invalid account data: ${validation.errors.join(', ')}`);
        }

        const newAccount: Account = {
            id: generateUUID(),
            name: accountData.name!,
            type: accountData.type!,
            currency: accountData.currency || 'USD',
            initialBalance: accountData.initialBalance || 0,
            currentBalance: accountData.currentBalance || 0,
            isActive: accountData.isActive ?? true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };
        
        await db.accounts.add(newAccount);
        return newAccount;
    }

    async updateAccount(id: string, updates: Partial<Account>): Promise<void> {
        // Validate account data before update
        const validation = await validationService.validateAccountUpdate(id, updates);
        if (!validation.isValid) {
            throw new Error(`Invalid account data: ${validation.errors.join(', ')}`);
        }

        await db.accounts.update(id, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    }

    // Soft-delete an account by setting deletedAt flag
    async deleteAccount(id: string): Promise<void> {
        await db.softDeleteAccount(id);
        console.debug('[AccountService] Account soft-deleted successfully: ', id);
    }

    // Get account by ID (including soft-deleted ones)
    async getAccountById(id: string) {
        const account = await db.accounts.get(id);
        
        if (account) {
            console.debug('[AccountService] Found account:', account);
        } else {
            console.debug('[AccountService] Account not found for ID:', id);
        }
        
        return account;
    }

    // Get accounts by type (excluding soft-deleted ones)
    async getAccountsByType(type: Account['type']): Promise<Account[]> {
        console.debug('[AccountService] Getting accounts by type:', type);
        return await db.getAccountsByType(type);
    }

    // Get account balance (cached version for UI display)
    async getAccountBalance(accountId: string, includePending: boolean = false): Promise<number> {
        console.debug('[AccountService] Getting balance for account:', accountId, 'includePending:', includePending);
        
        // Check cache first (only for non-pending balances)
        if (!includePending) {
            const cachedBalance = this.getCachedBalance(accountId);
            if (cachedBalance !== null) {
                console.debug('[AccountService] Using cached balance:', cachedBalance);
                return cachedBalance;
            }
        }

        const account = await this.getAccountById(accountId);
        
        if (!account) {
            console.error('[AccountService] Account not found for balance check:', accountId);
            throw new Error('Account not found');
        }

        console.debug('[AccountService] Retrieving transactions for account...');
        const transactions = await db.getTransactionsByAccount(accountId);
        console.debug('[AccountService] Found', transactions.length, 'transactions for account');

        // Filter out planned transactions if includePending is false
        const relevantTransactions = includePending 
            ? transactions 
            : transactions.filter(t => t.status !== 'planned');
        
        console.debug('[AccountService] Using', relevantTransactions.length, 'transactions for balance calculation');

        console.debug('[AccountService] Calculating balance...');
        const transactionBalance = relevantTransactions.reduce((total, transaction) => {
            console.debug('[AccountService] Processing transaction:', transaction.id, 'amount:', transaction.amount);
            // Use transfer impact calculation for transfers, regular amount for others
            const impact = transaction.type === 'transfer' 
                ? calculateTransferImpact(transaction, accountId)
                : transaction.amount;
            return total + impact;
        }, 0);

        // Include initial balance in the calculation
        const balance = account.initialBalance + transactionBalance;
        console.debug('[AccountService] Final balance calculated:', balance, '(initial:', account.initialBalance, '+ transactions:', transactionBalance, ')');
        
        // Cache the result (only for non-pending balances)
        if (!includePending) {
            this.setCachedBalance(accountId, balance);
        }
        
        return balance;
    }

    // Get account balance with real-time calculation (for critical operations)
    async getAccountBalanceRealTime(accountId: string, includePending: boolean = false): Promise<number> {
        console.debug('[AccountService] Getting real-time balance for account:', accountId, 'includePending:', includePending);
        
        const account = await this.getAccountById(accountId);
        
        if (!account) {
            console.error('[AccountService] Account not found for balance check:', accountId);
            throw new Error('Account not found');
        }

        const transactions = await db.getTransactionsByAccount(accountId);
        
        // Filter out planned transactions if includePending is false
        const relevantTransactions = includePending 
            ? transactions 
            : transactions.filter(t => t.status !== 'planned');
        
        const transactionBalance = relevantTransactions.reduce((total, transaction) => {
            return total + transaction.amount;
        }, 0);

        // Include initial balance in the calculation
        const balance = account.initialBalance + transactionBalance;
        console.debug('[AccountService] Real-time balance calculated:', balance, '(initial:', account.initialBalance, '+ transactions:', transactionBalance, ')');
        return balance;
    }

    // Update account balance
    async updateAccountBalance(accountId: string, amount: number): Promise<void> {
        await db.updateAccountBalance(accountId, amount);
    }

    // Recalculate account balance from transactions and update stored balance
    async recalculateAccountBalance(accountId: string): Promise<number> {
        const balance = await this.getAccountBalanceRealTime(accountId);
        await this.updateAccountBalance(accountId, balance);
        this.clearBalanceCache(accountId);
        return balance;
    }

    // Refresh all account balances (useful after bulk operations)
    async refreshAllAccountBalances(): Promise<void> {
        console.debug('[AccountService] Refreshing all account balances...');
        const accounts = await this.getAccounts();
        
        for (const account of accounts) {
            await this.recalculateAccountBalance(account.id);
        }
        
        console.debug('[AccountService] All account balances refreshed');
    }

    // Get accounts with their current balances (cached for performance)
    async getAccountsWithBalances(): Promise<{ account: Account; balance: number }[]> {
        const accounts = await this.getAccounts();
        const results: { account: Account; balance: number }[] = [];

        for (const account of accounts) {
            const balance = await this.getAccountBalance(account.id);
            results.push({ account, balance });
        }

        return results;
    }

    // Get accounts with real-time balances (for critical operations)
    async getAccountsWithRealTimeBalances(): Promise<{ account: Account; balance: number }[]> {
        const accounts = await this.getAccounts();
        const results: { account: Account; balance: number }[] = [];

        for (const account of accounts) {
            const balance = await this.getAccountBalanceRealTime(account.id);
            results.push({ account, balance });
        }

        return results;
    }

    // Get total balance across all accounts
    async getTotalBalance(): Promise<number> {
        const accounts = await this.getAccounts();
        let total = 0;

        for (const account of accounts) {
            const balance = await this.getAccountBalance(account.id);
            total += balance;
        }

        return total;
    }
}

export const accountService = new AccountService();