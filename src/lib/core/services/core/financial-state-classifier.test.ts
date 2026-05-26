import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	classifyFinancialState,
	endOfPreviousCalendarMonth,
	startOfPreviousCalendarMonth,
	RECOVERY_PACE_THRESHOLD,
	TENSE_PACE_THRESHOLD
} from './financial-state-classifier';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('$lib/core/db', () => ({
	db: {
		getActiveAccounts: vi.fn(),
		transactions: {
			where: vi.fn()
		},
		goals: {
			toArray: vi.fn()
		}
	}
}));

vi.mock('./allowance-calculation', () => ({
	computeDailyAllowance: vi.fn()
}));

vi.mock('./negative-allowance-service', () => ({
	negativeAllowanceService: {
		getNegativeAllowanceEvents: vi.fn()
	}
}));

vi.mock('./goal-service', () => ({
	goalService: {
		getGoalsProgress: vi.fn()
	},
	isTimeBoundGoalAtRisk: vi.fn()
}));

import { db } from '$lib/core/db';
import { computeDailyAllowance } from './allowance-calculation';
import { negativeAllowanceService } from './negative-allowance-service';
import { goalService, isTimeBoundGoalAtRisk } from './goal-service';

// ── Helpers ────────────────────────────────────────────────────────────────

function makePaceView(pace: number, lifestyleBudget = 100) {
	return { pace, lifestyleBudget, lifestyleSpent: 0, daily: 0 } as never;
}

/** Build a Dexie-like chain mock that resolves `first()` to `result`. */
function mockTxChain(result: unknown) {
	const firstFn = vi.fn().mockResolvedValue(result);
	const filterFn = vi.fn().mockReturnValue({ first: firstFn });
	const equalsFn = vi.fn().mockReturnValue({ filter: filterFn });
	const whereFn = vi.fn().mockReturnValue({ equals: equalsFn });
	vi.mocked(db.transactions.where).mockImplementation(whereFn);
}

function setupDefaults() {
	vi.mocked(db.getActiveAccounts).mockResolvedValue([]);
	mockTxChain(null); // no loan_schedule tx by default
	vi.mocked(db.goals.toArray).mockResolvedValue([]);
	vi.mocked(negativeAllowanceService.getNegativeAllowanceEvents).mockResolvedValue([]);
	vi.mocked(goalService.getGoalsProgress).mockResolvedValue([]);
	vi.mocked(isTimeBoundGoalAtRisk).mockReturnValue(false);
	// Both months normal pace
	vi.mocked(computeDailyAllowance).mockResolvedValue(makePaceView(1.0));
}

// ── Utility tests ──────────────────────────────────────────────────────────

describe('endOfPreviousCalendarMonth', () => {
	it('returns last moment of prior month for March 15', () => {
		const ref = new Date(2026, 2, 15); // March 15
		const result = endOfPreviousCalendarMonth(ref);
		expect(result.getFullYear()).toBe(2026);
		expect(result.getMonth()).toBe(1); // February
		expect(result.getDate()).toBe(28);
	});

	it('handles January correctly (wraps to December prior year)', () => {
		const ref = new Date(2026, 0, 10); // January 10
		const result = endOfPreviousCalendarMonth(ref);
		expect(result.getFullYear()).toBe(2025);
		expect(result.getMonth()).toBe(11); // December
	});
});

describe('startOfPreviousCalendarMonth', () => {
	it('returns first day of prior month for May', () => {
		const ref = new Date(2026, 4, 26); // May 26
		const result = startOfPreviousCalendarMonth(ref);
		expect(result.getFullYear()).toBe(2026);
		expect(result.getMonth()).toBe(3); // April
		expect(result.getDate()).toBe(1);
	});
});

// ── Classifier tests ───────────────────────────────────────────────────────

