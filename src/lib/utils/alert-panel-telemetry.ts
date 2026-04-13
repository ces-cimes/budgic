import { userService } from '$lib/core/services';
import type { Insight } from '$lib/core/db';

export type AlertPanelTelemetryAction =
	| 'alerts_panel_cta'
	| 'alerts_panel_dismiss'
	| 'alerts_panel_mark_all_read'
	| 'alerts_panel_snooze';

function severityTierFromInsights(insights: Insight[]): 'critical' | 'high' | 'low' {
	if (insights.some((i) => i.severity === 'alert')) return 'critical';
	if (insights.some((i) => i.severity === 'warning')) return 'high';
	return 'low';
}

/**
 * Local-only effectiveness counts for the Alerts panel (IndexedDB userActions).
 * Gated on `analyticsEnabled`. No titles, URLs, account/category IDs, or amounts.
 */
export async function trackAlertPanelEvent(
	action: AlertPanelTelemetryAction,
	insights: Insight[]
): Promise<void> {
	try {
		const prefs = await userService.getUserPreferences();
		if (!prefs.analyticsEnabled) return;
		const primary = insights[0];
		await userService.trackUserAction({
			action,
			details: JSON.stringify({
				insightType: primary?.type,
				severityTier: severityTierFromInsights(insights),
				groupedCount: insights.length
			})
		});
	} catch {
		/* non-fatal */
	}
}

export async function trackAlertPanelMarkAllRead(markedCount: number): Promise<void> {
	try {
		const prefs = await userService.getUserPreferences();
		if (!prefs.analyticsEnabled) return;
		await userService.trackUserAction({
			action: 'alerts_panel_mark_all_read',
			details: JSON.stringify({
				groupedCount: markedCount
			})
		});
	} catch {
		/* non-fatal */
	}
}
