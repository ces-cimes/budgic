import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dataQualityService } from './data-quality-service';
import type { Transaction } from '$lib/core/db';

const { mockFilter, mockWhereEquals } = vi.hoisted(() => ({
	mockFilter: vi.fn(),
	mockWhereEquals: vi.fn()
}));

vi.mock('$lib/core/db', () => ({
	db: {
		transactions: {
			filter: mockFilter,
			where: vi.fn(() => ({
				equals: mockWhereEquals
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
		mockFilter.mockReturnValue({
			toArray: vi.fn(() => Promise.resolve(rows))
		} as never);
		mockWhereEquals.mockReturnValue({
			filter: vi.fn(() => ({
				toArray: vi.fn(() => Promise.resolve([]))
			}))
		} as never);

		const q = await dataQualityService.getImportReviewQueue();
		expect(q.map((t) => t.id)).toEqual(['1']);
	});

	it('getImportReviewSnapshot scans once and returns both queues', async () => {
		const rows: Transaction[] = [
			{
				id: '1',
				type: 'expense',
				status: 'cleared',
				currency: 'USD',
				deletedAt: null,
				importQuality: { amountInferred: true }
			} as Transaction
		];
		const toArray = vi.fn(() => Promise.resolve(rows));
		mockFilter.mockReturnValue({ toArray } as never);
		mockWhereEquals.mockReturnValue({
			filter: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) }))
		} as never);

		await dataQualityService.getImportReviewSnapshot();
		expect(toArray).toHaveBeenCalledTimes(1);
	});
});
