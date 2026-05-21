import { generateUUID } from '$lib/core/db';
import type {
	Account,
	MigrationOperation,
	Person,
	PersonExternalKey,
	PersonMigrationBatch,
	ReimbursementEntry
} from '$lib/core/db';
import type { PersonMigrationMode } from './types';
import { accountService } from '$lib/core/services/core/account-service';
import { transactionService } from '$lib/core/services/core/transaction-service';
import { personService } from './person-service';

export type BuildMigrationBatchInput = {
	ledgerAccount: Account;
	person: Person;
	anchorAccountId: string;
	mode: Extract<PersonMigrationMode, 'single_total' | 'forgive_archive'>;
	batchId: string;
};

export type BuiltMigrationBatch = Omit<
	PersonMigrationBatch,
	'createdAt' | 'updatedAt' | 'deletedAt'
> & { createdAt?: string; updatedAt?: string; deletedAt?: null };

/** Balances per currency from cleared txs; account currency uses currentBalance when set. */
export async function ledgerBalancesByCurrency(
	ledgerAccountId: string
): Promise<Record<string, number>> {
	const account = await accountService.getAccount(ledgerAccountId);
	if (!account) return {};

	const txs = await transactionService.getTransactionsByAccount(ledgerAccountId);
	const byCurrency: Record<string, number> = {};

	for (const tx of txs) {
		if (tx.deletedAt != null || tx.status !== 'cleared' || tx.amount == null) continue;
		const c = tx.currency;
		byCurrency[c] = (byCurrency[c] ?? 0) + tx.amount;
	}

	if (account && Math.abs(account.currentBalance) > 0.001) {
		byCurrency[account.currency] = account.currentBalance;
	}

	return byCurrency;
}

function reimbursementForBalance(
	balance: number,
	person: Person,
	currency: string,
	forgive: boolean
): ReimbursementEntry {
	const amount = Math.abs(balance);
	const now = new Date().toISOString();
	const direction = balance > 0 ? 'lending' : 'borrowing';
	const status = forgive ? 'forgiven' : direction === 'lending' ? 'expecting' : 'owed';
	const base: ReimbursementEntry = {
		id: generateUUID(),
		direction,
		amount,
		currency,
		person: person.displayName,
		personId: person.id,
		status,
		createdAt: now,
		updatedAt: now
	};
	return personService.linkReimbursementPerson(base, person);
}

export async function buildSingleTotalBatch(
	input: BuildMigrationBatchInput
): Promise<BuiltMigrationBatch> {
	return buildCloseBatch({ ...input, forgive: false });
}

export async function buildForgiveArchiveBatch(
	input: BuildMigrationBatchInput
): Promise<BuiltMigrationBatch> {
	return buildCloseBatch({ ...input, forgive: true });
}

