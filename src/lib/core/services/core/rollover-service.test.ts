import { describe, it, expect } from 'vitest';
import { rolloverService } from './rollover-service';
import type { DailyAllowanceView } from './allowance-calculation';

function baseAllowance(): DailyAllowanceView {
	const now = new Date();
	return {
		daily: 20,
		monthlyRemaining: 200,
		lifestyleRemaining: 200,
		lifestyleSpent: 50,
		lifestyleBudget: 250,
		pace: 1,
		signal: 'on_track',
		confidenceLevel: 'high',
		currency: 'USD',
		lifestyleLines: [
			{
				categoryId: 'a',
				categoryName: 'A',
				budgetAmount: 150,
				spentAmount: 30,
				remaining: 120,
				dailyRate: 12,
				daysRemaining: 10
			},
			{
				categoryId: 'b',
				categoryName: 'B',
				budgetAmount: 100,
				spentAmount: 20,
				remaining: 80,
				dailyRate: 8,
				daysRemaining: 10
			}
		],
		total: {
			dailySafe: 20,
			monthly: 250,
			remaining: 200,
			spentSoFar: 50,
			daysRemaining: 10,
			currency: 'USD',
			confidence: 0.9,
			projectedBalance: 0
		},
		periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
		periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0),
		recommendations: []
	};
}

describe('rolloverService.applyDeltasToAllowance', () => {
	it('applies per-categoryId deltas to lifestyle lines', () => {
		const allowance = baseAllowance();
		const updated = rolloverService.applyDeltasToAllowance(allowance, {
			a: 10,
			b: -5
		});
		const lineA = updated.lifestyleLines.find((l) => l.categoryId === 'a');
		const lineB = updated.lifestyleLines.find((l) => l.categoryId === 'b');
		expect(lineA?.budgetAmount).toBe(160);
		expect(lineB?.budgetAmount).toBe(95);
		expect(updated.daily).toBeCloseTo(130 / 10 + 75 / 10, 5);
	});
});
