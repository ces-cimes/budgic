/**
 * Goal Trade-off Service (Phase 2.3)
 * Priority-weighted allocation and opportunity cost ("Increasing Goal A by $100/mo delays Goal B by 2 months").
 */

import { goalService } from '$lib/core/services/core/goal-service';
import { exchangeRateService } from './exchange-rate-service';
import type { Goal } from '$lib/core/db';
import type { RequiredSavingsResult } from '$lib/core/services/core/goal-service';

const PRIORITY_ORDER: Goal['priority'][] = ['critical', 'high', 'medium', 'low'];
const PRIORITY_WEIGHT: Record<Goal['priority'], number> = {
	critical: 4,
	high: 3,
	medium: 2,
	low: 1
};

export interface GoalAllocationItem {
	goalId: string;
	goalName: string;
	priority: Goal['priority'];
	currency: string;
	/** Required or suggested monthly in goal currency */
	requiredMonthly: number;
	/** Required/suggested in user currency for comparison */
	requiredMonthlyInUserCurrency: number;
	/** Allocated amount in user currency (from the pool) */
	allocatedInUserCurrency: number;
	/** Shortfall: required - allocated (positive = underfunded) */
	shortfallInUserCurrency: number;
	/** Surplus: allocated - required (positive = overfunded) */
	surplusInUserCurrency: number;
}

export interface AllocationPreviewResult {
	totalAvailableInUserCurrency: number;
	userCurrency: string;
	allocations: GoalAllocationItem[];
	/** Total shortfall across all goals */
	totalShortfall: number;
	/** Total surplus (unallocated or over-allocated) */
	totalSurplus: number;
}

export interface TradeOffImpactItem {
	goalId: string;
	goalName: string;
	/** e.g. "delayed by 2 months" or "suggested monthly reduced by $50" */
	message: string;
	/** For time-bound: months of delay */
	delayMonths?: number;
	/** For open-ended: amount reduced in goal currency */
	reducedAmount?: number;
	reducedAmountInUserCurrency?: number;
}

export interface TradeOffImpactResult {
	increasedGoalId: string;
	increasedGoalName: string;
	amountIncreaseInUserCurrency: number;
	userCurrency: string;
	impacts: TradeOffImpactItem[];
}

/**
 * Convert goal's monthly amount to user currency.
 */
async function toUserCurrency(
	amount: number,
	goalCurrency: string,
	userCurrency: string
): Promise<number> {
	if (goalCurrency === userCurrency) return amount;
	const converted = await exchangeRateService.convertAmount(
		amount,
		goalCurrency,
		userCurrency
	);
	return converted ?? amount;
}

/**
 * Get numeric order for sorting (higher = higher priority).
 */
function getPriorityRank(p: Goal['priority']): number {
	const i = PRIORITY_ORDER.indexOf(p);
	return i >= 0 ? PRIORITY_ORDER.length - i : 0;
}

class GoalTradeoffService {
	/**
	 * Priority-weighted allocation: allocate totalMonthlyAvailable to goals
	 * (highest priority first, then distribute remainder proportionally).
	 */
	async getAllocationPreview(
		activeGoals: Goal[],
		totalMonthlyAvailableInUserCurrency: number,
		userCurrency: string
	): Promise<AllocationPreviewResult> {
		if (activeGoals.length === 0) {
			return {
				totalAvailableInUserCurrency: totalMonthlyAvailableInUserCurrency,
				userCurrency,
				allocations: [],
				totalShortfall: 0,
				totalSurplus: Math.max(0, totalMonthlyAvailableInUserCurrency)
			};
		}

		// Build allocation items with required monthly in user currency
		const items: (GoalAllocationItem & { goal: Goal; weight: number })[] = [];
		for (const goal of activeGoals) {
			const req = goalService.getRequiredSavings(goal);
			const requiredMonthly =
				req.isTimeBound && req.requiredMonthly != null
					? req.requiredMonthly
					: req.suggestedMonthly ?? 0;
			const requiredInUser = await toUserCurrency(
				requiredMonthly,
				goal.currency,
				userCurrency
			);
			items.push({
				goalId: goal.id,
				goalName: goal.name,
				priority: goal.priority,
				currency: goal.currency,
				requiredMonthly,
				requiredMonthlyInUserCurrency: requiredInUser,
				allocatedInUserCurrency: 0,
				shortfallInUserCurrency: 0,
				surplusInUserCurrency: 0,
				goal,
				weight: PRIORITY_WEIGHT[goal.priority]
			});
		}

		// Sort by priority (critical first)
		items.sort(
			(a, b) => getPriorityRank(b.priority) - getPriorityRank(a.priority)
		);

		let remaining = totalMonthlyAvailableInUserCurrency;

		// First pass: allocate up to required for each goal in order
		for (const item of items) {
			const take = Math.min(remaining, Math.max(0, item.requiredMonthlyInUserCurrency));
			item.allocatedInUserCurrency = take;
			remaining -= take;
		}

		// Second pass: distribute remainder proportionally by weight
		const totalWeight = items.reduce((s, i) => s + i.weight, 0);
		if (totalWeight > 0 && remaining > 0) {
			for (const item of items) {
				const extra = (remaining * item.weight) / totalWeight;
				item.allocatedInUserCurrency += extra;
			}
			remaining = 0;
		}

		// Compute shortfall/surplus per goal
		const allocations: GoalAllocationItem[] = [];
		let totalShortfall = 0;
		let totalSurplus = 0;
		for (const item of items) {
			const shortfall = Math.max(0, item.requiredMonthlyInUserCurrency - item.allocatedInUserCurrency);
			const surplus = Math.max(0, item.allocatedInUserCurrency - item.requiredMonthlyInUserCurrency);
			totalShortfall += shortfall;
			totalSurplus += surplus;
			allocations.push({
				goalId: item.goalId,
				goalName: item.goalName,
				priority: item.priority,
				currency: item.currency,
				requiredMonthly: item.requiredMonthly,
				requiredMonthlyInUserCurrency: item.requiredMonthlyInUserCurrency,
				allocatedInUserCurrency: item.allocatedInUserCurrency,
				shortfallInUserCurrency: shortfall,
				surplusInUserCurrency: surplus
			});
		}

		return {
			totalAvailableInUserCurrency: totalMonthlyAvailableInUserCurrency,
			userCurrency,
			allocations,
			totalShortfall,
			totalSurplus
		};
	}

