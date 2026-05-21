import { db, generateUUID } from '$lib/core/db';
import type { PersonMigrationBatch } from '$lib/core/db';
import type { CreatePersonMigrationBatchInput } from './types';

class PersonMigrationBatchService {
	async createBatch(data: CreatePersonMigrationBatchInput): Promise<PersonMigrationBatch> {
		const now = new Date().toISOString();
		const batch: PersonMigrationBatch = {
			id: generateUUID(),
			status: data.status ?? 'draft',
			ledgerAccountId: data.ledgerAccountId,
			personId: data.personId,
			anchorAccountId: data.anchorAccountId,
			mode: data.mode,
			operations: data.operations ?? [],
			createdAt: now,
			updatedAt: now,
			deletedAt: null
		};
		await db.personMigrationBatches.add(batch);
		return batch;
	}

	async getBatch(id: string): Promise<PersonMigrationBatch | null> {
		const row = await db.personMigrationBatches.get(id);
		return row ?? null;
	}

	async updateBatch(
		id: string,
		updates: Partial<Omit<PersonMigrationBatch, 'id' | 'createdAt'>>
	): Promise<PersonMigrationBatch> {
		const existing = await db.personMigrationBatches.get(id);
		if (!existing) {
			throw new Error(`Person migration batch ${id} not found`);
		}
		const updated: PersonMigrationBatch = {
			...existing,
			...updates,
			updatedAt: new Date().toISOString()
		};
		await db.personMigrationBatches.put(updated);
		return updated;
	}

	async listBatchesForLedger(ledgerAccountId: string): Promise<PersonMigrationBatch[]> {
		const rows = await db.personMigrationBatches
			.where('ledgerAccountId')
			.equals(ledgerAccountId)
			.toArray();
		return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}
}

export const personMigrationBatchService = new PersonMigrationBatchService();
