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

/** Inline-only insights (Patterns tab / low tier); never bell panel or Home Needs attention. */
export function isInlineOnlyInsight(insight: Insight): boolean {
	if (insight.type === 'behavioral' && /unusual/i.test(insight.title)) return true;
	return false;
}

/** Whether an insight may appear in the bell panel or Home grouped attention block. */
export function isPanelEligible(insight: Insight): boolean {
	return (
		insight.isActive &&
		!insight.dismissedAt &&
		!insight.readAt &&
		isPanelSeverity(insight.severity) &&
		!isInlineOnlyInsight(insight)
	);
}

/** Filter insights to those shown in the bell panel (Critical + High, active, not dismissed). */
export function getPanelAlerts(insights: Insight[]): Insight[] {
	return insights.filter((i) => isPanelEligible(i));
}

/** Count of unread panel alerts (Critical + High only), raw insight rows. */
export function getPanelUnreadCount(insights: Insight[]): number {
	return getPanelAlerts(insights).length;
}

/**
 * Badge count aligned with the alerts panel: one per grouped row (same type + title + severity).
 */
export function getPanelGroupedBadgeCount(insights: Insight[]): number {
	const { critical, high } = splitByTier(insights);
	return groupPanelAlertsForDisplay(critical).length + groupPanelAlertsForDisplay(high).length;
}

/** Badge color: red if any Critical, else amber if any High. */
export function getBadgeVariant(insights: Insight[]): 'destructive' | 'warning' | null {
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

/** Stable key for deduping panel rows (same type + title + severity → one card). */
export function panelInsightGroupKey(i: Insight): string {
	return `${i.type}\0${i.title}\0${i.severity}`;
}

/**
 * Group panel-tier insights for display: newest-first globally, one row per key.
 * Within each group, insights are newest-first (primary = group[0]).
 */
export function groupPanelAlertsForDisplay(insights: Insight[]): Insight[][] {
	const sorted = [...insights].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
	const byKey = new Map<string, Insight[]>();
	for (const i of sorted) {
		const k = panelInsightGroupKey(i);
		const arr = byKey.get(k) ?? [];
		arr.push(i);
		byKey.set(k, arr);
	}
	const out: Insight[][] = [];
	const seen = new Set<string>();
	for (const i of sorted) {
		const k = panelInsightGroupKey(i);
		if (seen.has(k)) continue;
		seen.add(k);
		const g = byKey.get(k);
		if (g) out.push(g);
	}
	return out;
}

/** Insights deep-link tab: fee-style savings → Optimize; else Patterns. */
export function insightsTabForAlertType(type: Insight['type']): 'optimize' | 'patterns' {
	return type === 'savings_opportunity' ? 'optimize' : 'patterns';
}

export function insightsDeepLinkForType(type: Insight['type']): string {
	if (type === 'reconciliation_due') return '/data?tab=reconcile';
	if (type === 'overdraft_overdue' || type === 'repayment_overdue') {
		return '/transactions?status=planned';
	}
	if (type === 'goal_milestone') return '/plan?tab=goals';
	if (type === 'budget_approaching' || type === 'budget_exceeded') return '/plan?tab=budget';
	if (type === 'emergency_fund' || type === 'credit_utilization') {
		return `/insights?tab=optimize&insightType=${encodeURIComponent(type)}`;
	}
	const tab = insightsTabForAlertType(type);
	return `/insights?tab=${tab}&insightType=${encodeURIComponent(type)}`;
}

function parseInsightMetadata(insight: Insight): Record<string, unknown> | null {
	if (!insight.metadata) return null;
	try {
		return typeof insight.metadata === 'string'
			? (JSON.parse(insight.metadata) as Record<string, unknown>)
			: (insight.metadata as Record<string, unknown>);
	} catch {
		return null;
	}
}

/** Resolved navigation target for panel/Home CTAs (explicit actionUrl wins). */
export function alertActionUrlForInsight(insight: Insight): string | undefined {
	if (insight.actionUrl) return insight.actionUrl;
	const meta = parseInsightMetadata(insight);
	if (insight.type === 'overdraft_overdue') {
		const accountId = meta?.accountId as string | undefined;
		if (accountId) return `/accounts/${accountId}`;
	}
	if (insight.type === 'savings_opportunity') {
		const accountId = meta?.accountId as string | undefined;
		if (accountId) return `/accounts/${accountId}`;
	}
	if (insight.type === 'prediction' || insight.type === 'credit_utilization') {
		const accountId = meta?.accountId as string | undefined;
		if (accountId) return `/accounts/${accountId}`;
	}
	return insightsDeepLinkForType(insight.type);
}

/** Human-readable fee alert title for panel rows. */
export function formatFeeAlertTitle(accountName: string, triggerCondition?: string): string {
	const name = accountName?.trim() || 'Account';
	if (triggerCondition?.trim()) {
		return `Possible fee: ${name}`;
	}
	return `Possible fee: ${name}`;
}
