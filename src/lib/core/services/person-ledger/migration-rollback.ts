import { db } from '$lib/core/db';
import type {
	Account,
	MigrationOperation,
	Person,
	PersonMigrationBatch,
	Transaction
} from '$lib/core/db';
import { accountService } from '$lib/core/services/core/account-service';
import { personMigrationBatchService } from './person-migration-batch-service';

type OpPayload = Record<string, unknown>;

function getBefore(payload: OpPayload): OpPayload | undefined {
	return payload.before as OpPayload | undefined;
}

function collectAffectedAccountIds(
	tx: Pick<Transaction, 'accountId' | 'type' | 'transferDetails'>,
	into: Set<string>
): void {
	if (tx.accountId) into.add(tx.accountId);
	if (tx.type === 'transfer' && tx.transferDetails?.toAccountId) {
		into.add(tx.transferDetails.toAccountId);
	}
	if (tx.transferDetails?.feeAccountId) {
		into.add(tx.transferDetails.feeAccountId);
	}
}

async function rollbackCreateTransaction(
	op: Extract<MigrationOperation, { op: 'create_transaction' }>,
	affectedAccountIds: Set<string>
): Promise<void> {
	const id = op.transactionId;
	if (!id) return;
	const existing = await db.transactions.get(id);
	if (!existing) return;
	await db.softDeleteTransaction(id);
	collectAffectedAccountIds(existing, affectedAccountIds);
}

async function rollbackUpdateTransaction(
	op: Extract<MigrationOperation, { op: 'update_transaction' }>,
	affectedAccountIds: Set<string>
): Promise<void> {
	const before = getBefore(op.payload as OpPayload);
	if (!before) return;
	const existing = await db.transactions.get(op.transactionId);
	if (!existing) return;
	const restored: Transaction = {
		...existing,
		...(before as Partial<Transaction>),
		updatedAt: new Date().toISOString()
	};
	await db.transactions.update(op.transactionId, restored);
	collectAffectedAccountIds(existing, affectedAccountIds);
	collectAffectedAccountIds(restored, affectedAccountIds);
}

async function rollbackSoftDeleteTransaction(
	op: Extract<MigrationOperation, { op: 'soft_delete_transaction' }>,
	affectedAccountIds: Set<string>
): Promise<void> {
	const before = getBefore(op.payload as OpPayload);
	if (!before) return;
	const existing = await db.transactions.get(op.transactionId);
	const restored: Transaction = {
		...(existing ?? (before as Transaction)),
		...(before as Partial<Transaction>),
		deletedAt: null,
		updatedAt: new Date().toISOString()
	};
	await db.transactions.put(restored);
	collectAffectedAccountIds(restored, affectedAccountIds);
}

async function rollbackUpdateAccount(
	op: Extract<MigrationOperation, { op: 'update_account' }>
): Promise<void> {
	const before = getBefore(op.payload as OpPayload);
	if (!before) return;
	const existing = await db.accounts.get(op.accountId);
	if (!existing) return;
	const restored: Account = {
		...existing,
		...(before as Partial<Account>),
		updatedAt: new Date().toISOString()
	};
	await db.accounts.update(op.accountId, restored);
}

async function rollbackArchiveAccount(
	op: Extract<MigrationOperation, { op: 'archive_account' }>
): Promise<void> {
	await rollbackUpdateAccount(op);
}

async function rollbackCreatePerson(
	op: Extract<MigrationOperation, { op: 'create_person' }>
): Promise<void> {
	const id = op.personId;
	if (!id) return;
	const person = await db.people.get(id);
	if (!person) return;
	await db.people.update(id, {
		deletedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	});
}

async function rollbackUpdatePerson(
	op: Extract<MigrationOperation, { op: 'update_person' }>
): Promise<void> {
	const before = getBefore(op.payload as OpPayload);
	if (!before) return;
	const existing = await db.people.get(op.personId);
	if (!existing) return;
	const restored: Person = {
		...existing,
		...(before as Partial<Person>),
		updatedAt: new Date().toISOString()
	};
	await db.people.put(restored);
}

async function rollbackOperation(
	op: MigrationOperation,
	affectedAccountIds: Set<string>
): Promise<void> {
	switch (op.op) {
		case 'create_transaction':
			await rollbackCreateTransaction(op, affectedAccountIds);
			break;
		case 'update_transaction':
			await rollbackUpdateTransaction(op, affectedAccountIds);
			break;
		case 'soft_delete_transaction':
			await rollbackSoftDeleteTransaction(op, affectedAccountIds);
			break;
		case 'update_account':
			await rollbackUpdateAccount(op);
			break;
		case 'archive_account':
			await rollbackArchiveAccount(op);
			break;
		case 'create_person':
			await rollbackCreatePerson(op);
			break;
		case 'update_person':
			await rollbackUpdatePerson(op);
			break;
		default: {
			const _exhaustive: never = op;
			throw new Error(`Unknown operation: ${(_exhaustive as MigrationOperation).op}`);
		}
	}
}

async function markBatchRolledBack(batchId: string): Promise<void> {
	const existing = await db.personMigrationBatches.get(batchId);
	if (!existing) {
		throw new Error(`Person migration batch ${batchId} not found`);
	}
	await db.personMigrationBatches.put({
		...existing,
		status: 'rolled_back',
		updatedAt: new Date().toISOString()
	});
}

async function recalculateAffectedBalances(affectedAccountIds: Set<string>): Promise<void> {
	for (const accountId of affectedAccountIds) {
		await accountService.recalculateAccountBalance(accountId);
	}
}

export async function rollbackPersonMigrationBatch(batchId: string): Promise<PersonMigrationBatch> {
	const batch = await personMigrationBatchService.getBatch(batchId);
	if (!batch) {
		throw new Error(`Person migration batch ${batchId} not found`);
	}
	if (batch.status !== 'applied') {
		throw new Error(`Batch ${batchId} is not applied (status: ${batch.status})`);
	}

	const reversed = [...batch.operations].reverse();
	const affectedAccountIds = new Set<string>();

	await db.transaction(
		'rw',
		db.transactions,
		db.accounts,
		db.people,
		db.personMigrationBatches,
		async () => {
			for (const op of reversed) {
				await rollbackOperation(op, affectedAccountIds);
			}
			await markBatchRolledBack(batchId);
		}
	);

	await recalculateAffectedBalances(affectedAccountIds);

	const updated = await personMigrationBatchService.getBatch(batchId);
	if (!updated) throw new Error('Batch missing after rollback');
	return updated;
}

/** Latest applied batch for a ledger account (for undo UI). */
export async function getLatestAppliedBatchForLedger(
	ledgerAccountId: string
): Promise<PersonMigrationBatch | null> {
	const batches = await personMigrationBatchService.listBatchesForLedger(ledgerAccountId);
	return batches.find((b) => b.status === 'applied') ?? null;
}
