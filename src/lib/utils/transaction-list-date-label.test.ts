import { describe, expect, it } from 'vitest';
import { groupSpansMultipleCalendarDays } from './transaction-list-date-label';

const getDate = (tx: unknown) => {
	const value = tx as { clearedDate?: string; transactions?: { clearedDate: string }[] };
	if (value.transactions?.length) {
		return value.clearedDate ?? value.transactions[0].clearedDate;
	}
	return value.clearedDate ?? '2026-05-01T12:00:00.000Z';
};

describe('transaction-list-date-label', () => {
	it('uses grouped member dates when checking multi-day spans', () => {
		const group = {
			isGroup: true,
			clearedDate: '2026-05-12T09:00:00.000Z',
			transactions: [
				{ clearedDate: '2026-05-12T09:00:00.000Z' },
				{ clearedDate: '2026-05-14T18:00:00.000Z' }
			]
		};
		const sameDay = {
			isGroup: true,
			clearedDate: '2026-05-12T09:00:00.000Z',
			transactions: [
				{ clearedDate: '2026-05-12T09:00:00.000Z' },
				{ clearedDate: '2026-05-12T18:00:00.000Z' }
			]
		};

		expect(
			groupSpansMultipleCalendarDays(getDate, 'smart', [group, { clearedDate: '2026-05-13T10:00:00.000Z' }])
		).toBe(true);
		expect(groupSpansMultipleCalendarDays(getDate, 'smart', [group, sameDay])).toBe(true);
		expect(groupSpansMultipleCalendarDays(getDate, 'smart', [sameDay])).toBe(false);
	});
});
