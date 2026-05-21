import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Account } from '$lib/core/db';
import {
	calculateTotalAllowance,
	computeDailyAllowance,
	DEFAULT_SAVINGS_HINT_LIFESTYLE_FLOOR_RATIO,
	getSavingsHintAllowanceContext,
	PACE_OVER_THRESHOLD,
	PACE_UNDER_THRESHOLD,
	paceSignalFromRatio
} from './allowance-calculation';

vi.mock('./budget-service', () => ({
	budgetService: {
		getLifestyleCategorySpendInputs: vi.fn()
	}
}));

vi.mock('./user-service', () => ({
	userService: {
		getUserPreferences: vi.fn()
	}
}));

import { budgetService } from './budget-service';
import { userService } from './user-service';

describe('getSavingsHintAllowanceContext', () => {
	beforeEach(() => {
		vi.mocked(budgetService.getLifestyleCategorySpendInputs).mockReset();
		vi.mocked(userService.getUserPreferences).mockReset();
		vi.mocked(userService.getUserPreferences).mockResolvedValue({} as never);
	});

	it('returns unknown when no lifestyle budgets', async () => {
		vi.mocked(budgetService.getLifestyleCategorySpendInputs).mockResolvedValue({
			mainCurrency: 'USD',
			inputs: []
		});
		const ctx = await getSavingsHintAllowanceContext({ floorRatio: 0.1 });
		expect(ctx.discretionaryBinding).toBe('unknown');
		expect(ctx.suppressLifestyleHints).toBe(false);
	});

	it('sets at_floor and suppressLifestyleHints below default ratio', async () => {
		const now = new Date();
		vi.mocked(budgetService.getLifestyleCategorySpendInputs).mockResolvedValue({
			mainCurrency: 'USD',
			inputs: [
				{
					categoryId: 'cat-a',
					categoryName: 'Dining',
					budgetAmount: 1000,
					spentAmount: 950,
					remainingAmount: 50,
					daysRemaining: 10,
					budgetPeriod: 'monthly',
					periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
					periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0)
				}
			]
		});
		const ctx = await getSavingsHintAllowanceContext();
		expect(ctx.discretionaryBinding).toBe('at_floor');
		expect(ctx.suppressLifestyleHints).toBe(true);
		expect(DEFAULT_SAVINGS_HINT_LIFESTYLE_FLOOR_RATIO).toBe(0.1);
	});

	it('forceSuppressLifestyleHints overrides has_room (Milestone F hook)', async () => {
		const now = new Date();
		vi.mocked(budgetService.getLifestyleCategorySpendInputs).mockResolvedValue({
			mainCurrency: 'USD',
			inputs: [
				{
					categoryId: 'cat-a',
					categoryName: 'Dining',
					budgetAmount: 1000,
					spentAmount: 200,
					remainingAmount: 800,
					daysRemaining: 10,
					budgetPeriod: 'monthly',
					periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
					periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0)
				}
			]
		});
		const ctx = await getSavingsHintAllowanceContext({ forceSuppressLifestyleHints: true });
		expect(ctx.discretionaryBinding).toBe('has_room');
		expect(ctx.suppressLifestyleHints).toBe(true);
	});

	it('has_room when lifestyle headroom is above floor', async () => {
		const now = new Date();
		vi.mocked(budgetService.getLifestyleCategorySpendInputs).mockResolvedValue({
			mainCurrency: 'USD',
			inputs: [
				{
					categoryId: 'cat-a',
					categoryName: 'Dining',
					budgetAmount: 1000,
					spentAmount: 200,
					remainingAmount: 800,
					daysRemaining: 10,
					budgetPeriod: 'monthly',
					periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
					periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0)
				}
			]
		});
		const ctx = await getSavingsHintAllowanceContext();
		expect(ctx.discretionaryBinding).toBe('has_room');
		expect(ctx.suppressLifestyleHints).toBe(false);
	});
});

describe('computeDailyAllowance', () => {
	beforeEach(() => {
		vi.mocked(budgetService.getLifestyleCategorySpendInputs).mockReset();
	});

	it('sums daily rates from monthly and weekly lifestyle categories', async () => {
		const now = new Date();
		vi.mocked(budgetService.getLifestyleCategorySpendInputs).mockResolvedValue({
			mainCurrency: 'USD',
			inputs: [
				{
					categoryId: 'cat-monthly',
					categoryName: 'Fun',
					budgetAmount: 300,
					spentAmount: 100,
					remainingAmount: 200,
					daysRemaining: 10,
					budgetPeriod: 'monthly',
					periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
					periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0)
				},
				{
					categoryId: 'cat-weekly',
					categoryName: 'Coffee',
					budgetAmount: 70,
					spentAmount: 20,
					remainingAmount: 50,
					daysRemaining: 5,
					budgetPeriod: 'weekly',
					periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
					periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0)
				}
			]
		});

		const result = await computeDailyAllowance();
		expect(result.currency).toBe('USD');
		expect(result.daily).toBeCloseTo(200 / 10 + 50 / 5, 5);
		expect(result.lifestyleRemaining).toBe(250);
		expect(result.lifestyleLines).toHaveLength(2);
	});

	it('assigns pace signal from thresholds', () => {
		expect(paceSignalFromRatio(1.2)).toBe('over_pace');
		expect(paceSignalFromRatio(0.8)).toBe('under_pace');
		expect(paceSignalFromRatio(1)).toBe('on_track');
		expect(PACE_OVER_THRESHOLD).toBe(1.05);
		expect(PACE_UNDER_THRESHOLD).toBe(0.85);
	});
});

describe('calculateTotalAllowance (legacy fallback)', () => {
	const account: Account = {
		id: 'acc-1',
		name: 'Checking',
		type: 'checking',
		currency: 'EUR',
		currentBalance: 1000,
		initialBalance: 1000,
		isActive: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: null
	};

	const emptyHistorical = {
		average: 0,
		stdDev: 0,
		monthsOfData: 0,
		hasEnoughData: false
	};

	const methodWeights = { historical: 0, buffer: 1, velocity: 0 };

	it('uses spentSoFar for projectedBalance when over monthly cap', async () => {
		const spentSoFar = 800;
		const result = await calculateTotalAllowance(
			account,
			emptyHistorical,
			[],
			spentSoFar,
			10,
			20,
			500,
			methodWeights,
			new Date(2026, 4, 1),
			new Date(2026, 4, 15),
			'USD'
		);
		expect(result.projectedBalance).toBe(account.currentBalance - spentSoFar);
		expect(result.projectedBalance).toBe(200);
	});

	it('returns mainCurrency label not account currency', async () => {
		const result = await calculateTotalAllowance(
			account,
			emptyHistorical,
			[],
			100,
			5,
			25,
			200,
			methodWeights,
			new Date(2026, 4, 1),
			new Date(2026, 4, 15),
			'USD'
		);
		expect(result.currency).toBe('USD');
		expect(account.currency).toBe('EUR');
	});
});
