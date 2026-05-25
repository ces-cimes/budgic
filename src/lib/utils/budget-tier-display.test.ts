import { describe, expect, it } from 'vitest';
import {
	computeTierSegmentLayout,
	getTierColorToken,
	tierRowsFromBudgetSummary
} from './budget-tier-display';
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

describe('computeTierSegmentLayout', () => {
	it('widths sum to 100% proportional to allocated', () => {
		const layout = computeTierSegmentLayout([
			{ tier: 'survival', spent: 40, allocated: 100 },
			{ tier: 'lifestyle', spent: 10, allocated: 50 }
		]);
		expect(layout).toHaveLength(2);
		expect(layout[0].widthPct).toBeCloseTo(66.666, 1);
		expect(layout[1].widthPct).toBeCloseTo(33.333, 1);
		expect(layout.reduce((sum, segment) => sum + segment.widthPct, 0)).toBeCloseTo(100);
	});

	it('uses equal widths when total allocated is zero', () => {
		const layout = computeTierSegmentLayout([
			{ tier: 'survival', spent: 20, allocated: 0 },
			{ tier: 'lifestyle', spent: 5, allocated: 0 }
		]);
		expect(layout[0].widthPct).toBe(50);
		expect(layout[1].widthPct).toBe(50);
	});

	it('caps fill at 100% and flags overspend with overflow', () => {
		const layout = computeTierSegmentLayout([{ tier: 'growth', spent: 150, allocated: 100 }]);
		expect(layout[0].fillPct).toBe(100);
		expect(layout[0].isOverspent).toBe(true);
		expect(layout[0].overflowPct).toBe(50);
	});

	it('returns empty layout for empty rows', () => {
		expect(computeTierSegmentLayout([])).toEqual([]);
	});

	it('handles single tier at full width', () => {
		const layout = computeTierSegmentLayout([{ tier: 'security', spent: 25, allocated: 100 }]);
		expect(layout).toHaveLength(1);
		expect(layout[0].widthPct).toBe(100);
		expect(layout[0].fillPct).toBe(25);
		expect(layout[0].isOverspent).toBe(false);
	});

	it('assigns tier colour tokens', () => {
		expect(getTierColorToken('survival')).toBe('var(--color-warm-coral)');
		expect(getTierColorToken('security')).toBe('var(--color-info)');
		expect(getTierColorToken('growth')).toBe('var(--color-sage-green)');
		expect(getTierColorToken('lifestyle')).toBe('var(--color-golden-amber)');
	});
});
