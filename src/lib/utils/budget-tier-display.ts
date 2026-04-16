import { ANALYTICS_TIERS } from '$lib/core/db';
import type { BudgetSummary } from '$lib/core/services/core/budget-service';

export type AllowanceTierRow = {
	tier: (typeof ANALYTICS_TIERS)[number];
	spent: number;
	allocated: number;
};

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
