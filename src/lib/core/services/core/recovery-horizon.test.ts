import { describe, it, expect } from 'vitest';
import {
	computeWeeklySurplusFromProjection,
	computeWeeklySurplusFallback,
	computeProgressPct,
	computeAggregateClearanceDate,
	computeRecoveryTradeOff,
	resolveWeeklySurplus,
	WEEKS_PER_MONTH
} from './recovery-horizon';
import type { AllowanceProjection } from './budget-service';

function baseProjection(overrides: Partial<AllowanceProjection> = {}): AllowanceProjection {
	return {
		committed: 2000,
		planned: 500,
		periodIncome: 4000,
		uncertaintyBand: 100,
		available: 1500,
		availableMin: 1400,
		availableMax: 1500,
		confidence: {
			ratio: 0.9,
			tier: 'high',
			unclassifiedSpend: 0,
			totalSpend: 1000,
			exactSpend: 900,
			inferredSpend: 100
		},
		recoveryDeduction: 0,
		debtOverflowShortfall: 0,
		activeDebtGroupIds: [],
		hasAcknowledgedDebtInPeriod: false,
		recoveryWeeksEstimate: null,
		periodStart: '2026-05-01T00:00:00.000Z',
		periodEnd: '2026-05-31T23:59:59.999Z',
		currency: 'USD',
		passiveAccrualAdjustment: 0,
		...overrides
	};
}

describe('recovery horizon math', () => {
	it('computes weekly surplus from projection income minus committed and planned', () => {
		const projection = baseProjection();
		const surplus = computeWeeklySurplusFromProjection(projection);
		expect(surplus).toBeCloseTo((4000 - 2000 - 500) / WEEKS_PER_MONTH, 5);
	});

	it('falls back to lifestyle headroom when projection surplus is zero', () => {
		const projection = baseProjection({ periodIncome: 2500 });
		const resolved = resolveWeeklySurplus(projection, 400, 20);
		expect(computeWeeklySurplusFromProjection(projection)).toBe(0);
		expect(resolved).toBeCloseTo(400 / (20 / 7), 5);
	});

	it('uses lifestyle fallback helper directly', () => {
		expect(computeWeeklySurplusFallback(350, 14)).toBeCloseTo(350 / 2, 5);
	});

	it('computes debt-free progress from original vs remaining balance', () => {
		expect(computeProgressPct(2500, 10000)).toBe(75);
		expect(computeProgressPct(0, 10000)).toBe(100);
		expect(computeProgressPct(500, 0)).toBe(0);
	});

	it('extrapolates aggregate clearance from total balance and weekly surplus', () => {
		const iso = computeAggregateClearanceDate(5200, 100, []);
		expect(iso).toBeTruthy();
		const weeksOut = (new Date(iso!).getTime() - Date.now()) / (7 * 86_400_000);
		expect(weeksOut).toBeCloseTo(52, 0);
	});

	it('returns now when obligation balance is cleared', () => {
		const iso = computeAggregateClearanceDate(0, 100, []);
		expect(new Date(iso!).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
	});

	it('computes trade-off weeks saved from lifestyle reduction slice', () => {
		const tradeOff = computeRecoveryTradeOff(50, 2600, 280, 28, 20);
		expect(tradeOff).not.toBeNull();
		expect(tradeOff!.lifestyleReductionPerWeek).toBeGreaterThan(0);
		expect(tradeOff!.weeksSaved).toBeGreaterThan(0);
	});

	it('returns null trade-off when no surplus or no debt', () => {
		expect(computeRecoveryTradeOff(0, 1000, 200, 30, 10)).toBeNull();
		expect(computeRecoveryTradeOff(50, 0, 200, 30, 10)).toBeNull();
	});
});
