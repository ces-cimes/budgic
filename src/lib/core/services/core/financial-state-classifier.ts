/**
 * Financial State Classifier
 *
 * Detects whether the household is in `normal`, `tense`, or `recovery` state
 * from four signals:
 *   1. active_loan_or_schedule — loan accounts or loan_schedule planned txs
 *   2. negative_allowance_event — unrecovered overspend since prior period start
 *   3. lifestyle_pace_high — pace ≥ 1.2 for BOTH current and prior calendar month
 *   4. goal_at_risk — time-bound goal not on track, or debt_payoff goal off track
 *
 * Threshold rules:
 *   recovery  — any recovery-level signal (1 | 2 | 3)
 *   tense     — mild signals only: single-month pace ≥ 1.05 OR one at-risk goal
 *   normal    — no signals
 */

import { db } from '$lib/core/db';
import type { Goal } from '$lib/core/db';
import { computeDailyAllowance } from './allowance-calculation';
import { negativeAllowanceService } from './negative-allowance-service';
import { goalService, isTimeBoundGoalAtRisk } from './goal-service';

export type FinancialState = 'normal' | 'tense' | 'recovery';

export interface FinancialStateResult {
	state: FinancialState;
	signals: string[];
}

/** Pace threshold above which a single-month lifestyle pace counts as recovery-level. */
export const RECOVERY_PACE_THRESHOLD = 1.2;
/** Pace threshold for tense (single month only). */
export const TENSE_PACE_THRESHOLD = 1.05;

/** Returns the last moment of the calendar month before `ref`. */
export function endOfPreviousCalendarMonth(ref: Date = new Date()): Date {
	return new Date(ref.getFullYear(), ref.getMonth(), 0, 23, 59, 59, 999);
}

/** Returns the first moment of the calendar month before `ref`. */
export function startOfPreviousCalendarMonth(ref: Date = new Date()): Date {
	const d = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
	return d;
}

async function hasActiveLoanOrSchedule(): Promise<boolean> {
	const accounts = await db.getActiveAccounts();
	const hasLoanAccount = accounts.some((a) => a.type === 'loan' && a.loanDetails != null);
	if (hasLoanAccount) return true;

	// loan_schedule planned txs live in db.transactions with status='planned'
	const loanScheduleTx = await db.transactions
		.where('status')
		.equals('planned')
		.filter((tx) => !tx.deletedAt && !!tx.reference?.startsWith('loan_schedule:'))
		.first();
	return loanScheduleTx != null;
}

async function hasNegativeAllowanceEvent(priorPeriodStart: Date): Promise<boolean> {
	const events = await negativeAllowanceService.getNegativeAllowanceEvents({
		since: priorPeriodStart,
		unrecoveredOnly: true
	});
	return events.length > 0;
}

/**
 * Returns { current: pace for now, prior: pace for prior calendar month }.
 * Uses `computeDailyAllowance(undefined, undefined, asOf)` so spend inputs
 * are calculated relative to the supplied date.
 */
async function getLifestylePaces(
	now: Date
): Promise<{ current: number; prior: number; priorMonthHasData: boolean }> {
	const priorEnd = endOfPreviousCalendarMonth(now);
	const priorStart = startOfPreviousCalendarMonth(now);

	const [currentView, priorView] = await Promise.all([
		computeDailyAllowance(undefined, undefined, now),
		computeDailyAllowance(priorStart, priorEnd, priorEnd)
	]);

	// If prior month had zero budget configured, treat as no-data (cannot confirm consecutive)
	const priorMonthHasData = priorView.lifestyleBudget > 0;

	return {
		current: currentView.pace,
		prior: priorView.pace,
		priorMonthHasData
	};
}

async function getAtRiskGoals(): Promise<Array<Pick<Goal, 'id' | 'category'>>> {
	const goalsProgress = await goalService.getGoalsProgress();
	const goals = await db.goals.toArray();
	const progressById = new Map(goalsProgress.map((p) => [p.goalId, p]));

	return goals.filter((g) => {
		if (g.deletedAt) return false;
		const progress = progressById.get(g.id);
		if (!progress) return false;

		const atRisk = isTimeBoundGoalAtRisk(g, progress);
		const debtPayoffOffTrack = g.category === 'debt_payoff' && !progress.isOnTrack;
		return atRisk || debtPayoffOffTrack;
	});
}

/**
 * Classify the current household financial state.
 * @param now - Reference date (defaults to current time). Useful for testing.
 */
export async function classifyFinancialState(
	now: Date = new Date()
): Promise<FinancialStateResult> {
	const priorPeriodStart = startOfPreviousCalendarMonth(now);

	const [loanActive, negativeEvent, paces, atRiskGoals] = await Promise.all([
		hasActiveLoanOrSchedule(),
		hasNegativeAllowanceEvent(priorPeriodStart),
		getLifestylePaces(now),
		getAtRiskGoals()
	]);

	const signals: string[] = [];

	// Recovery-level signals
	if (loanActive) signals.push('active_loan_or_schedule');
	if (negativeEvent) signals.push('negative_allowance_event');

	const bothMonthsHighPace =
		paces.priorMonthHasData &&
		paces.current >= RECOVERY_PACE_THRESHOLD &&
		paces.prior >= RECOVERY_PACE_THRESHOLD;

	if (bothMonthsHighPace) signals.push('lifestyle_pace_high');

	// Tense-level signals (only counted when no recovery signal from pace yet)
	const singleMonthHighPace =
		!bothMonthsHighPace &&
		(paces.current >= TENSE_PACE_THRESHOLD ||
			(paces.priorMonthHasData && paces.prior >= TENSE_PACE_THRESHOLD));

	if (atRiskGoals.length > 0) signals.push('goal_at_risk');

	const recoverySignals = new Set([
		'active_loan_or_schedule',
		'negative_allowance_event',
		'lifestyle_pace_high'
	]);
	const hasRecoverySignal = signals.some((s) => recoverySignals.has(s));

	let state: FinancialState;
	if (hasRecoverySignal) {
		state = 'recovery';
	} else if (singleMonthHighPace || atRiskGoals.length > 0) {
		state = 'tense';
	} else {
		state = 'normal';
	}

	return { state, signals };
}
