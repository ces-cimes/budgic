/**
 * Phase 8 — contextual date group headers (payday / rent / month boundary / today).
 * Pure helpers for use from TransactionList, Plan week view, etc.
 */

export type SmartPatternFrequency =
	| 'daily'
	| 'weekly'
	| 'biweekly'
	| 'monthly'
	| 'quarterly'
	| 'yearly'
	| 'irregular';

export interface SmartPatternForLabel {
	frequency: SmartPatternFrequency;
	confidence: number;
	typicalDayOfMonth?: number;
	typicalDayOfWeek?: number;
	averageAmount: number;
	txType?: 'income' | 'expense' | 'transfer' | 'adjustment';
}

function startOfLocalDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function weekdayDateLabel(date: Date): string {
	const today = new Date();
	const currentYear = today.getFullYear();
	const dateYear = date.getFullYear();
	if (dateYear === currentYear) {
		return date.toLocaleDateString(undefined, {
			weekday: 'long',
			month: 'short',
			day: 'numeric'
		});
	}
	return date.toLocaleDateString(undefined, {
		weekday: 'long',
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

function isNearMonthStart(d: Date): boolean {
	return d.getDate() <= 2;
}

function isNearMonthEnd(d: Date): boolean {
	const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
	return d.getDate() >= last - 1;
}

const MIN_PATTERN_CONFIDENCE = 40;
const RENT_TRANSFER_MIN_ABS = 200;

function isPayday(date: Date, patterns: readonly SmartPatternForLabel[]): boolean {
	const dow = date.getDay();
	const dom = date.getDate();
	for (const p of patterns) {
		if (p.txType !== 'income') continue;
		if (p.confidence < MIN_PATTERN_CONFIDENCE) continue;
		if (p.frequency === 'monthly' || p.frequency === 'quarterly' || p.frequency === 'yearly') {
			if (p.typicalDayOfMonth != null && dom === p.typicalDayOfMonth) return true;
		}
		if (p.frequency === 'weekly' || p.frequency === 'biweekly') {
			if (p.typicalDayOfWeek != null && dow === p.typicalDayOfWeek) return true;
		}
	}
	return false;
}

function isRentDay(date: Date, patterns: readonly SmartPatternForLabel[]): boolean {
	const dow = date.getDay();
	const dom = date.getDate();
	for (const p of patterns) {
		if (p.txType !== 'transfer') continue;
		if (p.confidence < MIN_PATTERN_CONFIDENCE) continue;
		if (Math.abs(p.averageAmount) < RENT_TRANSFER_MIN_ABS) continue;
		if (p.frequency !== 'monthly' && p.frequency !== 'biweekly') continue;
		if (p.typicalDayOfMonth != null && dom === p.typicalDayOfMonth) return true;
		if (p.frequency === 'biweekly' && p.typicalDayOfWeek != null && dow === p.typicalDayOfWeek)
			return true;
	}
	return false;
}

/**
 * Priority: Payday → Rent day → month boundary hints → Today / Yesterday → weekday + date.
 */
export function resolveSmartLabel(
	date: Date,
	patterns: readonly SmartPatternForLabel[] | null | undefined
): string {
	const d = startOfLocalDay(date);
	const today = startOfLocalDay(new Date());
	const yesterday = startOfLocalDay(new Date(today));
	yesterday.setDate(yesterday.getDate() - 1);

	const list = patterns ?? [];

	if (list.length > 0) {
		if (isPayday(d, list)) return 'Payday';
		if (isRentDay(d, list)) return 'Rent day';
	}

	if (d.getTime() === today.getTime()) return 'Today';
	if (d.getTime() === yesterday.getTime()) return 'Yesterday';

	if (isNearMonthStart(d)) return 'First of month';
	if (isNearMonthEnd(d)) return 'Last day of month';

	return weekdayDateLabel(d);
}
