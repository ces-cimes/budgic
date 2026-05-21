import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	estimateResidualBalances,
	groupProposalsByConfidence,
	inferProposalsForLedger
} from './migration-inference';
import type { Account, Person, Transaction } from '$lib/core/db';

const person: Person = {
	id: 'person-1',
	displayName: 'Alice',
	externalKeys: [],
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	deletedAt: null
};

const ledger: Account = {
	id: 'ledger-1',
	name: 'Alice',
	type: 'cash',
	currency: 'USD',
	currentBalance: 0,
	initialBalance: 0,
	isActive: true,
	ledgerRole: 'person',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	deletedAt: null
};

const wallet: Account = {
	id: 'wallet-1',
	name: 'Checking',
	type: 'checking',
	currency: 'USD',
	currentBalance: 0,
	initialBalance: 0,
	isActive: true,
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	deletedAt: null
};

const clearedDate = '2026-02-01T12:00:00.000Z';

let ledgerTxs: Transaction[] = [];
let anchorTxs: Transaction[] = [];
let relatedTxs: Transaction[] = [];

vi.mock('$lib/core/services/core/transaction-service', () => ({
	transactionService: {
		getTransactionsByAccount: vi.fn(async (id: string) => {
			if (id === 'ledger-1') return ledgerTxs;
			if (id === 'anchor-1') return anchorTxs;
			return [];
		})
	}
}));

vi.mock('$lib/core/services/core/account-service', () => ({
	accountService: {
		getWalletAccounts: vi.fn(async () => [wallet]),
		getAccount: vi.fn(async (id: string) => (id === 'ledger-1' ? ledger : null))
	}
}));

vi.mock('$lib/core/db', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/core/db')>();
	return {
		...actual,
		db: {
			...actual.db,
			getTransactionsRelatedToAccount: vi.fn(async () => relatedTxs)
		}
	};
});

function tx(partial: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount'>): Transaction {
	return {
		status: 'cleared',
		currency: 'USD',
		accountId: 'ledger-1',
		clearedDate,
		createdAt: clearedDate,
		updatedAt: clearedDate,
		deletedAt: null,
		...partial
	} as Transaction;
}

