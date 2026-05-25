import type { UserPreferences } from '$lib/core/db';

export type GuidanceTone = UserPreferences['guidanceTone'];
export type ExplanationDetail = UserPreferences['explanationDetail'];

/** Legacy backup/import field removed from schema in db v33 */
export type LegacyMaturityLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface GuidancePresentation {
	guidanceTone: GuidanceTone;
	explanationDetail: ExplanationDetail;
}

export function mapLegacyMaturityToGuidance(maturity: LegacyMaturityLevel): GuidancePresentation {
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
	prefs: Partial<Pick<UserPreferences, 'guidanceTone' | 'explanationDetail'>>
): GuidancePresentation {
	return {
		guidanceTone: prefs.guidanceTone ?? 'balanced',
		explanationDetail: prefs.explanationDetail ?? 'standard'
	};
}

export function needsGuidanceMigration(
	prefs: Partial<Pick<UserPreferences, 'guidanceTone' | 'explanationDetail'>>
): boolean {
	return prefs.guidanceTone == null || prefs.explanationDetail == null;
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

export interface ClassifyNudgeContext {
	allowanceConfidenceRatio: number;
	unclassifiedTransactionCount: number;
	dismissed: boolean;
}

/** Show thresholds keyed off guidance tone (balanced = legacy defaults). */
export function shouldShowClassifyNudge(
	presentation: GuidancePresentation,
	context: ClassifyNudgeContext
): boolean {
	if (context.dismissed) return false;

	const { ratio, unclassifiedTransactionCount: count } = {
		ratio: context.allowanceConfidenceRatio,
		unclassifiedTransactionCount: context.unclassifiedTransactionCount
	};

	switch (presentation.guidanceTone) {
		case 'supportive':
			return ratio < 0.6 && count > 3;
		case 'minimal':
			return ratio < 0.35 && count > 10;
		default:
			return ratio < 0.5 && count > 5;
	}
}

/** One-time Alerts panel coachmark — suppressed for minimal guidance tone. */
export function shouldShowCriticalAlertsCoachmark(guidanceTone: GuidanceTone): boolean {
	return guidanceTone !== 'minimal';
}

export function getCriticalAlertsCoachmarkCopy(detail: ExplanationDetail): {
	title: string;
	body: string;
} {
	switch (detail) {
		case 'brief':
			return {
				title: 'Alerts',
				body: 'Visible ~1s marks read. Tap for action; swipe to dismiss or snooze.'
			};
		case 'full':
			return {
				title: 'How alerts work',
				body: 'When an alert stays visible for about a second, it is marked read. Tap the alert or its CTA to open the linked screen. Details expands the full message when there is more to read. Swipe left to dismiss, swipe right to snooze for 24 hours. Dismiss (✕) removes it until the issue returns. Mark all read in the header marks every unread alert here as read.'
			};
		default:
			return {
				title: 'How alerts work',
				body: 'Alerts mark read after ~1s visible. Tap to act, swipe left to dismiss, swipe right to snooze 24h, or use Mark all read in the header.'
			};
	}
}

/** Goal-precision split nudge on transaction save — suppressed for minimal guidance tone. */
export function shouldShowGoalPrecisionNudge(guidanceTone: GuidanceTone): boolean {
	return guidanceTone !== 'minimal';
}

/** Post-add split suggestion sheet — suppressed for minimal guidance tone. */
export function shouldShowPostAddSplitSuggestion(guidanceTone: GuidanceTone): boolean {
	return guidanceTone !== 'minimal';
}

export function getGoalPrecisionNudgeCopy(
	detail: ExplanationDetail,
	secondaryLabel: string
): { title: string; description: string; body: string } {
	switch (detail) {
		case 'brief':
			return {
				title: 'Split for goals?',
				description: `Amount for ${secondaryLabel}?`,
				body: `History often includes ${secondaryLabel}. Enter an amount or tap No.`
			};
		case 'full':
			return {
				title: 'Split for your goals?',
				description: `Any amount for ${secondaryLabel}?`,
				body: `Your merchant history often includes ${secondaryLabel}. Enter part of the total for that category to improve goal tracking, or tap No to skip.`
			};
		default:
			return {
				title: 'Split for your goals?',
				description: `Any amount for ${secondaryLabel}?`,
				body: `Your merchant history often includes ${secondaryLabel}. Enter part of the total for that category, or tap No.`
			};
	}
}

export function getPostAddSplitSuggestionCopy(detail: ExplanationDetail): {
	title: string;
	description: string;
} {
	switch (detail) {
		case 'brief':
			return {
				title: 'Link as split?',
				description: 'Same receipt on this account?'
			};
		case 'full':
			return {
				title: 'Link as split?',
				description:
					'Other transactions on this account look like the same receipt. Select lines to merge into one split group.'
			};
		default:
			return {
				title: 'Link as split?',
				description: 'Other transactions on this account look like the same receipt.'
			};
	}
}
