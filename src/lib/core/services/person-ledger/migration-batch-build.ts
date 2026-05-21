import { generateUUID } from '$lib/core/db';
import type {
	Account,
	MigrationOperation,
	Person,
	PersonExternalKey,
	PersonMigrationBatch,
	ReimbursementEntry
} from '$lib/core/db';
import type { MigrationProposal, PersonMigrationMode } from './types';
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

function parseSettlementKey(key: string | undefined): {
	transactionId: string;
	reimbursementId: string;
} | null {
	if (!key || !key.includes('::')) return null;
	const [transactionId, reimbursementId] = key.split('::');
	if (!transactionId || !reimbursementId) return null;
	return { transactionId, reimbursementId };
}

function softDeleteOp(tx: import('$lib/core/db').Transaction): MigrationOperation {
	return {
		op: 'soft_delete_transaction',
		transactionId: tx.id,
		payload: { before: { ...tx } }
	};
}

function newExpectingReimbursement(
	amount: number,
	currency: string,
	person: Person
): ReimbursementEntry {
	const now = new Date().toISOString();
	return personService.linkReimbursementPerson(
		{
			id: generateUUID(),
			direction: 'lending',
			amount: Math.abs(amount),
			currency,
			person: person.displayName,
			personId: person.id,
			status: 'expecting',
			createdAt: now,
			updatedAt: now
		},
		person
	);
}

export type CompileProposalsContext = {
	ledgerAccount: Account;
	person: Person;
	anchorAccountId: string;
};

export async function compileAcceptedProposalsToOperations(
	proposals: MigrationProposal[],
	ctx: CompileProposalsContext
): Promise<MigrationOperation[]> {
	const operations: MigrationOperation[] = [];
	const { person, anchorAccountId } = ctx;

	for (const proposal of proposals) {
		const sourceTxs = (
			await Promise.all(
				proposal.sourceTransactionIds.map((id) => transactionService.getTransaction(id))
			)
		).filter((t): t is NonNullable<typeof t> => t != null);

		if (sourceTxs.length === 0) continue;

		const primary = sourceTxs[0];
		const clearedDate = primary.clearedDate || primary.createdAt;
		const amount = Math.abs(primary.transferDetails?.transferAmount ?? primary.amount ?? 0);

		if (proposal.kind === 'collapse_transfer_to_ledger') {
			if (!proposal.linkExistingReimbursementId) {
				const anchorTxId = generateUUID();
				operations.push({
					op: 'create_transaction',
					transactionId: anchorTxId,
					payload: {
						after: {
							type: 'expense',
							status: 'cleared',
							accountId: anchorAccountId,
							amount: -amount,
							currency: primary.currency,
							description: primary.description || `From person ledger: ${person.displayName}`,
							categoryId: primary.categoryId,
							reimbursements: [newExpectingReimbursement(amount, primary.currency, person)],
							clearedDate
						}
					}
				});
			}
		} else if (proposal.kind === 'collapse_transfer_from_ledger') {
			const settlement = parseSettlementKey(proposal.selectedSettlementKey);
			if (settlement) {
				const anchorTx = await transactionService.getTransaction(settlement.transactionId);
				if (anchorTx?.reimbursements) {
					const incomeTxId = generateUUID();
					operations.push({
						op: 'create_transaction',
						transactionId: incomeTxId,
						payload: {
							after: {
								type: 'income',
								status: 'cleared',
								accountId: anchorAccountId,
								amount,
								currency: primary.currency,
								description: primary.description || `Repayment: ${person.displayName}`,
								clearedDate
							}
						}
					});
					const updatedReimbursements = anchorTx.reimbursements.map((r) => {
						if (r.id !== settlement.reimbursementId) return r;
						return personService.linkReimbursementPerson(
							{
								...r,
								status: 'settled',
								settledTransactionId: incomeTxId,
								updatedAt: new Date().toISOString()
							},
							person
						);
					});
					operations.push({
						op: 'update_transaction',
						transactionId: settlement.transactionId,
						payload: {
							before: { reimbursements: anchorTx.reimbursements },
							after: { reimbursements: updatedReimbursements }
						}
					});
				}
			} else {
				const anchorTxId = generateUUID();
				operations.push({
					op: 'create_transaction',
					transactionId: anchorTxId,
					payload: {
						after: {
							type: 'income',
							status: 'cleared',
							accountId: anchorAccountId,
							amount,
							currency: primary.currency,
							description: primary.description || `Repayment: ${person.displayName}`,
							clearedDate
						}
					}
				});
			}
		} else if (proposal.kind === 'reattach_ledger_expense') {
			if (!proposal.linkExistingReimbursementId) {
				const anchorTxId = generateUUID();
				operations.push({
					op: 'create_transaction',
					transactionId: anchorTxId,
					payload: {
						after: {
							type: 'expense',
							status: 'cleared',
							accountId: anchorAccountId,
							amount: primary.amount,
							currency: primary.currency,
							description: primary.description,
							categoryId: primary.categoryId,
							memo: primary.memo,
							reimbursements: [newExpectingReimbursement(amount, primary.currency, person)],
							clearedDate
						}
					}
				});
			}
		} else if (proposal.kind === 'reattach_ledger_income') {
			const settlement = parseSettlementKey(proposal.selectedSettlementKey);
			if (settlement) {
				const anchorTx = await transactionService.getTransaction(settlement.transactionId);
				if (anchorTx?.reimbursements) {
					const incomeTxId = generateUUID();
					operations.push({
						op: 'create_transaction',
						transactionId: incomeTxId,
						payload: {
							after: {
								type: 'income',
								status: 'cleared',
								accountId: anchorAccountId,
								amount,
								currency: primary.currency,
								description: primary.description,
								clearedDate
							}
						}
					});
					const updatedReimbursements = anchorTx.reimbursements.map((r) => {
						if (r.id !== settlement.reimbursementId) return r;
						return personService.linkReimbursementPerson(
							{
								...r,
								status: 'settled',
								settledTransactionId: incomeTxId,
								updatedAt: new Date().toISOString()
							},
							person
						);
					});
					operations.push({
						op: 'update_transaction',
						transactionId: settlement.transactionId,
						payload: {
							before: { reimbursements: anchorTx.reimbursements },
							after: { reimbursements: updatedReimbursements }
						}
					});
				}
			} else {
				const anchorTxId = generateUUID();
				operations.push({
					op: 'create_transaction',
					transactionId: anchorTxId,
					payload: {
						after: {
							type: 'income',
							status: 'cleared',
							accountId: anchorAccountId,
							amount: primary.amount,
							currency: primary.currency,
							description: primary.description,
							clearedDate
						}
					}
				});
			}
		}

		for (const tx of sourceTxs) {
			operations.push(softDeleteOp(tx));
		}
		if (proposal.walletTransactionId) {
			const walletTx = await transactionService.getTransaction(proposal.walletTransactionId);
			if (walletTx) operations.push(softDeleteOp(walletTx));
		}
	}

	return operations;
}

