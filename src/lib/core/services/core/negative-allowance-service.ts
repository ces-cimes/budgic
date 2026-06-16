/**
 * Negative Allowance Service
 *
 * Detects overspend against household lifestyle allowance (total + per category).
 */

import { db, generateUUID } from '$lib/core/db';
import type { NegativeAllowanceEvent } from '$lib/core/db';
import type { DailyAllowanceView } from '$lib/core/services/core/budget-service';
import { formatAmount } from '$lib/utils/currency-utils';

export type NegativeAllowanceHandling =
	| 'block_with_warning'
	| 'allow_with_strong_warning'
	| 'borrow_from_future'
	| 'borrow_from_other_categories';

/** `total` or a lifestyle categoryId */
export type NegativeAllowanceCategory = 'total' | string;

export interface NegativeAllowanceStatus {
	isNegative: boolean;
	handlingMode: NegativeAllowanceHandling;
	negativeCategories: Array<{
		category: NegativeAllowanceCategory;
		categoryName?: string;
		allowanceAmount: number;
		spentAmount: number;
		overBy: number;
		currency: string;
	}>;
	shouldBlock: boolean;
	warningMessage: string | null;
}

export interface RecoverySuggestion {
	id: string;
	title: string;
	description: string;
	actionType:
		| 'reduce_spending'
		| 'move_transactions'
		| 'use_buffer'
		| 'borrow_future'
		| 'review_budget';
	priority: 'high' | 'medium' | 'low';
	estimatedImpact?: number;
	currency?: string;
}

export interface RecordNegativeAllowanceInput {
	periodStart: Date;
	periodEnd: Date;
	accountId?: string;
	category: NegativeAllowanceCategory;
	allowanceAmount: number;
	spentAmount: number;
	overBy: number;
	currency: string;
	handlingApplied: NegativeAllowanceHandling;
}

function isOverBudget(allowanceAmount: number, spentAmount: number): boolean {
	const effectiveRemaining = allowanceAmount - spentAmount;
	return effectiveRemaining < 0 || (allowanceAmount <= 0 && spentAmount >= 0);
}

function overByAmount(allowanceAmount: number, spentAmount: number): number {
	const effectiveRemaining = allowanceAmount - spentAmount;
	if (allowanceAmount <= 0) return Math.max(spentAmount, 1);
	return Math.abs(effectiveRemaining);
}

class NegativeAllowanceService {
	public get ready() {
		return db.isOpen();
	}

	public get isLoading() {
		return !this.ready;
	}

	async checkNegativeAllowance(
		allowance: DailyAllowanceView,
		handlingMode: NegativeAllowanceHandling,
		accountId?: string
	): Promise<NegativeAllowanceStatus> {
		void accountId;
		const negativeCategories: NegativeAllowanceStatus['negativeCategories'] = [];

		if (isOverBudget(allowance.lifestyleBudget, allowance.lifestyleSpent)) {
			negativeCategories.push({
				category: 'total',
				allowanceAmount: allowance.lifestyleBudget,
				spentAmount: allowance.lifestyleSpent,
				overBy: overByAmount(allowance.lifestyleBudget, allowance.lifestyleSpent),
				currency: allowance.currency
			});
		}

		for (const line of allowance.lifestyleLines) {
			if (isOverBudget(line.budgetAmount, line.spentAmount)) {
				negativeCategories.push({
					category: line.categoryId,
					categoryName: line.categoryName,
					allowanceAmount: line.budgetAmount,
					spentAmount: line.spentAmount,
					overBy: overByAmount(line.budgetAmount, line.spentAmount),
					currency: allowance.currency
				});
			}
		}

		const isNegative = negativeCategories.length > 0;
		const shouldBlock = isNegative && handlingMode === 'block_with_warning';

		let warningMessage: string | null = null;
		if (
			isNegative &&
			(handlingMode === 'allow_with_strong_warning' || handlingMode === 'block_with_warning')
		) {
			const primary = negativeCategories[0];
			const totalOver = negativeCategories.reduce((s, c) => s + c.overBy, 0);
			const hasNoAllowance = primary.allowanceAmount <= 0;
			warningMessage = hasNoAllowance
				? `You have no lifestyle budget for this period. ${
						shouldBlock
							? 'Confirm to proceed, or set category budgets first.'
							: 'Consider setting lifestyle category budgets.'
					}`
				: `You're over your lifestyle allowance by ${formatAmount(totalOver, primary.currency)} this period. ${
						shouldBlock
							? 'Confirm to proceed, or adjust your spending.'
							: 'Review your budget and consider reducing future spending.'
					}`;
		}

		return {
			isNegative,
			handlingMode,
			negativeCategories,
			shouldBlock,
			warningMessage
		};
	}

