// balance-service.ts
import { accountService } from './account-service';
import { transactionService } from './transaction-service';
import { categoryService } from './category-service';
import type { BalancesByType } from '$lib/core/models/types';

class BalanceService {
    private cache: Map<string, number> = new Map();
    private cacheTimestamp: number = 0;
    private cacheTTL: number = 1000 * 60 * 5; // 5 minutes cache
    private typeCache: BalancesByType | null = null;
    private typeCacheTimestamp: number = 0;

    async getAccountBalance(accountId: string, forceFresh = false): Promise<number> {
        // Check cache first
        if (!forceFresh && this.cache.has(accountId) && 
            Date.now() - this.cacheTimestamp < this.cacheTTL) {
            return this.cache.get(accountId)!;
        }

        const transactions = await transactionService.getTransactionsByAccount(accountId);
        const balance = await transactions.reduce(async (totalPromise, transaction) => {
            const total = await totalPromise;

            if (!transaction.categoryId) return total;

            const category = await categoryService.getCategoryById(transaction.categoryId);
            const amount = transaction.actualAmount ?? transaction.plannedAmount ?? 0;
            
            switch (category?.type) {
                case 'income': return total + amount;
                case 'expense': return total - amount;
                default: return total;
            }
        }, Promise.resolve(0));

        // Update cache
        this.cache.set(accountId, balance);
        this.cacheTimestamp = Date.now();
        
        return balance;
    }

    async getAccountBalances(): Promise<Record<string, number>> {
        const accounts = accountService.accounts;
        const balances: Record<string, number> = {};
        
        await Promise.all(accounts.map(async (account) => {
            balances[account.id] = await this.getAccountBalance(account.id);
        }));
        
        return balances;
    }

    async getTotalBalance(): Promise<number> {
        const balances = await this.getAccountBalances();
        return Object.values(balances).reduce((total, balance) => total + balance, 0);
    }

    async getBalancesByType(forceFresh = false): Promise<BalancesByType> {
        // Check cache first
        if (!forceFresh && this.typeCache && 
            Date.now() - this.typeCacheTimestamp < this.cacheTTL) {
            return this.typeCache;
        }
    
        const allTransactions = await transactionService.getAllTransactions();
        
        const balances: BalancesByType = {
            income: 0,
            savings: 0,
            expenses: 0
        };
    
        await Promise.all(allTransactions.map(async (transaction) => {
            const amount = transaction.actualAmount ?? transaction.plannedAmount ?? 0;

            if (!transaction.categoryId) return;

            const category = await categoryService.getCategoryById(transaction.categoryId);
            
            switch (category?.type) {
                case 'income':
                    balances.income += amount;
                    break;
                case 'expense':
                    balances.expenses += amount;
                    break;
            }
        }));
    
        // Update cache
        this.typeCache = balances;
        this.typeCacheTimestamp = Date.now();
        
        return balances;
    }

    // Get net income (income - expenses)
    async getNetIncome(): Promise<number> {
        const balances = await this.getBalancesByType();
        return balances.income - balances.expenses;
    }

    // Get savings rate (savings / income)
    async getSavingsRate(): Promise<number> {
        const balances = await this.getBalancesByType();
        return balances.income > 0 ? balances.savings / balances.income : 0;
    }

    // Add this to clear type cache when transactions change
    clearTypeCache() {
        this.typeCache = null;
        this.typeCacheTimestamp = 0;
    }

    // Update existing clearCache method to also clear type cache
    clearCache() {
        this.cache.clear();
        this.cacheTimestamp = 0;
        this.clearTypeCache();
    }
}

export const balanceService = new BalanceService();