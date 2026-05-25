import { describe, expect, it } from 'vitest';
import {
	getDismissedPostChecklistSuggestions,
	getEligiblePostChecklistSuggestions
} from './post-checklist-suggestions';
import type { UserPreferences } from '$lib/core/db';

const basePrefs = {
	guidanceTone: 'balanced',
	explanationDetail: 'standard',
	nudgeClassifyDismissed: false,
	postChecklistSuggestionDismissals: undefined
} as Pick<
	UserPreferences,
	| 'guidanceTone'
	| 'explanationDetail'
	| 'postChecklistSuggestionDismissals'
	| 'nudgeClassifyDismissed'
>;

describe('getEligiblePostChecklistSuggestions', () => {
	it('returns set-goal and fees-accounts when classify is irrelevant', () => {
		const eligible = getEligiblePostChecklistSuggestions(basePrefs, {
			unclassifiedTransactionCount: 0
		});
		expect(eligible.map((s) => s.id)).toEqual(['fees-accounts', 'set-goal']);
	});

	it('includes classify when enough unclassified transactions', () => {
		const eligible = getEligiblePostChecklistSuggestions(basePrefs, {
			unclassifiedTransactionCount: 10
		});
		expect(eligible.map((s) => s.id)).toContain('classify-transactions');
	});

	it('hides dismissed suggestions', () => {
		const eligible = getEligiblePostChecklistSuggestions(
			{
				...basePrefs,
				postChecklistSuggestionDismissals: { 'set-goal': new Date().toISOString() }
			},
			{ unclassifiedTransactionCount: 0 }
		);
		expect(eligible.map((s) => s.id)).not.toContain('set-goal');
	});

	it('limits count for minimal+brief prefs', () => {
		const eligible = getEligiblePostChecklistSuggestions(
			{
				...basePrefs,
				guidanceTone: 'minimal',
				explanationDetail: 'brief'
			},
			{ unclassifiedTransactionCount: 10 }
		);
		expect(eligible.length).toBeLessThanOrEqual(2);
	});
});

describe('getDismissedPostChecklistSuggestions', () => {
	it('lists only dismissed catalog items', () => {
		const dismissed = getDismissedPostChecklistSuggestions({
			...basePrefs,
			postChecklistSuggestionDismissals: {
				'fees-accounts': new Date().toISOString(),
				'unknown-id': new Date().toISOString()
			}
		});
		expect(dismissed.map((s) => s.id)).toEqual(['fees-accounts']);
	});
});
