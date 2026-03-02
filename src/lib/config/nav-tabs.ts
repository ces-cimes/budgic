/**
 * Shared tab configuration for sidebar navigation.
 * Used by Navigation.svelte to render direct tab links; route pages keep their own TabConfig (with icons).
 */

export interface NavTabDef {
	id: string;
	label: string;
}

export const planTabs: NavTabDef[] = [
	{ id: 'budget', label: 'Budget' },
	{ id: 'allowance', label: 'Allowance' },
	{ id: 'goals', label: 'Goals' },
	{ id: 'categories', label: 'Categories' }
];

export const insightsTabs: NavTabDef[] = [
	{ id: 'alerts', label: 'Alerts' },
	{ id: 'savings', label: 'Savings' },
	{ id: 'patterns', label: 'Patterns' },
	{ id: 'optimize', label: 'Optimize' },
	{ id: 'badges', label: 'Badges' }
];

export const reportsTabs: NavTabDef[] = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'trends', label: 'Trends' },
	{ id: 'categories', label: 'Categories' },
	{ id: 'compare', label: 'Compare' },
	{ id: 'reports', label: 'Reports' }
];

export const defaultTabByRoute: Record<string, string> = {
	'/plan': 'budget',
	'/insights': 'alerts',
	'/reports': 'overview'
};
