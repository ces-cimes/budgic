/**
 * Shared tab configuration for sidebar navigation.
 * Used by Navigation.svelte to render direct tab links; route pages keep their own TabConfig (with icons).
 */

export interface NavTabDef {
	id: string;
	label: string;
}

export const planTabs: NavTabDef[] = [
	{ id: 'allowance', label: 'Allowance' },
	{ id: 'budget', label: 'Budget' },
	{ id: 'goals', label: 'Goals' }
];

export const insightsTabs: NavTabDef[] = [
	{ id: 'patterns', label: 'Patterns' },
	{ id: 'optimize', label: 'Optimize' },
	{ id: 'badges', label: 'Badges' }
];

export const reportsTabs: NavTabDef[] = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'trends', label: 'Trends' },
	{ id: 'categories', label: 'Categories' },
	{ id: 'compare', label: 'Compare' },
	{ id: 'saved', label: 'Saved' }
];

export const defaultTabByRoute: Record<string, string> = {
	'/plan': 'allowance',
	'/insights': 'patterns',
	'/reports': 'overview'
};

/** Sidebar / nav: hide Optimize for beginner (matches Insights route TabHeader). */
export function insightsNavTabsForMaturity(
	maturity: string | undefined | null
): NavTabDef[] {
	const level = typeof maturity === 'string' ? maturity.trim().toLowerCase() : '';
	if (level === 'beginner' || level === '') {
		return insightsTabs.filter((t) => t.id !== 'optimize');
	}
	return insightsTabs;
}
