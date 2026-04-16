import type { Account, Transaction } from '$lib/core/db';

/**
 * Display label for transfers: source account → destination account.
 * The stored `description` field is not used for display.
 */
export function formatTransferLabel(tx: Transaction, accounts: Account[]): string {
	const src = accounts.find((a) => a.id === tx.accountId)?.name ?? 'Unknown';
	const dst = accounts.find((a) => a.id === tx.transferDetails?.toAccountId)?.name ?? 'Unknown';
	return `${src} → ${dst}`;
}

export function normaliseMerchantKey(description: string): string {
	const trimmed = description.trim().toLowerCase();
	if (!trimmed) return '';

	const withoutPunctuation = trimmed
		.replace(/[.,/#!$%^&*;:{}=_`~()"'?+<>\\[\]|-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!withoutPunctuation) return '';

	const withoutStoreSuffixes = withoutPunctuation
		.replace(/\s*(#|№)\s*\d+[a-zа-я]*$/iu, '')
		.replace(/\s+\d+[a-zа-я-]*$/iu, '')
		.trim();

	return withoutStoreSuffixes || withoutPunctuation;
}
