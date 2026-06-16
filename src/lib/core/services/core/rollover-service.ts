/**
 * Rollover Service
 *
 * Period-end surplus/deficit per lifestyle budget category (categoryId).
 * Adjustments apply to next period's per-category budget via planning-service.
 */

import { db, generateUUID } from '$lib/core/db';
import type { RolloverAdjustment } from '$lib/core/db';
import type { UserPreferences } from '$lib/core/db';
import type { DailyAllowanceView } from '$lib/core/services/core/budget-service';
import { userService } from './user-service';

export type RolloverSurplusBehavior = 'rollover_next' | 'to_savings_goals' | 'hybrid';
export type RolloverDeficitBehavior =
	| 'reduce_next_period'
	| 'borrow_from_other'
	| 'one_time_exception';

export interface CategorySurplusDeficit {
	categoryId: string;
	categoryName: string;
	surplus: number;
	deficit: number;
	allowanceAmount: number;
	spentAmount: number;
	currency: string;
}

export interface PeriodSurplusDeficit {
	periodStart: Date;
	periodEnd: Date;
	currency: string;
	categories: CategorySurplusDeficit[];
	totalSurplus: number;
	totalDeficit: number;
}

export interface RolloverSuggestion {
	categoryId: string;
	categoryName: string;
	type: 'surplus' | 'deficit';
	amount: number;
	currency: string;
	action: string;
	source: RolloverAdjustment['source'];
}

export interface ApplyRolloverInput {
	accountId?: string;
	allowance: DailyAllowanceView;
	surplusBehavior?: RolloverSurplusBehavior;
	deficitBehavior?: RolloverDeficitBehavior;
	hybridRatio?: number;
}

function getNextPeriodStart(periodEnd: Date): Date {
	const next = new Date(periodEnd);
	next.setDate(next.getDate() + 1);
	next.setHours(0, 0, 0, 0);
	return next;
}

class RolloverService {
	public get ready() {
		return db.isOpen();
	}

	computeSurplusDeficit(allowance: DailyAllowanceView): PeriodSurplusDeficit {
		const periodStart =
			allowance.periodStart instanceof Date
				? allowance.periodStart
				: new Date(allowance.periodStart);
		const periodEnd =
			allowance.periodEnd instanceof Date
				? allowance.periodEnd
				: new Date(allowance.periodEnd);
		const currency = allowance.currency;

		const categories: CategorySurplusDeficit[] = allowance.lifestyleLines.map((line) => {
			const allowanceAmount = line.budgetAmount;
			const spentAmount = line.spentAmount;
			const remaining = allowanceAmount - spentAmount;
			return {
				categoryId: line.categoryId,
				categoryName: line.categoryName,
				allowanceAmount,
				spentAmount,
				surplus: remaining > 0 ? remaining : 0,
				deficit: remaining < 0 ? Math.abs(remaining) : 0,
				currency
			};
		});

		let totalSurplus = 0;
		let totalDeficit = 0;
		for (const cat of categories) {
			totalSurplus += cat.surplus;
			totalDeficit += cat.deficit;
		}

		return {
			periodStart,
			periodEnd,
			currency,
			categories,
			totalSurplus,
			totalDeficit
		};
	}

	async getRolloverSuggestions(allowance: DailyAllowanceView): Promise<RolloverSuggestion[]> {
		const sd = this.computeSurplusDeficit(allowance);
		const prefs = await userService.getUserPreferences();
		const surplusBehavior = prefs.rolloverSurplusBehavior ?? 'rollover_next';
		const deficitBehavior = prefs.rolloverDeficitBehavior ?? 'reduce_next_period';
		const hybridRatio = prefs.rolloverSurplusHybridRatio ?? 0.5;
		const suggestions: RolloverSuggestion[] = [];

		for (const cat of sd.categories) {
			if (cat.surplus > 0) {
				const action =
					surplusBehavior === 'rollover_next'
						? 'Roll over to next period'
						: surplusBehavior === 'to_savings_goals'
							? 'Reallocate to savings goals'
							: `Roll over ${Math.round(hybridRatio * 100)}% to next period, rest to goals`;
				suggestions.push({
					categoryId: cat.categoryId,
					categoryName: cat.categoryName,
					type: 'surplus',
					amount: cat.surplus,
					currency: cat.currency,
					action,
					source:
						surplusBehavior === 'to_savings_goals'
							? 'to_goals'
							: surplusBehavior === 'hybrid'
								? 'surplus_rollover'
								: 'surplus_rollover'
				});
			}
			if (cat.deficit > 0) {
				const action =
					deficitBehavior === 'reduce_next_period'
						? 'Reduce next period allowance'
						: deficitBehavior === 'borrow_from_other'
							? 'Borrow from another category'
							: 'One-time exception (no adjustment)';
				suggestions.push({
					categoryId: cat.categoryId,
					categoryName: cat.categoryName,
					type: 'deficit',
					amount: cat.deficit,
					currency: cat.currency,
					action,
					source:
						deficitBehavior === 'reduce_next_period'
							? 'deficit_reduction'
							: deficitBehavior === 'one_time_exception'
								? 'one_time_exception'
								: 'deficit_reduction'
				});
			}
		}
		return suggestions;
	}