describe('classifyFinancialState', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupDefaults();
	});

	it('normal — no signals', async () => {
		const result = await classifyFinancialState();
		expect(result.state).toBe('normal');
		expect(result.signals).toHaveLength(0);
	});

	it('recovery — active loan account', async () => {
		vi.mocked(db.getActiveAccounts).mockResolvedValue([
			{ type: 'loan', loanDetails: { balance: 5000 } } as never
		]);
		const result = await classifyFinancialState();
		expect(result.state).toBe('recovery');
		expect(result.signals).toContain('active_loan_or_schedule');
	});

	it('recovery — loan_schedule planned tx', async () => {
		mockTxChain({ deletedAt: null, reference: 'loan_schedule:abc:1' });
		const result = await classifyFinancialState();
		expect(result.state).toBe('recovery');
		expect(result.signals).toContain('active_loan_or_schedule');
	});

	it('ignores deleted planned tx (filter returns null)', async () => {
		// The filter callback excludes deletedAt rows, so first() returns null
		mockTxChain(null);
		const result = await classifyFinancialState();
		expect(result.state).toBe('normal');
	});

	it('recovery — unrecovered negative allowance event', async () => {
		vi.mocked(negativeAllowanceService.getNegativeAllowanceEvents).mockResolvedValue([
			{ id: 'ev1' } as never
		]);
		const result = await classifyFinancialState();
		expect(result.state).toBe('recovery');
		expect(result.signals).toContain('negative_allowance_event');
	});

	it('recovery — lifestyle pace ≥ 1.2 both months', async () => {
		vi.mocked(computeDailyAllowance)
			.mockResolvedValueOnce(makePaceView(RECOVERY_PACE_THRESHOLD)) // current
			.mockResolvedValueOnce(makePaceView(RECOVERY_PACE_THRESHOLD)); // prior
		const result = await classifyFinancialState();
		expect(result.state).toBe('recovery');
		expect(result.signals).toContain('lifestyle_pace_high');
	});

	it('tense — lifestyle pace ≥ 1.2 only current month', async () => {
		vi.mocked(computeDailyAllowance)
			.mockResolvedValueOnce(makePaceView(RECOVERY_PACE_THRESHOLD)) // current high
			.mockResolvedValueOnce(makePaceView(1.0)); // prior normal
		const result = await classifyFinancialState();
		expect(result.state).toBe('tense');
		expect(result.signals).not.toContain('lifestyle_pace_high');
	});

	it('tense — pace ≥ 1.05 single month', async () => {
		vi.mocked(computeDailyAllowance)
			.mockResolvedValueOnce(makePaceView(TENSE_PACE_THRESHOLD)) // current
			.mockResolvedValueOnce(makePaceView(1.0)); // prior
		const result = await classifyFinancialState();
		expect(result.state).toBe('tense');
	});

	it('tense — at-risk goal', async () => {
		vi.mocked(db.goals.toArray).mockResolvedValue([
			{ id: 'g1', deletedAt: null, category: 'vacation', targetDate: '2026-12-01' } as never
		]);
		vi.mocked(goalService.getGoalsProgress).mockResolvedValue([
			{ goalId: 'g1', isOnTrack: false } as never
		]);
		vi.mocked(isTimeBoundGoalAtRisk).mockReturnValue(true);
		const result = await classifyFinancialState();
		expect(result.state).toBe('tense');
		expect(result.signals).toContain('goal_at_risk');
	});

	it('recovery trumps tense when pace + goal both present', async () => {
		vi.mocked(negativeAllowanceService.getNegativeAllowanceEvents).mockResolvedValue([
			{ id: 'ev1' } as never
		]);
		vi.mocked(db.goals.toArray).mockResolvedValue([
			{ id: 'g1', deletedAt: null, category: 'vacation', targetDate: '2026-12-01' } as never
		]);
		vi.mocked(goalService.getGoalsProgress).mockResolvedValue([
			{ goalId: 'g1', isOnTrack: false } as never
		]);
		vi.mocked(isTimeBoundGoalAtRisk).mockReturnValue(true);
		const result = await classifyFinancialState();
		expect(result.state).toBe('recovery');
	});

	it('prior month zero budget → no consecutive pace signal', async () => {
		vi.mocked(computeDailyAllowance)
			.mockResolvedValueOnce(makePaceView(RECOVERY_PACE_THRESHOLD)) // current high
			.mockResolvedValueOnce(makePaceView(RECOVERY_PACE_THRESHOLD, 0)); // prior no budget
		const result = await classifyFinancialState();
		// pace_high NOT triggered because priorMonthHasData = false
		expect(result.signals).not.toContain('lifestyle_pace_high');
	});
});
