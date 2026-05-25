import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CSVFile } from './types';
import type { Currency, Transaction } from '$lib/core/db';

const hoisted = vi.hoisted(() => {
	const accountsById = new Map<string, Record<string, unknown>>();
	const transactionsById = new Map<string, Transaction>();
	const peopleById = new Map<string, Record<string, unknown>>();
	let uuidN = 0;

	const resolvePersonForLedgerAccount = vi.fn(
		async (
			account: { name: string },
			externalKeys?: Array<{ source: string; entity: string; key: string }>
		) => ({
			id: 'person-1',
			displayName: account.name,
			aliases: [],
			externalKeys: externalKeys ?? [],
			createdAt: '2020-01-01T00:00:00.000Z',
			updatedAt: '2020-01-01T00:00:00.000Z',
			deletedAt: null
		})
	);
	const updatePerson = vi.fn(async (id: string, patch: Record<string, unknown>) => {
		const current = peopleById.get(id) ?? { id };
		const next = { ...current, ...patch };
		peopleById.set(id, next);
		return next;
	});
	const linkReimbursementPerson = vi.fn(
		(entry: Record<string, unknown>, person: { id: string; displayName: string }) => ({
			...entry,
			personId: person.id,
			person: person.displayName
		})
	);
	const resolveImportedPersonLedgerTarget = vi.fn();

	return {
		accountsById,
		transactionsById,
		peopleById,
		uuidN,
		resolvePersonForLedgerAccount,
		updatePerson,
		linkReimbursementPerson,
		resolveImportedPersonLedgerTarget
	};
});

const usdCurrency: Currency = {
	id: 'cur-usd',
	code: 'USD',
	name: 'US Dollar',
	symbol: '$',
	placement: 'before',
	decimalPlaces: 2,
	isSystem: true,
	isActive: true,
	createdAt: '2020-01-01T00:00:00.000Z',
	updatedAt: '2020-01-01T00:00:00.000Z',
	deletedAt: null
};

vi.mock('$lib/core/db', () => ({
	generateUUID: vi.fn(() => {
		hoisted.uuidN += 1;
		return `uuid-${hoisted.uuidN}`;
	}),
	db: {
		getActiveAccounts: vi.fn(async () =>
			Array.from(hoisted.accountsById.values()).filter(
				(acc) => acc.deletedAt == null && acc.isActive !== false
			)
		),
		getActiveCategories: vi.fn(async () => []),
		getActiveCurrencies: vi.fn(async () => [usdCurrency]),
		getCurrencyByCode: vi.fn(async (code: string) => (code === 'USD' ? usdCurrency : null)),
		currencies: {
			get: vi.fn(async (id: string) => (id === 'cur-usd' ? usdCurrency : undefined)),
			add: vi.fn(async () => {})
		},
		accounts: {
			add: vi.fn(async (acc: Record<string, unknown>) => {
				hoisted.accountsById.set(String(acc.id), { ...acc });
			}),
			update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
				const cur = hoisted.accountsById.get(id);
				if (cur) hoisted.accountsById.set(id, { ...cur, ...patch });
			}),
			get: vi.fn(async (id: string) => hoisted.accountsById.get(id)),
			toArray: vi.fn(async () => Array.from(hoisted.accountsById.values()))
		},
		categories: { add: vi.fn(async () => {}) },
		transactions: {
			get: vi.fn(async (id: string) => hoisted.transactionsById.get(id)),
			update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
				const current = hoisted.transactionsById.get(id);
				if (!current) return;
				hoisted.transactionsById.set(id, { ...current, ...patch } as Transaction);
			}),
			add: vi.fn(async (tx: Transaction) => {
				hoisted.transactionsById.set(tx.id, tx);
			}),
			where: vi.fn((field: string) => ({
				equals: (value: string) => ({
					filter: (predicate: (tx: Transaction) => boolean) => ({
						toArray: vi.fn(async () =>
							Array.from(hoisted.transactionsById.values()).filter(
								(tx) => (tx as unknown as Record<string, unknown>)[field] === value && predicate(tx)
							)
						)
					})
				})
			})),
			filter: vi.fn((predicate: (tx: Transaction) => boolean) => ({
				toArray: vi.fn(async () =>
					Array.from(hoisted.transactionsById.values()).filter((tx) => predicate(tx))
				)
			}))
		},
		reconciliationRecords: { add: vi.fn(async () => {}) }
	}
}));

