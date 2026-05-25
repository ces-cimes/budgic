import { describe, expect, it } from 'vitest';
import {
	getClassifyNudgeCopy,
	getGuidancePresentation,
	getMaxSuggestions,
	mapLegacyMaturityToGuidance,
	needsGuidanceMigration
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
