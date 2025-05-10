import { persistentStore } from './persistence.svelte';
import { createAccount, createTransaction } from './types';
import type { Account, Transaction } from './types';

export const accounts = persistentStore<Account[], 'id'>(
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
	],
	{
		isCollection: true,
		idKey: 'id'
	}
);

export const transactions = persistentStore<Transaction[], 'id'>(
	'transactions',
	accounts.value.length > 0 ? [
		createTransaction({
			accountId: accounts.value[0].id,
			type: 'expense',
			category: 'Groceries',
			plannedAmount: 100,
			isCompleted: true
		}),
		createTransaction({
			accountId: accounts.value[1].id,
			type: 'income',
			category: 'Paycheck',
			actualAmount: 300,
			isCompleted: true
		}),
		createTransaction({
			accountId: accounts.value[0].id,
			type: 'expense',
			category: 'Cinema',
			plannedAmount: 20,
			isCompleted: true
		}),
		createTransaction({
			accountId: accounts.value[0].id,
			type: 'expense',
			category: 'Cinema',
			plannedAmount: 20,
			date: "2025-10-01T00:00Z"
		})
	] : [],
	{
		isCollection: true,
		idKey: 'id'
	}
);