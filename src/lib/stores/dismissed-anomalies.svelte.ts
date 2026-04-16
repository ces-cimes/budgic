/**
 * Anomaly dismissals (transactionId) so "Mark as reviewed" persists.
 * Persisted to localStorage so dismissals survive refresh.
 */

const STORAGE_KEY = 'budgic-dismissed-anomalies';

function load(): Set<string> {
	if (typeof window === 'undefined') return new Set();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set();
		const arr = JSON.parse(raw) as string[];
		return new Set(Array.isArray(arr) ? arr : []);
	} catch {
		return new Set();
	}
}

function save(set: Set<string>): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
	} catch {
		// ignore
	}
}

export const anomalyDismissals = $state<{ ids: Set<string> }>({ ids: load() });

export function dismissAnomaly(transactionId: string): void {
	const next = new Set(anomalyDismissals.ids);
	next.add(transactionId);
	anomalyDismissals.ids = next;
	save(next);
}

export function isAnomalyDismissed(transactionId: string): boolean {
	return anomalyDismissals.ids.has(transactionId);
}
