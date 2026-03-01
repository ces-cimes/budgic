/**
 * Rollover Service
 *
 * Handles period-end surplus and deficit per allowance category:
 * - Computes surplus (unspent) / deficit (overspent) per category
 * - Applies user preferences: rollover to next period, to savings goals, or hybrid
 * - Deficit handling: reduce next period, borrow from other, or one-time exception
 * - Stores adjustments that are applied to the next period's allowance
 */

import { db, generateUUID } from '$lib/core/db';
import type { RolloverAdjustment } from '$lib/core/db';
import type { UserPreferences } from '$lib/core/db';
import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
import { userService } from './user-service';

export type AllowanceCategoryKey = 'essential' | 'discretionary' | 'buffer';

export type RolloverSurplusBehavior = 'rollover_next' | 'to_savings_goals' | 'hybrid';
export type RolloverDeficitBehavior = 'reduce_next_period' | 'borrow_from_other' | 'one_time_exception';

export interface CategorySurplusDeficit {
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
	essential: CategorySurplusDeficit;
	discretionary: CategorySurplusDeficit;
	buffer: CategorySurplusDeficit;
	totalSurplus: number;
	totalDeficit: number;
}

export interface RolloverSuggestion {
	category: AllowanceCategoryKey;
	type: 'surplus' | 'deficit';
	amount: number;
	currency: string;
	action: string;
	source: RolloverAdjustment['source'];
}

export interface ApplyRolloverInput {
	accountId?: string;
	allowance: EnhancedAllowance;
	/** Override surplus behavior for this apply (optional) */
	surplusBehavior?: RolloverSurplusBehavior;
	/** Override deficit behavior for this apply (optional) */
	deficitBehavior?: RolloverDeficitBehavior;
	/** Override hybrid ratio 0–1 (optional) */
	hybridRatio?: number;
}

