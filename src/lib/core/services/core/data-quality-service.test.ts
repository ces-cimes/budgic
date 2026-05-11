import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dataQualityService } from './data-quality-service';
import type { Transaction } from '$lib/core/db';

vi.mock('$lib/core/db', () => ({
	db: {
		transactions: {
			filter: vi.fn(() => ({
				toArray: vi.fn()
			}))
		}
	}
}));

import { db } from '$lib/core/db';

describe('dataQualityService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('getImportReviewQueue returns flagged rows without reviewDismissed', async () => {
		const rows: Transaction[] = [
			{
				id: '1',
				type: 'expense',
				status: 'cleared',
				currency: 'USD',
				deletedAt: null,
				importQuality: { amountInferred: true }
			} as Transaction,
			{
				id: '2',
				type: 'expense',
				status: 'cleared',
				currency: 'USD',
				deletedAt: null,
				importQuality: { amountInferred: true, reviewDismissed: true }
			} as Transaction,
			{
				id: '3',
				type: 'expense',
				status: 'cleared',
				currency: 'USD',
				deletedAt: null
			} as Transaction
		];
		vi.mocked(db.transactions.filter).mockReturnValue({
			toArray: vi.fn(() => Promise.resolve(rows))
		} as never);

		const q = await dataQualityService.getImportReviewQueue();
		expect(q.map((t) => t.id)).toEqual(['1']);
	});
});
