import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildForgiveArchiveBatch, buildSingleTotalBatch } from './migration-batch-build';
import type { Account, Person } from '$lib/core/db';

vi.mock('$lib/core/services/core/transaction-service', () => ({
	transactionService: {
		getTransactionsByAccount: vi.fn(async () => [])
	}
}));

vi.mock('$lib/core/services/core/account-service', () => ({
	accountService: {
		getAccount: vi.fn(async (id: string) => (id === 'ledger-1' ? ledger : null))
	}
}));

const ledger: Account = {
	id: 'ledger-1',
	name: 'Alice',
	type: 'cash',
	currency: 'USD',
	currentBalance: 100,
	initialBalance: 0,
	isActive: true,
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	deletedAt: null
};

const person: Person = {
	id: 'person-1',
	displayName: 'Alice',
	externalKeys: [],
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	deletedAt: null
};

describe('migration-batch-build', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('buildSingleTotalBatch includes anchor and ledger adjustments', async () => {
		const batch = await buildSingleTotalBatch({
			ledgerAccount: ledger,
			person,
			anchorAccountId: 'anchor-1',
			mode: 'single_total',
			batchId: 'batch-1'
		});

		const creates = batch.operations.filter((o) => o.op === 'create_transaction');
		expect(creates).toHaveLength(2);
		const anchorCreate = creates.find((o) => o.transactionId && o.payload);
		expect(
			(anchorCreate?.payload as { after?: { automation?: string } })?.after?.automation
		).toBe('person-opening-balance');

		const ledgerClose = creates.find(
			(o) =>
				(o.payload as { after?: { automation?: string } })?.after?.automation ===
				'person-ledger-close'
		);
		expect(ledgerClose).toBeDefined();
		expect(batch.operations.some((o) => o.op === 'archive_account')).toBe(true);
	});

	it('buildForgiveArchiveBatch marks reimbursements forgiven on open ledger txs', async () => {
		const { transactionService } = await import('$lib/core/services/core/transaction-service');
		vi.mocked(transactionService.getTransactionsByAccount).mockResolvedValue([
			{
				id: 'tx-1',
				type: 'expense',
				status: 'cleared',
				accountId: 'ledger-1',
				amount: 40,
				currency: 'USD',
				reimbursements: [
					{
						id: 'r-1',
						direction: 'lending',
						amount: 40,
						currency: 'USD',
						person: 'Alice',
						status: 'expecting',
						createdAt: '2026-01-01T00:00:00.000Z',
						updatedAt: '2026-01-01T00:00:00.000Z'
					}
				],
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				deletedAt: null
			} as import('$lib/core/db').Transaction
		]);

		const batch = await buildForgiveArchiveBatch({
			ledgerAccount: ledger,
			person,
			anchorAccountId: 'anchor-1',
			mode: 'forgive_archive',
			batchId: 'batch-2'
		});

		const updates = batch.operations.filter((o) => o.op === 'update_transaction');
		expect(updates.length).toBeGreaterThanOrEqual(1);
		const reimbUpdate = updates[0].payload as {
			after?: { reimbursements?: Array<{ status: string; personId?: string }> };
		};
		expect(reimbUpdate.after?.reimbursements?.[0]?.status).toBe('forgiven');
		expect(reimbUpdate.after?.reimbursements?.[0]?.personId).toBe('person-1');
	});
});
