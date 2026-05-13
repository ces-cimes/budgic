import { describe, it, expect } from 'vitest';
import {
	computeSavingsVariabilityHint,
	SAVINGS_VARIABILITY_MIN_MONTHS,
	SAVINGS_VARIABILITY_DIVERGENCE_RATIO
} from './category-savings-variability';

function months(amounts: number[], year = 2024): { monthKey: string; amount: number }[] {
	return amounts.map((amount, i) => ({
		monthKey: `${year}-${String(i + 1).padStart(2, '0')}`,
		amount
	}));
}

describe('computeSavingsVariabilityHint', () => {
	it('returns null when fewer than MIN_MONTHS', () => {
		expect(
			computeSavingsVariabilityHint({
				months: months([100, 120]),
				budgetAmount: 500,
				predictedMonthlySpend: 100
			})
		).toBeNull();
	});

	it('returns null when mean spend is ~0', () => {
		expect(
			computeSavingsVariabilityHint({
				months: months([0, 0, 0]),
				budgetAmount: 500,
				predictedMonthlySpend: 0
			})
		).toBeNull();
	});

	it('returns null when predicted exceeds divergence ratio of budget', () => {
		const b = 100;
		expect(
			computeSavingsVariabilityHint({
				months: months([10, 12, 11]),
				budgetAmount: b,
				predictedMonthlySpend: b * SAVINGS_VARIABILITY_DIVERGENCE_RATIO + 1
			})
		).toBeNull();
	});

	it('returns null when headroom below minimum slack', () => {
		expect(
			computeSavingsVariabilityHint({
				months: months([95, 98, 97]),
				budgetAmount: 100,
				predictedMonthlySpend: 96
			})
		).toBeNull();
	});

	it('computes CV, headroom, and ranking for stable underspend', () => {
		const r = computeSavingsVariabilityHint({
			months: months([100, 102, 101]),
			budgetAmount: 500,
			predictedMonthlySpend: 110
		});
		expect(r).not.toBeNull();
		expect(r!.monthCount).toBeGreaterThanOrEqual(SAVINGS_VARIABILITY_MIN_MONTHS);
		expect(r!.rollingAverage).toBeCloseTo(101, 5);
		expect(r!.headroom).toBeCloseTo(500 - 110, 5);
		expect(r!.coefficientOfVariation).toBeGreaterThan(0);
		expect(r!.rankingScore).toBeGreaterThan(0);
	});

	it('honours minSurplusFromPreferences', () => {
		expect(
			computeSavingsVariabilityHint({
				months: months([100, 100, 100]),
				budgetAmount: 200,
				predictedMonthlySpend: 100,
				minSurplusFromPreferences: 500
			})
		).toBeNull();

		const ok = computeSavingsVariabilityHint({
			months: months([50, 50, 50]),
			budgetAmount: 500,
			predictedMonthlySpend: 50,
			minSurplusFromPreferences: 10
		});
		expect(ok).not.toBeNull();
		expect(ok!.headroom).toBe(450);
	});
});
