/**
 * Normalise soft-split weights so they sum to 1 (floating-point safe).
 */
export function roundWeightSum(weights: { categoryId: string; weight: number }[]): {
	categoryId: string;
	weight: number;
}[] {
	const sum = weights.reduce((a, w) => a + w.weight, 0);
	if (sum < 1e-9) return weights;
	return weights.map((w) => ({ ...w, weight: w.weight / sum }));
}

export function primaryCategoryIdFromWeights(
	weights: { categoryId: string; weight: number }[]
): string {
	if (weights.length === 0) return '';
	return weights.reduce((a, b) => (b.weight > a.weight ? b : a)).categoryId;
}

export function isSoftCategorySplit(
	categoryWeights: { categoryId: string; weight: number }[] | undefined | null
): boolean {
	return !!categoryWeights && categoryWeights.length >= 2;
}

/** Mutually exclusive: grouped multi-row vs single-row soft split */
export function assertNotGroupedWithSoftSplit(
	isGroupTransaction: boolean,
	categoryWeights: { categoryId: string; weight: number }[] | undefined | null
): void {
	if (isGroupTransaction && isSoftCategorySplit(categoryWeights)) {
		throw new Error('Turn off "Grouped transaction" before saving a soft category split.');
	}
}

/** Invariant before persisting `categoryWeights` on a transaction */
export function assertValidSoftCategoryWeights(
	weights: { categoryId: string; weight: number }[]
): void {
	if (weights.length < 2) {
		throw new Error('Soft split requires at least two categories');
	}
	for (const w of weights) {
		if (w.weight < 0 || w.weight > 1) {
			throw new Error('Category weight out of range');
		}
	}
	const sum = weights.reduce((a, w) => a + w.weight, 0);
	if (Math.abs(sum - 1) > 0.002) {
		throw new Error('Category weights must sum to 1');
	}
}

export function assertSoftSplitCategoryIdMatchesPrimary(
	categoryId: string | undefined,
	weights: { categoryId: string; weight: number }[]
): void {
	const expected = primaryCategoryIdFromWeights(weights);
	if (categoryId !== expected) {
		throw new Error('categoryId must be the highest-weight category for soft splits');
	}
}
