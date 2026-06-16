/**
 * Envelope Borrowing Service
 *
 * Temporary borrowing between lifestyle budget categories (categoryId).
 */

import { db, generateUUID } from '$lib/core/db';
import type { EnvelopeBorrowing } from '$lib/core/db';
import type { UserPreferences } from '$lib/core/db';
import type { DailyAllowanceView } from '$lib/core/services/core/budget-service';
import { userService } from './user-service';
import { formatAmount, formatPercentage } from '$lib/utils/currency-utils';

export interface CreateBorrowInput {
	accountId?: string;
	fromCategoryId: string;
	toCategoryId: string;
	amount: number;
	currency: string;
	periodStart: Date;
	periodEnd: Date;
	negativeAllowanceEventId?: string;
	userConfirmedRepeated?: boolean;
}

export interface BorrowingLimitCheck {
	allowed: boolean;
	maxPerCategory?: number;
	maxTotal?: number;
	totalOutstanding: number;
	outstandingByCategory: Record<string, number>;
	reason?: string;
}

export interface PaybackSuggestion {
	borrowId: string;
	amount: number;
	currency: string;
	fromCategoryId: string;
	toCategoryId: string;
	fromCategoryName?: string;
	toCategoryName?: string;
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

function addPeriodsToDate(date: Date, months: number): Date {
	const out = new Date(date);
	out.setMonth(out.getMonth() + months);
	return out;
}

class EnvelopeBorrowingService {
	public get ready() {
		return db.isOpen();
	}

