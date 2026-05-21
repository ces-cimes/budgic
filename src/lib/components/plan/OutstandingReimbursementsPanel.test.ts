import { describe, expect, it } from 'vitest';
import type { ReimbursementEntry } from '$lib/core/db';

function personLabel(reimbursement: ReimbursementEntry, peopleById: Map<string, string>): string {
	if (reimbursement.personId) {
		const fromPerson = peopleById.get(reimbursement.personId);
		if (fromPerson) return fromPerson;
	}
	return reimbursement.person || 'Unknown person';
}

describe('OutstandingReimbursementsPanel person labels', () => {
	it('prefers Person.displayName when personId is set', () => {
		const map = new Map([['person-1', 'Alice Smith']]);
		const label = personLabel(
			{
				id: 'r1',
				direction: 'lending',
				amount: 10,
				currency: 'USD',
				person: 'Old Name',
				personId: 'person-1',
				status: 'expecting',
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z'
			},
			map
		);
		expect(label).toBe('Alice Smith');
	});
});
