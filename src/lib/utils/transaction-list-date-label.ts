/** Calendar-day keys used to decide per-row date vs time labels in TransactionList. */
export function calendarDayKeysForTransaction(
	getTransactionDate: (tx: unknown) => string,
	tx: unknown
): string[] {
	if (
		tx &&
		typeof tx === 'object' &&
		'isGroup' in tx &&
		(tx as { isGroup?: boolean }).isGroup &&
		'transactions' in tx &&
		Array.isArray((tx as { transactions?: unknown[] }).transactions)
	) {
		const members = (tx as { transactions: unknown[] }).transactions;
		if (members.length > 0) {
			return members.map((member) => getTransactionDate(member));
		}
	}
	return [getTransactionDate(tx)];
}

export function groupSpansMultipleCalendarDays(
	getTransactionDate: (tx: unknown) => string,
	groupingMode: string,
	transactions: unknown[]
): boolean {
	if (groupingMode === 'none') return false;
	if (transactions.length < 2) return false;

	const keys = new Set<string>();
	for (const t of transactions) {
		for (const raw of calendarDayKeysForTransaction(getTransactionDate, t)) {
			const d = new Date(raw);
			if (Number.isNaN(d.getTime())) continue;
			keys.add(d.toISOString().slice(0, 10));
			if (keys.size > 1) return true;
		}
	}
	return false;
}
