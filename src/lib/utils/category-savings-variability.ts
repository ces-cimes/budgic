/**
 * Pure helpers for "savings hints from variability" (CV + headroom vs budget).
 * Data loading and tier / divergence filters live in services; this module stays testable without DB.
 *
 * **Allowance binding (approach A):** lifestyle headroom suppression is applied in
 * `insights-service.generateSavingsVariabilityInsights` via `getSavingsHintAllowanceContext`
 * (`allowance-calculation.ts`) — not in this module.
 *
 * **Calendar-month caveat:** two recurring payments in one month (e.g. rent on 1st and 30th) can
 * inflate monthly totals and CV; v1 does not normalize billing periods (see `docs/analysis/allowance-signals-and-savings-hints.md`).
 */

/** Minimum count of calendar months with attributed spend (see prediction MIN_MONTHS). */
export const SAVINGS_VARIABILITY_MIN_MONTHS = 3;

const MEAN_EPS = 1e-6;

/** When predicted spend exceeds budget by this factor, skip hint (coordinates with budget divergence callout). */
export const SAVINGS_VARIABILITY_DIVERGENCE_RATIO = 1.15;

export type MonthlySpendPoint = { monthKey: string; amount: number };

export type ComputeSavingsVariabilityHintInput = {
	/** Distinct calendar months (YYYY-MM), sorted ascending; amounts are spend in main currency. */
	months: MonthlySpendPoint[];
	budgetAmount: number;
	predictedMonthlySpend: number;
	/**
	 * Optional floor from `UserPreferences.savingsOpportunityMinSurplus`.
	 * Headroom must be >= max(minHeadroomAbsolute, minHeadroomBudgetFraction * budget, this).
	 */
	minSurplusFromPreferences?: number;
};

export type SavingsVariabilityHintResult = {
	rollingAverage: number;
	coefficientOfVariation: number;
	headroom: number;
	monthCount: number;
	/** Higher = better candidate for surfacing (headroom-weighted, prefers lower CV). */
	rankingScore: number;
};

/** Absolute minimum headroom (main currency units) when prefs do not raise the bar. */
export const DEFAULT_MIN_HEADROOM_ABSOLUTE = 5;

/** Minimum headroom as a fraction of budget (slack gate — plan C). */
export const DEFAULT_MIN_HEADROOM_BUDGET_FRACTION = 0.03;

function mean(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

function sampleStdDev(values: number[]): number {
	const n = values.length;
	if (n < 2) return 0;
	const m = mean(values);
	const v = values.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1);
	return Math.sqrt(Math.max(0, v));
}

/**
 * If eligible, returns CV, rolling average (mean monthly spend), and headroom
 * `budget − max(rollingAvg, predicted)`. Otherwise null.
 */
export function computeSavingsVariabilityHint(
	input: ComputeSavingsVariabilityHintInput
): SavingsVariabilityHintResult | null {
	const { months, budgetAmount, predictedMonthlySpend, minSurplusFromPreferences } = input;

	if (!budgetAmount || budgetAmount <= 0) return null;
	if (months.length < SAVINGS_VARIABILITY_MIN_MONTHS) return null;

	if (predictedMonthlySpend > budgetAmount * SAVINGS_VARIABILITY_DIVERGENCE_RATIO) {
		return null;
	}

	const amounts = months.map((m) => m.amount);
	const rollingAverage = mean(amounts);
	if (rollingAverage < MEAN_EPS) return null;

	const coefficientOfVariation = sampleStdDev(amounts) / rollingAverage;
	if (!Number.isFinite(coefficientOfVariation) || coefficientOfVariation < 0) return null;

	const baseline = Math.max(rollingAverage, predictedMonthlySpend);
	const headroom = budgetAmount - baseline;

	const minFromPrefs = Math.max(0, minSurplusFromPreferences ?? 0);
	const minFromBudgetFrac = budgetAmount * DEFAULT_MIN_HEADROOM_BUDGET_FRACTION;
	const minHeadroom = Math.max(DEFAULT_MIN_HEADROOM_ABSOLUTE, minFromBudgetFrac, minFromPrefs);

	if (headroom < minHeadroom) return null;

	const cvClamped = Math.min(coefficientOfVariation, 3);
	const rankingScore = headroom * Math.max(0.05, 1 - cvClamped / 3);

	return {
		rollingAverage,
		coefficientOfVariation,
		headroom,
		monthCount: months.length,
		rankingScore
	};
}
