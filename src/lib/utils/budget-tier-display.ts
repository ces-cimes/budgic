import { ANALYTICS_TIERS } from '$lib/core/db';
import type { BudgetSummary } from '$lib/core/services/core/budget-service';

export type AllowanceTierRow = {
	tier: (typeof ANALYTICS_TIERS)[number];
	spent: number;
	allocated: number;
};

export type TierSegmentLayout = {
	tier: AllowanceTierRow['tier'];
	widthPct: number;
	fillPct: number;
	overflowPct: number;
	isOverspent: boolean;
	colorToken: string;
	spent: number;
	allocated: number;
};

const TIER_COLOR_TOKENS: Record<AllowanceTierRow['tier'], string> = {
	survival: 'var(--color-warm-coral)',
	security: 'var(--color-info)',
	growth: 'var(--color-sage-green)',
	lifestyle: 'var(--color-golden-amber)'
};

/** CSS colour token for waterfall tier segments (home T2 allowance bar). */
export function getTierColorToken(tier: AllowanceTierRow['tier']): string {
	return TIER_COLOR_TOKENS[tier];
}

/**
 * Layout for tier-coloured segmented allowance bar: width ∝ allocated (equal if total ≈ 0),
 * fill = spent/allocated capped at 100%, coral overflow when overspent.
 */
export function computeTierSegmentLayout(tierRows: AllowanceTierRow[]): TierSegmentLayout[] {
	if (tierRows.length === 0) return [];

	const totalAllocated = tierRows.reduce((sum, row) => sum + row.allocated, 0);
	const useEqualWidth = totalAllocated < 0.01;

	return tierRows.map((row) => {
		const widthPct = useEqualWidth
			? 100 / tierRows.length
			: (row.allocated / totalAllocated) * 100;
		const rawFillPct =
			row.allocated <= 0.01
				? row.spent > 0.01
					? 100
					: 0
				: (row.spent / row.allocated) * 100;
		const isOverspent = row.allocated > 0.01 && row.spent > row.allocated;
		const fillPct = Math.min(rawFillPct, 100);
		const overflowPct = isOverspent ? Math.min(rawFillPct - 100, 50) : 0;

		return {
			tier: row.tier,
			widthPct,
			fillPct,
			overflowPct,
			isOverspent,
			colorToken: getTierColorToken(row.tier),
			spent: row.spent,
			allocated: row.allocated
		};
	});
}

/**
 * Rows for home / summary UI: same mapping as legacy AllowanceSummary onMount.
 */
export function tierRowsFromBudgetSummary(summary: BudgetSummary): AllowanceTierRow[] {
	return [...ANALYTICS_TIERS]
		.map((t) => ({
			tier: t,
			spent: summary.byTier[t].spent,
			allocated: summary.byTier[t].allocated
		}))
		.filter((r) => r.allocated > 0.01 || r.spent > 0.01);
}
