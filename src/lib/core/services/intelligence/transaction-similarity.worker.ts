import type { Transaction } from '$lib/core/db';

import {
	TransactionSimilarityEngine,
	type SimilarityProfileName,
	resolveSimilarityProfile
} from './transaction-similarity-engine';

interface ClusterRequest {
	transactions: Transaction[];
	profileName: SimilarityProfileName;
	minGroupSize?: number;
}

interface ClusterResponse {
	clusters: number[][];
}

self.onmessage = (event: MessageEvent<ClusterRequest>) => {
	const { transactions, profileName, minGroupSize = 2 } = event.data;
	const engine = new TransactionSimilarityEngine();
	const config = resolveSimilarityProfile(profileName);
	const groups = engine.cluster(transactions, config, minGroupSize);

	const indexMap = new Map<string, number[]>();
	transactions.forEach((tx, index) => {
		const list = indexMap.get(tx.id) ?? [];
		list.push(index);
		indexMap.set(tx.id, list);
	});

	const usedIndices = new Set<number>();
	const clusters = groups.map((group) => {
		const indices: number[] = [];
		for (const tx of group) {
			const candidates = indexMap.get(tx.id) ?? [];
			const nextIndex = candidates.find((candidate) => !usedIndices.has(candidate));
			if (nextIndex !== undefined) {
				usedIndices.add(nextIndex);
				indices.push(nextIndex);
			}
		}
		return indices;
	});

	self.postMessage({ clusters } satisfies ClusterResponse);
};

export {};
