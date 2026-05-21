import type { PersonMigrationBatch } from '$lib/core/db';

export type {
	Person,
	PersonExternalKey,
	PersonMigrationBatch,
	MigrationOperation
} from '$lib/core/db';

export type PersonMigrationMode = PersonMigrationBatch['mode'];
export type PersonMigrationBatchStatus = PersonMigrationBatch['status'];

export type CreatePersonInput = {
	displayName: string;
	aliases?: string[];
	externalKeys?: import('$lib/core/db').PersonExternalKey[];
	preferredAnchorAccountId?: string;
	openBalancesByCurrency?: Record<string, number>;
};

export type CreatePersonMigrationBatchInput = {
	ledgerAccountId: string;
	personId: string;
	anchorAccountId: string;
	mode: PersonMigrationMode;
	operations?: import('$lib/core/db').MigrationOperation[];
	status?: PersonMigrationBatchStatus;
};

export type ProposalConfidence = 'high' | 'medium' | 'low';

export type ProposalKind =
	| 'collapse_transfer_to_ledger'
	| 'collapse_transfer_from_ledger'
	| 'reattach_ledger_expense'
	| 'reattach_ledger_income';

export type SettlementCandidate = {
	transactionId: string;
	reimbursementId: string;
	label: string;
	clearedDate: string;
};

export type MigrationProposal = {
	id: string;
	kind: ProposalKind;
	confidence: ProposalConfidence;
	sourceTransactionIds: string[];
	groupId?: string;
	summary: string;
	settlementCandidates?: SettlementCandidate[];
	/** `transactionId::reimbursementId` */
	selectedSettlementKey?: string;
	linkExistingReimbursementId?: string;
	linkExistingTransactionId?: string;
	conflict?: string;
	walletTransactionId?: string;
};
