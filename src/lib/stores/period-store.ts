/**
 * Global period (month) state for Transactions and Reports (Phase 5).
 * Plain TS module (no runes) to avoid "Module function declarations have already been instantiated"
 * when the route is loaded. Bidirectional sync with URL ?month=YYYY-MM.
 */

function getDefaultMonth(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonth(ym: string): Date | null {
	const [y, m] = ym.split('-').map(Number);
	if (!y || !m || m < 1 || m > 12) return null;
	return new Date(y, m - 1, 1);
}

let monthValue = getDefaultMonth();

export const periodStore = {
	get month(): string {
		return monthValue;
	},
	set month(value: string) {
		const parsed = value.length === 7 && value.includes('-') ? value : null;
		if (parsed) {
			const d = parseMonth(parsed);
			if (d) monthValue = parsed;
		}
	},
	/** Current month as Date (first day of month) */
	get monthDate(): Date {
		return (
			parseMonth(monthValue) ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
		);
	},
	setMonth(ym: string) {
		this.month = ym;
	},
	/** Prev/next month in YYYY-MM */
	prevMonth(): string {
		const d = new Date(this.monthDate.getFullYear(), this.monthDate.getMonth() - 1, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	},
	nextMonth(): string {
		const d = new Date(this.monthDate.getFullYear(), this.monthDate.getMonth() + 1, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	},
	/** Initialize from URL ?month=YYYY-MM (call from layout or page on load) */
	initFromUrl(search: string) {
		const params = new URLSearchParams(search);
		const m = params.get('month');
		if (m && /^\d{4}-\d{2}$/.test(m)) this.month = m;
	},
	/** Apply current month to URL (replaceState); returns new URL search string */
	applyToUrl(currentPath: string, currentSearch: string): string {
		const params = new URLSearchParams(currentSearch);
		params.set('month', monthValue);
		return `${currentPath}?${params.toString()}`;
	}
};
