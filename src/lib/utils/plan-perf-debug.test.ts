import { describe, it, expect, beforeEach } from 'vitest';
import { getPlanPerfSnapshot, resetPlanPerfCounters } from './plan-perf-debug';

describe('plan-perf-debug', () => {
	beforeEach(() => {
		resetPlanPerfCounters();
	});

	it('reset leaves counters at zero with stable snapshot shape', () => {
		const s = getPlanPerfSnapshot();
		expect(s.planAllowanceCacheHits).toBe(0);
		expect(s.planAllowanceCacheMisses).toBe(0);
		expect(s.weekAnnHits).toBe(0);
		expect(s.txSnapshotHits).toBe(0);
		expect(s.recurringCanonicalColdStart).toBe(0);
		expect(Object.keys(s).length).toBeGreaterThanOrEqual(10);
	});
});
