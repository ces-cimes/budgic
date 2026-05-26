import { addWeeks } from 'date-fns';
import { budgetService, type AllowanceProjection } from './budget-service';
import { loanAmortizationService, type ActiveLoanObligation } from './loan-amortization-service';
import { tierRowsFromBudgetSummary, type AllowanceTierRow } from '$lib/utils/budget-tier-display';

export const WEEKS_PER_MONTH = 4.33;

/** Insight types hidden from bell panel when recovery view is active. */
export const RECOVERY_SUPPRESSED_ALERT_TYPES = [
	'achievement',
	'goal_milestone',
	'savings_opportunity',
	'behavioral'
] as const;

export type RecoveryObligation = {
	id: string;
	label: string;
	balance: number;
	projectedClearanceDate: string | null;
};

export type RecoveryHorizonSnapshot = {
	weeklySurplus: number;
	aggregateClearanceDate: string | null;
	totalObligationBalance: number;
	progressPct: number;
	tradeOff: { lifestyleReductionPerWeek: number; weeksSaved: number } | null;
	obligations: RecoveryObligation[];
	currency: string;
	tierRows: AllowanceTierRow[];
};

export function computeWeeklySurplusFromProjection(projection: AllowanceProjection): number {
	return (
		Math.max(0, projection.periodIncome - projection.committed - projection.planned) /
		WEEKS_PER_MONTH
	);
}

export function computeWeeklySurplusFallback(
	lifestyleRemaining: number,
	daysRemaining: number
): number {
	const weeksLeft = Math.max(daysRemaining / 7, 1);
	return Math.max(0, lifestyleRemaining / weeksLeft);
}

export function resolveWeeklySurplus(
	projection: AllowanceProjection,
	lifestyleRemaining: number,
	daysRemaining: number
): number {
	const fromProjection = computeWeeklySurplusFromProjection(projection);
	if (fromProjection > 0.005) return fromProjection;
	return computeWeeklySurplusFallback(lifestyleRemaining, daysRemaining);
}

export function computeProgressPct(totalBalance: number, originalTotal: number): number {
	if (originalTotal <= 0.005) return totalBalance <= 0.005 ? 100 : 0;
	const cleared = Math.max(0, originalTotal - totalBalance);
	return Math.min(100, Math.max(0, (cleared / originalTotal) * 100));
}

export function computeAggregateClearanceDate(
	totalBalance: number,
	weeklySurplus: number,
	obligationClearances: Array<string | null>
): string | null {
	if (totalBalance <= 0.005) return new Date().toISOString();
	if (weeklySurplus <= 0.005) {
		const dated = obligationClearances.filter(Boolean) as string[];
		return dated.length > 0 ? dated.sort().at(-1)! : null;
	}
	const weeks = totalBalance / weeklySurplus;
	return addWeeks(new Date(), weeks).toISOString();
}

export function computeRecoveryTradeOff(
	weeklySurplus: number,
	totalObligationBalance: number,
	lifestyleRemaining: number,
	daysRemaining: number,
	dailyAllowance: number
): { lifestyleReductionPerWeek: number; weeksSaved: number } | null {
	if (totalObligationBalance <= 0.005 || weeklySurplus <= 0.005) return null;

	const weeksLeft = Math.max(daysRemaining / 7, 1);
	const lifestyleWeeklyBurn = lifestyleRemaining / weeksLeft;
	const illustrativeSlice = Math.max(0, dailyAllowance * 7 * 0.25);
	const lifestyleReductionPerWeek = Math.min(lifestyleWeeklyBurn, illustrativeSlice);
	if (lifestyleReductionPerWeek <= 0.005) return null;

	const baselineWeeks = totalObligationBalance / weeklySurplus;
	const acceleratedWeeks = totalObligationBalance / (weeklySurplus + lifestyleReductionPerWeek);
	const weeksSaved = Math.max(0, Math.round(baselineWeeks - acceleratedWeeks));
	if (weeksSaved <= 0) return null;

	return { lifestyleReductionPerWeek, weeksSaved };
}

function mapObligations(raw: ActiveLoanObligation[], weeklySurplus: number): RecoveryObligation[] {
	return raw.map((item) => ({
		id: item.accountId,
		label: item.label,
		balance: item.balance,
		projectedClearanceDate: loanAmortizationService.projectClearanceDate(
			item.balance,
			weeklySurplus,
			{
				lastScheduleDate: item.lastScheduleDate,
				monthlyPaymentPace: item.monthlyPaymentPace
			}
		)
	}));
}

/**
 * Recovery horizon snapshot for Home card and Plan → Allowance section.
 */
export async function computeRecoveryHorizon(options?: {
	lifestyleRemaining?: number;
	daysRemaining?: number;
	dailyAllowance?: number;
}): Promise<RecoveryHorizonSnapshot | null> {
	const [projection, budgetSummary, rawObligations] = await Promise.all([
		budgetService.getAllowanceProjection(),
		budgetService.getBudgetSummary(),
		loanAmortizationService.getActiveObligations()
	]);

	const lifestyleRemaining =
		options?.lifestyleRemaining ?? budgetSummary.byTier.lifestyle.remaining ?? 0;
	const daysRemaining = options?.daysRemaining ?? 30;
	const dailyAllowance = options?.dailyAllowance ?? 0;

	const weeklySurplus = resolveWeeklySurplus(projection, lifestyleRemaining, daysRemaining);
	const obligations = mapObligations(rawObligations, weeklySurplus);
	const totalObligationBalance = obligations.reduce((sum, o) => sum + o.balance, 0);
	const originalTotal = rawObligations.reduce((sum, o) => sum + o.originalPrincipal, 0);
	const progressPct = computeProgressPct(totalObligationBalance, originalTotal);
	const aggregateClearanceDate = computeAggregateClearanceDate(
		totalObligationBalance,
		weeklySurplus,
		obligations.map((o) => o.projectedClearanceDate)
	);
	const tradeOff = computeRecoveryTradeOff(
		weeklySurplus,
		totalObligationBalance,
		lifestyleRemaining,
		daysRemaining,
		dailyAllowance
	);

	return {
		weeklySurplus,
		aggregateClearanceDate,
		totalObligationBalance,
		progressPct,
		tradeOff,
		obligations,
		currency: projection.currency,
		tierRows: tierRowsFromBudgetSummary(budgetSummary)
	};
}

export function isRecoverySuppressedAlertType(type: string): boolean {
	return (RECOVERY_SUPPRESSED_ALERT_TYPES as readonly string[]).includes(type);
}