async function appendCloseTailOperations(
	operations: MigrationOperation[],
	params: {
		ledgerAccount: Account;
		person: Person;
		anchorAccountId: string;
		batchId: string;
		forgive: boolean;
		balances: Record<string, number>;
	}
): Promise<void> {
	const { ledgerAccount, person, anchorAccountId, batchId, forgive, balances } = params;
	const currencies = Object.keys(balances).filter((c) => Math.abs(balances[c] ?? 0) > 0.001);

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
}

export type BuildGuidedMigrationBatchInput = {
	ledgerAccount: Account;
	person: Person;
	anchorAccountId: string;
	batchId: string;
	acceptedProposals: MigrationProposal[];
	tailMode?: Extract<PersonMigrationMode, 'single_total' | 'forgive_archive'>;
	residualBalances?: Record<string, number>;
};

export type BuildProposalMigrationBatchInput = BuildGuidedMigrationBatchInput & {
	mode: Extract<PersonMigrationMode, 'guided' | 'automatic'>;
};

export async function buildProposalMigrationBatch(
	input: BuildProposalMigrationBatchInput
): Promise<BuiltMigrationBatch> {
	const {
		ledgerAccount,
		person,
		anchorAccountId,
		batchId,
		acceptedProposals,
		tailMode,
		residualBalances,
		mode
	} = input;

	const operations: MigrationOperation[] = [];
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

	const proposalOps = await compileAcceptedProposalsToOperations(acceptedProposals, {
		ledgerAccount,
		person,
		anchorAccountId
	});
	operations.push(...proposalOps);

	if (tailMode && residualBalances) {
		await appendCloseTailOperations(operations, {
			ledgerAccount,
			person,
			anchorAccountId,
			batchId,
			forgive: tailMode === 'forgive_archive',
			balances: residualBalances
		});
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

export async function buildGuidedMigrationBatch(
	input: BuildGuidedMigrationBatchInput
): Promise<BuiltMigrationBatch> {
	return buildProposalMigrationBatch({ ...input, mode: 'guided' });
}

export async function buildAutomaticMigrationBatch(
	input: BuildGuidedMigrationBatchInput
): Promise<BuiltMigrationBatch> {
	return buildProposalMigrationBatch({ ...input, mode: 'automatic' });
}

async function buildCloseBatch(
	input: BuildMigrationBatchInput & { forgive: boolean }
): Promise<BuiltMigrationBatch> {
	const { ledgerAccount, person, anchorAccountId, mode, batchId, forgive } = input;
	const operations: MigrationOperation[] = [];
	const balances = await ledgerBalancesByCurrency(ledgerAccount.id);

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

	await appendCloseTailOperations(operations, {
		ledgerAccount,
		person,
		anchorAccountId,
		batchId,
		forgive,
		balances
	});

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
	mode: PersonMigrationMode;
	externalKeys?: PersonExternalKey[];
	acceptedProposals?: MigrationProposal[];
	tailMode?: Extract<PersonMigrationMode, 'single_total' | 'forgive_archive'>;
	residualBalances?: Record<string, number>;
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

	if (params.mode === 'guided') {
		return buildGuidedMigrationBatch({
			ledgerAccount,
			person,
			anchorAccountId: params.anchorAccountId,
			batchId,
			acceptedProposals: params.acceptedProposals ?? [],
			tailMode: params.tailMode,
			residualBalances: params.residualBalances
		});
	}

	if (params.mode === 'automatic') {
		return buildProposalMigrationBatch({
			ledgerAccount,
			person,
			anchorAccountId: params.anchorAccountId,
			batchId,
			mode: 'automatic',
			acceptedProposals: params.acceptedProposals ?? [],
			tailMode: params.tailMode,
			residualBalances: params.residualBalances
		});
	}

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
	if (params.mode === 'single_total') {
		return buildSingleTotalBatch(input);
	}
	throw new Error(`Unsupported migration mode: ${params.mode}`);
}
