/**
 * Dev-oriented counters for Plan allowance + week annotations + related cold paths.
 * No-ops in production builds (zero overhead).
 */

const enabled = import.meta.env.DEV;

export type RecurringCanonicalTier = 'memory' | 'indexeddb' | 'cold_start' | 'cold_coalesced_wait';

export type PlanPerfSnapshot = {
	planAllowanceCacheHits: number;
	planAllowanceCacheMisses: number;
	weekAnnHits: number;
	weekAnnMissEmpty: number;
	weekAnnMissWrongAccount: number;
	weekAnnMissExpired: number;
	weekAnnDetectPatternsMsTotal: number;
	weekAnnDetectPatternsCalls: number;
	txSnapshotHits: number;
	txSnapshotMisses: number;
	recurringCanonicalMemory: number;
	recurringCanonicalIndexedDb: number;
	recurringCanonicalColdStart: number;
	recurringCanonicalColdCoalescedWait: number;
};

const s = {
	planAllowanceCacheHits: 0,
	planAllowanceCacheMisses: 0,
	weekAnnHits: 0,
	weekAnnMissEmpty: 0,
	weekAnnMissWrongAccount: 0,
	weekAnnMissExpired: 0,
	weekAnnDetectPatternsMsTotal: 0,
	weekAnnDetectPatternsCalls: 0,
	txSnapshotHits: 0,
	txSnapshotMisses: 0,
	recurringCanonicalMemory: 0,
	recurringCanonicalIndexedDb: 0,
	recurringCanonicalColdStart: 0,
	recurringCanonicalColdCoalescedWait: 0
};

function dbg(...args: unknown[]) {
	if (enabled) console.debug('[plan-perf]', ...args);
}

export function recordPlanAllowanceCacheHit(meta: {
	rev: number;
	dayKey: string;
	selectedAccountId: string;
}): void {
	if (!enabled) return;
	s.planAllowanceCacheHits++;
	dbg('planAllowanceCache HIT', meta);
}

export function recordPlanAllowanceCacheMiss(meta: {
	rev: number;
	dayKey: string;
	selectedAccountId: string;
}): void {
	if (!enabled) return;
	s.planAllowanceCacheMisses++;
	dbg('planAllowanceCache MISS (full load)', meta);
}

export function recordWeekAnnotationLookup(
	reason: 'hit' | 'miss_empty' | 'miss_wrong_account' | 'miss_expired'
): void {
	if (!enabled) return;
	switch (reason) {
		case 'hit':
			s.weekAnnHits++;
			break;
		case 'miss_empty':
			s.weekAnnMissEmpty++;
			break;
		case 'miss_wrong_account':
			s.weekAnnMissWrongAccount++;
			break;
		case 'miss_expired':
			s.weekAnnMissExpired++;
			break;
	}
	dbg('weekAnn', reason);
}

export function recordWeekAnnDetectPatternsMs(ms: number): void {
	if (!enabled) return;
	s.weekAnnDetectPatternsMsTotal += ms;
	s.weekAnnDetectPatternsCalls++;
	dbg('detectPatterns(365,3) ms', ms.toFixed(1));
}

export function recordTxSnapshotCacheHit(): void {
	if (!enabled) return;
	s.txSnapshotHits++;
	dbg('transactions:snapshot HIT');
}

export function recordTxSnapshotCacheMiss(): void {
	if (!enabled) return;
	s.txSnapshotMisses++;
	dbg('transactions:snapshot MISS (populate)');
}

export function recordRecurringCanonicalTier(tier: RecurringCanonicalTier): void {
	if (!enabled) return;
	switch (tier) {
		case 'memory':
			s.recurringCanonicalMemory++;
			break;
		case 'indexeddb':
			s.recurringCanonicalIndexedDb++;
			break;
		case 'cold_start':
			s.recurringCanonicalColdStart++;
			break;
		case 'cold_coalesced_wait':
			s.recurringCanonicalColdCoalescedWait++;
			break;
	}
	dbg('recurring canonical', tier);
}

export function getPlanPerfSnapshot(): PlanPerfSnapshot {
	return { ...s };
}

export function resetPlanPerfCounters(): void {
	s.planAllowanceCacheHits = 0;
	s.planAllowanceCacheMisses = 0;
	s.weekAnnHits = 0;
	s.weekAnnMissEmpty = 0;
	s.weekAnnMissWrongAccount = 0;
	s.weekAnnMissExpired = 0;
	s.weekAnnDetectPatternsMsTotal = 0;
	s.weekAnnDetectPatternsCalls = 0;
	s.txSnapshotHits = 0;
	s.txSnapshotMisses = 0;
	s.recurringCanonicalMemory = 0;
	s.recurringCanonicalIndexedDb = 0;
	s.recurringCanonicalColdStart = 0;
	s.recurringCanonicalColdCoalescedWait = 0;
}
