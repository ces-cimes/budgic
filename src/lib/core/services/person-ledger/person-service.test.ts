import { describe, expect, it, beforeEach, vi } from 'vitest';
import { personService } from './person-service';

const peopleStore = new Map<string, unknown>();

vi.mock('$lib/core/db', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/core/db')>();
	return {
		...actual,
		db: {
			people: {
				add: vi.fn(async (row: { id: string }) => {
					peopleStore.set(row.id, row);
				}),
				get: vi.fn(async (id: string) => peopleStore.get(id)),
				put: vi.fn(async (row: { id: string }) => {
					peopleStore.set(row.id, row);
				}),
				update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
					const cur = peopleStore.get(id) as Record<string, unknown> | undefined;
					if (cur) peopleStore.set(id, { ...cur, ...patch });
				}),
				filter: vi.fn((predicate: (row: Record<string, unknown>) => boolean) => ({
					toArray: vi.fn(async () =>
						Array.from(peopleStore.values()).filter((row) =>
							predicate(row as Record<string, unknown>)
						)
					)
				})),
				toArray: vi.fn(async () => Array.from(peopleStore.values())),
				orderBy: vi.fn(() => ({
					toArray: vi.fn(async () =>
						Array.from(peopleStore.values()).sort((a, b) =>
							String((a as { displayName: string }).displayName).localeCompare(
								String((b as { displayName: string }).displayName)
							)
						)
					)
				}))
			}
		},
		generateUUID: vi.fn(() => 'person-uuid-1')
	};
});

describe('personService', () => {
	beforeEach(() => {
		peopleStore.clear();
		vi.clearAllMocks();
	});

	it('creates and finds person by external key', async () => {
		const created = await personService.createPerson({
			displayName: 'Alice',
			externalKeys: [{ source: 'mm', entity: 'account', key: 'uid-1' }]
		});
		expect(created.displayName).toBe('Alice');
		const found = await personService.findByExternalKey({
			source: 'mm',
			entity: 'account',
			key: 'uid-1'
		});
		expect(found?.id).toBe('person-uuid-1');
	});

	it('soft-deletes person', async () => {
		await personService.createPerson({ displayName: 'Bob' });
		await personService.deletePerson('person-uuid-1');
		const row = peopleStore.get('person-uuid-1') as { deletedAt: string | null };
		expect(row.deletedAt).not.toBeNull();
	});

	it('backfills missing external keys when reusing a name match', async () => {
		await personService.createPerson({ displayName: 'Alice' });

		const resolved = await personService.resolvePersonForLedgerAccount(
			{
				id: 'ledger-1',
				name: 'Alice',
				type: 'checking',
				currency: 'USD',
				initialBalance: 0,
				currentBalance: 0,
				isActive: true,
				createdAt: '2020-01-01',
				updatedAt: '2020-01-01',
				deletedAt: null
			},
			[{ source: 'money-manager', entity: 'account', key: 'mm-alice' }]
		);

		expect(resolved.externalKeys).toEqual([
			{ source: 'money-manager', entity: 'account', key: 'mm-alice' }
		]);
	});

	it('ignores deleted people during external key lookup', async () => {
		await personService.createPerson({
			displayName: 'Archived Alice',
			externalKeys: [{ source: 'money-manager', entity: 'account', key: 'mm-alice' }]
		});
		await personService.deletePerson('person-uuid-1');

		const found = await personService.findByExternalKey({
			source: 'money-manager',
			entity: 'account',
			key: 'mm-alice'
		});

		expect(found).toBeNull();
	});
});
