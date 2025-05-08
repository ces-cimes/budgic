import { persistentStore } from './persistence.svelte';
import { createAccount, createTransaction } from './types';
import type { Account, Transaction } from './types';

export const accounts = persistentStore<Account[]>(
    'accounts',
    [
        createAccount({ 
            name: 'Checking', 
            type: 'debit', 
            currentBalance: 1000 
        }),
        createAccount({ 
            name: 'Savings', 
            type: 'savings', 
            currentBalance: 5000 
        })
    ]
);

export const transactions = persistentStore<Transaction[]>(
    'transactions',
    accounts.value.length > 0 ? [
        createTransaction({
            accountId: accounts.value[0].id,
            type: 'expense',
            category: 'Groceries',
            plannedAmount: 100
        })
    ] : []
);