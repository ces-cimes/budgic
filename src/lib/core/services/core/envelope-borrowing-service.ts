/**
 * Envelope Borrowing Service
 *
 * Implements temporary borrowing between allowance categories when the user
 * chooses "borrow from other categories" for negative allowance handling.
 * Tracks borrowing limits, repayment deadlines, and suggests payback in subsequent periods.
 */

import { db, generateUUID } from '$lib/core/db';
import type { EnvelopeBorrowing } from '$lib/core/db';
import type { UserPreferences } from '$lib/core/db';
import type { EnhancedAllowance } from '$lib/core/services/core/budget-service';
import { userService } from './user-service';
import { formatAmount, formatPercentage } from '$lib/utils/currency-utils';

export type AllowanceCategoryKey = 'essential' | 'discretionary' | 'buffer';

export interface CreateBorrowInput {
	accountId?: string;
	fromCategory: AllowanceCategoryKey;
	toCategory: AllowanceCategoryKey;
	amount: number;
	currency: string;
	periodStart: Date;
	periodEnd: Date;
	negativeAllowanceEventId?: string;
	/** Set when user confirmed repeated borrowing (if requireConfirmationRepeated) */
	userConfirmedRepeated?: boolean;
}

export interface BorrowingLimitCheck {
	allowed: boolean;
	maxPerCategory?: number;
	maxTotal?: number;
	totalOutstanding: number;
	outstandingByCategory: Record<AllowanceCategoryKey, number>;
	reason?: string;
}

export interface PaybackSuggestion {
	borrowId: string;
	amount: number;
	currency: string;
	fromCategory: AllowanceCategoryKey;
	toCategory: AllowanceCategoryKey;
	dueRepayBy: string;
	periodLabel: string;
	suggestedAmount: number;
}

export interface ChronicBorrowingSummary {
	isChronic: boolean;
	borrowCountLast3Periods: number;
	suggestion: string;
	shouldRequireConfirmation: boolean;
}

const CATEGORY_KEYS: AllowanceCategoryKey[] = ['essential', 'discretionary', 'buffer'];

function addPeriodsToDate(date: Date, months: number): Date {
	const out = new Date(date);
	out.setMonth(out.getMonth() + months);
	return out;
}

function getNextPeriodStart(periodEnd: Date): Date {
	const next = new Date(periodEnd);
	next.setDate(next.getDate() + 1);
	next.setHours(0, 0, 0, 0);
	return next;
}

class EnvelopeBorrowingService {
	public get ready() {
		return db.isOpen();
	}

	/**
	 * Create a new envelope borrow (fromCategory lends to toCategory).
	 */
	async createBorrow(input: CreateBorrowInput): Promise<EnvelopeBorrowing> {
		const prefs = await userService.getUserPreferences();
		const limitCheck = await this.checkBorrowingLimits(
			input.accountId,
			null,
			input.amount,
			input.fromCategory,
			input.toCategory,
			prefs
		);
		if (!limitCheck.allowed && limitCheck.reason) {
			throw new Error(limitCheck.reason);
		}

		const repaymentPeriods = prefs.envelopeBorrowRepaymentPeriods ?? 2;
		const dueRepayBy = addPeriodsToDate(input.periodEnd, repaymentPeriods);

		const borrow: EnvelopeBorrowing = {
			id: generateUUID(),
			accountId: input.accountId,
			fromCategory: input.fromCategory,
			toCategory: input.toCategory,
			amount: input.amount,
			currency: input.currency,
			periodStart: input.periodStart.toISOString(),
			periodEnd: input.periodEnd.toISOString(),
			dueRepayBy: dueRepayBy.toISOString(),
			repaidAmount: 0,
			negativeAllowanceEventId: input.negativeAllowanceEventId,
			metadata: input.userConfirmedRepeated
				? JSON.stringify({ userConfirmedRepeated: true })
				: undefined,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};
		await db.envelopeBorrowings.add(borrow);
		return borrow;
	}

