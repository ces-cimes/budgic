import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CSVFile } from './types';
import type { Currency, Transaction } from '$lib/core/db';

const hoisted = vi.hoisted(() => {
	const accountsById = new Map<
		string,
		{ id: string; currency: string; type?: string; name?: string }
	>();
	let uuidN = 0;
	return { accountsById, uuidN };
});

const eurCurrency: Currency = {
	id: 'cur-eur',
	code: 'EUR',
	name: 'Euro',
	symbol: '€',
	isSystem: true,
	isActive: true,
	createdAt: '2020-01-01',
	updatedAt: '2020-01-01',
	deletedAt: null
};

const usdCurrency: Currency = {
	id: 'cur-usd',
	code: 'USD',
	name: 'US Dollar',
	symbol: '$',
	isSystem: true,
	isActive: true,
	createdAt: '2020-01-01',
	updatedAt: '2020-01-01',
	deletedAt: null
};

const storedTransactions = new Map<string, Transaction>();

const createTransaction = vi.fn(async (tx: Transaction) => {
	storedTransactions.set(tx.id, tx);
});

vi.mock('$lib/core/db', () => ({
	generateUUID: vi.fn(() => {
		hoisted.uuidN += 1;
		return `uuid-${hoisted.uuidN}`;
	}),
	db: {
		getActiveAccounts: vi.fn(async () => []),
		getActiveCategories: vi.fn(async () => []),
		getActiveCurrencies: vi.fn(async () => [usdCurrency, eurCurrency]),
		getCurrencyByCode: vi.fn(async (code: string) => {
			if (code === 'EUR') return eurCurrency;
			if (code === 'USD') return usdCurrency;
			return null;
		}),
		currencies: {
			get: vi.fn(async (id: string) =>
				id === 'cur-eur' ? eurCurrency : id === 'cur-usd' ? usdCurrency : undefined
			),
			add: vi.fn(async () => {})
		},
		accounts: {
			add: vi.fn(async (acc: { id: string; currency: string; type?: string; name?: string }) => {
				hoisted.accountsById.set(acc.id, acc);
			}),
			get: vi.fn(async (id: string) => hoisted.accountsById.get(id) ?? undefined)
		},
		categories: {
			add: vi.fn(async () => {})
		},
		transactions: {
			where: vi.fn(() => ({
				equals: () => ({
					filter: () => ({
						toArray: vi.fn(async () => [])
					})
				})
			})),
			filter: vi.fn(() => ({
				toArray: vi.fn(async () => [])
			})),
			get: vi.fn(async (id: string) => storedTransactions.get(id) ?? undefined),
			update: vi.fn(async () => {})
		},
		reconciliationRecords: {
			add: vi.fn(async () => {})
		}
	}
}));

vi.mock('../core/transaction-service', () => ({
	transactionService: {
		createTransaction: (...args: unknown[]) => createTransaction(args[0] as Transaction),
		updateTransaction: vi.fn()
	}
}));