async function buildCloseBatch(
	input: BuildMigrationBatchInput & { forgive: boolean }
): Promise<BuiltMigrationBatch> {
	const { ledgerAccount, person, anchorAccountId, mode, batchId, forgive } = input;
	const operations: MigrationOperation[] = [];
	const balances = await ledgerBalancesByCurrency(ledgerAccount.id);
	const currencies = Object.keys(balances).filter((c) => Math.abs(balances[c] ?? 0) > 0.001);

	const ledgerBefore = {
		ledgerRole: ledgerAccount.ledgerRole,
		personId: ledgerAccount.personId,
		isActive: ledgerAccount.isActive
	};

	operations.push({
		op: 'update_account',
		accountId: ledgerAccount.id,
		payload: {
			before: ledgerBefore,
			after: { ledgerRole: 'person', personId: person.id }
		}
	});

	for (const currency of currencies) {
		const balance = balances[currency] ?? 0;
		if (Math.abs(balance) <= 0.001) continue;

		const anchorTxId = generateUUID();
		const ledgerTxId = generateUUID();
		const clearedDate = new Date().toISOString();
		const reimbursements = forgive
			? [reimbursementForBalance(balance, person, currency, true)]
			: [reimbursementForBalance(balance, person, currency, false)];

		operations.push({
			op: 'create_transaction',
			transactionId: anchorTxId,
			payload: {
				after: {
					type: 'adjustment',
					status: 'cleared',
					accountId: anchorAccountId,
					amount: balance,
					currency,
					description: `Person ledger opening: ${person.displayName}`,
					automation: 'person-opening-balance',
					reimbursements,
					clearedDate
				}
			}
		});

		operations.push({
			op: 'create_transaction',
			transactionId: ledgerTxId,
			payload: {
				after: {
					type: 'adjustment',
					status: 'cleared',
					accountId: ledgerAccount.id,
					amount: -balance,
					currency,
					description: `Close person ledger: ${person.displayName}`,
					automation: 'person-ledger-close',
					clearedDate
				}
			}
		});
	}

	if (forgive) {
		const txs = await transactionService.getTransactionsByAccount(ledgerAccount.id);
		for (const tx of txs) {
			if (tx.deletedAt != null || !tx.reimbursements?.length) continue;
			const hasOpen = tx.reimbursements.some(
				(r) => r.status === 'expecting' || r.status === 'owed'
			);
			if (!hasOpen) continue;

			const updatedReimbursements = tx.reimbursements.map((r) => {
				if (r.status !== 'expecting' && r.status !== 'owed') return r;
				return personService.linkReimbursementPerson(
					{ ...r, status: 'forgiven', updatedAt: new Date().toISOString() },
					person
				);
			});

			operations.push({
				op: 'update_transaction',
				transactionId: tx.id,
				payload: {
					before: { reimbursements: tx.reimbursements },
					after: { reimbursements: updatedReimbursements }
				}
			});
		}
	}

	const personBefore = {
		preferredAnchorAccountId: person.preferredAnchorAccountId,
		migrationHistory: person.migrationHistory,
		openBalancesByCurrency: person.openBalancesByCurrency
	};

	operations.push({
		op: 'update_person',
		personId: person.id,
		payload: {
			before: personBefore,
			after: {
				preferredAnchorAccountId: anchorAccountId,
				migrationHistory: [
					...(person.migrationHistory ?? []),
					{
						batchId,
						ledgerAccountId: ledgerAccount.id,
						migratedAt: new Date().toISOString(),
						mode
					}
				],
				openBalancesByCurrency: {}
			}
		}
	});

	operations.push({
		op: 'archive_account',
		accountId: ledgerAccount.id,
		payload: {
			before: { ...ledgerBefore, ledgerRole: 'person', personId: person.id },
			after: { ledgerRole: 'archived_person', personId: person.id, isActive: false }
		}
	});

	return {
		id: batchId,
		status: 'draft',
		ledgerAccountId: ledgerAccount.id,
		personId: person.id,
		anchorAccountId,
		mode,
		operations
	};
}

export async function prepareMigrationBatch(params: {
	ledgerAccountId: string;
	anchorAccountId: string;
	mode: Extract<PersonMigrationMode, 'single_total' | 'forgive_archive'>;
	externalKeys?: PersonExternalKey[];
}): Promise<BuiltMigrationBatch> {
	const ledgerAccount = await accountService.getAccount(params.ledgerAccountId);
	if (!ledgerAccount) {
		throw new Error(`Ledger account ${params.ledgerAccountId} not found`);
	}
	if (ledgerAccount.ledgerRole === 'archived_person') {
		throw new Error('Account is already archived');
	}

	const person = await personService.resolvePersonForLedgerAccount(
		ledgerAccount,
		params.externalKeys
	);
	const batchId = generateUUID();

	const input: BuildMigrationBatchInput = {
		ledgerAccount,
		person,
		anchorAccountId: params.anchorAccountId,
		mode: params.mode,
		batchId
	};

	if (params.mode === 'forgive_archive') {
		return buildForgiveArchiveBatch(input);
	}
	return buildSingleTotalBatch(input);
}