	async createBorrow(input: CreateBorrowInput): Promise<EnvelopeBorrowing> {
		const prefs = await userService.getUserPreferences();
		const limitCheck = await this.checkBorrowingLimits(
			input.accountId,
			null,
			input.amount,
			input.fromCategoryId,
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
			fromCategory: input.fromCategoryId,
			toCategory: input.toCategoryId,
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

	async getActiveBorrows(accountId?: string, periodStart?: Date): Promise<EnvelopeBorrowing[]> {
		const accountFilter = accountId ?? '';
		const items = await db.envelopeBorrowings.toArray();
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

	async getBorrowingHistory(
		accountId?: string,
		options?: { limit?: number; includeRepaid?: boolean }
	): Promise<EnvelopeBorrowing[]> {
		const limit = options?.limit ?? 50;
		const includeRepaid = options?.includeRepaid ?? true;
		const items = await db.envelopeBorrowings.toArray();
		const accountFilter = accountId ?? '';
		let result = items.filter((b) => (b.accountId ?? '') === accountFilter);
		if (!includeRepaid) {
			result = result.filter((b) => b.repaidAmount < b.amount);
		}
		return result
			.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
			.slice(0, limit);
	}

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

	async checkBorrowingLimits(
		accountId: string | undefined,
		allowance: DailyAllowanceView | null,
		requestedAmount: number,
		fromCategoryId: string,
		prefs?: UserPreferences | null
	): Promise<BorrowingLimitCheck> {
		const preferences = prefs ?? (await userService.getUserPreferences());
		const active = await this.getActiveBorrows(accountId);
		const totalOutstanding = active.reduce((sum, b) => sum + (b.amount - b.repaidAmount), 0);
		const outstandingByCategory: Record<string, number> = {};
		for (const b of active) {
			outstandingByCategory[b.fromCategory] =
				(outstandingByCategory[b.fromCategory] ?? 0) + (b.amount - b.repaidAmount);
		}

		const totalLimit = preferences.envelopeBorrowTotalLimit;
		if (
			totalLimit != null &&
			totalLimit > 0 &&
			totalOutstanding + requestedAmount > totalLimit
		) {
			return {
				allowed: false,
				totalOutstanding,
				outstandingByCategory,
				reason: `Total borrowing would exceed your limit of ${totalLimit}`
			};
		}

		const maxPercent = preferences.envelopeBorrowMaxPerCategoryPercent ?? 0.5;
		if (allowance && maxPercent < 1) {
			const fromLine = allowance.lifestyleLines.find((l) => l.categoryId === fromCategoryId);
			const nextPeriodAllowance = fromLine?.budgetAmount ?? 0;
			const maxFromCategory = nextPeriodAllowance * maxPercent;
			const currentFromOutstanding = outstandingByCategory[fromCategoryId] ?? 0;
			const fromName = fromLine?.categoryName ?? fromCategoryId;
			if (currentFromOutstanding + requestedAmount > maxFromCategory) {
				return {
					allowed: false,
					maxPerCategory: maxFromCategory,
					totalOutstanding,
					outstandingByCategory,
					reason: `Borrowing from "${fromName}" would exceed ${formatPercentage(maxPercent * 100, { maxDecimals: 0 })} of next period's budget (max ${formatAmount(maxFromCategory, preferences?.currency || 'USD')})`
				};
			}
		}

		return {
			allowed: true,
			totalOutstanding,
			outstandingByCategory
		};
	}

	async getPaybackSuggestions(accountId?: string): Promise<PaybackSuggestion[]> {
		const active = await this.getActiveBorrows(accountId);
		const categories = await db.getActiveCategories();
		const nameById = new Map(categories.map((c) => [c.id, c.name]));
		const now = new Date();
		const suggestions: PaybackSuggestion[] = [];
		for (const b of active) {
			const outstanding = b.amount - b.repaidAmount;
			if (outstanding <= 0) continue;
			suggestions.push({
				borrowId: b.id,
				amount: b.amount,
				currency: b.currency,
				fromCategoryId: b.fromCategory,
				toCategoryId: b.toCategory,
				fromCategoryName: nameById.get(b.fromCategory),
				toCategoryName: nameById.get(b.toCategory),
				dueRepayBy: b.dueRepayBy,
				periodLabel: `${new Date(b.periodStart).toLocaleDateString()} – ${new Date(b.periodEnd).toLocaleDateString()}`,
				suggestedAmount: outstanding
			});
		}
		return suggestions.sort(
			(a, b) => new Date(a.dueRepayBy).getTime() - new Date(b.dueRepayBy).getTime()
		);
	}

	async getChronicBorrowingSummary(accountId?: string): Promise<ChronicBorrowingSummary> {
		const history = await this.getBorrowingHistory(accountId, {
			limit: 24,
			includeRepaid: true
		});
		const now = new Date();
		const threePeriodsAgo = new Date(now);
		threePeriodsAgo.setMonth(threePeriodsAgo.getMonth() - 3);
		const recent = history.filter(
			(b) => new Date(b.periodStart).getTime() >= threePeriodsAgo.getTime()
		);
		const prefs = await userService.getUserPreferences();
		const requireConfirmation = prefs.envelopeBorrowRequireConfirmationRepeated ?? true;
		const isChronic = recent.length >= 3;
		let suggestion = '';
		if (isChronic) {
			suggestion =
				"You've borrowed between lifestyle categories several times recently. Consider raising category budgets to reduce borrowing.";
		}
		return {
			isChronic,
			borrowCountLast3Periods: recent.length,
			suggestion,
			shouldRequireConfirmation: requireConfirmation && recent.length >= 2
		};
	}

	/** Resolve lifestyle categoryId to display name (allowance lines, then DB). */
	resolveCategoryDisplayName(categoryId: string, nameById: Map<string, string>): string {
		return nameById.get(categoryId) ?? categoryId;
	}

	/** Build id → name map from allowance lifestyle lines and active categories. */
	async buildCategoryNameMap(allowance: DailyAllowanceView | null): Promise<Map<string, string>> {
		const map = new Map<string, string>();
		if (allowance) {
			for (const line of allowance.lifestyleLines) {
				map.set(line.categoryId, line.categoryName);
			}
		}
		const categories = await db.getActiveCategories();
		for (const c of categories) {
			if (!map.has(c.id)) map.set(c.id, c.name);
		}
		return map;
	}

	getLenderCandidates(
		allowance: DailyAllowanceView
	): Array<{ categoryId: string; categoryName: string; available: number; currency: string }> {
		return allowance.lifestyleLines
			.filter((line) => line.remaining > 0)
			.map((line) => ({
				categoryId: line.categoryId,
				categoryName: line.categoryName,
				available: line.remaining,
				currency: allowance.currency
			}))
			.sort((a, b) => b.available - a.available);
	}
}

export const envelopeBorrowingService = new EnvelopeBorrowingService();
