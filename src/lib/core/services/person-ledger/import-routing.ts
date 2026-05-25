import { db } from '$lib/core/db';
import type { Account, Person, PersonExternalKey } from '$lib/core/db';
import { resolveDefaultAnchorAccountId } from './anchor-inference';
import { personService } from './person-service';

export interface ResolvedPersonLedgerImportTarget {
	person: Person;
	externalKeys: PersonExternalKey[];
	activeLedgerAccount: Account | null;
	archivedLedgerAccount: Account | null;
	anchorAccountId: string | null;
}

interface ResolveImportedPersonLedgerOptions {
	accountName: string;
	externalKeys: PersonExternalKey[];
	ensurePerson?: boolean;
}

function buildLedgerAccountStub(name: string, personId?: string): Account {
	return {
		id: `import-ledger:${name}`,
		name,
		type: 'checking',
		currency: 'USD',
		initialBalance: 0,
		currentBalance: 0,
		isActive: true,
		ledgerRole: 'person',
		personId,
		createdAt: new Date(0).toISOString(),
		updatedAt: new Date(0).toISOString(),
		deletedAt: null
	};
}

async function getLedgerAccountsForPerson(personId: string): Promise<Account[]> {
	const accounts = await db.accounts.toArray();
	return accounts.filter(
		(account) =>
			account.deletedAt == null &&
			account.personId === personId &&
			(account.ledgerRole === 'person' || account.ledgerRole === 'archived_person')
	);
}

function pickArchivedLedgerAccount(person: Person, accounts: Account[]): Account | null {
	const archived = accounts.filter((account) => account.ledgerRole === 'archived_person');
	if (archived.length === 0) return null;

	const latestHistoryAccountId = [...(person.migrationHistory ?? [])]
		.reverse()
		.find((entry) => entry.ledgerAccountId)?.ledgerAccountId;
	if (latestHistoryAccountId) {
		const fromHistory = archived.find((account) => account.id === latestHistoryAccountId);
		if (fromHistory) return fromHistory;
	}

	return archived.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
}

export async function resolveImportedPersonLedgerTarget(
	options: ResolveImportedPersonLedgerOptions
): Promise<ResolvedPersonLedgerImportTarget | null> {
	const { accountName, externalKeys, ensurePerson = false } = options;
	const firstExternalKey = externalKeys[0];
	let person = firstExternalKey ? await personService.findByExternalKey(firstExternalKey) : null;

	if (!person && !ensurePerson) {
		return null;
	}

	person = await personService.resolvePersonForLedgerAccount(
		buildLedgerAccountStub(accountName, person?.id),
		externalKeys
	);

	const ledgerAccounts = await getLedgerAccountsForPerson(person.id);
	const activeLedgerAccount =
		ledgerAccounts.find(
			(account) => account.ledgerRole === 'person' && account.isActive !== false
		) ?? null;
	const archivedLedgerAccount = pickArchivedLedgerAccount(person, ledgerAccounts);
	const anchorAccountId = await resolveDefaultAnchorAccountId({
		ledgerAccountId: activeLedgerAccount?.id ?? archivedLedgerAccount?.id,
		personId: person.id
	});

	return {
		person,
		externalKeys,
		activeLedgerAccount,
		archivedLedgerAccount,
		anchorAccountId
	};
}
