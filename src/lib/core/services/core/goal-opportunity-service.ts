/**
 * Goal Opportunity Service (Phase 2.2)
 * Surplus detection and "contribute to goals?" suggestions with impact (e.g. moves target date).
 */

import { goalService } from '$lib/core/services/core/goal-service';
import type { Goal } from '$lib/core/db';
import type { RequiredSavingsResult } from '$lib/core/services/core/goal-service';
import { calculateGlobalAllowance } from '$lib/utils/allowance-utils';
import { transactionService } from '$lib/core/services/core/transaction-service';
import { userService } from '$lib/core/services/core/user-service';
import { db } from '$lib/core/db';

/** Minimum surplus (in user currency) to show opportunity suggestions. */
const DEFAULT_SURPLUS_THRESHOLD = 50;

export interface ProjectedSurplusBreakdown {
	income: number;
	essential: number;
	buffer: number;
	allowances: number;
	savingsCommitment: number;
	surplus: number;
	currency: string;
}

export interface SavingsOpportunity {
	goalId: string;
	goalName: string;
	currency: string;
	/** Suggested one-time contribution from surplus (capped at surplus and goal remaining) */
	suggestedAmount: number;
	/** e.g. "Moves target date from June 2026 to May 2026" or "Gets you 1 month closer" */
	impactMessage: string;
	/** For time-bound: months earlier with this contribution */
	monthsEarlier?: number;
}

export interface SavingsOpportunitiesResult {
	/** Projected surplus this period (Income - Essential - Buffer - Allowances - Savings commitment) */
	surplus: number;
	currency: string;
	breakdown: ProjectedSurplusBreakdown;
	/** Only present when surplus >= threshold */
	opportunities: SavingsOpportunity[];
	/** Threshold used for opportunity detection */
	threshold: number;
}

class GoalOpportunityService {
	public get ready() {
		return Promise.resolve();
	}

	/**
	 * Get projected surplus for the current period (month).
	 * Surplus = Income - Essential expenses - Buffer - Allowances - Current savings commitment
	 */
	async getProjectedSurplus(
		periodStart?: Date,
		periodEnd?: Date
	): Promise<ProjectedSurplusBreakdown> {
		const now = new Date();
		const start = periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
		const end =
			periodEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

		const preferences = await userService.getUserPreferences();
		const currency = preferences?.currency ?? 'USD';

		// 1. Projected income for period (cleared + planned transactions in range)
		const income = await this.getProjectedIncomeForPeriod(start, end, currency);

		// 2. Allowance breakdown (essential, buffer, discretionary) for the period
		const allowance = await calculateGlobalAllowance(start, end);
		const essential = allowance.essential.monthly;
		const buffer = allowance.buffer.monthly;
		const allowances = allowance.discretionary.monthly;

		// 3. Current savings commitment = sum of active goals' monthly contribution or required monthly
		const savingsCommitment = await this.getCurrentSavingsCommitment(currency);

		const surplus = income - essential - buffer - allowances - savingsCommitment;

		return {
			income,
			essential,
			buffer,
			allowances,
			savingsCommitment,
			surplus: Math.max(0, surplus),
			currency: allowance.total.currency
		};
	}

	/**
	 * Get savings opportunities: surplus amount and per-goal suggestions with impact messages.
	 */
	async getSavingsOpportunities(options?: {
		minSurplusThreshold?: number;
	}): Promise<SavingsOpportunitiesResult> {
		const preferences = await userService.getUserPreferences();
		const prefs = preferences as { savingsOpportunityMinSurplus?: number };
		const threshold =
			options?.minSurplusThreshold ??
			prefs.savingsOpportunityMinSurplus ??
			DEFAULT_SURPLUS_THRESHOLD;
		const breakdown = await this.getProjectedSurplus();

		const opportunities: SavingsOpportunity[] = [];
		if (breakdown.surplus >= threshold) {
			const goals = await goalService.getGoals();
			const activeGoals = goals.filter(
				(g) => g.status === 'active' && g.targetAmount > g.currentAmount
			);

			for (const goal of activeGoals) {
				const req = goalService.getRequiredSavings(goal);
				const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
				if (remaining <= 0) continue;

				// Suggest up to surplus, capped by remaining needed (and round to sensible amount)
				const suggestedAmount = Math.min(
					breakdown.surplus,
					remaining,
					Math.floor(breakdown.surplus / 10) * 10 || breakdown.surplus
				);
				if (suggestedAmount <= 0) continue;

				const impactMessage = this.buildImpactMessage(goal, req, suggestedAmount);
				const monthsEarlier = this.getMonthsEarlier(goal, req, suggestedAmount);

				opportunities.push({
					goalId: goal.id,
					goalName: goal.name,
					currency: goal.currency,
					suggestedAmount,
					impactMessage,
					monthsEarlier
				});
			}
		}

		return {
			surplus: breakdown.surplus,
			currency: breakdown.currency,
			breakdown,
			opportunities,
			threshold
		};
	}

