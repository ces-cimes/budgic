/** First-name-like account names (person ledger tracking). */
export const PERSON_ACCOUNT_NAME_RE = /^[A-ZА-Я][a-zа-я]{2,20}$/;

export function isPersonAccountNameCandidate(name: string): boolean {
	return PERSON_ACCOUNT_NAME_RE.test(name.trim());
}
