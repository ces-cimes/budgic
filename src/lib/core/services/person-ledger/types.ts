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
