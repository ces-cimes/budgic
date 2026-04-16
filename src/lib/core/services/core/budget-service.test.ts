import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { budgetService, computeDeadlineChunk } from './budget-service';

vi.mock('../analytics/recurring-transaction-intelligence-service', () => ({
	recurringTransactionIntelligenceService: {
		detectPatterns: vi.fn().mockResolvedValue([])
	}
}));

vi.mock('$lib/core/db', async () => {
	const actual = await vi.importActual('$lib/core/db');
	return {
		...actual,
		db: {
			getActiveCategories: vi.fn(),
			getActiveAccounts: vi.fn(),
			transactions: {
				toArray: vi.fn(),
				update: vi.fn()
			},
			userPreferences: {
				toCollection: vi.fn(() => ({
					first: vi.fn()
				})),
				update: vi.fn()
			}
		}
	};
});

import { db } from '$lib/core/db';

describe('budgetService reimbursement allowance mode', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.getActiveCategories).mockResolvedValue([
			{
				id: 'cat-lifestyle',
				name: 'Lifestyle',
				waterfallTier: 'lifestyle',
				priority: 1
			}
		] as any);
		vi.mocked(db.getActiveAccounts).mockResolvedValue([
			{ id: 'checking-1', type: 'checking' },
			{ id: 'credit-1', type: 'credit' }
		] as any);
	});

	it('uses full expense in conservative mode', async () => {
		vi.mocked(db.transactions.toArray).mockResolvedValue([
			{
				id: 'tx-1',
				type: 'expense',
				status: 'cleared',
				amount: -100,
				currency: 'USD',
				categoryId: 'cat-lifestyle',
				clearedDate: '2026-04-01T00:00:00.000Z',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null,
				reimbursements: [
					{
						id: 'r-1',
						direction: 'lending',
						amount: 40,
						currency: 'USD',
						status: 'expecting',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					}
				]
			}
		] as any);
		vi.mocked(db.userPreferences.toCollection).mockReturnValue({
			first: vi.fn().mockResolvedValue({
				reimbursementAllowanceMode: 'conservative',
				currency: 'USD',
				recoveryAggressiveness: 0.2,
				debtRecoveryActive: false
			})
		} as any);

		const summary = await budgetService.getBudgetSummary();
		expect(summary.confidence.exactSpend).toBe(100);
		expect(summary.confidence.ratio).toBe(1);
	});

	it('nets open lending reimbursements in optimistic mode', async () => {
		vi.mocked(db.transactions.toArray).mockResolvedValue([
			{
				id: 'tx-1',
				type: 'expense',
				status: 'cleared',
				amount: -100,
				currency: 'USD',
				categoryId: 'cat-lifestyle',
				clearedDate: '2026-04-02T00:00:00.000Z',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null,
				reimbursements: [
					{
						id: 'r-1',
						direction: 'lending',
						amount: 40,
						currency: 'USD',
						status: 'expecting',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					}
				]
			}
		] as any);
		vi.mocked(db.userPreferences.toCollection).mockReturnValue({
			first: vi.fn().mockResolvedValue({
				reimbursementAllowanceMode: 'optimistic',
				currency: 'USD',
				recoveryAggressiveness: 0.2,
				debtRecoveryActive: false
			})
		} as any);

		const summary = await budgetService.getBudgetSummary();
		expect(summary.confidence.exactSpend).toBe(60);
		expect(summary.confidence.ratio).toBe(1);
	});

	it('does not double count matched transfer to credit account', async () => {
		vi.mocked(db.transactions.toArray).mockResolvedValue([
			{
				id: 'exp-1',
				type: 'expense',
				status: 'cleared',
				accountId: 'credit-1',
				amount: -250,
				currency: 'USD',
				categoryId: 'cat-lifestyle',
				clearedDate: '2026-04-08T00:00:00.000Z',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			},
			{
				id: 'xfer-1',
				type: 'transfer',
				status: 'cleared',
				accountId: 'checking-1',
				amount: -250,
				currency: 'USD',
				clearedDate: '2026-04-09T00:00:00.000Z',
				transferDetails: { toAccountId: 'credit-1', transferAmount: 250, feeAmount: 0 },
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			}
		] as any);
		vi.mocked(db.userPreferences.toCollection).mockReturnValue({
			first: vi.fn().mockResolvedValue({
				reimbursementAllowanceMode: 'conservative',
				currency: 'USD',
				recoveryAggressiveness: 0.2,
				debtRecoveryActive: false
			})
		} as any);

		const summary = await budgetService.getBudgetSummary();
		expect(summary.confidence.exactSpend).toBe(250);
	});
});

