import { db, validateTransactionGroup, validateNewGroupTransaction, generateUUID, calculateTransactionImpact } from '$lib/core/db';
import type { Transaction } from '$lib/core/db';
import { accountService } from './account-service';
import { crossRouteSyncService } from '../analytics/cross-route-sync-service';
import { balanceProjectionService } from '../analytics/balance-projection-service';
import { exchangeRateService } from './exchange-rate-service';

class TransactionService {
    /**
     * Calculate and cache currency conversions for a transaction
     * This ensures balance calculations use the correct amounts in account currencies
     * Returns only the fields that were calculated/modified
     */
    private async calculateCurrencyConversions(
        transaction: Partial<Transaction>,
        accountId?: string
    ): Promise<Partial<Pick<Transaction, 'accountAmount' | 'currencyConversion' | 'transferDetails'>>> {
        if (!accountId || !transaction.currency) {
            return transaction;
        }

        const account = await accountService.getAccount(accountId);
        if (!account) {
            return transaction;
        }

        const transactionCurrency = transaction.currency;
        const accountCurrency = account.currency;

        // If currencies match, no conversion needed
        if (transactionCurrency === accountCurrency) {
            // For non-transfers, set accountAmount = amount
            if (transaction.type !== 'transfer' && transaction.amount !== undefined) {
                return {
                    accountAmount: transaction.amount
                };
            }
            return {};
        }

        // Currencies differ - need conversion
        const transactionDate = transaction.clearedDate 
            ? new Date(transaction.clearedDate) 
            : transaction.plannedDate 
                ? new Date(transaction.plannedDate)
                : new Date();

        // For regular transactions (income, expense, adjustment)
        if (transaction.type !== 'transfer' && transaction.amount !== undefined) {
            const convertedAmount = await exchangeRateService.convertAmount(
                transaction.amount,
                transactionCurrency,
                accountCurrency,
                transactionDate
            );

            if (convertedAmount !== null) {
                return {
                    accountAmount: convertedAmount,
                    currencyConversion: {
                        exchangeRate: convertedAmount / transaction.amount,
                        conversionDate: transactionDate.toISOString(),
                        sourceCurrency: transactionCurrency,
                        targetCurrency: accountCurrency
                    }
                };
            } else {
                // Conversion failed - use original amount and log warning
                console.warn(
                    `Failed to convert ${transaction.amount} ${transactionCurrency} to ${accountCurrency} for transaction. ` +
                    `Using original amount. Exchange rate may not be available for ${transactionDate.toISOString().substring(0, 10)}.`
                );
                return {};
            }
        }

        // For transfers, handle source account conversion
        if (transaction.type === 'transfer' && transaction.transferDetails) {
            const result: Partial<Pick<Transaction, 'accountAmount' | 'currencyConversion' | 'transferDetails'>> = {};
            
            // Convert transfer amount for source account
            if (transaction.transferDetails.transferAmount !== undefined) {
                const sourceConverted = await exchangeRateService.convertAmount(
                    transaction.transferDetails.transferAmount,
                    transactionCurrency,
                    accountCurrency,
                    transactionDate
                );

                if (sourceConverted !== null) {
                    result.accountAmount = sourceConverted;
                }
            }

            // Convert fee amount if fee is on this account
            if (transaction.transferDetails.feeAmount && transaction.transferDetails.feeAmount > 0) {
                const feeAccountId = transaction.transferDetails.feeAccountId || accountId;
                if (feeAccountId === accountId) {
                    const feeConverted = await exchangeRateService.convertAmount(
                        transaction.transferDetails.feeAmount,
                        transactionCurrency,
                        accountCurrency,
                        transactionDate
                    );

                    if (feeConverted !== null) {
                        result.transferDetails = {
                            ...transaction.transferDetails,
                            feeAccountAmount: feeConverted
                        };
                    }
                }
            }

            // Store conversion metadata
            if (result.accountAmount !== undefined) {
                result.currencyConversion = {
                    exchangeRate: result.accountAmount / (transaction.transferDetails.transferAmount || 1),
                    conversionDate: transactionDate.toISOString(),
                    sourceCurrency: transactionCurrency,
                    targetCurrency: accountCurrency
                };
            }

            return result;
        }

        return {};
    }

