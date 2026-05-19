import {
	roundWeightSum,
	primaryCategoryIdFromWeights
} from '$lib/utils/transaction-category-weights';

/** 5% grid for soft-split UI */
export const SPLIT_WEIGHT_STEP = 0.05;
export const SPLIT_MIN_SLICE = 0.05;
/** Max non-primary categories (primary + 3 = 4 total) */
export const SPLIT_MAX_EXTRAS = 3;

export interface SplitExtra {
	categoryId: string;
	weight: number;
}

export function snapSplitWeight(weight: number): number {
	return Math.round(weight / SPLIT_WEIGHT_STEP) * SPLIT_WEIGHT_STEP;
}

/**
 * Dedupe by categoryId, drop primary and blanks, snap weights, cap count,
 * then iteratively shrink extras so residual primary ≥ SPLIT_MIN_SLICE and ≥ each extra (ties OK; primary is first in saved weights).
 */
export function normalizeAndClampSplitExtras(
	primaryCategoryId: string,
	extras: SplitExtra[]
): SplitExtra[] {
	if (!primaryCategoryId) return [];
	const seen = new Set<string>();
	const cleaned: SplitExtra[] = [];
	for (const row of extras) {
		const id = row.categoryId?.trim() ?? '';
		if (!id || id === primaryCategoryId || seen.has(id)) continue;
		seen.add(id);
		const snapped = snapSplitWeight(Math.min(0.95, Math.max(SPLIT_MIN_SLICE, row.weight)));
		cleaned.push({ categoryId: id, weight: snapped });
		if (cleaned.length >= SPLIT_MAX_EXTRAS) break;
	}
	let e = cleaned;
	for (let guard = 0; guard < 400; guard++) {
		const sumE = e.reduce((a, x) => a + x.weight, 0);
		const primaryW = 1 - sumE;
		const maxEx = e.length ? Math.max(...e.map((x) => x.weight)) : 0;
		if (primaryW + 1e-12 >= SPLIT_MIN_SLICE && primaryW + 1e-12 >= maxEx) return e;
		if (e.length === 0) return e;
		const idx = e.reduce((bi, x, i, arr) => (x.weight > arr[bi].weight ? i : bi), 0);
		const next = [...e];
		next[idx] = {
			...next[idx]!,
			weight: Math.max(SPLIT_MIN_SLICE, next[idx]!.weight - SPLIT_WEIGHT_STEP)
		};
		e = next;
	}
	return e;
}

/** Non-placeholder extras (have category id). */
export function validSplitExtras(extras: SplitExtra[]): SplitExtra[] {
	return extras.filter((x) => (x.categoryId?.trim() ?? '').length > 0);
}

/**
 * Build persisted `categoryWeights` from primary + explicit extra slices.
 * Returns undefined when there is nothing to persist.
 */
export function buildSplitResultFromForm(
	primaryCategoryId: string,
	extras: SplitExtra[]
): { weights: { categoryId: string; weight: number }[]; primaryId: string } | undefined {
	if (!primaryCategoryId) return undefined;
	const ve = validSplitExtras(extras);
	if (ve.length === 0) return undefined;
	const clamped = normalizeAndClampSplitExtras(primaryCategoryId, ve);
	if (clamped.length === 0) return undefined;
	const sumE = clamped.reduce((a, x) => a + x.weight, 0);
	let primaryW = 1 - sumE;
	if (primaryW < SPLIT_MIN_SLICE - 1e-12) return undefined;
	const weights = roundWeightSum([{ categoryId: primaryCategoryId, weight: primaryW }, ...clamped]);
	const primaryId = primaryCategoryIdFromWeights(weights);
	return { weights, primaryId };
}

/**
 * Load form state from stored `categoryWeights` (2–4 rows). Uses top-weight row as primary.
 */
export function hydrateSplitExtrasFromCategoryWeights(
	categoryWeights: { categoryId: string; weight: number }[]
): { primaryCategoryId: string; splitExtras: SplitExtra[] } | null {
	if (!categoryWeights || categoryWeights.length < 2) return null;
	const sorted = [...categoryWeights].sort((a, b) => b.weight - a.weight);
	const top = sorted.slice(0, 4);
	const sum = top.reduce((a, x) => a + x.weight, 0);
	if (sum < 1e-9) return null;
	const normalized = top.map((x) => ({
		categoryId: x.categoryId,
		weight: x.weight / sum
	}));
	const primaryCategoryId = normalized[0]!.categoryId;
	const rawExtras = normalized.slice(1).map((x) => ({
		categoryId: x.categoryId,
		weight: snapSplitWeight(x.weight)
	}));
	const splitExtras = normalizeAndClampSplitExtras(primaryCategoryId, rawExtras);
	return { primaryCategoryId, splitExtras };
}

/**
 * Apply merchant (or other) suggested full distribution: keep top four by weight, renormalize, return primary + extras.
 */
export function splitFormStateFromSuggestedWeights(
	weights: { categoryId: string; weight: number }[]
): { primaryCategoryId: string; splitExtras: SplitExtra[] } | null {
	if (!weights || weights.length < 2) return null;
	const sorted = [...weights].sort((a, b) => b.weight - a.weight);
	const top = sorted.slice(0, 4);
	const sum = top.reduce((a, x) => a + x.weight, 0);
	if (sum < 1e-9) return null;
	const normalized = top.map((x) => ({
		categoryId: x.categoryId,
		weight: x.weight / sum
	}));
	const primaryCategoryId = normalized[0]!.categoryId;
	const rawExtras = normalized.slice(1).map((x) => ({
		categoryId: x.categoryId,
		weight: snapSplitWeight(x.weight)
	}));
	const splitExtras = normalizeAndClampSplitExtras(primaryCategoryId, rawExtras);
	return { primaryCategoryId, splitExtras };
}
