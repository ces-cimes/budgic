import { db, generateUUID } from '$lib/core/db';
import type { Person, PersonExternalKey } from '$lib/core/db';
import type { CreatePersonInput } from './types';

class PersonService {
	async createPerson(data: CreatePersonInput): Promise<Person> {
		const now = new Date().toISOString();
		const person: Person = {
			id: generateUUID(),
			displayName: data.displayName.trim(),
			aliases: data.aliases,
			externalKeys: data.externalKeys ?? [],
			preferredAnchorAccountId: data.preferredAnchorAccountId,
			openBalancesByCurrency: data.openBalancesByCurrency,
			createdAt: now,
			updatedAt: now,
			deletedAt: null
		};
		await db.people.add(person);
		return person;
	}

	async getPerson(id: string): Promise<Person | null> {
		const row = await db.people.get(id);
		return row ?? null;
	}

	async listPeople(): Promise<Person[]> {
		return await db.people.orderBy('displayName').toArray();
	}

	async updatePerson(id: string, updates: Partial<Omit<Person, 'id' | 'createdAt'>>): Promise<Person> {
		const existing = await db.people.get(id);
		if (!existing) {
			throw new Error(`Person with ID ${id} not found`);
		}
		const updated: Person = {
			...existing,
			...updates,
			updatedAt: new Date().toISOString()
		};
		await db.people.put(updated);
		return updated;
	}

	async deletePerson(id: string): Promise<void> {
		const existing = await db.people.get(id);
		if (!existing) {
			throw new Error(`Person with ID ${id} not found`);
		}
		await db.people.update(id, {
			deletedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	async findByExternalKey(key: PersonExternalKey): Promise<Person | null> {
		const people = await db.people.toArray();
		const match = people.find((p) =>
			p.externalKeys.some(
				(k) => k.source === key.source && k.entity === key.entity && k.key === key.key
			)
		);
		return match ?? null;
	}
}

export const personService = new PersonService();
