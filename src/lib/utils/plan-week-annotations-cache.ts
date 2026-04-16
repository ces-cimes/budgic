/**
 * Short TTL cache for Allowance week-row labels (recurring RTI is expensive on large DBs).
 */
const TTL_MS = 120_000;

let cache: { accountId: string; at: number; ann: Record<string, string> } | null = null;

export function getCachedWeekAnnotations(accountId: string): Record<string, string> | null {
	if (!cache || cache.accountId !== accountId) return null;
	if (Date.now() - cache.at > TTL_MS) return null;
	return cache.ann;
}

export function setCachedWeekAnnotations(accountId: string, ann: Record<string, string>): void {
	cache = { accountId, at: Date.now(), ann };
}
