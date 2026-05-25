import {
	getGuidancePresentation,
	getMaxSuggestions,
	type GuidancePresentation
} from './guidance-presentation';
import type { UserPreferences } from '$lib/core/db';

export interface PostChecklistSuggestionDef {
	id: string;
	title: string;
	href: string;
	helperFull: string;
	helperStandard: string;
	helperBrief: string;
	priority: number;
}

export const POST_CHECKLIST_SUGGESTION_CATALOG: PostChecklistSuggestionDef[] = [
	{
		id: 'classify-transactions',
		title: 'Classify uncategorized spending',
		href: '/plan?tab=allowance',
		helperFull:
			'Review and classify transactions so your allowance confidence improves and insights stay accurate.',
		helperStandard: 'Classify uncategorized transactions to sharpen your allowance estimate.',
		helperBrief: 'Classify spending for better allowance accuracy.',
		priority: 1
	},
	{
		id: 'fees-accounts',
		title: 'Review Fees & Accounts',
		href: '/insights?tab=optimize',
		helperFull:
			'Open Optimize once to spot recurring fees and account-level opportunities tailored to your data.',
		helperStandard: 'Check Optimize for fees and account insights.',
		helperBrief: 'Review fees and accounts in Optimize.',
		priority: 2
	},
	{
		id: 'set-goal',
		title: 'Set a financial goal',
		href: '/plan?tab=goals',
		helperFull:
			'Add a savings or payoff goal on Plan so Home and Allowance can track progress toward what matters.',
		helperStandard: 'Create a goal on Plan to track progress from Home.',
		helperBrief: 'Add a goal on Plan.',
		priority: 3
	}
];

export interface SuggestionEligibilityContext {
	dismissals: Record<string, string>;
	nudgeClassifyDismissed?: boolean;
	unclassifiedTransactionCount?: number;
}

export interface ResolvedPostChecklistSuggestion {
	id: string;
	title: string;
	href: string;
	helper: string;
	priority: number;
}

function helperForDetail(
	def: PostChecklistSuggestionDef,
	detail: GuidancePresentation['explanationDetail']
): string {
	switch (detail) {
		case 'full':
			return def.helperFull;
		case 'brief':
			return def.helperBrief;
		default:
			return def.helperStandard;
	}
}

function isSuggestionRelevant(
	def: PostChecklistSuggestionDef,
	context: SuggestionEligibilityContext
): boolean {
	if (context.dismissals[def.id]) return false;

	if (def.id === 'classify-transactions') {
		if (context.nudgeClassifyDismissed) return false;
		const count = context.unclassifiedTransactionCount ?? 0;
		if (count <= 5) return false;
	}

	return true;
}

export function getEligiblePostChecklistSuggestions(
	prefs: Pick<
		UserPreferences,
		| 'guidanceTone'
		| 'explanationDetail'
		| 'userMaturityLevel'
		| 'postChecklistSuggestionDismissals'
		| 'nudgeClassifyDismissed'
	>,
	context: Pick<SuggestionEligibilityContext, 'unclassifiedTransactionCount'> = {}
): ResolvedPostChecklistSuggestion[] {
	const presentation = getGuidancePresentation(prefs);
	const dismissals = prefs.postChecklistSuggestionDismissals ?? {};
	const eligibility: SuggestionEligibilityContext = {
		dismissals,
		nudgeClassifyDismissed: prefs.nudgeClassifyDismissed,
		unclassifiedTransactionCount: context.unclassifiedTransactionCount
	};

	const eligible = POST_CHECKLIST_SUGGESTION_CATALOG.filter((def) =>
		isSuggestionRelevant(def, eligibility)
	)
		.sort((a, b) => a.priority - b.priority)
		.slice(0, getMaxSuggestions(presentation))
		.map((def) => ({
			id: def.id,
			title: def.title,
			href: def.href,
			helper: helperForDetail(def, presentation.explanationDetail),
			priority: def.priority
		}));

	return eligible;
}

export function getDismissedPostChecklistSuggestions(
	prefs: Pick<
		UserPreferences,
		'guidanceTone' | 'explanationDetail' | 'userMaturityLevel' | 'postChecklistSuggestionDismissals'
	>
): ResolvedPostChecklistSuggestion[] {
	const presentation = getGuidancePresentation(prefs);
	const dismissals = prefs.postChecklistSuggestionDismissals ?? {};

	return POST_CHECKLIST_SUGGESTION_CATALOG.filter((def) => dismissals[def.id])
		.sort((a, b) => a.priority - b.priority)
		.map((def) => ({
			id: def.id,
			title: def.title,
			href: def.href,
			helper: helperForDetail(def, presentation.explanationDetail),
			priority: def.priority
		}));
}

export function hasActivePostChecklistSuggestions(
	prefs: Parameters<typeof getEligiblePostChecklistSuggestions>[0],
	context: Parameters<typeof getEligiblePostChecklistSuggestions>[1] = {}
): boolean {
	return getEligiblePostChecklistSuggestions(prefs, context).length > 0;
}
