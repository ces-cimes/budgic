import type { Transaction } from '$lib/core/db';

function quartiles(values: number[]): { q1: number; q3: number } {
	const sorted = [...values].sort((a, b) => a - b);
	const q1 = sorted[Math.floor(sorted.length * 0.25)];
	const q3 = sorted[Math.floor(sorted.length * 0.75)];
	return { q1, q3 };
}

export function iqrFilter(values: number[], fence = 1.5): { core: number[]; outliers: number[] } {
	if (values.length < 4) return { core: values, outliers: [] };

	const { q1, q3 } = quartiles(values);
	const iqr = q3 - q1;
	const margin = iqr * fence;
	const lower = q1 - margin;
	const upper = q3 + margin;

	return {
		core: values.filter((v) => v >= lower && v <= upper),
		outliers: values.filter((v) => v < lower || v > upper)
	};
}

export function iqrOutlierScore(value: number, pool: number[], fence = 1.5): number {
	if (pool.length < 4) return 0;

	const { q1, q3 } = quartiles(pool);
	const iqr = q3 - q1;
	const margin = iqr * fence;
	const lower = q1 - margin;
	const upper = q3 + margin;

	if (value >= lower && value <= upper) return 0;

	// Degenerate spread means nearly all values are identical; any deviation is maximally extreme.
	if (iqr === 0 || margin === 0) return 1;

	const distance = value < lower ? lower - value : value - upper;
	return Math.max(0, Math.min(1, distance / margin));
}

export function canonicalDuplicateKey(tx: Transaction): string {
	const date = (tx.clearedDate ?? tx.plannedDate ?? '').substring(0, 10);
	return `${tx.amount}_${date}_${tx.description?.substring(0, 20)}`;
}
