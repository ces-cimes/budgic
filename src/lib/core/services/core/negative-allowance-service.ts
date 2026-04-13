/**
 * Negative Allowance Service
 *
 * Handles detection, tracking, and recovery when spending exceeds allowance.
 * Implements user-configurable behaviour: block with warning, allow with strong warning,
 * borrow from future, borrow from other categories.
 */

import { db, generateUUID } from '$lib/core/db';
import type { NegativeAllowanceEvent } from '$lib/core/db';
import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
import { formatAmount } from '$lib/utils/currency-utils';

/** User-configurable handling when allowance goes negative */
export type NegativeAllowanceHandling =
	| 'block_with_warning'
	| 'allow_with_strong_warning'
	| 'borrow_from_future'
	| 'borrow_from_other_categories';

/** Which allowance category is negative */
export type NegativeAllowanceCategory = 'total' | 'essential' | 'discretionary' | 'buffer';

export interface NegativeAllowanceStatus {
	isNegative: boolean;
	handlingMode: NegativeAllowanceHandling;
	negativeCategories: Array<{
		category: NegativeAllowanceCategory;
		allowanceAmount: number;
		spentAmount: number;
		overBy: number;
		currency: string;
	}>;
	/** True only when handling is block_with_warning and user must explicitly override */
	shouldBlock: boolean;
	/** Message for strong warning (when allow_with_strong_warning or block_with_warning) */
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

class NegativeAllowanceService {
	public get ready() {
		return db.isOpen();
	}

	public get isLoading() {
		return !this.ready;
	}

	/**
	 * Detect if allowance is negative and derive status based on user's handling preference.
	 */
	async checkNegativeAllowance(
		allowance: EnhancedAllowance,
		handlingMode: NegativeAllowanceHandling,
		accountId?: string
	): Promise<NegativeAllowanceStatus> {
		const negativeCategories: NegativeAllowanceStatus['negativeCategories'] = [];

		const categories: Array<{
			key: NegativeAllowanceCategory;
			calc: EnhancedAllowance['total'];
		}> = [
			{ key: 'total', calc: allowance.total },
			{ key: 'essential', calc: allowance.essential },
			{ key: 'discretionary', calc: allowance.discretionary },
			{ key: 'buffer', calc: allowance.buffer }
		];

		for (const { key, calc } of categories) {
			// Use effective remaining (allowance utils clamp remaining to >= 0, so we must use monthly - spentSoFar)
			const effectiveRemaining = calc.monthly - calc.spentSoFar;
			// Negative when over allowance, or when there is no allowance (monthly <= 0) and user has/will have spending
			const isOver = effectiveRemaining < 0 || (calc.monthly <= 0 && calc.spentSoFar >= 0);
			if (isOver) {
				// When monthly <= 0: overBy = spentSoFar, or 1 if both 0 (so "adding any expense is over")
				const overBy =
					calc.monthly <= 0 ? Math.max(calc.spentSoFar, 1) : Math.abs(effectiveRemaining);
				negativeCategories.push({
					category: key,
					allowanceAmount: calc.monthly,
					spentAmount: calc.spentSoFar,
					overBy,
					currency: calc.currency
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
				? `You have no spending allowance for this period (zero balance or no data). ${
						shouldBlock
							? 'Confirm to proceed, or add funds first.'
							: 'Consider adding funds or reviewing your budget.'
					}`
				: `You're over your spending allowance by ${formatAmount(totalOver, primary.currency)} this period. ${
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

	/**
	 * Record a negative allowance event for accountability tracking.
	 */
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

	/**
	 * Record events for all currently negative categories (idempotent per period: only records if not already recorded for this period).
	 */
	async recordCurrentNegativeAllowanceIfAny(
		allowance: EnhancedAllowance,
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
			allowance.periodEnd instanceof Date ? allowance.periodEnd : new Date(allowance.periodEnd);

		// Avoid duplicate events for same period+category
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

	/**
	 * List negative allowance events for accountability (e.g. settings or reports).
	 */
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
			const t = filters.since.getTime();
			result = result.filter((e) => new Date(e.periodStart).getTime() >= t);
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

	/**
	 * Mark a negative allowance event as recovered (e.g. user moved transactions or period rolled).
	 */
	async markRecovered(eventId: string): Promise<void> {
		const event = await db.negativeAllowanceEvents.get(eventId);
		if (!event || event.deletedAt) return;
		await db.negativeAllowanceEvents.update(eventId, {
			recoveredAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Generate recovery suggestions when allowance is negative.
	 */
	getRecoverySuggestions(allowance: EnhancedAllowance): RecoverySuggestion[] {
		const suggestions: RecoverySuggestion[] = [];
		const currency = allowance.total.currency;

		// Total over
		const totalRemaining =
			allowance.total.remaining ?? allowance.total.monthly - allowance.total.spentSoFar;
		if (totalRemaining >= 0) return suggestions;

		const overBy = Math.abs(totalRemaining);

		suggestions.push({
			id: 'reduce-future',
			title: 'Reduce future spending',
			description: `Spend ${formatAmount(overBy, currency)} less over the rest of the period to get back on track.`,
			actionType: 'reduce_spending',
			priority: 'high',
			estimatedImpact: overBy,
			currency
		});

		suggestions.push({
			id: 'move-transactions',
			title: 'Move transactions to next period',
			description:
				'Reschedule some discretionary or buffer spending to next month to balance this period.',
			actionType: 'move_transactions',
			priority: 'medium'
		});

		suggestions.push({
			id: 'review-budget',
			title: 'Review your budget',
			description:
				'Check if your allowance is realistic for your income and fixed costs; adjust categories if needed.',
			actionType: 'review_budget',
			priority: 'low'
		});

		return suggestions;
	}
}

export const negativeAllowanceService = new NegativeAllowanceService();
