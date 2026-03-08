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

		const unread = await insightsService.getUnreadInsights();

		// Negative allowance: single Critical insight when isNegative
		const existingNegative = unread.find(
			(i) => i.type === 'budget_exceeded' && i.title === NEGATIVE_ALLOWANCE_INSIGHT_TITLE
		);
		if (negativeStatus.isNegative) {
			if (!existingNegative) {
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
		} else if (existingNegative) {
			await insightsService.markAsRead(existingNegative.id);
		}

		// Fee risks: one insight per account (Critical/High by likelihood)
		const existingFeeByAccount = new Set(
			unread
				.filter((i) => i.type === 'savings_opportunity' && i.actionUrl?.startsWith('/accounts/'))
				.map((i) => i.actionUrl?.replace('/accounts/', '') ?? '')
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
