import type { UserPreferences } from '$lib/core/db';

export type GuidanceTone = UserPreferences['guidanceTone'];
export type ExplanationDetail = UserPreferences['explanationDetail'];

export interface GuidancePresentation {
	guidanceTone: GuidanceTone;
	explanationDetail: ExplanationDetail;
}

export function mapLegacyMaturityToGuidance(
	maturity: UserPreferences['userMaturityLevel']
): GuidancePresentation {
	switch (maturity) {
		case 'beginner':
			return { guidanceTone: 'supportive', explanationDetail: 'full' };
		case 'intermediate':
			return { guidanceTone: 'balanced', explanationDetail: 'standard' };
		case 'advanced':
		case 'expert':
			return { guidanceTone: 'minimal', explanationDetail: 'brief' };
		default:
			return { guidanceTone: 'balanced', explanationDetail: 'standard' };
	}
}

export function getGuidancePresentation(
	prefs: Pick<UserPreferences, 'guidanceTone' | 'explanationDetail' | 'userMaturityLevel'>
): GuidancePresentation {
	if (prefs.guidanceTone && prefs.explanationDetail) {
		return { guidanceTone: prefs.guidanceTone, explanationDetail: prefs.explanationDetail };
	}
	return mapLegacyMaturityToGuidance(prefs.userMaturityLevel ?? 'beginner');
}

export function needsGuidanceMigration(
	prefs: Partial<Pick<UserPreferences, 'guidanceTone' | 'explanationDetail' | 'userMaturityLevel'>>
): boolean {
	return prefs.guidanceTone == null && prefs.explanationDetail == null;
}

/** Max suggestions to show based on presentation prefs */
export function getMaxSuggestions(presentation: GuidancePresentation): number {
	if (presentation.guidanceTone === 'minimal' && presentation.explanationDetail === 'brief') {
		return 2;
	}
	return 3;
}

export function getClassifyNudgeCopy(detail: ExplanationDetail): { title: string; body: string } {
	switch (detail) {
		case 'brief':
			return {
				title: 'Improve allowance confidence',
				body: 'Classify unclassified transactions.'
			};
		case 'full':
			return {
				title: 'Improve allowance confidence',
				body: 'You have several unclassified transactions. Classifying them helps Budgic estimate your allowance more accurately and surface better insights over time.'
			};
		default:
			return {
				title: 'Improve allowance confidence',
				body: 'You have several unclassified transactions. Classify them to improve your allowance accuracy.'
			};
	}
}
