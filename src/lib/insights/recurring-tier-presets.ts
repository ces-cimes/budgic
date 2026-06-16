import type { Category } from '$lib/core/db';

export type TierChipDef = {
	tier: NonNullable<Category['waterfallTier']>;
	label: string;
	hint: string;
};

export const tierChipDefs: TierChipDef[] = [
	{ tier: 'survival', label: 'Survival', hint: 'Non-negotiable — rent, food, utilities' },
	{ tier: 'security', label: 'Security', hint: 'Buffer, savings, debt repayment' },
	{ tier: 'growth', label: 'Growth', hint: 'Investment, learning, building' },
	{ tier: 'lifestyle', label: 'Lifestyle', hint: 'Wants and quality-of-life' },
	{ tier: 'unclassified', label: 'Unclassified', hint: 'Not yet categorised' }
];

/** Tailwind classes for an active (selected) tier chip */
export const tierActiveClasses: Record<NonNullable<Category['waterfallTier']>, string> = {
	survival: 'bg-rose-500/15 text-rose-600 border-rose-500/50 dark:text-rose-400',
	security: 'bg-amber-500/15 text-amber-600 border-amber-500/50 dark:text-amber-400',
	growth: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/50 dark:text-emerald-400',
	lifestyle: 'bg-blue-500/15 text-blue-600 border-blue-500/50 dark:text-blue-400',
	unclassified: 'bg-muted text-muted-foreground border-border'
};

/** Inactive tier chips — same hue families as tierActiveClasses, softer */
export const tierChipIdleClasses: Record<NonNullable<Category['waterfallTier']>, string> = {
	survival:
		'border-rose-500/30 bg-rose-500/[0.06] text-rose-700 hover:bg-rose-500/12 hover:border-rose-500/45 dark:text-rose-300',
	security:
		'border-amber-500/30 bg-amber-500/[0.06] text-amber-800 hover:bg-amber-500/12 hover:border-amber-500/45 dark:text-amber-200',
	growth: 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-800 hover:bg-emerald-500/12 hover:border-emerald-500/45 dark:text-emerald-200',
	lifestyle:
		'border-blue-500/30 bg-blue-500/[0.06] text-blue-800 hover:bg-blue-500/12 hover:border-blue-500/45 dark:text-blue-200',
	unclassified:
		'border-border bg-muted/40 text-muted-foreground hover:bg-muted/55 hover:text-foreground'
};
