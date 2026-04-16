/**
 * Occasion Service
 *
 * Tracks recurring spending occasions (weekly, monthly, annual) detected from
 * transaction history or defined by the user. Used to adjust allowances for
 * known high-spending periods (e.g. Friday nights, first weekend, holidays).
 */

import { db, generateUUID } from '$lib/core/db';
import type { Occasion, Transaction } from '$lib/core/db';
import { transactionService } from '../core/transaction-service';
import { exchangeRateService } from '../core/exchange-rate-service';

export type OccasionType = 'weekly' | 'monthly' | 'annual';

export interface WeeklyPattern {
	type: 'weekly';
	dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
}

export interface MonthlyPattern {
	type: 'monthly';
	weekOfMonth?: number; // 1-5 (first week .. last week)
	dayOfWeek?: number; // 0-6, for "first Saturday"
	dayOfMonth?: number; // 1-31, for "payday on 25th"
}

export interface AnnualPattern {
	type: 'annual';
	month: number; // 1-12
	dayOfMonth?: number; // 1-31
}

export type OccasionPattern = WeeklyPattern | MonthlyPattern | AnnualPattern;

export interface OccasionInPeriod {
	occasion: Occasion;
	occurrences: number;
	amountDelta: number;
}

export interface AllowanceAdjustmentForPeriod {
	totalDelta: number;
	currency: string;
	occasions: OccasionInPeriod[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MIN_TRANSACTIONS_FOR_DETECTION = 20;
const SPIKES_THRESHOLD = 1.4; // Day/week/month with avg spending > 1.4x overall avg = spike

function parsePattern(patternJson: string): OccasionPattern | null {
	try {
		return JSON.parse(patternJson) as OccasionPattern;
	} catch {
		return null;
	}
}

function getWeekOfMonth(d: Date): number {
	const day = d.getDate();
	return Math.ceil(day / 7);
}

function dateInRange(d: Date, start: Date, end: Date): boolean {
	const t = d.getTime();
	return t >= start.getTime() && t <= end.getTime();
}

/** Count how many times this occasion occurs in [periodStart, periodEnd]. */
function countOccurrencesInPeriod(occasion: Occasion, periodStart: Date, periodEnd: Date): number {
	const pattern = parsePattern(occasion.pattern);
	if (!pattern) return 0;

	if (pattern.type === 'weekly') {
		let count = 0;
		const cur = new Date(periodStart);
		cur.setHours(0, 0, 0, 0);
		const end = new Date(periodEnd);
		end.setHours(23, 59, 59, 999);
		while (cur <= end) {
			if (cur.getDay() === pattern.dayOfWeek) count++;
			cur.setDate(cur.getDate() + 1);
		}
		return count;
	}

	if (pattern.type === 'monthly') {
		if (pattern.dayOfMonth != null) {
			let count = 0;
			const cur = new Date(periodStart.getFullYear(), periodStart.getMonth(), pattern.dayOfMonth);
			const end = new Date(periodEnd);
			while (cur <= end) {
				if (
					cur.getMonth() === periodStart.getMonth() &&
					cur.getFullYear() === periodStart.getFullYear()
				) {
					if (dateInRange(cur, periodStart, periodEnd)) count++;
				}
				cur.setMonth(cur.getMonth() + 1);
			}
			return Math.min(count, 1); // At most one per month
		}
		if (pattern.weekOfMonth != null && pattern.dayOfWeek != null) {
			// e.g. first Saturday: check if period contains that week
			const firstDay = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
			let target = new Date(firstDay);
			let weekNum = 1;
			while (target.getDay() !== pattern.dayOfWeek) {
				target.setDate(target.getDate() + 1);
				if (target.getMonth() !== firstDay.getMonth()) return 0;
			}
			while (weekNum < pattern.weekOfMonth) {
				target.setDate(target.getDate() + 7);
				weekNum++;
				if (target.getMonth() !== firstDay.getMonth()) return 0;
			}
			return dateInRange(target, periodStart, periodEnd) ? 1 : 0;
		}
		return 0;
	}

	if (pattern.type === 'annual') {
		const occasionDate = new Date(
			periodStart.getFullYear(),
			pattern.month - 1,
			pattern.dayOfMonth ?? 1
		);
		return dateInRange(occasionDate, periodStart, periodEnd) ? 1 : 0;
	}
	return 0;
}

// @legacy-dormant — occasions UI removed (Phase 8); service retained for existing DB rows.
class OccasionService {
	public get ready() {
		return db.isOpen();
	}

	/**
	 * Get all active occasions for an account (or global).
	 */
	async getOccasions(
		accountId?: string,
		options?: { includeInactive?: boolean }
	): Promise<Occasion[]> {
		const all = await db.occasions.toArray();
		let list = all.filter(
			(o): o is Occasion => o != null && (o.accountId ?? '') === (accountId ?? '')
		);
		if (!options?.includeInactive) {
			list = list.filter((o) => o.isActive);
		}
		return list.sort((a, b) => a.title.localeCompare(b.title));
	}

	/**
	 * Get total allowance adjustment for a period from all matching occasions.
	 */
	async getAllowanceAdjustmentForPeriod(
		accountId: string | undefined,
		periodStart: Date,
		periodEnd: Date,
		currency: string
	): Promise<AllowanceAdjustmentForPeriod> {
		const occasions = await this.getOccasions(accountId);
		const result: OccasionInPeriod[] = [];
		let totalDelta = 0;
		for (const occasion of occasions) {
			const occurrences = countOccurrencesInPeriod(occasion, periodStart, periodEnd);
			if (occurrences === 0) continue;
			const amountDelta = occasion.expectedAmountDelta * occurrences;
			result.push({ occasion, occurrences, amountDelta });
			if (occasion.currency === currency) {
				totalDelta += amountDelta;
			} else {
				const abs = Math.abs(amountDelta);
				const sign = amountDelta >= 0 ? 1 : -1;
				const converted = await exchangeRateService.convertAmount(
					abs,
					occasion.currency,
					currency,
					periodStart
				);
				totalDelta += converted != null ? sign * converted : amountDelta;
			}
		}
		return { totalDelta, currency, occasions: result };
	}

	/**
	 * Detect occasions from transaction history (spending spikes by day of week, week of month, month).
	 */
	async detectOccasionsFromTransactions(
		accountId?: string,
		options?: { daysLookback?: number; minConfidence?: number }
	): Promise<Occasion[]> {
		const daysLookback = options?.daysLookback ?? 180;
		const minConfidence = options?.minConfidence ?? 70;
		const cutoff = new Date(Date.now() - daysLookback * 24 * 60 * 60 * 1000);

		let transactions: Transaction[];
		if (accountId) {
			transactions = (await transactionService.getTransactionsByAccount(accountId)).filter(
				(t) =>
					t.status === 'cleared' &&
					t.clearedDate &&
					t.clearedDate >= cutoff.toISOString() &&
					t.type === 'expense'
			);
		} else {
			const all = await db.transactions.toArray();
			transactions = all.filter(
				(t): t is Transaction =>
					t != null &&
					!t.deletedAt &&
					t.status === 'cleared' &&
					t.clearedDate != null &&
					t.clearedDate >= cutoff.toISOString() &&
					t.type === 'expense'
			);
		}

		if (transactions.length < MIN_TRANSACTIONS_FOR_DETECTION) return [];

		const created: Occasion[] = [];
		const overallAvg =
			transactions.reduce((s, t) => s + Math.abs(t.amount ?? 0), 0) / transactions.length;

		// By day of week
		const byDay = new Map<number, number[]>();
		for (const t of transactions) {
			const d = new Date(t.clearedDate!);
			const day = d.getDay();
			const list = byDay.get(day) ?? [];
			list.push(Math.abs(t.amount ?? 0));
			byDay.set(day, list);
		}
		for (const [dayOfWeek, amounts] of byDay) {
			const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
			if (amounts.length >= 3 && avg >= overallAvg * SPIKES_THRESHOLD) {
				const confidence = Math.min(100, 60 + Math.round((avg / overallAvg - 1) * 30));
				if (confidence >= minConfidence) {
					const existing = await this.findMatchingOccasion(accountId, 'weekly', {
						type: 'weekly',
						dayOfWeek
					});
					if (!existing) {
						const occasion = await this.createOccasion({
							accountId,
							title: `Higher spending on ${DAY_NAMES[dayOfWeek]}s`,
							occasionType: 'weekly',
							pattern: JSON.stringify({ type: 'weekly', dayOfWeek }),
							expectedAmountDelta: Math.round((avg - overallAvg) * 10) / 10,
							currency: transactions[0]?.currency ?? 'USD',
							source: 'detected',
							confidence,
							lastDetectedAt: new Date().toISOString()
						});
						created.push(occasion);
					}
				}
			}
		}

		// By week of month (1-5)
		const byWeekOfMonth = new Map<number, number[]>();
		for (const t of transactions) {
			const d = new Date(t.clearedDate!);
			const w = getWeekOfMonth(d);
			const list = byWeekOfMonth.get(w) ?? [];
			list.push(Math.abs(t.amount ?? 0));
			byWeekOfMonth.set(w, list);
		}
		for (const [weekOfMonth, amounts] of byWeekOfMonth) {
			const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
			if (amounts.length >= 3 && avg >= overallAvg * SPIKES_THRESHOLD) {
				const confidence = Math.min(100, 60 + Math.round((avg / overallAvg - 1) * 30));
				if (confidence >= minConfidence) {
					const existing = await this.findMatchingOccasion(accountId, 'monthly', {
						type: 'monthly',
						weekOfMonth
					});
					if (!existing) {
						const occasion = await this.createOccasion({
							accountId,
							title: `Higher spending in week ${weekOfMonth} of month`,
							occasionType: 'monthly',
							pattern: JSON.stringify({ type: 'monthly', weekOfMonth }),
							expectedAmountDelta: Math.round((avg - overallAvg) * 10) / 10,
							currency: transactions[0]?.currency ?? 'USD',
							source: 'detected',
							confidence,
							lastDetectedAt: new Date().toISOString()
						});
						created.push(occasion);
					}
				}
			}
		}

		return created;
	}

	private async findMatchingOccasion(
		accountId: string | undefined,
		occasionType: OccasionType,
		pattern: OccasionPattern
	): Promise<Occasion | null> {
		const list = await this.getOccasions(accountId, { includeInactive: true });
		const patternStr = JSON.stringify(pattern);
		return list.find((o) => o.occasionType === occasionType && o.pattern === patternStr) ?? null;
	}

	/**
	 * Create an occasion (user-defined or from detection).
	 */
	async createOccasion(data: {
		accountId?: string;
		title: string;
		occasionType: OccasionType;
		pattern: string;
		expectedAmountDelta: number;
		currency: string;
		source?: 'detected' | 'user_defined';
		confidence?: number;
		learningPatternId?: string;
		lastDetectedAt?: string;
	}): Promise<Occasion> {
		const occasion: Occasion = {
			id: generateUUID(),
			accountId: data.accountId,
			title: data.title,
			occasionType: data.occasionType,
			pattern: data.pattern,
			expectedAmountDelta: data.expectedAmountDelta,
			currency: data.currency,
			source: data.source ?? 'user_defined',
			confidence: data.confidence ?? 80,
			learningPatternId: data.learningPatternId,
			isActive: true,
			lastDetectedAt: data.lastDetectedAt,
			metadata: undefined,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};
		await db.occasions.add(occasion);
		return occasion;
	}

	/**
	 * Update an occasion.
	 */
	async updateOccasion(
		id: string,
		updates: Partial<Pick<Occasion, 'title' | 'expectedAmountDelta' | 'isActive' | 'pattern'>>
	): Promise<Occasion> {
		const existing = await db.occasions.get(id);
		if (!existing || existing.deletedAt) throw new Error('Occasion not found');
		const updated = {
			...existing,
			...updates,
			updatedAt: new Date().toISOString()
		};
		await db.occasions.update(id, updated);
		return updated;
	}

	/**
	 * Soft-delete an occasion.
	 */
	async deleteOccasion(id: string): Promise<void> {
		const existing = await db.occasions.get(id);
		if (!existing || existing.deletedAt) return;
		await db.occasions.update(id, {
			deletedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}
}

export const occasionService = new OccasionService();
