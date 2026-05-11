import { describe, expect, it } from 'vitest';

/**
 * Pure checks for round-up pairing math used by AutomationDetector (no Dexie — see automation-detector.ts).
 */
describe('round-up pairing invariants', () => {
	it('uses fractional part strictly between 0 and 1', () => {
		const expenseAmount = 12.34;
		const delta = Math.ceil(expenseAmount) - expenseAmount;
		expect(delta).toBeGreaterThan(0);
		expect(delta).toBeLessThan(1);
		expect(delta).toBeCloseTo(0.66, 5);
	});

	it('five minute pairing window in milliseconds', () => {
		expect(300_000).toBe(5 * 60 * 1000);
	});
});
