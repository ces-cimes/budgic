import { db, generateUUID } from '$lib/core/db';
import type {
	Account,
	MigrationOperation,
	Person,
	PersonMigrationBatch,
	Transaction
} from '$lib/core/db';
import { accountService } from '$lib/core/services/core/account-service';
import { personMigrationBatchService } from './person-migration-batch-service';
import type { BuiltMigrationBatch } from './migration-batch-build';

type OpPayload = Record<string, unknown>;

function getBefore(payload: OpPayload): OpPayload | undefined {
	return payload.before as OpPayload | undefined;
}

function getAfter(payload: OpPayload): OpPayload | undefined {
	return payload.after as OpPayload | undefined;
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

async function applyCreateTransaction(
	op: Extract<MigrationOperation, { op: 'create_transaction' }>,
	affectedAccountIds: Set<string>
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
	collectAffectedAccountIds(transaction, affectedAccountIds);
	return id;
}

async function applyUpdateTransaction(
	op: Extract<MigrationOperation, { op: 'update_transaction' }>,
	affectedAccountIds: Set<string>
): Promise<void> {
	const after = getAfter(op.payload as OpPayload);
	if (!after) throw new Error('update_transaction missing after payload');
	const existing = await db.transactions.get(op.transactionId);
	if (!existing) {
		throw new Error(`Transaction ${op.transactionId} not found`);
	}
	const updated: Transaction = {
		...existing,
		...(after as Partial<Transaction>),
		updatedAt: new Date().toISOString()
	};
	await db.transactions.update(op.transactionId, updated);
	collectAffectedAccountIds(existing, affectedAccountIds);
	collectAffectedAccountIds(updated, affectedAccountIds);
}

async function applySoftDeleteTransaction(
	transactionId: string,
	affectedAccountIds: Set<string>
): Promise<void> {
	const existing = await db.transactions.get(transactionId);
	if (!existing) {
		throw new Error(`Transaction ${transactionId} not found`);
	}
	await db.softDeleteTransaction(transactionId);
	collectAffectedAccountIds(existing, affectedAccountIds);
}

async function applyAccountMutation(
	op: Extract<MigrationOperation, { op: 'update_account' | 'archive_account' }>
): Promise<void> {
	const after = getAfter(op.payload as OpPayload);
	if (!after) throw new Error(`${op.op} missing after payload`);
	const existing = await db.accounts.get(op.accountId);
	if (!existing) {
		throw new Error(`Account ${op.accountId} not found`);
	}
	const updated: Account = {
		...existing,
		...(after as Partial<Account>),
		updatedAt: new Date().toISOString()
	};
	await db.accounts.update(op.accountId, updated);
}

async function applyUpdateAccount(
	op: Extract<MigrationOperation, { op: 'update_account' }>
): Promise<void> {
	await applyAccountMutation(op);
}

async function applyArchiveAccount(
	op: Extract<MigrationOperation, { op: 'archive_account' }>
): Promise<void> {
	await applyAccountMutation(op);
}

async function applyCreatePerson(
	op: Extract<MigrationOperation, { op: 'create_person' }>
): Promise<string> {
	const after = getAfter(op.payload as OpPayload);
	if (!after) throw new Error('create_person missing after payload');
	const id = op.personId ?? generateUUID();
	const now = new Date().toISOString();
	const person: Person = {
		id,
		...(after as Omit<Person, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>),
		createdAt: now,
		updatedAt: now,
		deletedAt: null
	};
	await db.people.add(person);
	return id;
}

async function applyUpdatePerson(
	op: Extract<MigrationOperation, { op: 'update_person' }>
): Promise<void> {
	const after = getAfter(op.payload as OpPayload);
	if (!after) throw new Error('update_person missing after payload');
	const existing = await db.people.get(op.personId);
	if (!existing) {
		throw new Error(`Person ${op.personId} not found`);
	}
	const updated: Person = {
		...existing,
		...(after as Partial<Person>),
		updatedAt: new Date().toISOString()
	};
	await db.people.put(updated);
}

async function executeOperation(
	op: MigrationOperation,
	affectedAccountIds: Set<string>
): Promise<void> {
	switch (op.op) {
		case 'create_transaction':
			await applyCreateTransaction(op, affectedAccountIds);
			break;
		case 'update_transaction':
			await applyUpdateTransaction(op, affectedAccountIds);
			break;
		case 'soft_delete_transaction':
			await applySoftDeleteTransaction(op.transactionId, affectedAccountIds);
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

async function markBatchApplied(batchId: string): Promise<void> {
	const existing = await db.personMigrationBatches.get(batchId);
	if (!existing) {
		throw new Error(`Person migration batch ${batchId} not found`);
	}
	await db.personMigrationBatches.put({
		...existing,
		status: 'applied',
		updatedAt: new Date().toISOString()
	});
}

async function recalculateAffectedBalances(affectedAccountIds: Set<string>): Promise<void> {
	for (const accountId of affectedAccountIds) {
		await accountService.recalculateAccountBalance(accountId);
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

	const affectedAccountIds = new Set<string>();

	// Dexie transaction: only direct db.* writes. Full services (transactionService, etc.)
	// touch other stores and async side effects, which commits the transaction too early.
	await db.transaction(
		'rw',
		db.transactions,
		db.accounts,
		db.people,
		db.personMigrationBatches,
		async () => {
			for (const op of batch.operations) {
				await executeOperation(op, affectedAccountIds);
			}
			await markBatchApplied(batchId);
		}
	);

	await recalculateAffectedBalances(affectedAccountIds);

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
