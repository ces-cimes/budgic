import { db, generateUUID } from '$lib/core/db';
import type {
	Account,
	MigrationOperation,
	Person,
	PersonMigrationBatch,
	Transaction
} from '$lib/core/db';
import { accountService } from '$lib/core/services/core/account-service';
import { transactionService } from '$lib/core/services/core/transaction-service';
import { personMigrationBatchService } from './person-migration-batch-service';
import type { BuiltMigrationBatch } from './migration-batch-build';

type OpPayload = Record<string, unknown>;

function getBefore(payload: OpPayload): OpPayload | undefined {
	return payload.before as OpPayload | undefined;
}

function getAfter(payload: OpPayload): OpPayload | undefined {
	return payload.after as OpPayload | undefined;
}

async function applyCreateTransaction(
	op: Extract<MigrationOperation, { op: 'create_transaction' }>
): Promise<string> {
	const after = getAfter(op.payload as OpPayload);
	if (!after) throw new Error('create_transaction missing after payload');
	const id = op.transactionId ?? generateUUID();
	const now = new Date().toISOString();
	const data = after as Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
	const transaction: Transaction = {
		id,
		...data,
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	};
	await db.transactions.add(transaction);
	if (transaction.accountId) {
		await accountService.recalculateAccountBalance(transaction.accountId);
	}
	return id;
}

async function applyUpdateTransaction(
	op: Extract<MigrationOperation, { op: 'update_transaction' }>
): Promise<void> {
	const after = getAfter(op.payload as OpPayload);
	if (!after) throw new Error('update_transaction missing after payload');
	await transactionService.updateTransaction(op.transactionId, after);
}

async function applySoftDeleteTransaction(transactionId: string): Promise<void> {
	await transactionService.deleteTransaction(transactionId);
}

async function applyUpdateAccount(
	op: Extract<MigrationOperation, { op: 'update_account' }>
): Promise<void> {
	const after = getAfter(op.payload as OpPayload);
	if (!after) throw new Error('update_account missing after payload');
	await accountService.updateAccount(op.accountId, after as Partial<Account>);
}

async function applyArchiveAccount(
	op: Extract<MigrationOperation, { op: 'archive_account' }>
): Promise<void> {
	const after = getAfter(op.payload as OpPayload);
	if (!after) throw new Error('archive_account missing after payload');
	await accountService.updateAccount(op.accountId, after as Partial<Account>);
}

async function applyCreatePerson(
	op: Extract<MigrationOperation, { op: 'create_person' }>
): Promise<string> {
	const after = getAfter(op.payload as OpPayload);
	if (!after) throw new Error('create_person missing after payload');
	const { personService } = await import('./person-service');
	const person = await personService.createPerson(
		after as Parameters<typeof personService.createPerson>[0]
	);
	return person.id;
}

async function applyUpdatePerson(
	op: Extract<MigrationOperation, { op: 'update_person' }>
): Promise<void> {
	const after = getAfter(op.payload as OpPayload);
	if (!after) throw new Error('update_person missing after payload');
	const { personService } = await import('./person-service');
	await personService.updatePerson(op.personId, after as Partial<Person>);
}

async function executeOperation(op: MigrationOperation): Promise<void> {
	switch (op.op) {
		case 'create_transaction':
			await applyCreateTransaction(op);
			break;
		case 'update_transaction':
			await applyUpdateTransaction(op);
			break;
		case 'soft_delete_transaction':
			await applySoftDeleteTransaction(op.transactionId);
			break;
		case 'update_account':
			await applyUpdateAccount(op);
			break;
		case 'archive_account':
			await applyArchiveAccount(op);
			break;
		case 'create_person':
			await applyCreatePerson(op);
			break;
		case 'update_person':
			await applyUpdatePerson(op);
			break;
		default: {
			const _exhaustive: never = op;
			throw new Error(`Unknown operation: ${(_exhaustive as MigrationOperation).op}`);
		}
	}
}

export async function applyPersonMigrationBatch(batchId: string): Promise<PersonMigrationBatch> {
	const batch = await personMigrationBatchService.getBatch(batchId);
	if (!batch) {
		throw new Error(`Person migration batch ${batchId} not found`);
	}
	if (batch.status !== 'draft') {
		throw new Error(`Batch ${batchId} is not draft (status: ${batch.status})`);
	}

	await db.transaction(
		'rw',
		db.transactions,
		db.accounts,
		db.people,
		db.personMigrationBatches,
		async () => {
			for (const op of batch.operations) {
				await executeOperation(op);
			}
			await personMigrationBatchService.updateBatch(batchId, { status: 'applied' });
		}
	);

	const updated = await personMigrationBatchService.getBatch(batchId);
	if (!updated) throw new Error('Batch missing after apply');
	return updated;
}

export async function createAndApplyMigrationBatch(
	built: BuiltMigrationBatch
): Promise<PersonMigrationBatch> {
	const now = new Date().toISOString();
	const batch: PersonMigrationBatch = {
		...built,
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	};
	await db.personMigrationBatches.add(batch);
	return await applyPersonMigrationBatch(batch.id);
}