vi.mock('../person-ledger/person-service', () => ({
	personService: {
		resolvePersonForLedgerAccount: hoisted.resolvePersonForLedgerAccount,
		updatePerson: hoisted.updatePerson,
		linkReimbursementPerson: hoisted.linkReimbursementPerson
	}
}));

vi.mock('../person-ledger/import-routing', () => ({
	resolveImportedPersonLedgerTarget: hoisted.resolveImportedPersonLedgerTarget
}));

vi.mock('../core/transaction-service', () => ({
	transactionService: {
		createTransaction: vi.fn(async (tx: Transaction) => {
			hoisted.transactionsById.set(tx.id, tx);
			return tx;
		}),
		updateTransaction: vi.fn(async (id: string, patch: Record<string, unknown>) => {
			const current = hoisted.transactionsById.get(id);
			if (!current) throw new Error(`Missing transaction ${id}`);
			const next = { ...current, ...patch, updatedAt: '2020-01-03T00:00:00.000Z' } as Transaction;
			hoisted.transactionsById.set(id, next);
			return next;
		})
	}
}));

vi.mock('../core/account-service', () => ({
	accountService: {
		getAccounts: vi.fn(async () =>
			Array.from(hoisted.accountsById.values()).filter(
				(acc) => acc.deletedAt == null && acc.isActive !== false
			)
		),
		getAccount: vi.fn(async (id: string) => hoisted.accountsById.get(id) ?? null),
		getWalletAccounts: vi.fn(async () =>
			Array.from(hoisted.accountsById.values()).filter(
				(acc) =>
					acc.deletedAt == null &&
					acc.isActive !== false &&
					(acc.ledgerRole == null || acc.ledgerRole === 'wallet')
			)
		),
		recalculateAccountBalance: vi.fn(async () => {})
	}
}));

vi.mock('../intelligence/automation-detector', () => ({
	automationDetector: {
		detect: vi.fn(async () => []),
		summarize: vi.fn(() => ({
			roundUpCount: 0,
			roundUpAmount: 0,
			interestCount: 0,
			interestAmount: 0,
			reconciliationAdjustmentCount: 0
		}))
	}
}));

vi.mock('../intelligence/interest-daily-merge', () => ({
	mergeDailyMicroInterestTransactions: vi.fn(async () => ({
		removedIds: [],
		touchedAccountIds: []
	})),
	recalculateBalancesForAccounts: vi.fn(async () => {})
}));

vi.mock('../intelligence/essential-detector', () => ({
	detectEssentials: vi.fn(() => [])
}));

vi.mock('../intelligence/essential-candidate-similarity', () => ({
	expandEssentialCandidatesWithSimilarity: vi.fn(<T>(c: T[]) => c)
}));

vi.mock('../intelligence/import-pattern-hints', () => ({
	buildUnclassifiedPatternHints: vi.fn(() => [])
}));

vi.mock('$lib/utils/category-utils', () => ({
	getOrCreateUncategorizedCategory: vi.fn(async () => ({ id: 'cat-uncategorized-expense' })),
	getOrCreateUncategorizedIncomeCategory: vi.fn(async () => ({ id: 'cat-uncategorized-income' }))
}));

vi.mock('./base-importer', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./base-importer')>();
	return { ...actual, detectPassiveBalanceImportHints: vi.fn(() => []) };
});

import { MoneyManagerImporter } from './money-manager-importer';

function csv(name: string, headers: string[], rows: Record<string, string>[]): CSVFile {
	return { name, headers, rows, rowCount: rows.length };
}

