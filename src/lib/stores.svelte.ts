import { accountService } from '$lib/core/services/account-service';
import { transactionService } from '$lib/core/services/transaction-service';

export type { Account, Transaction } from '$lib/core/models/types';

// Centralized store management
export const stores = {
    accounts: accountService,
    transactions: transactionService
};

// If you just need the arrays
export const getAccounts = () => accountService.accounts;
export const getTransactions = () => transactionService.getAllTransactions;
