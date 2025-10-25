import { db, generateUUID, calculateTransferImpact } from '$lib/core/db';
import type { Account, Transaction } from '$lib/core/db';

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
    // ACCOUNT MANAGEMENT
    // ============================================================================

    /**
     * Create a new account
     */
    async createAccount(data: {
        name: string;
        type: Account['type'];
        currency: string;
        initialBalance?: number;
    }): Promise<Account> {
        const account: Account = {
            id: generateUUID(),
            name: data.name,
            type: data.type,
            currency: data.currency,
            initialBalance: data.initialBalance || 0,
            currentBalance: data.initialBalance || 0,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };

        await db.accounts.add(account);
        return account;
    }

    /**
     * Get all active accounts
     */
    async getAccounts(): Promise<Account[]> {
        return await db.getActiveAccounts();
    }

    /**
     * Get account by ID
     */
    async getAccount(id: string): Promise<Account | null> {
        return await db.accounts.get(id) || null;
    }

    /**
     * Update account
     */
    async updateAccount(id: string, updates: Partial<Pick<Account, 'name' | 'type' | 'currency' | 'isActive'>>): Promise<Account> {
        const account = await db.accounts.get(id);
        if (!account) {
            throw new Error(`Account ${id} not found`);
        }

        const updatedAccount = {
            ...account,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        await db.accounts.update(id, updatedAccount);
        return updatedAccount;
    }

    /**
     * Delete account (soft delete)
     */
    async deleteAccount(id: string): Promise<void> {
        await db.softDeleteAccount(id);
    }

    /**
     * Get account balance
     */
    async getAccountBalance(accountId: string): Promise<number> {
        return await db.getAccountBalance(accountId);
    }

    /**
     * Recalculate account balance from transactions
     */
    async recalculateAccountBalance(accountId: string): Promise<number> {
        return await db.recalculateAccountBalance(accountId);
    }

    /**
     * Get accounts by type
     */
    async getAccountsByType(type: Account['type']): Promise<Account[]> {
        return await db.getAccountsByType(type);
    }

    /**
     * Get total balance across all accounts
     */
    async getTotalBalance(): Promise<number> {
        const accounts = await this.getAccounts();
        return accounts.reduce((total, account) => total + account.currentBalance, 0);
    }

    /**
     * Get balance by account type
     */
    async getBalanceByType(): Promise<Record<Account['type'], number>> {
        const accounts = await this.getAccounts();
        const balances: Record<Account['type'], number> = {
            checking: 0,
            savings: 0,
            credit: 0,
            cash: 0,
            investment: 0,
            crypto: 0
        };

        accounts.forEach(account => {
            balances[account.type] += account.currentBalance;
        });

        return balances;
    }

    /**
     * Get account balance impact for a transaction
     */
    getTransactionImpact(transaction: Transaction, accountId: string): number {
        if (transaction.type === 'transfer') {
            return calculateTransferImpact(transaction, accountId);
        }
        
        // For non-transfer transactions, check if this is the account
        if (transaction.accountId === accountId) {
            switch (transaction.type) {
                case 'income':
                    return transaction.amount || 0;
                case 'expense':
                    return -(transaction.amount || 0);
                case 'adjustment':
                    return transaction.amount || 0;
                default:
                    return 0;
            }
        }
        
        return 0;
    }

    /**
     * Validate account balance consistency
     */
    async validateAccountBalance(accountId: string): Promise<{ isValid: boolean; error?: string; calculatedBalance: number }> {
        const calculatedBalance = await this.recalculateAccountBalance(accountId);
        const account = await this.getAccount(accountId);
        
        if (!account) {
            return { isValid: false, error: 'Account not found', calculatedBalance: 0 };
        }
        
        const isValid = Math.abs(account.currentBalance - calculatedBalance) < 0.01;
        return {
            isValid,
            error: isValid ? undefined : 'Balance mismatch detected',
            calculatedBalance
        };
    }
}

export const accountService = new AccountService();