    /**
     * Calculate currency conversions for transfer destination account
     * Returns only the fields that were calculated/modified
     */
    private async calculateTransferDestinationConversion(
        transaction: Partial<Transaction>
    ): Promise<Partial<Pick<Transaction, 'transferDetails'>>> {
        if (transaction.type !== 'transfer' || !transaction.transferDetails) {
            return transaction;
        }

        const toAccountId = transaction.transferDetails.toAccountId;
        if (!toAccountId || !transaction.currency) {
            return transaction;
        }

        const toAccount = await accountService.getAccount(toAccountId);
        if (!toAccount) {
            return transaction;
        }

        const transactionCurrency = transaction.currency;
        const toAccountCurrency = toAccount.currency;

        // If currencies match, no conversion needed
        if (transactionCurrency === toAccountCurrency) {
            if (transaction.transferDetails.transferAmount !== undefined) {
                return {
                    transferDetails: {
                        ...transaction.transferDetails,
                        toAccountAmount: transaction.transferDetails.transferAmount
                    }
                };
            }
            return {};
        }

        // Convert transfer amount to destination account currency
        const transactionDate = transaction.clearedDate 
            ? new Date(transaction.clearedDate) 
            : transaction.plannedDate 
                ? new Date(transaction.plannedDate)
                : new Date();

        if (transaction.transferDetails.transferAmount !== undefined) {
            const toAccountConverted = await exchangeRateService.convertAmount(
                transaction.transferDetails.transferAmount,
                transactionCurrency,
                toAccountCurrency,
                transactionDate
            );

            if (toAccountConverted !== null) {
                return {
                    transferDetails: {
                        ...transaction.transferDetails,
                        toAccountAmount: toAccountConverted
                    }
                };
            }
        }

        return {};
    }
    public get ready() {
        return db.isOpen();
    }

    public isLoading() {
        return !this.ready;
    }

    // ============================================================================
    // TRANSACTION MANAGEMENT
    // ============================================================================

    /**
     * Create a new transaction
     * @param skipBalanceRecalculation - If true, skip balance recalculation (useful for bulk imports)
     */
    async createTransaction(
        data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
        skipBalanceRecalculation: boolean = false
    ): Promise<Transaction> {
        // Calculate currency conversions before creating transaction
        // IMPORTANT: If accountAmount is already set (e.g., from import), preserve it and skip conversion
        let transactionData: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> = { ...data };
        
        // Only calculate conversions if accountAmount is not already set
        // This preserves imported conversions from MM or other sources
        const hasAccountAmount = data.accountAmount !== undefined;
        const hasTransferAmounts = data.type === 'transfer' && 
            data.transferDetails?.toAccountAmount !== undefined;
        
        if (!hasAccountAmount && data.accountId) {
            // Calculate conversion for source account only if not already provided
            const conversions = await this.calculateCurrencyConversions(transactionData, data.accountId);
            transactionData = { ...transactionData, ...conversions };
        }
        
        // For transfers, calculate conversion for destination account only if not already provided
        if (data.type === 'transfer' && data.transferDetails && !hasTransferAmounts) {
            const transferConversions = await this.calculateTransferDestinationConversion(transactionData);
            transactionData = { ...transactionData, ...transferConversions };
            
            // Also calculate fee conversion if fee account is different and not already provided
            if (transactionData.transferDetails?.feeAccountId && 
                transactionData.transferDetails.feeAccountId !== data.accountId &&
                transactionData.transferDetails.feeAmount && 
                transactionData.transferDetails.feeAmount > 0 &&
                transactionData.transferDetails.feeAccountAmount === undefined) {
                const feeAccount = await accountService.getAccount(transactionData.transferDetails.feeAccountId);
                if (feeAccount && transactionData.currency && feeAccount.currency !== transactionData.currency) {
                    const transactionDate = data.clearedDate 
                        ? new Date(data.clearedDate) 
                        : data.plannedDate 
                            ? new Date(data.plannedDate)
                            : new Date();
                    
                    const feeConverted = await exchangeRateService.convertAmount(
                        transactionData.transferDetails.feeAmount,
                        transactionData.currency,
                        feeAccount.currency,
                        transactionDate
                    );
                    
                    if (feeConverted !== null && transactionData.transferDetails) {
                        transactionData.transferDetails = {
                            ...transactionData.transferDetails,
                            feeAccountAmount: feeConverted
                        };
                    }
                }
            }
        }

        const transaction: Transaction = {
            id: generateUUID(),
            ...transactionData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };

        await db.transactions.add(transaction);
        
        // Update account balance only if accountId is present and not skipping recalculation
        if (!skipBalanceRecalculation) {
            const affectedAccountIds: string[] = [];
            if (transaction.accountId) {
                await accountService.recalculateAccountBalance(transaction.accountId);
                affectedAccountIds.push(transaction.accountId);
            }
            
            // Handle transfers - both accounts are affected
            if (transaction.type === 'transfer' && transaction.transferDetails) {
                const toAccountId = transaction.transferDetails.toAccountId;
                if (toAccountId && !affectedAccountIds.includes(toAccountId)) {
                    await accountService.recalculateAccountBalance(toAccountId);
                    affectedAccountIds.push(toAccountId);
                }
            }
            
            // Clear balance projection cache for affected accounts
            if (affectedAccountIds.length > 0) {
                balanceProjectionService.clearCacheForAccounts(affectedAccountIds);
            }
        }
        
        // Emit sync event for transaction creation
        await crossRouteSyncService.onTransactionCreated(transaction);
        
        return transaction;
    }