	async recordNegativeAllowanceEvent(
		input: RecordNegativeAllowanceInput
	): Promise<NegativeAllowanceEvent> {
		const event: NegativeAllowanceEvent = {
			id: generateUUID(),
			periodStart: input.periodStart.toISOString(),
			periodEnd: input.periodEnd.toISOString(),
			accountId: input.accountId,
			category: input.category,
			allowanceAmount: input.allowanceAmount,
			spentAmount: input.spentAmount,
			overBy: input.overBy,
			currency: input.currency,
			handlingApplied: input.handlingApplied,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};
		await db.negativeAllowanceEvents.add(event);
		return event;
	}

	async recordCurrentNegativeAllowanceIfAny(
		allowance: DailyAllowanceView,
		handlingMode: NegativeAllowanceHandling,
		accountId?: string
	): Promise<NegativeAllowanceEvent[]> {
		const status = await this.checkNegativeAllowance(allowance, handlingMode, accountId);
		if (!status.isNegative) return [];

		const periodStart =
			allowance.periodStart instanceof Date
				? allowance.periodStart
				: new Date(allowance.periodStart);
		const periodEnd =
			allowance.periodEnd instanceof Date
				? allowance.periodEnd
				: new Date(allowance.periodEnd);

		const periodStartStr = periodStart.toISOString();
		const existing = await db.negativeAllowanceEvents
			.where('periodStart')
			.equals(periodStartStr)
			.filter((e) => !e.deletedAt && (e.accountId ?? '') === (accountId ?? ''))
			.toArray();

		const existingCategories = new Set(existing.map((e) => e.category));
		const created: NegativeAllowanceEvent[] = [];

		for (const neg of status.negativeCategories) {
			if (existingCategories.has(neg.category)) continue;
			const ev = await this.recordNegativeAllowanceEvent({
				periodStart,
				periodEnd,
				accountId,
				category: neg.category,
				allowanceAmount: neg.allowanceAmount,
				spentAmount: neg.spentAmount,
				overBy: neg.overBy,
				currency: neg.currency,
				handlingApplied: handlingMode
			});
			created.push(ev);
			existingCategories.add(neg.category);
		}
		return created;
	}

	async getNegativeAllowanceEvents(filters?: {
		accountId?: string;
		since?: Date;
		recoveredOnly?: boolean;
		unrecoveredOnly?: boolean;
	}): Promise<NegativeAllowanceEvent[]> {
		const items = await db.negativeAllowanceEvents.toArray();
		let result = items.filter((e) => !e.deletedAt);

		if (filters?.accountId !== undefined) {
			result = result.filter((e) => e.accountId === filters.accountId);
		}
		if (filters?.since) {
			const sinceMs = filters.since.getTime();
			result = result.filter((e) => new Date(e.periodStart).getTime() >= sinceMs);
		}
		if (filters?.recoveredOnly) {
			result = result.filter((e) => e.recoveredAt != null);
		}
		if (filters?.unrecoveredOnly) {
			result = result.filter((e) => e.recoveredAt == null);
		}

		return result.sort(
			(a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime()
		);
	}

	getRecoverySuggestions(allowance: DailyAllowanceView): RecoverySuggestion[] {
		const suggestions: RecoverySuggestion[] = [];
		const currency = allowance.currency;

		if (allowance.lifestyleSpent > allowance.lifestyleBudget) {
			const overBy = allowance.lifestyleSpent - allowance.lifestyleBudget;
			suggestions.push({
				id: 'reduce-spending',
				title: 'Reduce lifestyle spending',
				description: `You're ${formatAmount(overBy, currency)} over your lifestyle budgets. Pause discretionary purchases until back on pace.`,
				actionType: 'reduce_spending',
				priority: 'high',
				estimatedImpact: overBy,
				currency
			});
		}

		const overLines = allowance.lifestyleLines.filter((l) => l.spentAmount > l.budgetAmount);
		if (overLines.length > 0) {
			suggestions.push({
				id: 'review-budget',
				title: 'Review category budgets',
				description: `${overLines.map((l) => l.categoryName).join(', ')} exceeded this period. Adjust budgets or re-categorize transactions.`,
				actionType: 'review_budget',
				priority: 'medium',
				currency
			});
		}

		return suggestions;
	}
}

export const negativeAllowanceService = new NegativeAllowanceService();
