import { db, generateUUID } from '$lib/core/db';
import type { Account, Person, PersonExternalKey, ReimbursementEntry } from '$lib/core/db';

type PersonMigrationHistoryEntry = NonNullable<Person['migrationHistory']>[number];
import type { CreatePersonInput } from './types';

class PersonService {
	private externalKeyEquals(a: PersonExternalKey, b: PersonExternalKey): boolean {
		return a.source === b.source && a.entity === b.entity && a.key === b.key;
	}

	private mergeExternalKeys(
		existing: PersonExternalKey[] | undefined,
		incoming: PersonExternalKey[] | undefined
	): PersonExternalKey[] {
		const merged = [...(existing ?? [])];
		for (const key of incoming ?? []) {
			if (!merged.some((existingKey) => this.externalKeyEquals(existingKey, key))) {
				merged.push(key);
			}
		}
		return merged;
	}

	private async backfillExternalKeys(
		person: Person,
		externalKeys: PersonExternalKey[] | undefined
	): Promise<Person> {
		if (!externalKeys?.length || person.deletedAt != null) {
			return person;
		}
		const merged = this.mergeExternalKeys(person.externalKeys, externalKeys);
		if (merged.length === (person.externalKeys ?? []).length) {
			return person;
		}
		return await this.updatePerson(person.id, { externalKeys: merged });
	}

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

	async updatePerson(
		id: string,
		updates: Partial<Omit<Person, 'id' | 'createdAt'>>
	): Promise<Person> {
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
		const match = people.find(
			(p) =>
				p.deletedAt == null &&
				p.externalKeys.some(
					(k) => k.source === key.source && k.entity === key.entity && k.key === key.key
				)
		);
		return match ?? null;
	}

	async findByDisplayName(name: string): Promise<Person | null> {
		const normalized = name.trim().toLowerCase();
		if (!normalized) return null;
		const people = await db.people.filter((p) => p.deletedAt == null).toArray();
		return (
			people.find(
				(p) =>
					p.displayName.trim().toLowerCase() === normalized ||
					(p.aliases ?? []).some((a) => a.trim().toLowerCase() === normalized)
			) ?? null
		);
	}

	/** Resolve without creating — for wizard preview. */
	async peekPersonForLedgerAccount(account: Account): Promise<Person | null> {
		if (account.personId) {
			const linked = await this.getPerson(account.personId);
			if (linked && linked.deletedAt == null) return linked;
		}
		return await this.findByDisplayName(account.name);
	}

	async resolvePersonForLedgerAccount(
		account: Account,
		externalKeys?: PersonExternalKey[]
	): Promise<Person> {
		if (account.personId) {
			const linked = await this.getPerson(account.personId);
			if (linked && linked.deletedAt == null) {
				return await this.backfillExternalKeys(linked, externalKeys);
			}
		}
		for (const key of externalKeys ?? []) {
			const byKey = await this.findByExternalKey(key);
			if (byKey) return await this.backfillExternalKeys(byKey, externalKeys);
		}
		const byName = await this.findByDisplayName(account.name);
		if (byName) return await this.backfillExternalKeys(byName, externalKeys);
		return await this.createPerson({
			displayName: account.name.trim(),
			aliases: [],
			externalKeys: externalKeys ?? []
		});
	}

	async appendMigrationHistory(
		personId: string,
		entry: PersonMigrationHistoryEntry
	): Promise<Person> {
		const person = await this.getPerson(personId);
		if (!person) {
			throw new Error(`Person with ID ${personId} not found`);
		}
		const history = [...(person.migrationHistory ?? []), entry];
		return await this.updatePerson(personId, { migrationHistory: history });
	}

	linkReimbursementPerson(entry: ReimbursementEntry, person: Person): ReimbursementEntry {
		return {
			...entry,
			personId: person.id,
			person: person.displayName
		};
	}
}

export const personService = new PersonService();