    /**
     * Get transaction by ID
     */
    async getTransaction(id: string): Promise<Transaction | null> {
        return await db.transactions.get(id) || null;
    }

    /**
     * Update transaction
     */
    async updateTransaction(id: string, updates: Partial<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>): Promise<Transaction> {
        const transaction = await db.transactions.get(id);
        if (!transaction) {
            throw new Error(`Transaction ${id} not found`);
        }

        // Check if amount, currency, or account changed - need to recalculate conversions
        // BUT: Only recalculate if accountAmount is not already set (preserve imported conversions)
        const needsRecalculation = 
            (updates.amount !== undefined || 
             updates.currency !== undefined || 
             updates.accountId !== undefined ||
             updates.transferDetails !== undefined ||
             updates.clearedDate !== undefined ||
             updates.plannedDate !== undefined) &&
            // Only recalculate if accountAmount is not already set (preserve imported values)
            updates.accountAmount === undefined;

        let updatedData: Transaction = { ...transaction, ...updates };
        
        // Recalculate currency conversions if needed and not already provided
        if (needsRecalculation && updatedData.accountAmount === undefined) {
            const accountId = updatedData.accountId || transaction.accountId;
            if (accountId) {
                const conversions = await this.calculateCurrencyConversions(updatedData, accountId);
                updatedData = { ...updatedData, ...conversions };
            }
            
            // For transfers, recalculate destination conversion only if not already provided
            if (updatedData.type === 'transfer' && updatedData.transferDetails && 
                updatedData.transferDetails.toAccountAmount === undefined) {
                const transferConversions = await this.calculateTransferDestinationConversion(updatedData);
                updatedData = { ...updatedData, ...transferConversions };
            }
        }

        const updatedTransaction: Transaction = {
            ...updatedData,
            updatedAt: new Date().toISOString()
        };

        await db.transactions.update(id, updatedTransaction);
        
        // Update account balance for both old and new accountId (if changed)
        const accountIds = new Set<string>();
        if (transaction.accountId) {
            accountIds.add(transaction.accountId);
        }
        if (updatedTransaction.accountId) {
            accountIds.add(updatedTransaction.accountId);
        }
        
        // Check if transfer details changed (affects multiple accounts)
        if (updatedTransaction.type === 'transfer' && updatedTransaction.transferDetails) {
            accountIds.add(updatedTransaction.transferDetails.toAccountId);
        } else if (transaction.type === 'transfer' && transaction.transferDetails) {
            accountIds.add(transaction.transferDetails.toAccountId);
        }
        
        for (const accountId of accountIds) {
            await accountService.recalculateAccountBalance(accountId);
        }
        
        // Clear balance projection cache for affected accounts
        if (accountIds.size > 0) {
            balanceProjectionService.clearCacheForAccounts(Array.from(accountIds));
        }
        
        // Emit sync event for transaction update
        await crossRouteSyncService.onTransactionUpdated(updatedTransaction, updates);
        
        return updatedTransaction;
    }