	/**
	 * Get active (outstanding) borrows for an account or globally.
	 */
	async getActiveBorrows(accountId?: string, periodStart?: Date): Promise<EnvelopeBorrowing[]> {
		let collection = db.envelopeBorrowings.toCollection();
		const accountFilter = accountId ?? '';
		const items = await collection.toArray();
		let result = items.filter(
			(b) => (b.accountId ?? '') === accountFilter && b.repaidAmount < b.amount
		);
		if (periodStart) {
			const periodStartStr = periodStart.toISOString();
			result = result.filter((b) => b.periodStart === periodStartStr);
		}
		return result.sort(
			(a, b) => new Date(a.dueRepayBy).getTime() - new Date(b.dueRepayBy).getTime()
		);
	}

	/**
	 * Get borrowing history (including repaid) for display.
	 */
	async getBorrowingHistory(
		accountId?: string,
		options?: { limit?: number; includeRepaid?: boolean }
	): Promise<EnvelopeBorrowing[]> {
		const limit = options?.limit ?? 50;
		const includeRepaid = options?.includeRepaid ?? true;
		let collection = db.envelopeBorrowings.toCollection();
		const items = await collection.toArray();
		const accountFilter = accountId ?? '';
		let result = items.filter((b) => (b.accountId ?? '') === accountFilter);
		if (!includeRepaid) {
			result = result.filter((b) => b.repaidAmount < b.amount);
		}
		result = result.sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		);
		return result.slice(0, limit);
	}

	/**
	 * Repay (partially or fully) a borrow.
	 */
	async repayBorrow(borrowId: string, amount: number): Promise<EnvelopeBorrowing> {
		const borrow = await db.envelopeBorrowings.get(borrowId);
		if (!borrow || borrow.deletedAt) {
			throw new Error('Borrow not found');
		}
		const outstanding = borrow.amount - borrow.repaidAmount;
		const repayAmount = Math.min(amount, outstanding);
		if (repayAmount <= 0) return borrow;

		const newRepaidAmount = borrow.repaidAmount + repayAmount;
		const isFullyRepaid = newRepaidAmount >= borrow.amount;
		await db.envelopeBorrowings.update(borrowId, {
			repaidAmount: newRepaidAmount,
			repaidAt: isFullyRepaid ? new Date().toISOString() : borrow.repaidAt,
			updatedAt: new Date().toISOString()
		});
		const updated = await db.envelopeBorrowings.get(borrowId);
		return updated!;
	}

	/**
	 * Check if a requested borrow would exceed limits (per-category and total).
	 */
	async checkBorrowingLimits(
		accountId: string | undefined,
		allowance: EnhancedAllowance | null,
		requestedAmount: number,
		fromCategory: AllowanceCategoryKey,
		_toCategory: AllowanceCategoryKey,
		prefs?: UserPreferences | null
	): Promise<BorrowingLimitCheck> {
		const preferences = prefs ?? (await userService.getUserPreferences());
		const active = await this.getActiveBorrows(accountId);
		const totalOutstanding = active.reduce((sum, b) => sum + (b.amount - b.repaidAmount), 0);
		const outstandingByCategory: Record<AllowanceCategoryKey, number> = {
			essential: 0,
			discretionary: 0,
			buffer: 0
		};
		for (const b of active) {
			// "From" category is the one lending; we limit how much each category can lend (outstanding borrowed from it)
			outstandingByCategory[b.fromCategory] += b.amount - b.repaidAmount;
		}

		// Total limit
		const totalLimit = preferences.envelopeBorrowTotalLimit;
		if (totalLimit != null && totalLimit > 0 && totalOutstanding + requestedAmount > totalLimit) {
			return {
				allowed: false,
				totalOutstanding,
				outstandingByCategory,
				reason: `Total borrowing would exceed your limit of ${totalLimit}`
			};
		}

		// Per-category limit: max % of next period's allowance for that category
		const maxPercent = preferences.envelopeBorrowMaxPerCategoryPercent ?? 0.5;
		if (allowance && maxPercent < 1) {
			const fromCalc = allowance[fromCategory];
			const nextPeriodAllowance = fromCalc?.monthly ?? 0;
			const maxFromCategory = nextPeriodAllowance * maxPercent;
			const currentFromOutstanding = outstandingByCategory[fromCategory];
			if (currentFromOutstanding + requestedAmount > maxFromCategory) {
				return {
					allowed: false,
					maxPerCategory: maxFromCategory,
					totalOutstanding,
					outstandingByCategory,
					reason: `Borrowing from "${fromCategory}" would exceed ${formatPercentage(maxPercent * 100, { maxDecimals: 0 })} of next period's allowance (max ${formatAmount(maxFromCategory, preferences?.currency || 'USD')})`
				};
			}
		}

		return {
			allowed: true,
			totalOutstanding,
			outstandingByCategory
		};
	}

	/**
	 * Get payback suggestions for the current/next period (auto-suggest in subsequent periods).
	 */
	async getPaybackSuggestions(accountId?: string): Promise<PaybackSuggestion[]> {
		const active = await this.getActiveBorrows(accountId);
		const now = new Date();
		const suggestions: PaybackSuggestion[] = [];
		for (const b of active) {
			const outstanding = b.amount - b.repaidAmount;
			if (outstanding <= 0) continue;
			const dueDate = new Date(b.dueRepayBy);
			if (dueDate < now) continue; // Already overdue - still suggest but we don't change amount
			suggestions.push({
				borrowId: b.id,
				amount: b.amount,
				currency: b.currency,
				fromCategory: b.fromCategory,
				toCategory: b.toCategory,
				dueRepayBy: b.dueRepayBy,
				periodLabel: `${new Date(b.periodStart).toLocaleDateString()} – ${new Date(b.periodEnd).toLocaleDateString()}`,
				suggestedAmount: outstanding
			});
		}
		return suggestions.sort(
			(a, b) => new Date(a.dueRepayBy).getTime() - new Date(b.dueRepayBy).getTime()
		);
	}

	/**
	 * Check if user has chronic borrowing pattern (frequent borrows) → suggest allowance adjustment or require confirmation.
	 */
	async getChronicBorrowingSummary(accountId?: string): Promise<ChronicBorrowingSummary> {
		const history = await this.getBorrowingHistory(accountId, { limit: 24, includeRepaid: true });
		const now = new Date();
		const threePeriodsAgo = new Date(now);
		threePeriodsAgo.setMonth(threePeriodsAgo.getMonth() - 3);
		const recent = history.filter(
			(b) => new Date(b.periodStart).getTime() >= threePeriodsAgo.getTime()
		);
		const borrowCountLast3Periods = recent.length;
		const prefs = await userService.getUserPreferences();
		const requireConfirmation = prefs.envelopeBorrowRequireConfirmationRepeated ?? true;
		const isChronic = borrowCountLast3Periods >= 3;
		let suggestion = '';
		if (isChronic) {
			suggestion =
				"You've borrowed between categories several times recently. Consider increasing your discretionary or buffer allowance to reduce the need for borrowing.";
		}
		return {
			isChronic,
			borrowCountLast3Periods: recent.length,
			suggestion,
			shouldRequireConfirmation: requireConfirmation && borrowCountLast3Periods >= 2
		};
	}

	/**
	 * Get categories that have surplus (can lend) for a given allowance, for UI to offer "borrow from" options.
	 */
	getLenderCandidates(
		allowance: EnhancedAllowance
	): Array<{ category: AllowanceCategoryKey; available: number; currency: string }> {
		const candidates: Array<{
			category: AllowanceCategoryKey;
			available: number;
			currency: string;
		}> = [];
		for (const key of CATEGORY_KEYS) {
			const calc = allowance[key];
			const remaining = calc.monthly - calc.spentSoFar;
			if (remaining > 0) {
				candidates.push({
					category: key,
					available: remaining,
					currency: calc.currency
				});
			}
		}
		return candidates.sort((a, b) => b.available - a.available);
	}
}

export const envelopeBorrowingService = new EnvelopeBorrowingService();