describe('computeDeadlineChunk', () => {
	it('splits amount across remaining months until deadline', () => {
		const periodStart = new Date('2026-04-01T00:00:00.000Z');
		const periodEnd = new Date('2026-04-30T23:59:59.999Z');
		const today = new Date('2026-04-10T12:00:00.000Z');
		const chunk = computeDeadlineChunk(
			{
				amount: -300,
				deadline: '2026-06-15T00:00:00.000Z',
				spreadingStrategy: 'linear'
			},
			periodStart,
			periodEnd,
			today
		);
		expect(chunk).toBeCloseTo(100, 0);
	});
});

describe('budgetService.getAllowanceProjection', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'));
		vi.clearAllMocks();
		budgetService.invalidateProjectionCache();
		vi.mocked(db.getActiveCategories).mockResolvedValue([
			{
				id: 'cat-lifestyle',
				name: 'Lifestyle',
				waterfallTier: 'lifestyle',
				priority: 1
			}
		] as any);
		vi.mocked(db.getActiveAccounts).mockResolvedValue([
			{ id: 'checking-1', type: 'checking' },
			{ id: 'credit-1', type: 'credit' }
		] as any);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('counts planned expenses in planned layer but not committed', async () => {
		vi.mocked(db.transactions.toArray).mockResolvedValue([
			{
				id: 'inc-1',
				type: 'income',
				status: 'cleared',
				amount: 5000,
				currency: 'USD',
				clearedDate: '2026-04-01T00:00:00.000Z',
				createdAt: '2026-04-01T00:00:00.000Z',
				updatedAt: '2026-04-01T00:00:00.000Z',
				deletedAt: null
			},
			{
				id: 'exp-1',
				type: 'expense',
				status: 'cleared',
				amount: -100,
				currency: 'USD',
				categoryId: 'cat-lifestyle',
				clearedDate: '2026-04-05T00:00:00.000Z',
				createdAt: '2026-04-05T00:00:00.000Z',
				updatedAt: '2026-04-05T00:00:00.000Z',
				deletedAt: null
			},
			{
				id: 'plan-1',
				type: 'expense',
				status: 'planned',
				amount: -250,
				currency: 'USD',
				categoryId: 'cat-lifestyle',
				plannedDate: '2026-04-20T00:00:00.000Z',
				createdAt: '2026-04-10T00:00:00.000Z',
				updatedAt: '2026-04-10T00:00:00.000Z',
				deletedAt: null
			}
		] as any);
		vi.mocked(db.userPreferences.toCollection).mockReturnValue({
			first: vi.fn().mockResolvedValue({
				reimbursementAllowanceMode: 'conservative',
				currency: 'USD',
				recoveryAggressiveness: 0.2,
				debtRecoveryActive: false
			})
		} as any);

		const proj = await budgetService.getAllowanceProjection();
		expect(proj.committed).toBe(100);
		expect(proj.planned).toBe(250);
		expect(proj.periodIncome).toBe(5000);
		expect(proj.available).toBe(5000 - 100 - 250);
		expect(proj.passiveAccrualAdjustment).toBe(0);
	});

	it('applies recovery deduction when debt recovery is active', async () => {
		vi.mocked(db.transactions.toArray).mockResolvedValue([
			{
				id: 'inc-1',
				type: 'income',
				status: 'cleared',
				amount: 4000,
				currency: 'USD',
				clearedDate: '2026-04-01T00:00:00.000Z',
				createdAt: '2026-04-01T00:00:00.000Z',
				updatedAt: '2026-04-01T00:00:00.000Z',
				deletedAt: null
			},
			{
				id: 'exp-1',
				type: 'expense',
				status: 'cleared',
				amount: -200,
				currency: 'USD',
				categoryId: 'cat-lifestyle',
				clearedDate: '2026-04-05T00:00:00.000Z',
				createdAt: '2026-04-05T00:00:00.000Z',
				updatedAt: '2026-04-05T00:00:00.000Z',
				deletedAt: null
			}
		] as any);
		vi.mocked(db.userPreferences.toCollection).mockReturnValue({
			first: vi.fn().mockResolvedValue({
				reimbursementAllowanceMode: 'conservative',
				currency: 'USD',
				recoveryAggressiveness: 0.25,
				debtRecoveryActive: true
			})
		} as any);

		const proj = await budgetService.getAllowanceProjection();
		expect(proj.recoveryDeduction).toBe(1000);
		expect(proj.available).toBe(4000 - 200 - 1000);
		expect(proj.passiveAccrualAdjustment).toBe(0);
	});

	it('adds passive savings accrual to periodIncome when includeAccruedInNetWorth is on', async () => {
		vi.mocked(db.transactions.toArray).mockResolvedValue([] as any);
		vi.mocked(db.getActiveAccounts).mockResolvedValue([
			{ id: 'checking-1', type: 'checking' },
			{
				id: 'sav-1',
				type: 'savings',
				currency: 'USD',
				currentBalance: 10_000,
				lastConfirmedBalance: 10_000,
				lastConfirmedAt: '2026-03-01T00:00:00.000Z',
				rateProfile: {
					apr: 0.45,
					compounding: 'daily' as const,
					rateType: 'fixed' as const,
					effectiveFrom: '2026-01-01T00:00:00.000Z'
				},
				deletedAt: null
			}
		] as any);
		vi.mocked(db.userPreferences.toCollection).mockReturnValue({
			first: vi.fn().mockResolvedValue({
				reimbursementAllowanceMode: 'conservative',
				currency: 'USD',
				recoveryAggressiveness: 0.2,
				debtRecoveryActive: false,
				includeAccruedInNetWorth: true
			})
		} as any);

		const proj = await budgetService.getAllowanceProjection();
		expect(proj.passiveAccrualAdjustment).toBeGreaterThan(0);
		expect(proj.periodIncome).toBe(proj.passiveAccrualAdjustment);
	});

	it('does not add passive accrual when includeAccruedInNetWorth is off', async () => {
		vi.mocked(db.transactions.toArray).mockResolvedValue([] as any);
		vi.mocked(db.getActiveAccounts).mockResolvedValue([
			{ id: 'checking-1', type: 'checking' },
			{
				id: 'sav-1',
				type: 'savings',
				currency: 'USD',
				currentBalance: 10_000,
				lastConfirmedBalance: 10_000,
				lastConfirmedAt: '2026-03-01T00:00:00.000Z',
				rateProfile: {
					apr: 0.45,
					compounding: 'daily' as const,
					rateType: 'fixed' as const,
					effectiveFrom: '2026-01-01T00:00:00.000Z'
				},
				deletedAt: null
			}
		] as any);
		vi.mocked(db.userPreferences.toCollection).mockReturnValue({
			first: vi.fn().mockResolvedValue({
				reimbursementAllowanceMode: 'conservative',
				currency: 'USD',
				recoveryAggressiveness: 0.2,
				debtRecoveryActive: false,
				includeAccruedInNetWorth: false
			})
		} as any);

		const proj = await budgetService.getAllowanceProjection();
		expect(proj.passiveAccrualAdjustment).toBe(0);
		expect(proj.periodIncome).toBe(0);
	});

	it('subtracts booked interest-income from passive accrual for the same savings account', async () => {
		vi.mocked(db.transactions.toArray).mockResolvedValue([
			{
				id: 'int-1',
				type: 'income',
				status: 'cleared',
				amount: 50_000,
				currency: 'USD',
				accountId: 'sav-1',
				automation: 'interest-income',
				clearedDate: '2026-04-10T00:00:00.000Z',
				createdAt: '2026-04-10T00:00:00.000Z',
				updatedAt: '2026-04-10T00:00:00.000Z',
				deletedAt: null
			}
		] as any);
		vi.mocked(db.getActiveAccounts).mockResolvedValue([
			{ id: 'checking-1', type: 'checking' },
			{
				id: 'sav-1',
				type: 'savings',
				currency: 'USD',
				currentBalance: 10_000,
				lastConfirmedBalance: 10_000,
				lastConfirmedAt: '2026-03-01T00:00:00.000Z',
				rateProfile: {
					apr: 0.45,
					compounding: 'daily' as const,
					rateType: 'fixed' as const,
					effectiveFrom: '2026-01-01T00:00:00.000Z'
				},
				deletedAt: null
			}
		] as any);
		vi.mocked(db.userPreferences.toCollection).mockReturnValue({
			first: vi.fn().mockResolvedValue({
				reimbursementAllowanceMode: 'conservative',
				currency: 'USD',
				recoveryAggressiveness: 0.2,
				debtRecoveryActive: false,
				includeAccruedInNetWorth: true
			})
		} as any);

		const proj = await budgetService.getAllowanceProjection();
		expect(proj.passiveAccrualAdjustment).toBe(0);
		expect(proj.periodIncome).toBe(50_000);
	});
});