    /**
     * Delete transaction (soft delete)
     */
    async deleteTransaction(id: string): Promise<void> {
        const transaction = await db.transactions.get(id);
        if (!transaction) {
            throw new Error(`Transaction ${id} not found`);
        }

        await db.softDeleteTransaction(id);
        
        // Update account balance only if accountId is present
        const affectedAccountIds: string[] = [];
        if (transaction.accountId) {
            await accountService.recalculateAccountBalance(transaction.accountId);
            affectedAccountIds.push(transaction.accountId);
        }
        
        // Handle transfers - both accounts are affected
        if (transaction.type === 'transfer' && transaction.transferDetails) {
            const toAccountId = transaction.transferDetails.toAccountId;
            if (toAccountId && !affectedAccountIds.includes(toAccountId)) {
                await accountService.recalculateAccountBalance(toAccountId);
                affectedAccountIds.push(toAccountId);
            }
        }
        
        // Clear balance projection cache for affected accounts
        if (affectedAccountIds.length > 0) {
            balanceProjectionService.clearCacheForAccounts(affectedAccountIds);
        }
        
        // Emit sync event for transaction deletion
        await crossRouteSyncService.onTransactionDeleted(id);
    }

    /**
     * Get all transactions
     */
    async getAllTransactions(): Promise<Transaction[]> {
        return await db.transactions.toArray();
    }

    /**
     * Get transactions by account
     */
    async getTransactionsByAccount(accountId: string): Promise<Transaction[]> {
        return await db.transactions.where('accountId').equals(accountId).toArray();
    }

    /**
     * Get transactions by category
     */
    async getTransactionsByCategory(categoryId: string): Promise<Transaction[]> {
        return await db.transactions.where('categoryId').equals(categoryId).toArray();
    }