const CATEGORY_KEYS: AllowanceCategoryKey[] = ['essential', 'discretionary', 'buffer'];

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

	/**
	 * Compute period-end surplus and deficit per category from an enhanced allowance.
	 */
	computeSurplusDeficit(allowance: EnhancedAllowance): PeriodSurplusDeficit {
		const periodStart =
			allowance.periodStart instanceof Date ? allowance.periodStart : new Date(allowance.periodStart);
		const periodEnd =
			allowance.periodEnd instanceof Date ? allowance.periodEnd : new Date(allowance.periodEnd);
		const currency = allowance.total.currency;

		let totalSurplus = 0;
		let totalDeficit = 0;
		const result: PeriodSurplusDeficit = {
			periodStart,
			periodEnd,
			currency,
			essential: { surplus: 0, deficit: 0, allowanceAmount: 0, spentAmount: 0, currency },
			discretionary: { surplus: 0, deficit: 0, allowanceAmount: 0, spentAmount: 0, currency },
			buffer: { surplus: 0, deficit: 0, allowanceAmount: 0, spentAmount: 0, currency },
			totalSurplus: 0,
			totalDeficit: 0
		};

		for (const key of CATEGORY_KEYS) {
			const calc = allowance[key];
			const allowanceAmount = calc.monthly;
			const spentAmount = calc.spentSoFar;
			const remaining = allowanceAmount - spentAmount;
			const surplus = remaining > 0 ? remaining : 0;
			const deficit = remaining < 0 ? Math.abs(remaining) : 0;
			result[key] = {
				surplus,
				deficit,
				allowanceAmount,
				spentAmount,
				currency: calc.currency
			};
			totalSurplus += surplus;
			totalDeficit += deficit;
		}
		result.totalSurplus = totalSurplus;
		result.totalDeficit = totalDeficit;
		return result;
	}

	/**
	 * Get suggested rollover actions based on surplus/deficit and user preferences.
	 */
	async getRolloverSuggestions(allowance: EnhancedAllowance): Promise<RolloverSuggestion[]> {
		const sd = this.computeSurplusDeficit(allowance);
		const prefs = await userService.getUserPreferences();
		const surplusBehavior = prefs.rolloverSurplusBehavior ?? 'rollover_next';
		const deficitBehavior = prefs.rolloverDeficitBehavior ?? 'reduce_next_period';
		const hybridRatio = prefs.rolloverSurplusHybridRatio ?? 0.5;
		const suggestions: RolloverSuggestion[] = [];

		for (const key of CATEGORY_KEYS) {
			const cat = sd[key];
			if (cat.surplus > 0) {
				const action =
					surplusBehavior === 'rollover_next'
						? 'Roll over to next period'
						: surplusBehavior === 'to_savings_goals'
							? 'Reallocate to savings goals'
							: `Roll over ${Math.round(hybridRatio * 100)}% to next period, rest to goals`;
				suggestions.push({
					category: key,
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
							? 'Borrow from other categories (envelope)'
							: 'One-time exception (no adjustment)';
				suggestions.push({
					category: key,
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

	/**
	 * Apply rollover: create adjustment records for the next period based on surplus/deficit and preferences.
	 */
	async applyRollover(input: ApplyRolloverInput): Promise<RolloverAdjustment[]> {
		const { accountId, allowance } = input;
		const prefs = await userService.getUserPreferences();
		const surplusBehavior = input.surplusBehavior ?? prefs.rolloverSurplusBehavior ?? 'rollover_next';
		const deficitBehavior = input.deficitBehavior ?? prefs.rolloverDeficitBehavior ?? 'reduce_next_period';
		const hybridRatio = input.hybridRatio ?? prefs.rolloverSurplusHybridRatio ?? 0.5;

		const sd = this.computeSurplusDeficit(allowance);
		const periodStart =
			allowance.periodStart instanceof Date ? allowance.periodStart : new Date(allowance.periodStart);
		const periodEnd =
			allowance.periodEnd instanceof Date ? allowance.periodEnd : new Date(allowance.periodEnd);
		const fromPeriodStartStr = periodStart.toISOString();
		const nextPeriodStart = getNextPeriodStart(periodEnd);
		const forPeriodStartStr = nextPeriodStart.toISOString();
		const currency = allowance.total.currency;
		const created: RolloverAdjustment[] = [];

		for (const key of CATEGORY_KEYS) {
			const cat = sd[key];
			// Surplus
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
						category: key,
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
						category: key,
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
			// Deficit
			if (cat.deficit > 0 && deficitBehavior === 'reduce_next_period') {
				const adj: RolloverAdjustment = {
					id: generateUUID(),
					accountId,
					forPeriodStart: forPeriodStartStr,
					category: key,
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
			// one_time_exception and borrow_from_other: no stored adjustment (user handles separately)
		}
		return created;
	}

	/**
	 * Get all rollover adjustments that apply to a given period (for merging into allowance).
	 */
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

	/**
	 * Sum adjustment deltas per category for a period (for applying to allowance amounts).
	 */
	async getAdjustmentDeltasByCategory(
		accountId: string | undefined,
		periodStart: Date
	): Promise<Record<AllowanceCategoryKey, number>> {
		const adjustments = await this.getAdjustmentsForPeriod(accountId, periodStart);
		const deltas: Record<AllowanceCategoryKey, number> = {
			essential: 0,
			discretionary: 0,
			buffer: 0
		};
		for (const a of adjustments) {
			// Only surplus_rollover and deficit_reduction change next period's allowance
			if (a.source === 'surplus_rollover' || a.source === 'deficit_reduction') {
				deltas[a.category] += a.amountDelta;
			}
		}
		return deltas;
	}

	/**
	 * Apply rollover adjustment deltas to an allowance (pure; returns a new object).
	 * Call after getAdjustmentDeltasByCategory to merge previous period's rollover into current allowance.
	 */
	applyDeltasToAllowance(
		allowance: EnhancedAllowance,
		deltas: Record<AllowanceCategoryKey, number>
	): EnhancedAllowance {
		const periodStart =
			allowance.periodStart instanceof Date ? allowance.periodStart : new Date(allowance.periodStart);
		const periodEnd =
			allowance.periodEnd instanceof Date ? allowance.periodEnd : new Date(allowance.periodEnd);
		const currency = allowance.total.currency;

		const updateCat = (
			calc: EnhancedAllowance['essential'],
			delta: number
		): EnhancedAllowance['essential'] => {
			const newMonthly = calc.monthly + delta;
			const newRemaining = newMonthly - calc.spentSoFar;
			const daysRemaining = calc.daysRemaining;
			return {
				...calc,
				monthly: newMonthly,
				remaining: newRemaining,
				dailySafe: daysRemaining > 0 ? newRemaining / daysRemaining : 0
			};
		};

		const essential = updateCat(allowance.essential, deltas.essential);
		const discretionary = updateCat(allowance.discretionary, deltas.discretionary);
		const buffer = updateCat(allowance.buffer, deltas.buffer);
		const totalMonthly = essential.monthly + discretionary.monthly + buffer.monthly;
		const totalSpent = allowance.total.spentSoFar;
		const totalRemaining = totalMonthly - totalSpent;
		const total = {
			...allowance.total,
			monthly: totalMonthly,
			remaining: totalRemaining,
			dailySafe:
				allowance.total.daysRemaining > 0
					? totalRemaining / allowance.total.daysRemaining
					: 0
		};
		return {
			...allowance,
			essential,
			discretionary,
			buffer,
			total
		};
	}

	/**
	 * List recent rollover adjustments (for UI history).
	 */
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
			.sort((a, b) => new Date(b.forPeriodStart).getTime() - new Date(a.forPeriodStart).getTime())
			.slice(0, limit);
	}
}

export const rolloverService = new RolloverService();
