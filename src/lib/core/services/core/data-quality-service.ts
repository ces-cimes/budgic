import { db } from '$lib/core/db';
import type { Transaction } from '$lib/core/db';
import {
	getSplitPickerCandidateIds,
	isEligibleForSplitDetection
} from '../import-export/import-split-detect';

function hasImportQualityReviewFlags(q: Transaction['importQuality']): boolean {
	if (!q) return false;
	return Boolean(q.amountInferred || q.dateInferred || q.currencyFallback);
}

export interface ImportSplitReviewGroup {
	groupId: string;
	transactions: Transaction[];
	pickerTransactions: Transaction[];
}

export interface ImportReviewSnapshot {
	qualityQueue: Transaction[];
	splitGroups: ImportSplitReviewGroup[];
}

function accountPoolKey(accountId: string, type: Transaction['type']): string {
	return `${accountId}|${type}`;
}

/**
 * Load eligible split-picker rows for an account using the accountId index (not a full table scan).
 */
async function loadEligibleAccountPool(
	accountId: string,
	type: Transaction['type'],
	cache: Map<string, Transaction[]>
): Promise<Transaction[]> {
	const key = accountPoolKey(accountId, type);
	const cached = cache.get(key);
	if (cached) return cached;

	const pool = await db.transactions
		.where('accountId')
		.equals(accountId)
		.filter((t) => !t.deletedAt && t.type === type && isEligibleForSplitDetection(t))
		.toArray();

	cache.set(key, pool);
	return pool;
}

function buildSplitReviewGroups(
	splitRows: Transaction[],
	poolCache: Map<string, Transaction[]>
): ImportSplitReviewGroup[] {
	const byGroup = new Map<string, Transaction[]>();
	for (const tx of splitRows) {
		const gid = tx.importQuality!.splitCandidateGroupId!;
		const arr = byGroup.get(gid) ?? [];
		arr.push(tx);
		byGroup.set(gid, arr);
	}

	const groups: ImportSplitReviewGroup[] = [];

	for (const [groupId, transactions] of byGroup) {
		if (transactions.length < 2) continue;

		const accountId = transactions[0]?.accountId;
		const type = transactions[0]?.type;
		let pickerTransactions = transactions;

		if (accountId && type) {
			const pool = poolCache.get(accountPoolKey(accountId, type));
			if (pool) {
				const pickerIds = new Set(getSplitPickerCandidateIds(pool, transactions));
				pickerTransactions = pool.filter((t) => pickerIds.has(t.id));
				pickerTransactions.sort((a, b) => {
					const ta = Date.parse(a.clearedDate ?? a.plannedDate ?? a.createdAt ?? '');
					const tb = Date.parse(b.clearedDate ?? b.plannedDate ?? b.createdAt ?? '');
					return ta - tb;
				});
			}
		}

		groups.push({
			groupId,
			transactions: [...transactions].sort((a, b) => a.id.localeCompare(b.id)),
			pickerTransactions
		});
	}

	groups.sort((a, b) => {
		const ta = Date.parse(
			a.transactions[0]?.clearedDate ??
				a.transactions[0]?.plannedDate ??
				a.transactions[0]?.createdAt ??
				''
		);
		const tb = Date.parse(
			b.transactions[0]?.clearedDate ??
				b.transactions[0]?.plannedDate ??
				b.transactions[0]?.createdAt ??
				''
		);
		return tb - ta;
	});

	return groups;
}

/**
 * Transactions that still need import-quality review (O(n) table scan; no Dexie index on flags).
 */
class DataQualityService {
	/**
	 * Single pass over active transactions for both review queues.
	 * Split picker pools use indexed accountId lookups (one per distinct account+type).
	 */
	async getImportReviewSnapshot(): Promise<ImportReviewSnapshot> {
		const rows = await db.transactions.filter((t) => !t.deletedAt).toArray();

		const qualityQueue: Transaction[] = [];
		const splitRows: Transaction[] = [];
		const poolKeysNeeded = new Set<string>();

		for (const tx of rows) {
			const q = tx.importQuality;
			if (!q || q.reviewDismissed) continue;

			if (hasImportQualityReviewFlags(q)) {
				qualityQueue.push(tx);
			}

			if (!tx.groupId && q.splitCandidateGroupId) {
				splitRows.push(tx);
				if (tx.accountId && (tx.type === 'expense' || tx.type === 'income')) {
					poolKeysNeeded.add(accountPoolKey(tx.accountId, tx.type));
				}
			}
		}

		const poolCache = new Map<string, Transaction[]>();
		await Promise.all(
			[...poolKeysNeeded].map(async (key) => {
				const [accountId, type] = key.split('|') as [string, Transaction['type']];
				await loadEligibleAccountPool(accountId, type, poolCache);
			})
		);

		return {
			qualityQueue,
			splitGroups: buildSplitReviewGroups(splitRows, poolCache)
		};
	}

	async getImportReviewQueue(): Promise<Transaction[]> {
		return (await this.getImportReviewSnapshot()).qualityQueue;
	}

	async getImportSplitReviewGroups(): Promise<ImportSplitReviewGroup[]> {
		return (await this.getImportReviewSnapshot()).splitGroups;
	}
}

export const dataQualityService = new DataQualityService();
