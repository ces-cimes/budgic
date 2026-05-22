import { describe, expect, it, vi, beforeEach } from 'vitest';
import { accountCountsInNetWorth } from '$lib/core/db';

const accountsStore = new Map<string, import('$lib/core/db').Account>();
const transactionsStore = new Map<string, import('$lib/core/db').Transaction>();
const peopleStore = new Map<string, import('$lib/core/db').Person>();
const batchesStore = new Map<string, import('$lib/core/db').PersonMigrationBatch>();

vi.mock('$lib/core/db', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/core/db')>();
	return {
		...actual,
		generateUUID: vi.fn(() => `uuid-${transactionsStore.size + batchesStore.size}`),
		db: {
			softDeleteTransaction: vi.fn(async (id: string) => {
				const tx = transactionsStore.get(id);
				if (tx) {
					transactionsStore.set(id, {
						...tx,
						deletedAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					});
				}
			}),
			transaction: vi.fn(async (...args: unknown[]) => {
				const fn = args[args.length - 1];
				if (typeof fn === 'function') await (fn as () => Promise<void>)();
			}),
			transactions: {
				add: vi.fn(async (tx: import('$lib/core/db').Transaction) => {
					transactionsStore.set(tx.id, tx);
				}),
				get: vi.fn(async (id: string) => transactionsStore.get(id)),
				put: vi.fn(async (tx: import('$lib/core/db').Transaction) => {
					transactionsStore.set(tx.id, tx);
				}),
				update: vi.fn(async (id: string, patch: Partial<import('$lib/core/db').Transaction>) => {
					const cur = transactionsStore.get(id);
					if (cur) transactionsStore.set(id, { ...cur, ...patch });
				})
			},
			accounts: {
				get: vi.fn(async (id: string) => accountsStore.get(id)),
				update: vi.fn(async (id: string, acc: import('$lib/core/db').Account) => {
					accountsStore.set(id, acc);
				})
			},
			people: {
				add: vi.fn(async (p: import('$lib/core/db').Person) => {
					peopleStore.set(p.id, p);
				}),
				get: vi.fn(async (id: string) => peopleStore.get(id)),
				put: vi.fn(async (p: import('$lib/core/db').Person) => {
					peopleStore.set(p.id, p);
				}),
				toArray: vi.fn(async () => Array.from(peopleStore.values())),
				orderBy: vi.fn(() => ({
					toArray: vi.fn(async () => Array.from(peopleStore.values()))
				})),
				filter: vi.fn(() => ({
					toArray: vi.fn(async () =>
						Array.from(peopleStore.values()).filter((p) => p.deletedAt == null)
					)
				}))
			},
			personMigrationBatches: {
				get: vi.fn(async (id: string) => batchesStore.get(id)),
				add: vi.fn(async (b: import('$lib/core/db').PersonMigrationBatch) => {
					batchesStore.set(b.id, b);
				}),
				put: vi.fn(async (b: import('$lib/core/db').PersonMigrationBatch) => {
					batchesStore.set(b.id, b);
				})
			}
		}
	};
});

vi.mock('$lib/core/services/core/account-service', () => ({
	accountService: {
		recalculateAccountBalance: vi.fn(async (id: string) => {
			const acc = accountsStore.get(id);
			if (!acc) return;
			let balance = acc.initialBalance ?? 0;
			for (const tx of transactionsStore.values()) {
				if (tx.accountId === id && tx.deletedAt == null && tx.amount != null) {
					balance += tx.amount;
				}
			}
			accountsStore.set(id, { ...acc, currentBalance: balance });
		}),
		updateAccount: vi.fn(async (id: string, updates: Partial<import('$lib/core/db').Account>) => {
			const acc = accountsStore.get(id);
			if (!acc) throw new Error('missing');
			const updated = { ...acc, ...updates, updatedAt: new Date().toISOString() };
			accountsStore.set(id, updated);
			return updated;
		}),
		getAccount: vi.fn(async (id: string) => accountsStore.get(id))
	}
}));

vi.mock('$lib/core/services/core/transaction-service', () => ({
	transactionService: {
		getTransactionsByAccount: vi.fn(async () => []),
		updateTransaction: vi.fn(
			async (id: string, updates: Partial<import('$lib/core/db').Transaction>) => {
				const tx = transactionsStore.get(id);
				if (!tx) throw new Error('missing tx');
				transactionsStore.set(id, { ...tx, ...updates });
				return { ...tx, ...updates };
			}
		),
		deleteTransaction: vi.fn(async (id: string) => {
			const tx = transactionsStore.get(id);
			if (tx) transactionsStore.set(id, { ...tx, deletedAt: new Date().toISOString() });
		}),
		getTransaction: vi.fn(async (id: string) => transactionsStore.get(id) ?? null)
	}
}));

describe('person migration apply / rollback', () => {
	beforeEach(() => {
		accountsStore.clear();
		transactionsStore.clear();
		peopleStore.clear();
		batchesStore.clear();
		vi.clearAllMocks();

		accountsStore.set('ledger-1', {
			id: 'ledger-1',
			name: 'Alice',
			type: 'cash',
			currency: 'USD',
			currentBalance: 80,
			initialBalance: 0,
			isActive: true,
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
			deletedAt: null
		});
		accountsStore.set('anchor-1', {
			id: 'anchor-1',
			name: 'Checking',
			type: 'checking',
			currency: 'USD',
			currentBalance: 500,
			initialBalance: 500,
			isActive: true,
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
			deletedAt: null
		});
		peopleStore.set('person-1', {
			id: 'person-1',
			displayName: 'Alice',
			externalKeys: [],
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
			deletedAt: null
		});
	});

	it('apply then rollback restores ledger account', async () => {
		const { prepareMigrationBatch } = await import('./migration-batch-build');
		const { createAndApplyMigrationBatch } = await import('./migration-apply');
		const { rollbackPersonMigrationBatch } = await import('./migration-rollback');

		const built = await prepareMigrationBatch({
			ledgerAccountId: 'ledger-1',
			anchorAccountId: 'anchor-1',
			mode: 'single_total'
		});

		const applied = await createAndApplyMigrationBatch(built);
		expect(applied.status).toBe('applied');

		const archived = accountsStore.get('ledger-1');
		expect(archived?.ledgerRole).toBe('archived_person');
		expect(archived?.isActive).toBe(false);
		expect(accountCountsInNetWorth(archived!)).toBe(false);

		await rollbackPersonMigrationBatch(applied.id);
		const restored = accountsStore.get('ledger-1');
		expect(restored?.ledgerRole).not.toBe('archived_person');
		expect(restored?.isActive).not.toBe(false);
	});
});
