/**
 * Store for anomaly dismissals (transactionId) so "Mark as reviewed" persists.
 * Persisted to localStorage so dismissals survive refresh.
 */

import { writable } from 'svelte/store';

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

function createDismissedStore() {
	const { subscribe, set, update } = writable<Set<string>>(load());
	return {
		subscribe,
		dismiss(transactionId: string): void {
			update((s) => {
				const next = new Set(s);
				next.add(transactionId);
				save(next);
				return next;
			});
		},
		isDismissed(transactionId: string): boolean {
			let value: Set<string>;
			subscribe((v) => (value = v))();
			return (value!).has(transactionId);
		}
	};
}

export const dismissedAnomalies = createDismissedStore();

export function dismissAnomaly(transactionId: string): void {
	dismissedAnomalies.dismiss(transactionId);
}
