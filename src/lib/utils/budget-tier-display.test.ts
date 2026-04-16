import { describe, expect, it } from 'vitest';
import { tierRowsFromBudgetSummary } from './budget-tier-display';
import type { BudgetSummary } from '$lib/core/services/core/budget-service';

function emptyByTier(): BudgetSummary['byTier'] {
	return {
		survival: { allocated: 0, spent: 0, remaining: 0 },
		security: { allocated: 0, spent: 0, remaining: 0 },
		growth: { allocated: 0, spent: 0, remaining: 0 },
		lifestyle: { allocated: 0, spent: 0, remaining: 0 }
	};
}

describe('tierRowsFromBudgetSummary', () => {
	it('returns tiers with spend or allocation above threshold', () => {
		const byTier = emptyByTier();
		byTier.survival = { allocated: 100, spent: 40, remaining: 60 };
		byTier.lifestyle = { allocated: 0, spent: 5, remaining: 0 };
		const summary: BudgetSummary = {
			totalAllocated: 0,
			totalSpent: 0,
			totalRemaining: 0,
			allocations: [],
			byTier,
			confidence: {
				exactSpend: 45,
				inferredSpend: 0,
				unclassifiedSpend: 0,
				totalSpend: 45,
				ratio: 1,
				tier: 'high'
			},
			unclassifiedTransactionCount: 0
		};
		const rows = tierRowsFromBudgetSummary(summary);
		expect(rows.map((r) => r.tier)).toEqual(['survival', 'lifestyle']);
	});

	it('omits tiers with negligible amounts', () => {
		const byTier = emptyByTier();
		byTier.security = { allocated: 0.005, spent: 0, remaining: 0 };
		const summary: BudgetSummary = {
			totalAllocated: 0,
			totalSpent: 0,
			totalRemaining: 0,
			allocations: [],
			byTier,
			confidence: {
				exactSpend: 0,
				inferredSpend: 0,
				unclassifiedSpend: 0,
				totalSpend: 0,
				ratio: 1,
				tier: 'high'
			},
			unclassifiedTransactionCount: 0
		};
		expect(tierRowsFromBudgetSummary(summary)).toEqual([]);
	});
});