	/**
	 * Opportunity cost: "If I increase Goal A by $X/mo, how are other goals affected?"
	 * Reductions are taken from other goals proportionally to their current allocation.
	 */
	async getTradeOffImpacts(
		activeGoals: Goal[],
		fromGoalId: string,
		amountIncreaseInUserCurrency: number,
		userCurrency: string
	): Promise<TradeOffImpactResult | null> {
		if (amountIncreaseInUserCurrency <= 0) return null;

		const fromGoal = activeGoals.find((g) => g.id === fromGoalId);
		if (!fromGoal) return null;

		// Use current total = sum of required/suggested (or get from opportunity service surplus + commitment)
		const totalNeeded = await this.getTotalMonthlyCommitmentInUserCurrency(
			activeGoals,
			userCurrency
		);
		const preview = await this.getAllocationPreview(
			activeGoals,
			Math.max(totalNeeded, 0),
			userCurrency
		);

		const fromAllocation = preview.allocations.find((a) => a.goalId === fromGoalId);
		const others = preview.allocations.filter((a) => a.goalId !== fromGoalId);
		if (others.length === 0) {
			return {
				increasedGoalId: fromGoal.id,
				increasedGoalName: fromGoal.name,
				amountIncreaseInUserCurrency,
				userCurrency,
				impacts: []
			};
		}

		// Take amountIncrease from others proportionally to their allocated amount
		const othersTotalAllocated = others.reduce((s, a) => s + a.allocatedInUserCurrency, 0);
		const impacts: TradeOffImpactItem[] = [];

		for (const other of others) {
			if (othersTotalAllocated <= 0) continue;
			const share = other.allocatedInUserCurrency / othersTotalAllocated;
			const reductionUser = amountIncreaseInUserCurrency * share;
			if (reductionUser <= 0) continue;

			const goal = activeGoals.find((g) => g.id === other.goalId);
			if (!goal) continue;

			const req = goalService.getRequiredSavings(goal);
			if (req.isTimeBound && req.requiredMonthly != null && req.requiredMonthly > 0) {
				// reductionUser is in userCurrency; convert to goal currency for delay calc
				const reductionInGoalCurrency =
					goal.currency === userCurrency
						? reductionUser
						: (await exchangeRateService.convertAmount(
								reductionUser,
								userCurrency,
								goal.currency
							)) ?? reductionUser;
				const delayMonths = reductionInGoalCurrency / req.requiredMonthly;
				impacts.push({
					goalId: goal.id,
					goalName: goal.name,
					message: `Delayed by ${delayMonths >= 0.1 ? delayMonths.toFixed(1) : '<0.1'} month${delayMonths >= 1 ? 's' : ''}`,
					delayMonths
				});
			} else {
				// Open-ended: show reduced amount (reductionUser in userCurrency → goal currency)
				const reducedInGoalCurrency =
					goal.currency === userCurrency
						? reductionUser
						: (await exchangeRateService.convertAmount(
								reductionUser,
								userCurrency,
								goal.currency
							)) ?? reductionUser;
				impacts.push({
					goalId: goal.id,
					goalName: goal.name,
					message: `Suggested monthly reduced by ${reducedInGoalCurrency.toFixed(0)} ${goal.currency}`,
					reducedAmount: reducedInGoalCurrency,
					reducedAmountInUserCurrency: reductionUser
				});
			}
		}

		return {
			increasedGoalId: fromGoal.id,
			increasedGoalName: fromGoal.name,
			amountIncreaseInUserCurrency,
			userCurrency,
			impacts
		};
	}

	/**
	 * Total monthly commitment (required/suggested) for active goals in user currency.
	 */
	async getTotalMonthlyCommitmentInUserCurrency(
		activeGoals: Goal[],
		userCurrency: string
	): Promise<number> {
		let total = 0;
		for (const goal of activeGoals) {
			const req = goalService.getRequiredSavings(goal);
			const monthly =
				req.isTimeBound && req.requiredMonthly != null
					? req.requiredMonthly
					: req.suggestedMonthly ?? 0;
			total += await toUserCurrency(monthly, goal.currency, userCurrency);
		}
		return total;
	}

	getPriorityWeight(priority: Goal['priority']): number {
		return PRIORITY_WEIGHT[priority];
	}

	getPriorityOrder(): Goal['priority'][] {
		return [...PRIORITY_ORDER];
	}
}

export const goalTradeoffService = new GoalTradeoffService();
