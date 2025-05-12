import { persistentStore } from '$lib/core/persistence.svelte';
import { createAccount, createTransaction, validateAccountArray, validateTransactionArray } from '../core/models/types';
import type { Account, Transaction } from '../core/models/types';

export const accounts = persistentStore<Account[], 'id'>(
	'accounts',
	[
		createAccount({ 
			name: 'Checking', 
			type: 'debit'
		}),
		createAccount({ 
			name: 'Savings', 
			type: 'savings'
		})
	],
	{
		isCollection: true,
		idKey: 'id',
		validate: validateAccountArray
	}
);

export const transactions = (() => {
	let _store: ReturnType<typeof persistentStore<Transaction[], 'id'>>;
	
	return {
		get() {
			if (!_store && accounts.value.length > 0) {
				_store = persistentStore<Transaction[], 'id'>(
					'transactions',
					[
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
					],
					{
						isCollection: true,
						idKey: 'id',
						validate: validateTransactionArray
					}
				);
			}
			return _store;
		}
	};
})();