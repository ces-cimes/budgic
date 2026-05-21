/** First-name-like account names (person ledger tracking). */
export const PERSON_LEDGER_NAME_RE = /^[A-ZА-Я][a-zа-я]{2,20}$/;

export function isPersonLedgerNameCandidate(name: string): boolean {
	return PERSON_LEDGER_NAME_RE.test(name.trim());
}