function seedAnchorAccount(id: string = 'anchor-1') {
	hoisted.accountsById.set(id, {
		id,
		name: 'Main Checking',
		type: 'checking',
		currency: 'USD',
		initialBalance: 0,
		currentBalance: 0,
		isActive: true,
		ledgerRole: 'wallet',
		createdAt: '2020-01-01T00:00:00.000Z',
		updatedAt: '2020-01-01T00:00:00.000Z',
		deletedAt: null
	});
}

function buildFiles(includeExpenseRow: boolean = false): Map<string, CSVFile> {
	return new Map<string, CSVFile>([
		['CURRENCY', csv('CURRENCY', ['uid', 'ISO', 'IS_DEL'], [])],
		[
			'ASSETS',
			csv(
				'ASSETS',
				['uid', 'ID', 'NIC_NAME', 'currencyUid', 'ZDATA', 'A_UTIME', 'IS_DEL'],
				[
					{
						uid: 'mm-alice',
						ID: 'mm-alice',
						NIC_NAME: 'Alice',
						currencyUid: 'USD_USD',
						ZDATA: '1',
						A_UTIME: '1609459200000',
						IS_DEL: '0'
					}
				]
			)
		],
		['ZCATEGORY', csv('ZCATEGORY', ['uid', 'NAME', 'TYPE', 'C_IS_DEL'], [])],
		[
			'INOUTCOME',
			csv(
				'INOUTCOME',
				[
					'uid',
					'ID',
					'assetUid',
					'ctgUid',
					'currencyUid',
					'IN_ZMONEY',
					'DO_TYPE',
					'ZDATE',
					'UTIME',
					'IS_DEL',
					'ZCONTENT'
				],
				includeExpenseRow
					? [
							{
								uid: 'tx-1',
								ID: 'tx-1',
								assetUid: 'mm-alice',
								ctgUid: 'null',
								currencyUid: 'USD_USD',
								IN_ZMONEY: '-25',
								DO_TYPE: '1',
								ZDATE: '1609459200000',
								UTIME: '1609459200000',
								IS_DEL: '0',
								ZCONTENT: 'Dinner'
							}
						]
					: []
			)
		]
	]);
}

