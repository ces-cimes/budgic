import { describe, expect, it } from 'vitest';
import {
	getClassifyNudgeCopy,
	getCriticalAlertsCoachmarkCopy,
	getGoalPrecisionNudgeCopy,
	getGuidancePresentation,
	getMaxSuggestions,
	getPostAddSplitSuggestionCopy,
	mapLegacyMaturityToGuidance,
	needsGuidanceMigration,
	shouldShowClassifyNudge,
	shouldShowCriticalAlertsCoachmark,
	shouldShowGoalPrecisionNudge,
	shouldShowPostAddSplitSuggestion
} from './guidance-presentation';

describe('mapLegacyMaturityToGuidance', () => {
	it('maps beginner to supportive + full', () => {
		expect(mapLegacyMaturityToGuidance('beginner')).toEqual({
			guidanceTone: 'supportive',
			explanationDetail: 'full'
		});
	});

	it('maps advanced and expert to minimal + brief', () => {
		expect(mapLegacyMaturityToGuidance('advanced')).toEqual({
			guidanceTone: 'minimal',
			explanationDetail: 'brief'
		});
		expect(mapLegacyMaturityToGuidance('expert')).toEqual({
			guidanceTone: 'minimal',
			explanationDetail: 'brief'
		});
	});
});

describe('getGuidancePresentation', () => {
	it('returns explicit prefs when set', () => {
		expect(
			getGuidancePresentation({
				guidanceTone: 'minimal',
				explanationDetail: 'brief'
			})
		).toEqual({ guidanceTone: 'minimal', explanationDetail: 'brief' });
	});

	it('defaults to balanced + standard when prefs missing', () => {
		expect(getGuidancePresentation({})).toEqual({
			guidanceTone: 'balanced',
			explanationDetail: 'standard'
		});
	});
});

describe('needsGuidanceMigration', () => {
	it('returns true when either presentation field absent', () => {
		expect(needsGuidanceMigration({})).toBe(true);
		expect(needsGuidanceMigration({ guidanceTone: 'balanced' })).toBe(true);
	});

	it('returns false when both fields set', () => {
		expect(
			needsGuidanceMigration({ guidanceTone: 'balanced', explanationDetail: 'standard' })
		).toBe(false);
	});
});

describe('getMaxSuggestions', () => {
	it('limits minimal+brief to 2 suggestions', () => {
		expect(getMaxSuggestions({ guidanceTone: 'minimal', explanationDetail: 'brief' })).toBe(2);
	});

	it('allows all eligible for balanced+standard', () => {
		expect(getMaxSuggestions({ guidanceTone: 'balanced', explanationDetail: 'standard' })).toBe(3);
	});
});

describe('getClassifyNudgeCopy', () => {
	it('returns shorter copy for brief detail', () => {
		const copy = getClassifyNudgeCopy('brief');
		expect(copy.body.length).toBeLessThan(getClassifyNudgeCopy('full').body.length);
	});
});

describe('shouldShowClassifyNudge', () => {
	const balanced = { guidanceTone: 'balanced' as const, explanationDetail: 'standard' as const };

	it('uses balanced legacy thresholds', () => {
		expect(
			shouldShowClassifyNudge(balanced, {
				allowanceConfidenceRatio: 0.4,
				unclassifiedTransactionCount: 6,
				dismissed: false
			})
		).toBe(true);
		expect(
			shouldShowClassifyNudge(balanced, {
				allowanceConfidenceRatio: 0.6,
				unclassifiedTransactionCount: 6,
				dismissed: false
			})
		).toBe(false);
	});

	it('shows earlier for supportive tone', () => {
		expect(
			shouldShowClassifyNudge(
				{ guidanceTone: 'supportive', explanationDetail: 'full' },
				{
					allowanceConfidenceRatio: 0.55,
					unclassifiedTransactionCount: 4,
					dismissed: false
				}
			)
		).toBe(true);
	});

	it('requires stricter signals for minimal tone', () => {
		expect(
			shouldShowClassifyNudge(
				{ guidanceTone: 'minimal', explanationDetail: 'brief' },
				{
					allowanceConfidenceRatio: 0.4,
					unclassifiedTransactionCount: 6,
					dismissed: false
				}
			)
		).toBe(false);
		expect(
			shouldShowClassifyNudge(
				{ guidanceTone: 'minimal', explanationDetail: 'brief' },
				{
					allowanceConfidenceRatio: 0.3,
					unclassifiedTransactionCount: 11,
					dismissed: false
				}
			)
		).toBe(true);
	});

	it('respects dismissal', () => {
		expect(
			shouldShowClassifyNudge(balanced, {
				allowanceConfidenceRatio: 0.1,
				unclassifiedTransactionCount: 20,
				dismissed: true
			})
		).toBe(false);
	});
});

describe('shouldShowCriticalAlertsCoachmark', () => {
	it('suppresses for minimal guidance', () => {
		expect(shouldShowCriticalAlertsCoachmark('minimal')).toBe(false);
	});

	it('allows for supportive and balanced', () => {
		expect(shouldShowCriticalAlertsCoachmark('supportive')).toBe(true);
		expect(shouldShowCriticalAlertsCoachmark('balanced')).toBe(true);
	});
});

describe('getCriticalAlertsCoachmarkCopy', () => {
	it('returns shorter copy for brief detail', () => {
		expect(getCriticalAlertsCoachmarkCopy('brief').body.length).toBeLessThan(
			getCriticalAlertsCoachmarkCopy('full').body.length
		);
	});
});

describe('split nudge guidance', () => {
	it('suppresses goal-precision and post-add split for minimal tone', () => {
		expect(shouldShowGoalPrecisionNudge('minimal')).toBe(false);
		expect(shouldShowPostAddSplitSuggestion('minimal')).toBe(false);
	});

	it('allows split nudges for balanced and supportive', () => {
		expect(shouldShowGoalPrecisionNudge('balanced')).toBe(true);
		expect(shouldShowPostAddSplitSuggestion('supportive')).toBe(true);
	});

	it('returns shorter copy for brief detail', () => {
		expect(getGoalPrecisionNudgeCopy('brief', 'Groceries').body.length).toBeLessThan(
			getGoalPrecisionNudgeCopy('full', 'Groceries').body.length
		);
		expect(getPostAddSplitSuggestionCopy('brief').description.length).toBeLessThan(
			getPostAddSplitSuggestionCopy('full').description.length
		);
	});
});
