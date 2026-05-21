import { db } from '$lib/core/db';
import type {
	Account,
	MigrationOperation,
	Person,
	PersonMigrationBatch,
	Transaction
} from '$lib/core/db';
import { accountService } from '$lib/core/services/core/account-service';
import { transactionService } from '$lib/core/services/core/transaction-service';
import { personService } from './person-service';
import { personMigrationBatchService } from './person-migration-batch-service';

type OpPayload = Record<string, unknown>;

function getBefore(payload: OpPayload): OpPayload | undefined {
	return payload.before as OpPayload | undefined;
}

function getAfter(payload: OpPayload): OpPayload | undefined {
	return payload.after as OpPayload | undefined;
}

async function rollbackCreateTransaction(
	op: Extract<MigrationOperation, { op: 'create_transaction' }>
): Promise<void> {
	const id = op.transactionId;
	if (!id) return;
	const existing = await transactionService.getTransaction(id);
	if (existing) {
		await transactionService.deleteTransaction(id);
	}
}

async function rollbackUpdateTransaction(
	op: Extract<MigrationOperation, { op: 'update_transaction' }>
): Promise<void> {
	const before = getBefore(op.payload as OpPayload);
	if (!before) return;
	await transactionService.updateTransaction(op.transactionId, before as Partial<Transaction>);
}

async function rollbackSoftDeleteTransaction(
	op: Extract<MigrationOperation, { op: 'soft_delete_transaction' }>
): Promise<void> {
	const before = getBefore(op.payload as OpPayload);
	if (!before) return;
	await transactionService.updateTransaction(op.transactionId, {
		deletedAt: null,
		...(before as Partial<Transaction>)
	});
}

async function rollbackUpdateAccount(
	op: Extract<MigrationOperation, { op: 'update_account' }>
): Promise<void> {
	const before = getBefore(op.payload as OpPayload);
	if (!before) return;
	await accountService.updateAccount(op.accountId, before as Partial<Account>);
}

async function rollbackArchiveAccount(
	op: Extract<MigrationOperation, { op: 'archive_account' }>
): Promise<void> {
	const before = getBefore(op.payload as OpPayload);
	if (!before) return;
	await accountService.updateAccount(op.accountId, before as Partial<Account>);
}

async function rollbackCreatePerson(
	op: Extract<MigrationOperation, { op: 'create_person' }>
): Promise<void> {
	const id = op.personId;
	if (!id) return;
	const person = await personService.getPerson(id);
	if (person) {
		await personService.deletePerson(id);
	}
}

async function rollbackUpdatePerson(
	op: Extract<MigrationOperation, { op: 'update_person' }>
): Promise<void> {
	const before = getBefore(op.payload as OpPayload);
	if (!before) return;
	await personService.updatePerson(op.personId, before as Partial<Person>);
}

async function rollbackOperation(op: MigrationOperation): Promise<void> {
	switch (op.op) {
		case 'create_transaction':
			await rollbackCreateTransaction(op);
			break;
		case 'update_transaction':
			await rollbackUpdateTransaction(op);
			break;
		case 'soft_delete_transaction':
			await rollbackSoftDeleteTransaction(op);
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

export async function rollbackPersonMigrationBatch(batchId: string): Promise<PersonMigrationBatch> {
	const batch = await personMigrationBatchService.getBatch(batchId);
	if (!batch) {
		throw new Error(`Person migration batch ${batchId} not found`);
	}
	if (batch.status !== 'applied') {
		throw new Error(`Batch ${batchId} is not applied (status: ${batch.status})`);
	}

	const reversed = [...batch.operations].reverse();

	await db.transaction(
		'rw',
		db.transactions,
		db.accounts,
		db.people,
		db.personMigrationBatches,
		async () => {
			for (const op of reversed) {
				await rollbackOperation(op);
			}
			await personMigrationBatchService.updateBatch(batchId, { status: 'rolled_back' });
		}
	);

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
