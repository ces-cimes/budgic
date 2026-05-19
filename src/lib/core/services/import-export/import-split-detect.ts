import { generateUUID, type Transaction } from '$lib/core/db';

export const SPLIT_PROXIMITY_MS = 10 * 60 * 1000;
const DESCRIPTION_JACCARD_THRESHOLD = 0.5;

function normalizeTokens(value: string): string[] {
	return value
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.split(' ')
		.filter(Boolean);
}

function descriptionJaccard(a: string, b: string): number {
	const left = normalizeTokens(a);
	const right = normalizeTokens(b);
	if (!left.length || !right.length) return 0;

	const leftSet = new Set(left);
	const rightSet = new Set(right);
	let intersection = 0;
	for (const token of leftSet) {
		if (rightSet.has(token)) intersection += 1;
	}
	const union = new Set([...leftSet, ...rightSet]).size;
	return union > 0 ? intersection / union : 0;
}

function getRelevantTimestampMs(tx: Transaction): number | null {
	const raw = tx.clearedDate ?? tx.plannedDate ?? tx.createdAt;
	if (!raw) return null;
	const ms = Date.parse(raw);
	return Number.isFinite(ms) ? ms : null;
}

export function isEligibleForSplitDetection(tx: Transaction): boolean {
	if (tx.deletedAt) return false;
	if (tx.type !== 'expense' && tx.type !== 'income') return false;
	if (tx.groupId) return false;
	if (tx.categoryWeights && tx.categoryWeights.length > 0) return false;
	return getRelevantTimestampMs(tx) !== null;
}

function areSplitCandidates(a: Transaction, b: Transaction): boolean {
	const descA = (a.description ?? '').trim();
	const descB = (b.description ?? '').trim();
	if (descA && descB && descriptionJaccard(descA, descB) >= DESCRIPTION_JACCARD_THRESHOLD) {
		return true;
	}
	if (a.categoryId && b.categoryId && a.categoryId === b.categoryId) {
		return true;
	}
	return false;
}

function bucketKey(tx: Transaction): string {
	return `${tx.accountId ?? ''}|${tx.type}`;
}

/**
 * Detect groups of transactions likely to be splits from the same receipt.
 * Returns groupId → member transaction ids (each tx in at most one group).
 */
export function detectImportSplitCandidates(transactions: Transaction[]): Map<string, string[]> {
	const eligible = transactions.filter(isEligibleForSplitDetection);
	const buckets = new Map<string, Transaction[]>();

	for (const tx of eligible) {
		const key = bucketKey(tx);
		const arr = buckets.get(key) ?? [];
		arr.push(tx);
		buckets.set(key, arr);
	}

	const assigned = new Set<string>();
	const result = new Map<string, string[]>();

	for (const [, bucket] of buckets) {
		if (bucket.length < 2) continue;

		const sorted = [...bucket].sort((a, b) => {
			const ta = getRelevantTimestampMs(a) ?? 0;
			const tb = getRelevantTimestampMs(b) ?? 0;
			return ta - tb;
		});

		const parent = sorted.map((_, i) => i);

		function find(i: number): number {
			if (parent[i] !== i) parent[i] = find(parent[i]!);
			return parent[i]!;
		}

		function union(i: number, j: number): void {
			const ri = find(i);
			const rj = find(j);
			if (ri !== rj) parent[rj] = ri;
		}

		for (let i = 0; i < sorted.length; i += 1) {
			const ti = getRelevantTimestampMs(sorted[i]!)!;
			for (let j = i + 1; j < sorted.length; j += 1) {
				const tj = getRelevantTimestampMs(sorted[j]!)!;
				if (tj - ti > SPLIT_PROXIMITY_MS) break;
				if (areSplitCandidates(sorted[i]!, sorted[j]!)) {
					union(i, j);
				}
			}
		}

		const components = new Map<number, string[]>();
		for (let i = 0; i < sorted.length; i += 1) {
			const root = find(i);
			const arr = components.get(root) ?? [];
			arr.push(sorted[i]!.id);
			components.set(root, arr);
		}

		const componentList = [...components.values()]
			.filter((ids) => ids.length >= 2)
			.sort((a, b) => {
				const ta = getRelevantTimestampMs(sorted.find((t) => t.id === a[0])!)!;
				const tb = getRelevantTimestampMs(sorted.find((t) => t.id === b[0])!)!;
				return ta - tb;
			});

		for (const memberIds of componentList) {
			if (memberIds.some((id) => assigned.has(id))) continue;

			const groupId = generateUUID();
			result.set(groupId, memberIds);
			for (const id of memberIds) assigned.add(id);
		}
	}

	return result;
}

/**
 * Transaction ids in the same import batch eligible for the split picker (±10 min window).
 */
export function getSplitPickerCandidateIds(
	batchTransactions: Transaction[],
	anchorTransactions: Transaction[]
): string[] {
	if (anchorTransactions.length === 0) return [];

	const anchorTimes = anchorTransactions
		.map(getRelevantTimestampMs)
		.filter((t): t is number => t !== null);
	if (anchorTimes.length === 0) return [];

	const minT = Math.min(...anchorTimes) - SPLIT_PROXIMITY_MS;
	const maxT = Math.max(...anchorTimes) + SPLIT_PROXIMITY_MS;
	const accountId = anchorTransactions[0]?.accountId;
	const type = anchorTransactions[0]?.type;
	if (!accountId || !type) return [];

	const ids: string[] = [];
	for (const tx of batchTransactions) {
		if (!isEligibleForSplitDetection(tx)) continue;
		if (tx.accountId !== accountId || tx.type !== type) continue;
		const ms = getRelevantTimestampMs(tx);
		if (ms === null || ms < minT || ms > maxT) continue;
		ids.push(tx.id);
	}
	return [...new Set(ids)].sort();
}