describe('migration-inference', () => {
	beforeEach(() => {
		ledgerTxs = [];
		anchorTxs = [];
		relatedTxs = [];
		vi.clearAllMocks();
	});

	it('proposes collapse_transfer_to_ledger for wallet → ledger pair', async () => {
		ledgerTxs = [
			tx({
				id: 'ledger-tx-1',
				type: 'transfer',
				amount: 50,
				description: 'Incoming from wallet'
			})
		];
		relatedTxs = [
			tx({
				id: 'wallet-tx-1',
				accountId: 'wallet-1',
				type: 'transfer',
				amount: -50,
				transferDetails: { toAccountId: 'ledger-1', transferAmount: 50, feeAmount: 0 }
			}),
			...ledgerTxs
		];

		const proposals = await inferProposalsForLedger({
			ledgerAccountId: 'ledger-1',
			anchorAccountId: 'anchor-1',
			person
		});

		const collapse = proposals.find((p) => p.kind === 'collapse_transfer_to_ledger');
		expect(collapse).toBeDefined();
		expect(collapse?.sourceTransactionIds).toContain('ledger-tx-1');
		expect(collapse?.walletTransactionId).toBe('wallet-tx-1');
		expect(collapse?.confidence).toBe('high');
	});

	it('proposes collapse_transfer_from_ledger with FIFO settlement candidates', async () => {
		anchorTxs = [
			tx({
				id: 'anchor-1',
				accountId: 'anchor-1',
				type: 'expense',
				amount: -30,
				clearedDate: '2026-01-10T12:00:00.000Z',
				reimbursements: [
					{
						id: 'r-old',
						direction: 'lending',
						amount: 30,
						currency: 'USD',
						person: 'Alice',
						personId: 'person-1',
						status: 'expecting',
						createdAt: clearedDate,
						updatedAt: clearedDate
					}
				]
			}),
			tx({
				id: 'anchor-2',
				accountId: 'anchor-1',
				type: 'expense',
				amount: -30,
				clearedDate: '2026-01-20T12:00:00.000Z',
				reimbursements: [
					{
						id: 'r-new',
						direction: 'lending',
						amount: 30,
						currency: 'USD',
						person: 'Alice',
						status: 'expecting',
						createdAt: clearedDate,
						updatedAt: clearedDate
					}
				]
			})
		];
		ledgerTxs = [
			tx({
				id: 'ledger-out',
				type: 'transfer',
				amount: -30,
				transferDetails: { toAccountId: 'wallet-1', transferAmount: 30, feeAmount: 0 }
			})
		];
		relatedTxs = [...ledgerTxs];

		const proposals = await inferProposalsForLedger({
			ledgerAccountId: 'ledger-1',
			anchorAccountId: 'anchor-1',
			person
		});

		const fromLedger = proposals.find((p) => p.kind === 'collapse_transfer_from_ledger');
		expect(fromLedger?.settlementCandidates?.[0]?.reimbursementId).toBe('r-old');
		expect(fromLedger?.settlementCandidates?.[1]?.reimbursementId).toBe('r-new');
	});

	it('groups split transactions atomically by groupId', async () => {
		ledgerTxs = [
			tx({
				id: 'split-a',
				type: 'expense',
				amount: -20,
				groupId: 'grp-1',
				description: 'Part A'
			}),
			tx({
				id: 'split-b',
				type: 'expense',
				amount: -10,
				groupId: 'grp-1',
				description: 'Part B'
			})
		];
		relatedTxs = [...ledgerTxs];

		const proposals = await inferProposalsForLedger({
			ledgerAccountId: 'ledger-1',
			anchorAccountId: 'anchor-1',
			person
		});

		const reattach = proposals.find((p) => p.kind === 'reattach_ledger_expense');
		expect(reattach?.sourceTransactionIds).toEqual(['split-a', 'split-b']);
		expect(reattach?.groupId).toBe('grp-1');
	});

	it('flags duplicate expecting on anchor for expense reattach', async () => {
		anchorTxs = [
			tx({
				id: 'anchor-dup',
				accountId: 'anchor-1',
				type: 'expense',
				amount: -25,
				clearedDate,
				reimbursements: [
					{
						id: 'r-dup',
						direction: 'lending',
						amount: 25,
						currency: 'USD',
						personId: 'person-1',
						person: 'Alice',
						status: 'expecting',
						createdAt: clearedDate,
						updatedAt: clearedDate
					}
				]
			})
		];
		ledgerTxs = [tx({ id: 'ledger-exp', type: 'expense', amount: -25 })];
		relatedTxs = [...ledgerTxs];

		const proposals = await inferProposalsForLedger({
			ledgerAccountId: 'ledger-1',
			anchorAccountId: 'anchor-1',
			person
		});

		const reattach = proposals.find((p) => p.kind === 'reattach_ledger_expense');
		expect(reattach?.linkExistingReimbursementId).toBe('r-dup');
		expect(reattach?.conflict).toBeTruthy();
	});

	it('estimateResidualBalances excludes consumed ledger txs', async () => {
		ledgerTxs = [
			tx({ id: 'keep', type: 'expense', amount: -10 }),
			tx({ id: 'gone', type: 'expense', amount: -40 })
		];

		const residual = await estimateResidualBalances('ledger-1', [
			{
				id: 'p1',
				kind: 'reattach_ledger_expense',
				confidence: 'medium',
				sourceTransactionIds: ['gone'],
				summary: 'test'
			}
		]);

		expect(residual.USD).toBe(-10);
	});

	it('groupProposalsByConfidence buckets proposals', () => {
		const grouped = groupProposalsByConfidence([
			{
				id: '1',
				kind: 'reattach_ledger_expense',
				confidence: 'high',
				sourceTransactionIds: [],
				summary: 'a'
			},
			{
				id: '2',
				kind: 'reattach_ledger_income',
				confidence: 'low',
				sourceTransactionIds: [],
				summary: 'b'
			}
		]);
		expect(grouped.high).toHaveLength(1);
		expect(grouped.low).toHaveLength(1);
	});
});
