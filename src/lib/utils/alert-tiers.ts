/**
 * Alert tier mapping per UX_SPEC §7.
 * Severity (DB) → Tier (presentation): Critical = panel + Home, High = panel only, Low = inline only.
 */
import type { Insight } from '$lib/core/db';

export type AlertTier = 'critical' | 'high' | 'low';

const severityToTier: Record<Insight['severity'], AlertTier> = {
	alert: 'critical',
	warning: 'high',
	success: 'low',
	info: 'low'
} as const;

/** Map insight severity to spec tier. */
export function getTier(severity: Insight['severity']): AlertTier {
	return severityToTier[severity];
}

/** Severities that appear in the bell panel (Critical + High only). Low never in panel. */
const PANEL_SEVERITIES: Insight['severity'][] = ['alert', 'warning'];

export function isPanelSeverity(severity: Insight['severity']): boolean {
	return PANEL_SEVERITIES.includes(severity);
}

/** Filter insights to those shown in the bell panel (Critical + High, active, not dismissed). */
export function getPanelAlerts(insights: Insight[]): Insight[] {
	return insights.filter(
		(i) => i.isActive && !i.dismissedAt && !i.readAt && isPanelSeverity(i.severity)
	);
}

/** Count of unread panel alerts (Critical + High only) for badge. */
export function getPanelUnreadCount(insights: Insight[]): number {
	return getPanelAlerts(insights).length;
}

/** Badge color: red if any Critical, else amber if any High. */
export function getBadgeVariant(
	insights: Insight[]
): 'destructive' | 'warning' | null {
	const panel = getPanelAlerts(insights);
	if (panel.length === 0) return null;
	const hasCritical = panel.some((i) => i.severity === 'alert');
	return hasCritical ? 'destructive' : 'warning';
}

/** Split panel alerts into Critical and High for section headers. */
export function splitByTier(insights: Insight[]): {
	critical: Insight[];
	high: Insight[];
} {
	const panel = getPanelAlerts(insights);
	return {
		critical: panel.filter((i) => i.severity === 'alert'),
		high: panel.filter((i) => i.severity === 'warning')
	};
}
