import type { Account, AutomationTag } from '$lib/core/db';

export type UpdateBalanceClassification = AutomationTag | 'none' | 'unclassified';

const CLASSIFICATION_EPS = 0.02;

/**
 * Infer automation tag from entered balance vs projected passive balance (Update Balance sheet).
 */
export function guessUpdateBalanceClassification(
	account: Account,
	diffVsProjected: number
): UpdateBalanceClassification {
	if (!account.rateProfile || Math.abs(diffVsProjected) < CLASSIFICATION_EPS) {
		return 'unclassified';
	}
	if (account.type === 'savings') {
		if (diffVsProjected > CLASSIFICATION_EPS) return 'interest-income';
		if (diffVsProjected < -CLASSIFICATION_EPS) return 'transfer-fee';
	}
	if (account.type === 'credit' && diffVsProjected < -CLASSIFICATION_EPS)
		return 'interest-charge';
	if (account.type === 'loan' && diffVsProjected < -CLASSIFICATION_EPS) return 'interest-charge';
	return 'unclassified';
}
