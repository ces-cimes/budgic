/**
 * Key for {@link UserPreferences.goalRelativePrecisionDismissals} — merchant + secondary category.
 */
export function goalRelativePrecisionDismissalKey(merchantKey: string, categoryId: string): string {
	return `${merchantKey}::${categoryId}`;
}
