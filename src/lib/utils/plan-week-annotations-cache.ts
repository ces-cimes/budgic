/**
 * Short TTL cache for Allowance week-row labels (recurring RTI is expensive on large DBs).
 */
const TTL_MS = 120_000;

let cache: { accountId: string; at: number; ann: Record<string, string> } | null = null;

export type WeekAnnotationLookupReason =
	| 'hit'
	| 'miss_empty'
	| 'miss_wrong_account'
	| 'miss_expired';

export type WeekAnnotationLookup =
	| { reason: 'hit'; ann: Record<string, string> }
	| { reason: 'miss_empty' }
	| { reason: 'miss_wrong_account' }
	| { reason: 'miss_expired' };

export function getCachedWeekAnnotationsLookup(accountId: string): WeekAnnotationLookup {
	if (!cache) return { reason: 'miss_empty' };
	if (cache.accountId !== accountId) return { reason: 'miss_wrong_account' };
	if (Date.now() - cache.at > TTL_MS) return { reason: 'miss_expired' };
	return { reason: 'hit', ann: cache.ann };
}

export function getCachedWeekAnnotations(accountId: string): Record<string, string> | null {
	const r = getCachedWeekAnnotationsLookup(accountId);
	return r.reason === 'hit' ? r.ann : null;
}

export function setCachedWeekAnnotations(accountId: string, ann: Record<string, string>): void {
	cache = { accountId, at: Date.now(), ann };
}
