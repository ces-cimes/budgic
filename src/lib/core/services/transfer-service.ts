import { db, generateUUID, validateTransfer } from '../db';
import { accountService } from './account-service';
import type { Transaction, WhatTagType } from '../db';

interface TransferOptions {
    feeAmount?: number;
    feeAccountId?: string;        // Default: source account
    feeCategoryId?: string;       // Budget category for fee
    feeWhatTag?: WhatTagType;     // What tag for fee (e.g., 'banking_fees')
    status?: Transaction['status'];
    currency?: string;
    whatTag?: WhatTagType;
    budgetCategoryId?: string;
    payeeId?: string;
    notes?: string;
    reference?: string;
    plannedDate?: string;
    clearedDate?: string;
}

/**
 * Transfer Service - Single Transaction Approach
 * 
 * Transfer: $100 from Checking to Savings with $2 fee
 * Single transaction with transferDetails containing all transfer info
 */
class TransferService {
    public get ready() {
        return db.isOpen();
    }

    public isLoading() {
        return !this.ready;
    }

    /**
     * Create a transfer using single transaction approach
     */
    async createTransfer(
        fromAccountId: string,
        toAccountId: string,
        transferAmount: number,
        description: string,
        options: TransferOptions = {}
    ): Promise<Transaction> {
        
        // Validate inputs
        if (transferAmount <= 0) {
            throw new Error('Transfer amount must be positive');
        }
        
        if (fromAccountId === toAccountId) {
            throw new Error('Cannot transfer to the same account');
        }
        
        // Get account information
        const fromAccount = await db.accounts.get(fromAccountId);
        const toAccount = await db.accounts.get(toAccountId);
        
        if (!fromAccount || !toAccount) {
            throw new Error('One or both accounts not found');
        }
        
        if (fromAccount.deletedAt || toAccount.deletedAt) {
            throw new Error('Cannot transfer to/from deleted accounts');
        }
        
        const currency = options.currency || 'USD';
        const status = options.status || 'cleared';
        const now = new Date().toISOString();
        const transactionDate = status === 'cleared' 
            ? (options.clearedDate || now)
            : (options.plannedDate || now);
        
        // Create transfer transaction (no amount field used!)
        const transferTransaction: Transaction = {
            id: generateUUID(),
            type: 'transfer',
            status,
            accountId: fromAccountId, // Source account
            amount: undefined, // Not used for transfers!
            currency,
            description: `Transfer to ${toAccount.name}: ${description}`,
            whatTag: options.whatTag || 'transfer' as WhatTagType,
            budgetCategoryId: options.budgetCategoryId || 'transfers',
            payeeId: options.payeeId,
            plannedDate: status === 'planned' ? transactionDate : undefined,
            clearedDate: status === 'cleared' ? transactionDate : undefined,
            toAccountId: toAccountId, // Legacy field for compatibility
            reference: options.reference,
            notes: options.notes,
            importSource: undefined,
            // Transfer details contain all transfer information
            transferDetails: {
                toAccountId,
                transferAmount,
                feeAmount: options.feeAmount || 0,
                feeAccountId: options.feeAccountId || fromAccountId,
                feeCategoryId: options.feeCategoryId,
                feeWhatTag: options.feeWhatTag
            },
            createdAt: now,
            updatedAt: now,
            deletedAt: null
        };
        
        // Validate the transfer
        const validation = validateTransfer(transferTransaction);
        if (!validation.isValid) {
            throw new Error(`Invalid transfer: ${validation.errors.join(', ')}`);
        }
        
        // Save the transaction
        await db.transactions.add(transferTransaction);
        
        // Invalidate balance cache for affected accounts
        accountService.clearBalanceCache(fromAccountId);
        accountService.clearBalanceCache(toAccountId);
        if (options.feeAccountId && options.feeAccountId !== fromAccountId) {
            accountService.clearBalanceCache(options.feeAccountId);
        }
        
        return transferTransaction;
    }

