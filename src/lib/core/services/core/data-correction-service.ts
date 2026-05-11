import { db, generateUUID } from '$lib/core/db';
import type { DataCorrection } from '$lib/core/db';

export type DataCorrectionAppend = Omit<DataCorrection, 'id' | 'timestamp'> & {
	id?: string;
	timestamp?: string;
};

/**
 * Immutable insert-only audit log for balance and transaction field corrections.
 */
class DataCorrectionService {
	async append(entries: DataCorrectionAppend[]): Promise<void> {
		if (entries.length === 0) return;
		const defaultTs = new Date().toISOString();
		const rows: DataCorrection[] = entries.map((e) => ({
			id: e.id ?? generateUUID(),
			transactionId: e.transactionId,
			accountId: e.accountId,
			field: e.field,
			oldValue: e.oldValue,
			newValue: e.newValue,
			source: e.source,
			timestamp: e.timestamp ?? defaultTs
		}));
		await db.dataCorrections.bulkAdd(rows);
	}

	async listRecent(limit = 500): Promise<DataCorrection[]> {
		return await db.dataCorrections.orderBy('timestamp').reverse().limit(limit).toArray();
	}
}

export const dataCorrectionService = new DataCorrectionService();
