/**
 * Alerts aggregation service (Phase 5 — unified alerts).
 * Writes fee-risk and negative-allowance alerts into the shared Insight store
 * so the bell panel and Home "Needs attention" consume a single source of truth.
 */

import { insightsService } from './analytics/insights-service';
import { planningService } from './pages/planning-service';
import { negativeAllowanceService } from './core/negative-allowance-service';
import { feeAvoidanceService } from './analytics/fee-avoidance-service';
import { userService } from './core/user-service';

const NEGATIVE_ALLOWANCE_INSIGHT_TITLE = 'Allowance overspent';

/**
 * Refresh fee-risk and negative-allowance insights and persist them as Insights.
 * Call when cross-route insights are refreshed or on app init.
 */
export async function refreshFeeAndNegativeAllowanceInsights(): Promise<void> {
	try {
		const [allowance, prefs, feeRisks] = await Promise.all([
			planningService.getEnhancedAllowance(),
			userService.getUserPreferences(),
			feeAvoidanceService.detectFeeRisks({ minConfidence: 70 })
		]);

		const handling =
			(prefs as { negativeAllowanceHandling?: string })?.negativeAllowanceHandling ??
			'allow_with_strong_warning';
		const negativeStatus = await negativeAllowanceService.checkNegativeAllowance(
			allowance,
			handling as
				| 'block_with_warning'
				| 'allow_with_strong_warning'
				| 'borrow_from_future'
				| 'borrow_from_other_categories'
		);

		// Negative allowance: single Critical insight when isNegative.
		// Only create if no such insight exists at all (read or dismissed) — don't recreate after user dismissed.
		const anyNegativeInsights = await insightsService.getInsightsByTypeAndTitle(
			'budget_exceeded',
			NEGATIVE_ALLOWANCE_INSIGHT_TITLE
		);
		const existingUnreadNegative = anyNegativeInsights.find(
			(i) => !i.readAt && !i.dismissedAt && i.isActive
		);
		if (negativeStatus.isNegative) {
			if (anyNegativeInsights.length === 0) {
				await insightsService.createInsight({
					type: 'budget_exceeded',
					severity: 'alert',
					title: NEGATIVE_ALLOWANCE_INSIGHT_TITLE,
					message: negativeStatus.warningMessage ?? 'Spending is over your allowance this period.',
					actionable: true,
					actionText: 'View plan',
					actionUrl: '/plan?tab=allowance'
				});
			}
		} else if (existingUnreadNegative) {
			await insightsService.markAsRead(existingUnreadNegative.id);
		}

		// Fee risks: one insight per account (Critical/High by likelihood).
		// Only create if no insight exists for this account (read or dismissed) — don't recreate after user dismissed.
		const allFeeInsights =
			await insightsService.getInsightsByTypeIncludingDismissed('savings_opportunity');
		const existingFeeByAccount = new Set(
			allFeeInsights
				.filter((i) => i.actionUrl?.startsWith('/accounts/'))
				.map((i) => (i.actionUrl ?? '').replace(/^\/accounts\//, '').split(/[/?]/)[0])
				.filter(Boolean)
		);
		for (const risk of feeRisks.slice(0, 5)) {
			if (existingFeeByAccount.has(risk.accountId)) continue;
			const severity: 'alert' | 'warning' =
				risk.likelihood === 'imminent' || risk.likelihood === 'high' ? 'alert' : 'warning';
			await insightsService.createInsight({
				type: 'savings_opportunity',
				severity,
				title: risk.triggerCondition,
				message: `${risk.accountName}: estimated ${risk.estimatedAmount} ${risk.currency} fee.`,
				amount: risk.estimatedAmount,
				actionable: true,
				actionText: 'View account',
				actionUrl: `/accounts/${risk.accountId}`,
				metadata: { accountId: risk.accountId, feeRiskId: risk.id }
			});
			existingFeeByAccount.add(risk.accountId);
		}
	} catch (error) {
		console.error('[AlertsAggregation] refreshFeeAndNegativeAllowanceInsights:', error);
	}
}