    /**
     * Update a transfer
     */
    async updateTransfer(
        transferId: string,
        updates: {
            transferAmount?: number;
            feeAmount?: number;
            feeAccountId?: string;
            feeCategoryId?: string;
            feeWhatTag?: WhatTagType;
            description?: string;
            status?: Transaction['status'];
            plannedDate?: string;
            clearedDate?: string;
        }
    ): Promise<void> {
        const transaction = await db.transactions.get(transferId);
        if (!transaction || transaction.type !== 'transfer') {
            throw new Error('Transfer not found');
        }
        
        if (!transaction.transferDetails) {
            throw new Error('Invalid transfer - missing transferDetails');
        }
        
        // Update transfer details
        const updatedTransferDetails = {
            ...transaction.transferDetails,
            ...(updates.transferAmount && { transferAmount: updates.transferAmount }),
            ...(updates.feeAmount !== undefined && { feeAmount: updates.feeAmount }),
            ...(updates.feeAccountId && { feeAccountId: updates.feeAccountId }),
            ...(updates.feeCategoryId && { feeCategoryId: updates.feeCategoryId }),
            ...(updates.feeWhatTag && { feeWhatTag: updates.feeWhatTag })
        };
        
        // Update the transaction
        const updatedTransaction: Transaction = {
            ...transaction,
            ...updates,
            transferDetails: updatedTransferDetails,
            updatedAt: new Date().toISOString()
        };
        
        // Validate the updated transfer
        const validation = validateTransfer(updatedTransaction);
        if (!validation.isValid) {
            throw new Error(`Invalid transfer: ${validation.errors.join(', ')}`);
        }
        
        await db.transactions.put(updatedTransaction);
        
        // Invalidate balance cache for affected accounts
        accountService.clearBalanceCache(transaction.accountId);
        accountService.clearBalanceCache(transaction.transferDetails.toAccountId);
        if (transaction.transferDetails.feeAccountId) {
            accountService.clearBalanceCache(transaction.transferDetails.feeAccountId);
        }
    }

    /**
     * Delete a transfer
     */
    async deleteTransfer(transferId: string): Promise<void> {
        const transaction = await db.transactions.get(transferId);
        if (!transaction || transaction.type !== 'transfer') {
            throw new Error('Transfer not found');
        }
        
        // Soft delete
        await db.transactions.update(transferId, {
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        
        // Invalidate balance cache for affected accounts
        if (transaction.transferDetails) {
            accountService.clearBalanceCache(transaction.accountId);
            accountService.clearBalanceCache(transaction.transferDetails.toAccountId);
            if (transaction.transferDetails.feeAccountId) {
                accountService.clearBalanceCache(transaction.transferDetails.feeAccountId);
            }
        }
    }

    /**
     * Get all transfers
     */
    async getTransfers(): Promise<Transaction[]> {
        const allTransactions = await db.getActiveTransactions();
        return allTransactions.filter(t => t.type === 'transfer' && t.transferDetails);
    }

    /**
     * Get transfers for a specific account
     */
    async getTransfersForAccount(accountId: string): Promise<Transaction[]> {
        const allTransfers = await this.getTransfers();
        return allTransfers.filter(t => 
            t.accountId === accountId || 
            (t.transferDetails && t.transferDetails.toAccountId === accountId) ||
            (t.transferDetails && t.transferDetails.feeAccountId === accountId)
        );
    }

    /**
     * Get transfer details
     */
    async getTransferDetails(transferId: string): Promise<{
        transaction: Transaction;
        fromAccountId: string;
        toAccountId: string;
        transferAmount: number;
        feeAmount: number;
    } | null> {
        const transaction = await db.transactions.get(transferId);
        if (!transaction || transaction.type !== 'transfer' || !transaction.transferDetails) {
            return null;
        }
        
        return {
            transaction,
            fromAccountId: transaction.accountId,
            toAccountId: transaction.transferDetails.toAccountId,
            transferAmount: transaction.transferDetails.transferAmount,
            feeAmount: transaction.transferDetails.feeAmount || 0
        };
    }
}

export const transferService = new TransferService();