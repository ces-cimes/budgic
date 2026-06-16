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
	{ id: 'fees-accounts', label: 'Fees & Accounts' },
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
