import { db, type Category, type Transaction } from '$lib/core/db';
import { budgetService, recurringTransactionIntelligenceService } from '$lib/core/services';

export type ApplyRecurringPatternWaterfallTierResult =
	| { ok: true }
	| { ok: false; reason: 'no_pattern' | 'no_target_category' };

/**
 * Sets waterfall tier on the category tied to a recurring pattern (learned category first,
 * else single clear winner from matching transactions). Patches pattern cache so Insights
 * reads the same category as the rest of the app.
 */
export async function applyRecurringPatternWaterfallTier(
	patternId: string,
	tier: NonNullable<Category['waterfallTier']>
): Promise<ApplyRecurringPatternWaterfallTierResult> {
	const p = await recurringTransactionIntelligenceService.getPattern(patternId);
	if (!p) return { ok: false, reason: 'no_pattern' };

	let targetCategoryId: string | null = p.learnedCategoryId ?? null;

	if (!targetCategoryId) {
		if (!p.matchingTransactionIds?.length) return { ok: false, reason: 'no_target_category' };
		const txs = (await db.transactions.bulkGet(p.matchingTransactionIds)).filter(
			(t): t is Transaction => t != null && !t.deletedAt
		);
		const counts = new Map<string, number>();
		for (const t of txs) {
			if (!t.categoryId) continue;
			counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
		}
		if (counts.size === 0) return { ok: false, reason: 'no_target_category' };
		let bestId: string | null = null;
		let bestN = 0;
		for (const [id, n] of counts) {
			if (n > bestN) {
				bestId = id;
				bestN = n;
			}
		}
		if (!bestId) return { ok: false, reason: 'no_target_category' };
		const tied = [...counts.values()].filter((n) => n === bestN).length;
		if (tied > 1) return { ok: false, reason: 'no_target_category' };
		targetCategoryId = bestId;
	}

	await budgetService.updateBudgetCategory(targetCategoryId, { waterfallTier: tier });
	await recurringTransactionIntelligenceService.patchPatternCategory(patternId, targetCategoryId);

	return { ok: true };
}