	/**
	 * Get threshold used for opportunity detection (for UI/settings later).
	 */
	getDefaultThreshold(): number {
		return DEFAULT_SURPLUS_THRESHOLD;
	}

	// --- Private helpers ---

	private async getProjectedIncomeForPeriod(
		start: Date,
		end: Date,
		mainCurrency: string
	): Promise<number> {
		const startStr = start.toISOString();
		const endStr = end.toISOString();

		// Cleared income in range
		const cleared = await transactionService.getTransactionsByDateRange(startStr, endStr);
		const planned = await db.transactions
			.where('status')
			.equals('planned')
			.toArray();
		const plannedInRange = planned.filter((t) => {
			const d = t.plannedDate;
			if (!d) return false;
			return d >= startStr && d <= endStr;
		});

		// Dedupe: if a transaction is both cleared and planned we count once (use cleared set by id)
		const clearedIds = new Set(cleared.map((t) => t.id));
		const plannedOnly = plannedInRange.filter((t) => !clearedIds.has(t.id));
		const allInPeriod = [...cleared.filter((t) => t.type === 'income'), ...plannedOnly.filter((t) => t.type === 'income')];

		const accounts = await db.getActiveAccounts();
		const accountMap: Record<string, { currency?: string }> = Object.fromEntries(
			accounts.map((a) => [a.id, { currency: a.currency }])
		);

		const stats = await transactionService.getTransactionStatisticsForTransactions(
			allInPeriod,
			accountMap,
			mainCurrency
		);
		return stats.income;
	}

	private async getCurrentSavingsCommitment(currency: string): Promise<number> {
		const goals = await goalService.getGoals();
		let total = 0;
		for (const goal of goals) {
			if (goal.status !== 'active' && goal.status !== 'paused') continue;
			const req = goalService.getRequiredSavings(goal);
			const monthly = req.isTimeBound ? req.requiredMonthly : (req.suggestedMonthly ?? 0);
			if (goal.currency === currency) {
				total += monthly;
			} else {
				const { exchangeRateService } = await import('$lib/core/services');
				const converted = await exchangeRateService.convertAmount(
					monthly,
					goal.currency,
					currency
				);
				if (converted != null) total += converted;
				else total += monthly;
			}
		}
		return total;
	}

	private buildImpactMessage(
		goal: Goal,
		req: RequiredSavingsResult,
		extraAmount: number
	): string {
		if (req.isTimeBound && req.requiredMonthly != null && req.requiredMonthly > 0) {
			const monthsSaved = extraAmount / req.requiredMonthly;
			if (monthsSaved >= 1) {
				const targetDate = goal.targetDate ? new Date(goal.targetDate) : null;
				if (targetDate) {
					const newDate = new Date(targetDate);
					newDate.setMonth(newDate.getMonth() - Math.floor(monthsSaved));
					return `Moves target date from ${targetDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} to ${newDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
				}
				return `Gets you ${Math.floor(monthsSaved)} month${Math.floor(monthsSaved) !== 1 ? 's' : ''} closer`;
			}
			return 'Reduces time to goal';
		}
		return 'Increases progress toward goal';
	}

	private getMonthsEarlier(
		goal: Goal,
		req: RequiredSavingsResult,
		extraAmount: number
	): number | undefined {
		if (!req.isTimeBound || req.requiredMonthly == null || req.requiredMonthly <= 0)
			return undefined;
		const months = extraAmount / req.requiredMonthly;
		return Math.floor(months * 10) / 10; // one decimal
	}
}

export const goalOpportunityService = new GoalOpportunityService();
