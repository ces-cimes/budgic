/**
 * Post-add split suggestion after manual expense/income create (partitioned link only).
 * @see docs/analysis/transaction-split-unification.md § Import workflow
 */

import { db, type Transaction, type UserPreferences } from '$lib/core/db';
import { userService } from '../core/user-service';
import type { ImportSplitReviewGroup } from '../core/data-quality-service';
import {
	detectImportSplitCandidates,
	getSplitPickerCandidateIds,
	isEligibleForSplitDetection
} from './import-split-detect';
import { hasSplit, resolveSplit, transactionHasExistingSplit } from '$lib/utils/transaction-split';

const DISMISS_WINDOW_MS = 30 * 86400000;
const DISMISS_MAX_IN_WINDOW = 3;

/** Stable key for {@link UserPreferences.postAddSplitDismissals} — sorted member ids. */
export function postAddSplitDismissalKey(memberIds: string[]): string {
	return [...memberIds].sort().join('::');
}

export function isPostAddSplitDismissed(prefs: UserPreferences, key: string): boolean {
	const arr = prefs.postAddSplitDismissals?.[key] ?? [];
	const recent = arr.filter((d) => Date.now() - new Date(d).getTime() < DISMISS_WINDOW_MS).length;
	return recent >= DISMISS_MAX_IN_WINDOW;
}

async function loadEligibleAccountPool(
	accountId: string,
	type: Transaction['type']
): Promise<Transaction[]> {
	return db.transactions
		.where('accountId')
		.equals(accountId)
		.filter((t) => !t.deletedAt && t.type === type && isEligibleForSplitDetection(t))
		.toArray();
}

/**
 * Find a partitioned split candidate cluster around a newly saved transaction.
 * Returns null when prefs off, anchor ineligible, no cluster, or dismissed.
 */
export async function findPostAddSplitSuggestion(
	anchor: Transaction
): Promise<ImportSplitReviewGroup | null> {
	const prefs = await userService.getUserPreferences();
	if (!prefs.suggestSplitsAfterAdd) return null;

	if (anchor.type !== 'expense' && anchor.type !== 'income') return null;
	if (transactionHasExistingSplit(anchor)) return null;

	const split = resolveSplit(anchor);
	if (split && hasSplit(split)) return null;

	if (!isEligibleForSplitDetection(anchor)) return null;

	const accountId = anchor.accountId;
	if (!accountId) return null;

	const pool = await loadEligibleAccountPool(accountId, anchor.type);
	const pickerIds = new Set(getSplitPickerCandidateIds(pool, [anchor]));
	if (pickerIds.size < 2) return null;

	const pickerPool = pool.filter((t) => pickerIds.has(t.id));
	const groups = detectImportSplitCandidates(pickerPool);

	let matchedMemberIds: string[] | null = null;
	for (const memberIds of groups.values()) {
		if (memberIds.length >= 2 && memberIds.includes(anchor.id)) {
			matchedMemberIds = memberIds;
			break;
		}
	}
	if (!matchedMemberIds) return null;

	const dismissKey = postAddSplitDismissalKey(matchedMemberIds);
	if (isPostAddSplitDismissed(prefs, dismissKey)) return null;

	const detectedSet = new Set(matchedMemberIds);
	const detectedTransactions = pickerPool
		.filter((t) => detectedSet.has(t.id))
		.sort((a, b) => a.id.localeCompare(b.id));

	const pickerTransactions = pickerPool
		.filter((t) => pickerIds.has(t.id))
		.sort((a, b) => {
			const ta = Date.parse(a.clearedDate ?? a.plannedDate ?? a.createdAt ?? '');
			const tb = Date.parse(b.clearedDate ?? b.plannedDate ?? b.createdAt ?? '');
			return ta - tb;
		});

	return {
		groupId: `post-add-${anchor.id}`,
		transactions: detectedTransactions,
		pickerTransactions
	};
}
