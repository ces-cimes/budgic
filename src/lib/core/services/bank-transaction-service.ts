import { db, generateUUID } from '$lib/core/db';
import type { BankTransaction } from '$lib/core/db';
import { validationService } from './validation-service';

class BankTransactionService {
    public get ready() {
        return Promise.resolve();
    }

    public isLoading() {
        return false;
    }

    async load() {
        // No-op with Dexie as data is loaded on-demand
    }

    async getBankTransactions(): Promise<BankTransaction[]> {
        return await db.bankTransactions.filter(transaction => !transaction.deletedAt).toArray();
    }

    async createBankTransaction(data: Partial<BankTransaction>): Promise<BankTransaction> {
        // Validate bank transaction data before creation
        const validation = await validationService.validateTransactionCreation(data as any);
        if (!validation.isValid) {
            throw new Error(`Invalid bank transaction data: ${validation.errors.join(', ')}`);
        }

        const newTransaction: BankTransaction = {
            id: generateUUID(),
            accountId: data.accountId!,
            externalId: data.externalId || '',
            amount: data.amount!,
            description: data.description || '',
            transactionDate: data.transactionDate!,
            importSource: data.importSource || '',
            rawData: data.rawData || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };
        
        await db.bankTransactions.add(newTransaction);
        return newTransaction;
    }

    async updateBankTransaction(id: string, updates: Partial<BankTransaction>): Promise<void> {
        // Validate bank transaction data before update
        const validation = await validationService.validateTransactionUpdate(id, updates as any);
        if (!validation.isValid) {
            throw new Error(`Invalid bank transaction data: ${validation.errors.join(', ')}`);
        }

        await db.bankTransactions.update(id, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    }

    async deleteBankTransaction(id: string): Promise<void> {
        await db.softDeleteBankTransaction(id);
        console.debug('[BankTransactionService] Bank transaction soft-deleted successfully: ', id);
    }

    async getBankTransactionById(id: string): Promise<BankTransaction | undefined> {
        const transaction = await db.bankTransactions.get(id);
        
        if (transaction) {
            console.debug('[BankTransactionService] Found bank transaction:', transaction);
        } else {
            console.debug('[BankTransactionService] Bank transaction not found for ID:', id);
        }
        
        return transaction;
    }

    async getBankTransactionsByAccount(accountId: string): Promise<BankTransaction[]> {
        return await db.getBankTransactionsByAccount(accountId);
    }

    async getUncategorizedBankTransactions(): Promise<BankTransaction[]> {
        return await db.getUncategorizedBankTransactions();
    }

    async getBankTransactionsByDateRange(startDate: string, endDate: string): Promise<BankTransaction[]> {
        return await db.bankTransactions
            .where('transactionDate')
            .between(startDate, endDate, true, true)
            .filter(transaction => !transaction.deletedAt)
            .toArray();
    }

    async getBankTransactionsByExternalId(externalId: string): Promise<BankTransaction[]> {
        return await db.bankTransactions
            .where('externalId').equals(externalId)
            .filter(transaction => !transaction.deletedAt)
            .toArray();
    }

    async importBankTransactions(transactions: Partial<BankTransaction>[]): Promise<BankTransaction[]> {
        const importedTransactions: BankTransaction[] = [];
        
        await db.transaction('rw', [db.bankTransactions], async () => {
            for (const transactionData of transactions) {
                const newTransaction = await this.createBankTransaction(transactionData);
                importedTransactions.push(newTransaction);
            }
        });
        
        console.debug('[BankTransactionService] Imported', importedTransactions.length, 'bank transactions');
        return importedTransactions;
    }

    async deduplicateBankTransactions(): Promise<{ removed: number; kept: number }> {
        const allTransactions = await this.getBankTransactions();
        const duplicates = new Map<string, BankTransaction[]>();
        
        // Group by external ID and account
        for (const transaction of allTransactions) {
            const key = `${transaction.externalId}-${transaction.accountId}-${transaction.transactionDate}`;
            if (!duplicates.has(key)) {
                duplicates.set(key, []);
            }
            duplicates.get(key)!.push(transaction);
        }
        
        let removed = 0;
        let kept = 0;
        
        await db.transaction('rw', [db.bankTransactions], async () => {
            for (const [key, transactionGroup] of duplicates) {
                if (transactionGroup.length > 1) {
                    // Keep the first one, delete the rest
                    const [keep, ...remove] = transactionGroup;
                    kept++;
                    
                    for (const transaction of remove) {
                        await this.deleteBankTransaction(transaction.id);
                        removed++;
                    }
                } else {
                    kept++;
                }
            }
        });
        
        console.debug('[BankTransactionService] Deduplication complete:', { removed, kept });
        return { removed, kept };
    }

    async searchBankTransactions(query: string): Promise<BankTransaction[]> {
        const transactions = await this.getBankTransactions();
        const lowerQuery = query.toLowerCase();
        
        return transactions.filter(transaction => 
            (transaction.description?.toLowerCase().includes(lowerQuery) || false) ||
            (transaction.externalId?.toLowerCase().includes(lowerQuery) || false)
        );
    }

    async getImportStatistics(): Promise<{
        total: number;
        categorized: number;
        uncategorized: number;
        bySource: Record<string, number>;
    }> {
        const allTransactions = await this.getBankTransactions();
        const categorizedTransactions = await db.transactions
            .filter(transaction => transaction.bankTransactionId !== null)
            .toArray();
        
        const categorizedIds = new Set(categorizedTransactions.map(t => t.bankTransactionId!));
        const uncategorized = allTransactions.filter(t => !categorizedIds.has(t.id));
        
        const bySource: Record<string, number> = {};
        for (const transaction of allTransactions) {
            const source = transaction.importSource || 'manual';
            bySource[source] = (bySource[source] || 0) + 1;
        }
        
        return {
            total: allTransactions.length,
            categorized: categorizedTransactions.length,
            uncategorized: uncategorized.length,
            bySource
        };
    }
}

export const bankTransactionService = new BankTransactionService(); 