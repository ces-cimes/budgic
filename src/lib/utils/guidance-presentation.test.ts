import { describe, expect, it } from 'vitest';
import {
	getClassifyNudgeCopy,
	getCriticalAlertsCoachmarkCopy,
	getGuidancePresentation,
	getMaxSuggestions,
	mapLegacyMaturityToGuidance,
	needsGuidanceMigration,
	shouldShowClassifyNudge,
	shouldShowCriticalAlertsCoachmark
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
	it('prefers explicit prefs over legacy maturity', () => {
		expect(
			getGuidancePresentation({
				guidanceTone: 'minimal',
				explanationDetail: 'brief',
				userMaturityLevel: 'beginner'
			})
		).toEqual({ guidanceTone: 'minimal', explanationDetail: 'brief' });
	});

	it('falls back to legacy maturity when prefs missing', () => {
		expect(
			getGuidancePresentation({
				guidanceTone: 'balanced',
				explanationDetail: 'standard',
				userMaturityLevel: 'beginner'
			})
		).toEqual({ guidanceTone: 'balanced', explanationDetail: 'standard' });
	});
});

describe('needsGuidanceMigration', () => {
	it('returns true when both presentation fields absent', () => {
		expect(needsGuidanceMigration({ userMaturityLevel: 'intermediate' })).toBe(true);
	});

	it('returns false when either field is set', () => {
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
