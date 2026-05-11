import { db } from '$lib/core/db';
import type { Transaction } from '$lib/core/db';

function hasImportQualityReviewFlags(q: Transaction['importQuality']): boolean {
	if (!q) return false;
	return Boolean(q.amountInferred || q.dateInferred || q.currencyFallback);
}

/**
 * Transactions that still need import-quality review (O(n) table scan; no Dexie index on flags).
 */
class DataQualityService {
	async getImportReviewQueue(): Promise<Transaction[]> {
		const rows = await db.transactions.filter((t) => !t.deletedAt).toArray();
		return rows.filter(
			(t) =>
				hasImportQualityReviewFlags(t.importQuality) && !t.importQuality?.reviewDismissed
		);
	}
}

export const dataQualityService = new DataQualityService();
