import type { Transaction } from '$lib/core/db';

export function getTransactionEffectiveDateIso(tx: Transaction): string {
	return tx.clearedDate || tx.plannedDate || tx.createdAt;
}

export function monthKeyFromDate(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthDateFromKey(ym: string): Date {
	const [y, m] = ym.split('-').map(Number);
	return new Date(y, m - 1, 1);
}

export function transactionInMonth(tx: Transaction, month: Date): boolean {
	const d = new Date(getTransactionEffectiveDateIso(tx));
	if (Number.isNaN(d.getTime())) return false;
	return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
}

export function findLatestMonthWithTransactions(transactions: Transaction[]): string | null {
	let latest: { key: string; ms: number } | null = null;

	for (const tx of transactions) {
		if (!tx || tx.deletedAt) continue;
		const d = new Date(getTransactionEffectiveDateIso(tx));
		if (Number.isNaN(d.getTime())) continue;
		const ms = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
		const key = monthKeyFromDate(d);
		if (!latest || ms > latest.ms) {
			latest = { key, ms };
		}
	}

	return latest?.key ?? null;
}

export function hasTransactionsOutsideMonth(transactions: Transaction[], month: Date): boolean {
	const active = transactions.filter((t) => t && !t.deletedAt);
	if (active.length === 0) return false;
	return active.some((tx) => !transactionInMonth(tx, month));
}

export function countTransactionsInMonth(transactions: Transaction[], month: Date): number {
	return transactions.filter((t) => t && !t.deletedAt && transactionInMonth(t, month)).length;
}

export function isDefaultCalendarMonth(month: Date): boolean {
	const now = new Date();
	return month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
}

export function parseMonthParamFromSearch(search: string): string | null {
	const m = new URLSearchParams(search).get('month');
	if (m && /^\d{4}-\d{2}$/.test(m)) return m;
	return null;
}

/** Auto-snap when user did not deep-link a month, or linked the default calendar month. */
export function shouldAutoSnapToLatestMonth(search: string, currentMonth: Date): boolean {
	const param = parseMonthParamFromSearch(search);
	if (param === null) return true;
	return param === monthKeyFromDate(currentMonth) && isDefaultCalendarMonth(currentMonth);
}