describe('MoneyManagerImporter person-ledger routing', () => {
	beforeEach(() => {
		hoisted.accountsById.clear();
		hoisted.transactionsById.clear();
		hoisted.peopleById.clear();
		hoisted.uuidN = 0;
		vi.clearAllMocks();
	});

	it('falls back to temporary person wallet and close queue when direct route is off', async () => {
		hoisted.resolveImportedPersonLedgerTarget.mockResolvedValue({
			person: {
				id: 'person-1',
				displayName: 'Alice',
				aliases: [],
				externalKeys: [{ source: 'money-manager', entity: 'account', key: 'mm-alice' }],
				createdAt: '2020-01-01T00:00:00.000Z',
				updatedAt: '2020-01-01T00:00:00.000Z',
				deletedAt: null
			},
			externalKeys: [{ source: 'money-manager', entity: 'account', key: 'mm-alice' }],
			activeLedgerAccount: null,
			archivedLedgerAccount: null,
			anchorAccountId: 'anchor-1'
		});

		const importer = new MoneyManagerImporter({
			importCurrencies: true,
			importAccounts: true,
			importCategories: false,
			importTransactions: false,
			externalAccountMarkedAsPersonLedger: { 'mm-alice': true }
		});

		const result = await importer.import(buildFiles(false));
		expect(result.success).toBe(true);

		const importedAccount = Array.from(hoisted.accountsById.values()).find(
			(account) => account.name === 'Alice'
		);
		expect(importedAccount?.ledgerRole).toBe('person');
		expect(importedAccount?.personId).toBe('person-1');
		expect(result.importBatch?.personLedgerDirectRoute).toBeUndefined();
		expect(result.importBatch?.personLedgerCloseQueue).toHaveLength(1);
		expect(result.importBatch?.personAccountPreFlaggedNames).toEqual(['Alice']);
	});

	it('direct-routes opted-in person ledgers to anchor transactions with reimbursements', async () => {
		seedAnchorAccount();
		hoisted.resolveImportedPersonLedgerTarget.mockResolvedValue({
			person: {
				id: 'person-1',
				displayName: 'Alice',
				aliases: [],
				externalKeys: [{ source: 'money-manager', entity: 'account', key: 'mm-alice' }],
				createdAt: '2020-01-01T00:00:00.000Z',
				updatedAt: '2020-01-01T00:00:00.000Z',
				deletedAt: null
			},
			externalKeys: [{ source: 'money-manager', entity: 'account', key: 'mm-alice' }],
			activeLedgerAccount: null,
			archivedLedgerAccount: null,
			anchorAccountId: 'anchor-1'
		});

		const importer = new MoneyManagerImporter({
			importCurrencies: true,
			importAccounts: true,
			importCategories: false,
			importTransactions: true,
			externalAccountMarkedAsPersonLedger: { 'mm-alice': true },
			externalAccountMarkedAsPersonLedgerDirectRoute: { 'mm-alice': true }
		});

		const result = await importer.import(buildFiles(true));
		expect(result.success).toBe(true);

		const createdLedgerAccounts = Array.from(hoisted.accountsById.values()).filter(
			(account) => account.ledgerRole === 'person'
		);
		expect(createdLedgerAccounts).toHaveLength(0);

		const tx = Array.from(hoisted.transactionsById.values())[0];
		expect(tx.accountId).toBe('anchor-1');
		expect(tx.type).toBe('expense');
		expect(tx.reimbursements?.[0]).toMatchObject({
			personId: 'person-1',
			person: 'Alice',
			status: 'expecting',
			amount: 25
		});
		expect(result.importBatch?.personLedgerDirectRoute).toHaveLength(1);
		expect(result.importBatch?.personLedgerCloseQueue).toBeUndefined();
		expect(hoisted.updatePerson).toHaveBeenCalledWith('person-1', {
			preferredAnchorAccountId: 'anchor-1'
		});
	});

	it('re-imports archived person ledgers through direct route without recreating a live wallet', async () => {
		seedAnchorAccount();
		hoisted.resolveImportedPersonLedgerTarget.mockImplementation(async (_params: unknown) => ({
			person: {
				id: 'person-archived',
				displayName: 'Alice',
				aliases: [],
				externalKeys: [{ source: 'money-manager', entity: 'account', key: 'mm-alice' }],
				preferredAnchorAccountId: 'anchor-1',
				createdAt: '2020-01-01T00:00:00.000Z',
				updatedAt: '2020-01-01T00:00:00.000Z',
				deletedAt: null
			},
			externalKeys: [{ source: 'money-manager', entity: 'account', key: 'mm-alice' }],
			activeLedgerAccount: null,
			archivedLedgerAccount: {
				id: 'archived-ledger',
				name: 'Alice',
				type: 'checking',
				currency: 'USD',
				initialBalance: 0,
				currentBalance: 0,
				isActive: false,
				ledgerRole: 'archived_person',
				personId: 'person-archived',
				createdAt: '2020-01-01T00:00:00.000Z',
				updatedAt: '2020-01-02T00:00:00.000Z',
				deletedAt: null
			},
			anchorAccountId: 'anchor-1'
		}));

		const importer = new MoneyManagerImporter({
			importCurrencies: true,
			importAccounts: true,
			importCategories: false,
			importTransactions: true
		});

		const result = await importer.import(buildFiles(true));
		expect(result.success).toBe(true);

		expect(hoisted.resolveImportedPersonLedgerTarget).toHaveBeenCalledWith({
			accountName: 'Alice',
			externalKeys: [{ source: 'money-manager', entity: 'account', key: 'mm-alice' }],
			ensurePerson: false
		});
		expect(
			Array.from(hoisted.accountsById.values()).filter((account) => account.ledgerRole === 'person')
		).toHaveLength(0);
		expect(result.importBatch?.personLedgerDirectRoute).toHaveLength(1);
		expect(result.importBatch?.personLedgerCloseQueue).toBeUndefined();
		expect(Array.from(hoisted.transactionsById.values())[0]?.accountId).toBe('anchor-1');
	});
});
