import { describe, expect, it } from 'vitest';
import type { Insight } from '$lib/core/db';
import {
	getPanelGroupedBadgeCount,
	getPanelUnreadCount,
	panelInsightGroupKey
} from './alert-tiers';

function makeInsight(id: string, createdAt: string): Insight {
	return {
		id,
		type: 'anomaly',
		severity: 'warning',
		title: 'Possible fee',
		message: 'Review this transaction',
		actionable: false,
		isActive: true,
		dismissedAt: undefined,
		readAt: undefined,
		createdAt,
		updatedAt: createdAt,
		deletedAt: null
	};
}

describe('alert-tiers panel badge grouping', () => {
	it('groups badge count by type + title + severity cluster', () => {
		const insights = Array.from({ length: 8 }, (_, i) =>
			makeInsight(`insight-${i}`, `2026-05-2${i}T12:00:00.000Z`)
		);

		expect(panelInsightGroupKey(insights[0])).toBe(panelInsightGroupKey(insights[1]));
		expect(getPanelUnreadCount(insights)).toBe(8);
		expect(getPanelGroupedBadgeCount(insights)).toBe(1);
	});

	it('counts separate groups when title or severity differs', () => {
		const shared = makeInsight('a', '2026-05-23T12:00:00.000Z');
		const otherTitle = { ...shared, id: 'b', title: 'Other alert' };
		const critical = { ...shared, id: 'c', severity: 'alert' as const };

		expect(getPanelGroupedBadgeCount([shared, otherTitle, critical])).toBe(3);
	});
});