    /**
     * Get transactions by date range
     */
    async getTransactionsByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
        return await db.transactions
            .where('clearedDate')
            .between(startDate, endDate)
            .toArray();
    }

    /**
     * Get transactions by status
     */
    async getTransactionsByStatus(status: Transaction['status']): Promise<Transaction[]> {
        return await db.transactions.where('status').equals(status).toArray();
    }

    // ============================================================================
    // TRANSACTION GROUP MANAGEMENT (formerly split transactions)
    // ============================================================================

    /**
     * Create a new transaction group
     */
    async createTransactionGroup(
        groupTransactions: Array<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
        groupName?: string
    ): Promise<string> {
        if (groupTransactions.length === 0) {
            throw new Error('At least one transaction is required');
        }

        // Validate the group transactions
        const validation = validateNewGroupTransaction(groupTransactions);
        if (!validation.isValid) {
            throw new Error(`Invalid transaction group: ${validation.errors.join(', ')}`);
        }

        const groupId = await db.createTransactionGroup(groupTransactions, groupName);
        
        // Update account balances for affected accounts (filter out null accountIds)
        const accountIds = new Set(groupTransactions
            .map(tx => tx.accountId)
            .filter((id): id is string => id !== undefined && id !== null));
        
        // Also check for transfer destinations
        for (const tx of groupTransactions) {
            if (tx.type === 'transfer' && tx.transferDetails?.toAccountId) {
                accountIds.add(tx.transferDetails.toAccountId);
            }
        }
        
        for (const accountId of accountIds) {
            await accountService.recalculateAccountBalance(accountId);
        }
        
        // Clear balance projection cache for affected accounts
        if (accountIds.size > 0) {
            balanceProjectionService.clearCacheForAccounts(Array.from(accountIds));
        }
        
        return groupId;
    }

    /**
     * Update a transaction group
     */
    async updateTransactionGroup(
        groupId: string,
        updates: {
            sharedFields?: Partial<Pick<Transaction, 
                'type' | 'status' | 'currency' | 'categoryId' | 'plannedDate' | 'clearedDate' | 'recurrenceRule' | 'parentRecurrenceId' |
                'reference' | 'notes' | 'importSource' | 'toAccountId' | 'groupName'
            >>;
            individualUpdates?: Array<{
                id: string;
                amount?: number;
                description?: string;
                accountId?: string;
            }>;
        }
    ): Promise<void> {
        await db.updateTransactionGroup(groupId, updates);
        
        // Update account balances for affected accounts
        const accountIds = new Set<string>();
        
        // Get existing transactions to check for transfers
        const existingTransactions = await db.getGroupTransactions(groupId);
        for (const tx of existingTransactions) {
            if (tx.accountId) {
                accountIds.add(tx.accountId);
            }
            if (tx.type === 'transfer' && tx.transferDetails?.toAccountId) {
                accountIds.add(tx.transferDetails.toAccountId);
            }
        }
        
        if (updates.individualUpdates) {
            for (const update of updates.individualUpdates) {
                if (update.accountId) {
                    accountIds.add(update.accountId);
                }
            }
        }
        
        for (const accountId of accountIds) {
            await accountService.recalculateAccountBalance(accountId);
        }
        
        // Clear balance projection cache for affected accounts
        if (accountIds.size > 0) {
            balanceProjectionService.clearCacheForAccounts(Array.from(accountIds));
        }
    }

    /**
     * Delete a transaction group
     */
    async deleteTransactionGroup(groupId: string): Promise<void> {
        const transactions = await db.getGroupTransactions(groupId);
        const accountIds = new Set(transactions.map(tx => tx.accountId));
        
        // Also include transfer destinations
        for (const tx of transactions) {
            if (tx.type === 'transfer' && tx.transferDetails?.toAccountId) {
                accountIds.add(tx.transferDetails.toAccountId);
            }
        }
        
        await db.deleteTransactionGroup(groupId);
        
        // Update account balances for affected accounts (filter out null accountIds)
        const validAccountIds = Array.from(accountIds).filter((id): id is string => id !== undefined && id !== null);
        for (const accountId of validAccountIds) {
            await accountService.recalculateAccountBalance(accountId);
        }
        
        // Clear balance projection cache for affected accounts
        if (validAccountIds.length > 0) {
            balanceProjectionService.clearCacheForAccounts(validAccountIds);
        }
    }

    /**
     * Get transactions in a group
     */
    async getGroupTransactions(groupId: string): Promise<Transaction[]> {
        return await db.getGroupTransactions(groupId);
    }

    /**
     * Add transaction to group
     */
    async addTransactionToGroup(transactionId: string, groupId: string): Promise<void> {
        await db.addTransactionToGroup(transactionId, groupId);
        
        const transaction = await db.transactions.get(transactionId);
        const affectedAccountIds: string[] = [];
        if (transaction) {
            if (transaction.accountId) {
                await accountService.recalculateAccountBalance(transaction.accountId);
                affectedAccountIds.push(transaction.accountId);
            }
            // Handle transfers
            if (transaction.type === 'transfer' && transaction.transferDetails?.toAccountId) {
                const toAccountId = transaction.transferDetails.toAccountId;
                if (!affectedAccountIds.includes(toAccountId)) {
                    await accountService.recalculateAccountBalance(toAccountId);
                    affectedAccountIds.push(toAccountId);
                }
            }
        }
        
        // Clear balance projection cache for affected accounts
        if (affectedAccountIds.length > 0) {
            balanceProjectionService.clearCacheForAccounts(affectedAccountIds);
        }
    }

    /**
     * Remove transaction from group
     */
    async removeTransactionFromGroup(transactionId: string): Promise<void> {
        const transaction = await db.transactions.get(transactionId);
        if (transaction) {
            await db.removeTransactionFromGroup(transactionId);
            const affectedAccountIds: string[] = [];
            if (transaction.accountId) {
                await accountService.recalculateAccountBalance(transaction.accountId);
                affectedAccountIds.push(transaction.accountId);
            }
            // Handle transfers
            if (transaction.type === 'transfer' && transaction.transferDetails?.toAccountId) {
                const toAccountId = transaction.transferDetails.toAccountId;
                if (!affectedAccountIds.includes(toAccountId)) {
                    await accountService.recalculateAccountBalance(toAccountId);
                    affectedAccountIds.push(toAccountId);
                }
            }
            
            // Clear balance projection cache for affected accounts
            if (affectedAccountIds.length > 0) {
                balanceProjectionService.clearCacheForAccounts(affectedAccountIds);
            }
        }
    }

    // ============================================================================
    // TRANSFER MANAGEMENT
    // ============================================================================

    /**
     * Create a transfer between accounts
     */
    async createTransfer(data: {
        fromAccountId: string;
        toAccountId: string;
        amount: number;
        currency: string;
        description?: string;
        categoryId?: string;
        feeAmount?: number;
        feeCategoryId?: string;
    }): Promise<{ fromTransaction: Transaction; toTransaction: Transaction }> {
        const transferId = generateUUID();
        
        // Create from transaction (negative amount)
        const fromTransaction = await this.createTransaction({
            type: 'transfer',
            status: 'cleared',
            accountId: data.fromAccountId,
            amount: -data.amount,
            currency: data.currency,
            description: data.description || `Transfer to ${data.toAccountId}`,
            categoryId: data.categoryId,
            groupId: transferId,
            groupName: 'Transfer',
            transferDetails: {
                toAccountId: data.toAccountId,
                transferAmount: data.amount,
                feeAmount: data.feeAmount || 0,
                feeCategoryId: data.feeCategoryId
            },
            clearedDate: new Date().toISOString()
        });

        // Create to transaction (positive amount)
        const toTransaction = await this.createTransaction({
            type: 'transfer',
            status: 'cleared',
            accountId: data.toAccountId,
            amount: data.amount,
            currency: data.currency,
            description: data.description || `Transfer from ${data.fromAccountId}`,
            categoryId: data.categoryId,
            groupId: transferId,
            groupName: 'Transfer',
            transferDetails: {
                toAccountId: data.fromAccountId,
                transferAmount: data.amount,
                feeAmount: data.feeAmount || 0,
                feeCategoryId: data.feeCategoryId
            },
            clearedDate: new Date().toISOString()
        });

        return { fromTransaction, toTransaction };
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Get transaction statistics (converted to main currency).
     * Resolves currency from account when transaction.currency is missing.
     */
    async getTransactionStatistics(): Promise<{
        totalTransactions: number;
        totalIncome: number;
        totalExpenses: number;
        totalTransfers: number;
        averageTransactionAmount: number;
    }> {
        const [transactions, accounts] = await Promise.all([db.transactions.toArray(), db.getActiveAccounts()]);
        const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));
        const { userService, exchangeRateService } = await import('$lib/core/services');
        const preferences = await userService.getUserPreferences();
        const mainCurrency = preferences?.currency || 'USD';
        const stats = { totalTransactions: transactions.length, totalIncome: 0, totalExpenses: 0, totalTransfers: 0, averageTransactionAmount: 0 };
        let totalAmount = 0;

        for (const t of transactions) {
            const currency = t.currency || accountMap[t.accountId || '']?.currency || mainCurrency;
            const amount = t.amount || 0;
            const dateStr = t.clearedDate || t.plannedDate || t.createdAt;
            let convertedAmount = amount;
            if (currency !== mainCurrency && dateStr) {
                const converted = await exchangeRateService.convertAmount(amount, currency, mainCurrency, dateStr ? new Date(dateStr) : undefined);
                if (converted != null) convertedAmount = converted;
            }
            totalAmount += Math.abs(convertedAmount);
            if (t.type === 'income') stats.totalIncome += convertedAmount;
            else if (t.type === 'expense') stats.totalExpenses += convertedAmount;
            else if (t.type === 'transfer') stats.totalTransfers += Math.abs(convertedAmount);
        }
        stats.averageTransactionAmount = stats.totalTransactions > 0 ? totalAmount / stats.totalTransactions : 0;
        return stats;
    }

    /**
     * Get income/expenses/net for a list of transactions, converted to main currency.
     * Used by the transactions page for filtered summary and per-date-group totals.
     * @param accountMap - Map of accountId -> { currency } to resolve currency when t.currency is missing
     */
    async getTransactionStatisticsForTransactions(
        transactions: Array<{ type?: string; amount?: number; totalAmount?: number; isGroup?: boolean; accountId?: string; currency?: string; clearedDate?: string; plannedDate?: string; createdAt?: string; transferDetails?: unknown }>,
        accountMap: Record<string, { currency?: string }>,
        mainCurrency: string
    ): Promise<{ income: number; expenses: number; net: number }> {
        const { exchangeRateService } = await import('$lib/core/services');
        let income = 0, expenses = 0, net = 0;

        // Check if we have any exchange rates at all (to avoid spam logging)
        const hasAnyRates = await db.exchangeRates.filter(r => !r.deletedAt).count() > 0;
        let warnedAboutMissingRates = false;

        for (const t of transactions) {
            const amount = t.isGroup ? (t.totalAmount ?? 0) : (t.amount ?? 0);
            const currency = t.currency || accountMap[t.accountId || '']?.currency || mainCurrency;
            const dateStr = t.clearedDate || t.plannedDate || t.createdAt;
            let convertedAmount = amount;
            if (currency !== mainCurrency && dateStr) {
                const c = await exchangeRateService.convertAmount(amount, currency, mainCurrency, new Date(dateStr));
                if (c != null) {
                    convertedAmount = c;
                } else if (!warnedAboutMissingRates) {
                    // Only warn once per batch to avoid spam
                    if (!hasAnyRates) {
                        console.warn(`Exchange rates not found. Please go to Settings > Currency and click "Update from API" to fetch rates.`);
                    } else {
                        console.warn(`Exchange rate not found for ${currency}->${mainCurrency}. Using original amount.`);
                    }
                    warnedAboutMissingRates = true;
                }
            }
            const txForImpact = { ...t, amount };
            const impact = calculateTransactionImpact(txForImpact as Transaction, t.accountId);
            let convertedImpact = impact;
            if (currency !== mainCurrency && dateStr) {
                const c = await exchangeRateService.convertAmount(impact, currency, mainCurrency, new Date(dateStr));
                if (c != null) {
                    convertedImpact = c;
                }
                // Don't warn again for impact conversion
            }
            if (t.type === 'income') income += convertedAmount;
            else if (t.type === 'expense') expenses -= convertedAmount; // Store expenses as negative
            // Note: We still calculate impact for potential future use, but net is now income + expenses
        }
        // Net is simply the sum of income and expenses (where expenses is negative)
        net = income + expenses;
        return { income, expenses, net };
    }

    /**
     * Get transactions by type
     */
    async getTransactionsByType(type: Transaction['type']): Promise<Transaction[]> {
        return await db.transactions.where('type').equals(type).toArray();
    }

    /**
     * Search transactions
     */
    async searchTransactions(query: string): Promise<Transaction[]> {
        const transactions = await db.transactions.toArray();
        const lowerQuery = query.toLowerCase();
        
        return transactions.filter((transaction: Transaction) => 
            transaction.description?.toLowerCase().includes(lowerQuery) ||
            transaction.reference?.toLowerCase().includes(lowerQuery) ||
            transaction.notes?.toLowerCase().includes(lowerQuery)
        );
    }
}

export const transactionService = new TransactionService();