import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Account, Transaction } from '$lib/core/db';
import {
	calculateTotalAllowance,
	computeDailyAllowance,
	getSavingsHintAllowanceContext
} from './allowance-calculation';
import { rolloverService } from './rollover-service';
import type { DailyAllowanceView } from './allowance-calculation';
import { budgetService } from './budget-service';
import { effectiveAmountForCategory } from '$lib/utils/category-utils';
import {
	deduplicateForSpendTotals,
	expandForCategoryAttribution
} from '$lib/utils/transaction-split';

vi.mock('./user-service', () => ({
	userService: {
		getUserPreferences: vi.fn().mockResolvedValue({})
	}
}));

vi.mock('$lib/core/services', () => ({
	exchangeRateService: {
		convertAmountWithQuality: vi.fn(async (amount: number) => ({
			value: amount,
			quality: 'ok' as const
		}))
	}
}));

describe('allowance golden — FX label', () => {
	const account: Account = {
		id: 'acc-eur',
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

	it('returns mainCurrency label while account is foreign currency', async () => {
		const result = await calculateTotalAllowance(
			account,
			{ average: 0, stdDev: 0, monthsOfData: 0, hasEnoughData: false },
			[],
			100,
			5,
			25,
			200,
			{ historical: 0, buffer: 1, velocity: 0 },
			new Date(2026, 4, 1),
			new Date(2026, 4, 15),
			'USD'
		);
		expect(result.currency).toBe('USD');
		expect(account.currency).toBe('EUR');
	});
});

describe('allowance golden — lifestyle at floor', () => {
	beforeEach(() => {
		vi.spyOn(budgetService, 'getLifestyleCategorySpendInputs').mockReset();
	});

	it('suppressLifestyleHints when remaining/budget below 10%', async () => {
		const now = new Date();
		vi.spyOn(budgetService, 'getLifestyleCategorySpendInputs').mockResolvedValue({
			mainCurrency: 'USD',
			inputs: [
				{
					categoryId: 'l1',
					categoryName: 'Fun',
					budgetAmount: 500,
					spentAmount: 480,
					remainingAmount: 20,
					daysRemaining: 8,
					budgetPeriod: 'monthly',
					periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
					periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0)
				}
			]
		});
		const ctx = await getSavingsHintAllowanceContext();
		expect(ctx.discretionaryBinding).toBe('at_floor');
		expect(ctx.suppressLifestyleHints).toBe(true);
	});
});

describe('allowance golden — mixed weekly + monthly daily sum', () => {
	beforeEach(() => {
		vi.spyOn(budgetService, 'getLifestyleCategorySpendInputs').mockReset();
	});

	it('sums per-category daily rates for mixed periods', async () => {
		const now = new Date();
		vi.spyOn(budgetService, 'getLifestyleCategorySpendInputs').mockResolvedValue({
			mainCurrency: 'USD',
			inputs: [
				{
					categoryId: 'm',
					categoryName: 'Monthly',
					budgetAmount: 300,
					spentAmount: 100,
					remainingAmount: 200,
					daysRemaining: 10,
					budgetPeriod: 'monthly',
					periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
					periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0)
				},
				{
					categoryId: 'w',
					categoryName: 'Weekly',
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
		expect(result.daily).toBeCloseTo(200 / 10 + 50 / 5, 5);
	});
});

describe('allowance golden — rollover per categoryId', () => {
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

	it('applies categoryId deltas not bucket totals', () => {
		const updated = rolloverService.applyDeltasToAllowance(baseAllowance(), { a: 10, b: -5 });
		expect(updated.lifestyleLines.find((l) => l.categoryId === 'a')?.budgetAmount).toBe(160);
		expect(updated.lifestyleLines.find((l) => l.categoryId === 'b')?.budgetAmount).toBe(95);
	});
});

describe('allowance golden — split attribution via budget spend path', () => {
	const periodStart = new Date(2026, 4, 1);
	const clearedDate = '2026-05-10T12:00:00.000Z';

	const softTx = {
		id: 'soft',
		type: 'expense',
		status: 'cleared',
		clearedDate,
		amount: -100,
		currency: 'USD',
		categoryId: 'gro',
		categoryWeights: [
			{ categoryId: 'gro', weight: 0.6 },
			{ categoryId: 'hh', weight: 0.4 }
		],
		createdAt: clearedDate,
		updatedAt: clearedDate,
		deletedAt: null
	} as unknown as Transaction;

	const gid = 'g-golden';
	const hardMembers = [
		{
			id: 'h1',
			type: 'expense',
			status: 'cleared',
			clearedDate,
			groupId: gid,
			amount: -60,
			currency: 'USD',
			categoryId: 'gro',
			createdAt: clearedDate,
			updatedAt: clearedDate,
			deletedAt: null
		},
		{
			id: 'h2',
			type: 'expense',
			status: 'cleared',
			clearedDate,
			groupId: gid,
			amount: -40,
			currency: 'USD',
			categoryId: 'hh',
			createdAt: clearedDate,
			updatedAt: clearedDate,
			deletedAt: null
		}
	] as unknown as Transaction[];

	async function sumForCategory(txs: Transaction[], categoryId: string) {
		return (
			await budgetService.sumCategorySpending(
				categoryId,
				txs,
				new Set(),
				'USD',
				periodStart,
				'conservative'
			)
		).sum;
	}

	it('soft 60/40 matches expanded hard partitioned group per category', async () => {
		const expanded = expandForCategoryAttribution(hardMembers);
		const groSoft = await sumForCategory([softTx], 'gro');
		const hhSoft = await sumForCategory([softTx], 'hh');
		const groHard = await sumForCategory(expanded, 'gro');
		const hhHard = await sumForCategory(expanded, 'hh');
		expect(groSoft).toBe(60);
		expect(hhSoft).toBe(40);
		expect(groHard).toBe(60);
		expect(hhHard).toBe(40);
		expect(deduplicateForSpendTotals(hardMembers).length).toBe(1);
		expect(Math.abs(effectiveAmountForCategory(softTx, 'gro'))).toBe(60);
	});
});