vi.mock('../core/account-service', () => ({
	accountService: {
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
	mergeDailyMicroInterestTransactions: vi.fn(async () => ({ removedIds: [], touchedAccountIds: [] })),
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

vi.mock('./base-importer', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./base-importer')>();
	return {
		...actual,
		detectPassiveBalanceImportHints: vi.fn(() => [])
	};
});

vi.mock('$lib/utils/category-utils', () => ({
	getOrCreateUncategorizedCategory: vi.fn(async () => ({ id: 'uncat-exp', name: 'Uncategorized' })),
	getOrCreateUncategorizedIncomeCategory: vi.fn(async () => ({ id: 'uncat-inc', name: 'Uncategorized income' }))
}));

import { MoneyManagerImporter } from './money-manager-importer';

function csv(name: string, headers: string[], rows: Record<string, string>[]): CSVFile {
	return { name, headers, rows, rowCount: rows.length };
}

describe('MoneyManagerImporter mmCurrencyUidToBudgicCurrencyId', () => {
	beforeEach(() => {
		storedTransactions.clear();
		hoisted.accountsById.clear();
		hoisted.uuidN = 0;
		vi.clearAllMocks();
	});

	it('uses preset Budgic currency id for unknown MM currencyUid on expense import', async () => {
		const files = new Map<string, CSVFile>([
			['CURRENCY', csv('CURRENCY', ['uid', 'ISO', 'IS_DEL'], [])],
			[
				'ASSETS',
				csv('ASSETS', ['uid', 'ID', 'NIC_NAME', 'currencyUid', 'ZDATA', 'A_UTIME', 'IS_DEL'], [
					{
						uid: 'acc-mm-1',
						ID: 'acc-mm-1',
						NIC_NAME: 'Cash',
						currencyUid: 'WEIRD_MM_UID',
						ZDATA: '1',
						A_UTIME: '1609459200000',
						IS_DEL: '0'
					}
				])
			],
			[
				'ZCATEGORY',
				csv('ZCATEGORY', ['uid', 'ID', 'NAME', 'TYPE', 'STATUS', 'C_UTIME', 'C_IS_DEL', 'ORDERSEQ'], [
					{
						uid: 'ctg-mm-1',
						ID: 'ctg-mm-1',
						NAME: 'Food',
						TYPE: '1',
						STATUS: '0',
						C_UTIME: '1609459200000',
						C_IS_DEL: '0',
						ORDERSEQ: '1'
					}
				])
			],
			[
				'INOUTCOME',
				csv(
					'INOUTCOME',
					[
						'uid',
						'ID',
						'DO_TYPE',
						'IS_DEL',
						'assetUid',
						'ctgUid',
						'currencyUid',
						'IN_ZMONEY',
						'ZMONEY',
						'ZDATE',
						'UTIME',
						'WDATE',
						'ZCONTENT'
					],
					[
						{
							uid: 'tx-mm-1',
							ID: 'tx-mm-1',
							DO_TYPE: '1',
							IS_DEL: '0',
							assetUid: 'acc-mm-1',
							ctgUid: 'ctg-mm-1',
							currencyUid: 'WEIRD_MM_UID',
							IN_ZMONEY: '-12.50',
							ZMONEY: '-12.50',
							ZDATE: '1609459200000',
							UTIME: '1609459200000',
							WDATE: '',
							ZCONTENT: 'Coffee'
						}
					]
				)
			]
		]);

		const importer = new MoneyManagerImporter({
			importCurrencies: true,
			importAccounts: true,
			importCategories: true,
			importTransactions: true,
			importBudgets: false,
			mmCurrencyUidToBudgicCurrencyId: { WEIRD_MM_UID: 'cur-eur' }
		});

		const result = await importer.import(files);
		expect(result.success).toBe(true);
		expect(createTransaction).toHaveBeenCalled();
		const arg = createTransaction.mock.calls[0]?.[0];
		expect(arg?.currency).toBe('EUR');
		expect(arg?.importQuality?.currencyFallback).toBeFalsy();
	});
});

describe('MoneyManagerImporter mmAccountUidToBudgicType', () => {
	beforeEach(() => {
		storedTransactions.clear();
		hoisted.accountsById.clear();
		hoisted.uuidN = 0;
		vi.clearAllMocks();
	});

	it('uses pre-import type override despite ZDATA checking code', async () => {
		const files = new Map<string, CSVFile>([
			['CURRENCY', csv('CURRENCY', ['uid', 'ISO', 'IS_DEL'], [])],
			[
				'ASSETS',
				csv('ASSETS', ['uid', 'ID', 'NIC_NAME', 'currencyUid', 'ZDATA', 'A_UTIME', 'IS_DEL'], [
					{
						uid: 'acc-mm-1',
						ID: 'acc-mm-1',
						NIC_NAME: 'Main',
						currencyUid: 'USD_USD',
						ZDATA: '1',
						A_UTIME: '1609459200000',
						IS_DEL: '0'
					}
				])
			],
			['ZCATEGORY', csv('ZCATEGORY', ['uid', 'NAME', 'TYPE', 'C_IS_DEL'], [])],
			['INOUTCOME', csv('INOUTCOME', ['uid', 'IS_DEL'], [])]
		]);

		const importer = new MoneyManagerImporter({
			importCurrencies: true,
			importAccounts: true,
			importCategories: false,
			importTransactions: false,
			mmAccountUidToBudgicType: { 'acc-mm-1': 'savings' }
		});

		const result = await importer.import(files);
		expect(result.success).toBe(true);
		const account = [...hoisted.accountsById.values()][0];
		expect(account?.type).toBe('savings');
	});
});