	async applyRollover(input: ApplyRolloverInput): Promise<RolloverAdjustment[]> {
		const { accountId, allowance } = input;
		const prefs = await userService.getUserPreferences();
		const surplusBehavior =
			input.surplusBehavior ?? prefs.rolloverSurplusBehavior ?? 'rollover_next';
		const deficitBehavior =
			input.deficitBehavior ?? prefs.rolloverDeficitBehavior ?? 'reduce_next_period';
		const hybridRatio = input.hybridRatio ?? prefs.rolloverSurplusHybridRatio ?? 0.5;

		const sd = this.computeSurplusDeficit(allowance);
		const periodStart =
			allowance.periodStart instanceof Date
				? allowance.periodStart
				: new Date(allowance.periodStart);
		const periodEnd =
			allowance.periodEnd instanceof Date
				? allowance.periodEnd
				: new Date(allowance.periodEnd);
		const fromPeriodStartStr = periodStart.toISOString();
		const nextPeriodStart = getNextPeriodStart(periodEnd);
		const forPeriodStartStr = nextPeriodStart.toISOString();
		const currency = allowance.currency;
		const created: RolloverAdjustment[] = [];

		for (const cat of sd.categories) {
			if (cat.surplus > 0) {
				let toNext = cat.surplus;
				let toGoals = 0;
				if (surplusBehavior === 'to_savings_goals') {
					toNext = 0;
					toGoals = cat.surplus;
				} else if (surplusBehavior === 'hybrid') {
					toNext = cat.surplus * hybridRatio;
					toGoals = cat.surplus * (1 - hybridRatio);
				}
				if (toNext > 0) {
					const adj: RolloverAdjustment = {
						id: generateUUID(),
						accountId,
						forPeriodStart: forPeriodStartStr,
						category: cat.categoryId,
						amountDelta: toNext,
						currency,
						source: 'surplus_rollover',
						fromPeriodStart: fromPeriodStartStr,
						metadata: undefined,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						deletedAt: null
					};
					await db.rolloverAdjustments.add(adj);
					created.push(adj);
				}
				if (toGoals > 0) {
					const adj: RolloverAdjustment = {
						id: generateUUID(),
						accountId,
						forPeriodStart: forPeriodStartStr,
						category: cat.categoryId,
						amountDelta: 0,
						currency,
						source: 'to_goals',
						fromPeriodStart: fromPeriodStartStr,
						metadata: JSON.stringify({ amountAllocatedToGoals: toGoals }),
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						deletedAt: null
					};
					await db.rolloverAdjustments.add(adj);
					created.push(adj);
				}
			}
			if (cat.deficit > 0 && deficitBehavior === 'reduce_next_period') {
				const adj: RolloverAdjustment = {
					id: generateUUID(),
					accountId,
					forPeriodStart: forPeriodStartStr,
					category: cat.categoryId,
					amountDelta: -cat.deficit,
					currency,
					source: 'deficit_reduction',
					fromPeriodStart: fromPeriodStartStr,
					metadata: undefined,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				};
				await db.rolloverAdjustments.add(adj);
				created.push(adj);
			}
		}
		return created;
	}

	async getAdjustmentsForPeriod(
		accountId: string | undefined,
		periodStart: Date
	): Promise<RolloverAdjustment[]> {
		const periodStartStr = periodStart.toISOString();
		const all = await db.rolloverAdjustments.toArray();
		return all.filter(
			(a) =>
				!a.deletedAt &&
				a.forPeriodStart === periodStartStr &&
				(a.accountId ?? '') === (accountId ?? '')
		);
	}

	async getAdjustmentDeltasByCategory(
		accountId: string | undefined,
		periodStart: Date
	): Promise<Record<string, number>> {
		const adjustments = await this.getAdjustmentsForPeriod(accountId, periodStart);
		const deltas: Record<string, number> = {};
		for (const a of adjustments) {
			if (a.source === 'surplus_rollover' || a.source === 'deficit_reduction') {
				deltas[a.category] = (deltas[a.category] ?? 0) + a.amountDelta;
			}
		}
		return deltas;
	}

	applyDeltasToAllowance(
		allowance: DailyAllowanceView,
		deltas: Record<string, number>
	): DailyAllowanceView {
		const lifestyleLines = allowance.lifestyleLines.map((line) => {
			const delta = deltas[line.categoryId] ?? 0;
			const budgetAmount = line.budgetAmount + delta;
			const remaining = budgetAmount - line.spentAmount;
			const dailyRate =
				line.daysRemaining > 0 ? Math.max(0, remaining) / line.daysRemaining : 0;
			return {
				...line,
				budgetAmount,
				remaining: remaining,
				dailyRate
			};
		});

		const lifestyleBudget = lifestyleLines.reduce((s, l) => s + l.budgetAmount, 0);
		const lifestyleRemaining = lifestyleLines.reduce((s, l) => s + Math.max(0, l.remaining), 0);
		const daily = lifestyleLines.reduce((s, l) => s + l.dailyRate, 0);

		return {
			...allowance,
			daily,
			monthlyRemaining: lifestyleRemaining,
			lifestyleRemaining,
			lifestyleBudget,
			lifestyleLines,
			total: {
				...allowance.total,
				dailySafe: daily,
				monthly: lifestyleBudget,
				remaining: lifestyleRemaining
			}
		};
	}

	async getRolloverHistory(
		accountId: string | undefined,
		options?: { limit?: number }
	): Promise<RolloverAdjustment[]> {
		const limit = options?.limit ?? 30;
		const all = await db.rolloverAdjustments.toArray();
		const filtered = all.filter(
			(a) => !a.deletedAt && (a.accountId ?? '') === (accountId ?? '')
		);
		return filtered
			.sort(
				(a, b) =>
					new Date(b.forPeriodStart).getTime() - new Date(a.forPeriodStart).getTime()
			)
			.slice(0, limit);
	}
}

export const rolloverService = new RolloverService();
