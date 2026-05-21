import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CSVFile } from './types';
import type { Currency } from '$lib/core/db';

const hoisted = vi.hoisted(() => {
	const accountsById = new Map<
		string,
		{
			id: string;
			name: string;
			currency: string;
			type?: string;
			ledgerRole?: string;
			personId?: string;
		}
	>();
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
			createdAt: '2020-01-01',
			updatedAt: '2020-01-01',
			deletedAt: null
		})
	);
	return { accountsById, uuidN, resolvePersonForLedgerAccount };
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
	createdAt: '2020-01-01',
	updatedAt: '2020-01-01',
	deletedAt: null
};

vi.mock('$lib/core/db', () => ({
	generateUUID: vi.fn(() => {
		hoisted.uuidN += 1;
		return `uuid-${hoisted.uuidN}`;
	}),
	db: {
		getActiveAccounts: vi.fn(async () => []),
		getActiveCategories: vi.fn(async () => []),
		getActiveCurrencies: vi.fn(async () => [usdCurrency]),
		getCurrencyByCode: vi.fn(async (code: string) => (code === 'USD' ? usdCurrency : null)),
		currencies: {
			get: vi.fn(async (id: string) => (id === 'cur-usd' ? usdCurrency : undefined)),
			add: vi.fn(async () => {})
		},
		accounts: {
			add: vi.fn(
				async (acc: {
					id: string;
					name: string;
					currency: string;
					type?: string;
					ledgerRole?: string;
					personId?: string;
				}) => {
					hoisted.accountsById.set(acc.id, { ...acc });
				}
			),
			update: vi.fn(async (id: string, patch: { personId?: string }) => {
				const cur = hoisted.accountsById.get(id);
				if (cur) hoisted.accountsById.set(id, { ...cur, ...patch });
			}),
			get: vi.fn(async (id: string) => hoisted.accountsById.get(id) ?? undefined)
		},
		categories: { add: vi.fn(async () => {}) },
		transactions: {
			where: vi.fn(() => ({
				equals: () => ({
					filter: () => ({ toArray: vi.fn(async () => []) })
				})
			})),
			filter: vi.fn(() => ({ toArray: vi.fn(async () => []) }))
		},
		reconciliationRecords: { add: vi.fn(async () => {}) }
	}
}));

vi.mock('../person-ledger/person-service', () => ({
	personService: { resolvePersonForLedgerAccount: hoisted.resolvePersonForLedgerAccount }
}));

vi.mock('../core/transaction-service', () => ({
	transactionService: { createTransaction: vi.fn(), updateTransaction: vi.fn() }
}));

vi.mock('../core/account-service', () => ({
	accountService: { recalculateAccountBalance: vi.fn(async () => {}) }
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

vi.mock('./base-importer', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./base-importer')>();
	return { ...actual, detectPassiveBalanceImportHints: vi.fn(() => []) };
});

import { MoneyManagerImporter } from './money-manager-importer';

function csv(name: string, headers: string[], rows: Record<string, string>[]): CSVFile {
	return { name, headers, rows, rowCount: rows.length };
}

describe('MoneyManagerImporter externalAccountMarkedAsPersonLedger', () => {
	beforeEach(() => {
		hoisted.accountsById.clear();
		hoisted.uuidN = 0;
		vi.clearAllMocks();
	});

	it('creates person ledger account with personId, externalKeys, and close queue', async () => {
		const files = new Map<string, CSVFile>([
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
			['INOUTCOME', csv('INOUTCOME', ['uid', 'IS_DEL'], [])]
		]);

		const importer = new MoneyManagerImporter({
			importCurrencies: true,
			importAccounts: true,
			importCategories: false,
			importTransactions: false,
			externalAccountMarkedAsPersonLedger: { 'mm-alice': true }
		});

		const result = await importer.import(files);
		expect(result.success).toBe(true);

		const account = [...hoisted.accountsById.values()][0];
		expect(account?.ledgerRole).toBe('person');
		expect(account?.personId).toBe('person-1');

		expect(hoisted.resolvePersonForLedgerAccount).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'Alice', ledgerRole: 'person' }),
			[{ source: 'money-manager', entity: 'account', key: 'mm-alice' }]
		);

		const queue = result.importBatch?.personLedgerCloseQueue;
		expect(queue).toHaveLength(1);
		expect(queue?.[0]).toMatchObject({
			name: 'Alice',
			externalKeys: [{ source: 'money-manager', entity: 'account', key: 'mm-alice' }]
		});
		expect(queue?.[0]?.accountId).toBe(account?.id);
		expect(result.importBatch?.personAccountPreFlaggedNames).toEqual(['Alice']);
	});
});
