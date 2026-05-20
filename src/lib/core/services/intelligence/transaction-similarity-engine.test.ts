import { describe, expect, it } from 'vitest';

import type { Transaction } from '$lib/core/db';

import {
	AUTOCOMPLETE_CONTEXT_CONFIG,
	ESSENTIAL_DETECTION_CONFIG,
	RECURRING_DETECTION_CONFIG,
	TransactionSimilarityEngine,
	resolveSimilarityProfile
} from './transaction-similarity-engine';

let txCounter = 0;

function makeTx(overrides: Partial<Transaction>): Transaction {
	return {
		id: overrides.id ?? `tx-${txCounter++}`,
		type: overrides.type ?? 'expense',
		status: overrides.status ?? 'cleared',
		amount: overrides.amount ?? -100,
		currency: overrides.currency ?? 'RUB',
		description: overrides.description ?? '',
		accountId: overrides.accountId ?? 'acc-1',
		categoryId: overrides.categoryId,
		clearedDate: overrides.clearedDate ?? '2026-04-10T00:00:00.000Z',
		plannedDate: overrides.plannedDate,
		createdAt: overrides.createdAt ?? '2026-04-10T00:00:00.000Z',
		updatedAt: overrides.updatedAt ?? '2026-04-10T00:00:00.000Z',
		deletedAt: overrides.deletedAt ?? null
	} as Transaction;
}

describe('TransactionSimilarityEngine dimensions', () => {
	it('calculates description Jaccard score', () => {
		const dimension = TransactionSimilarityEngine.descriptionDimension(1);
		const score = dimension.compute(
			{ description: 'LIDL Supermarket #4' },
			makeTx({ description: 'lidl supermarket' })
		);

		expect(score).toBeGreaterThan(0.6);
		expect(score).toBeLessThanOrEqual(1);
	});

	it('calculates amount similarity with gaussian falloff', () => {
		const dimension = TransactionSimilarityEngine.amountDimension(1, 0.1);
		const close = dimension.compute({ amount: -100 }, makeTx({ amount: -105 }));
		const far = dimension.compute({ amount: -100 }, makeTx({ amount: -250 }));

		expect(close).toBeGreaterThan(far);
		expect(close).toBeGreaterThan(0.8);
		expect(far).toBeLessThan(0.1);
	});

	it('calculates exact-match dimensions', () => {
		const accountDimension = TransactionSimilarityEngine.accountDimension(1);
		const categoryDimension = TransactionSimilarityEngine.categoryDimension(1);
		const typeDimension = TransactionSimilarityEngine.typeDimension(1);
		const target = makeTx({ accountId: 'a-1', categoryId: 'cat-1', type: 'expense' });

		expect(accountDimension.compute({ accountId: 'a-1' }, target)).toBe(1);
		expect(accountDimension.compute({ accountId: 'a-2' }, target)).toBe(0);
		expect(categoryDimension.compute({ categoryId: 'cat-1' }, target)).toBe(1);
		expect(categoryDimension.compute({ categoryId: 'cat-2' }, target)).toBe(0);
		expect(typeDimension.compute({ type: 'expense' }, target)).toBe(1);
		expect(typeDimension.compute({ type: 'income' }, target)).toBe(0);
	});

	it('calculates temporal score from day-of-month and day-of-week', () => {
		const dimension = TransactionSimilarityEngine.temporalDimension(1);
		const sameCadence = dimension.compute(
			{ clearedDate: '2026-04-10T00:00:00.000Z' },
			makeTx({ clearedDate: '2026-05-08T00:00:00.000Z' })
		);
		const differentCadence = dimension.compute(
			{ clearedDate: '2026-04-10T00:00:00.000Z' },
			makeTx({ clearedDate: '2026-05-21T00:00:00.000Z' })
		);

		expect(sameCadence).toBeGreaterThan(differentCadence);
	});
});

describe('TransactionSimilarityEngine matching and clustering', () => {
	it('returns nearest results sorted by descending score', () => {
		const engine = new TransactionSimilarityEngine();
		const query: Partial<Transaction> = {
			description: 'Netflix',
			amount: -599,
			accountId: 'card-1',
			type: 'expense'
		};
		const pool = [
			makeTx({ id: '1', description: 'NETFLIX', amount: -599, accountId: 'card-1' }),
			makeTx({ id: '2', description: 'Spotify', amount: -599, accountId: 'card-1' }),
			makeTx({ id: '3', description: 'Netflix', amount: -1400, accountId: 'card-2' })
		];

		const nearest = engine.findNearest(query, pool, AUTOCOMPLETE_CONTEXT_CONFIG, 3);

		expect(nearest).toHaveLength(3);
		expect(nearest[0].transaction.id).toBe('1');
		expect(nearest[0].score).toBeGreaterThanOrEqual(nearest[1].score);
		expect(nearest[1].score).toBeGreaterThanOrEqual(nearest[2].score);
		expect(nearest[0].breakdown.description).toBeGreaterThan(0);
	});

	it('clusters using single-linkage connectivity above threshold', () => {
		const engine = new TransactionSimilarityEngine();
		const config = {
			threshold: 0.4,
			dimensions: [TransactionSimilarityEngine.descriptionDimension(1)]
		};
		const transactions = [
			makeTx({ id: 'a', description: 'rent apartment central' }),
			makeTx({ id: 'b', description: 'rent central apartment' }),
			makeTx({ id: 'c', description: 'rent central apt monthly' }),
			makeTx({ id: 'd', description: 'coffee beans' })
		];

		const groups = engine.cluster(transactions, config, 2);

		expect(groups).toHaveLength(1);
		expect(groups[0].map((tx) => tx.id).sort()).toEqual(['a', 'b', 'c']);
	});
});

describe('similarity profiles', () => {
	it('resolves all canonical profiles', () => {
		expect(resolveSimilarityProfile('RECURRING_DETECTION_CONFIG')).toBe(RECURRING_DETECTION_CONFIG);
		expect(resolveSimilarityProfile('AUTOCOMPLETE_CONTEXT_CONFIG')).toBe(
			AUTOCOMPLETE_CONTEXT_CONFIG
		);
		expect(resolveSimilarityProfile('ESSENTIAL_DETECTION_CONFIG')).toBe(ESSENTIAL_DETECTION_CONFIG);
	});

	it('RECURRING_DETECTION_CONFIG uses doc-aligned threshold and dimension weights', () => {
		expect(RECURRING_DETECTION_CONFIG.threshold).toBe(0.6);
		const weights = Object.fromEntries(
			RECURRING_DETECTION_CONFIG.dimensions.map((d) => [d.name, d.weight])
		);
		expect(weights).toEqual({
			description: 0.4,
			amount: 0.2,
			account: 0.2,
			type: 0.1,
			temporal: 0.1,
			direction: 0.1
		});
	});
});

function clusterIds(transactions: Transaction[], minGroupSize = 2): string[][] {
	const engine = new TransactionSimilarityEngine();
	return engine
		.cluster(transactions, RECURRING_DETECTION_CONFIG, minGroupSize)
		.map((group) => group.map((tx) => tx.id).sort());
}

function pairInSameCluster(
	transactions: Transaction[],
	idA: string,
	idB: string,
	minGroupSize = 2
): boolean {
	const groups = clusterIds(transactions, minGroupSize);
	return groups.some((ids) => ids.includes(idA) && ids.includes(idB));
}

describe('RECURRING_DETECTION_CONFIG clustering', () => {
	it('does not cluster unrelated merchants sharing only a generic token', () => {
		const transactions = [
			makeTx({
				id: 'amazon-mp-1',
				description: 'AMAZON MARKETPLACE',
				amount: -4200,
				accountId: 'card-1',
				clearedDate: '2026-01-10T00:00:00.000Z'
			}),
			makeTx({
				id: 'amazon-mp-2',
				description: 'AMAZON MARKETPLACE',
				amount: -4350,
				accountId: 'card-1',
				clearedDate: '2026-02-10T00:00:00.000Z'
			}),
			makeTx({
				id: 'amazon-prime-1',
				description: 'AMAZON PRIME',
				amount: -599,
				accountId: 'card-1',
				clearedDate: '2026-01-10T00:00:00.000Z'
			}),
			makeTx({
				id: 'amazon-prime-2',
				description: 'AMAZON PRIME',
				amount: -599,
				accountId: 'card-1',
				clearedDate: '2026-02-10T00:00:00.000Z'
			})
		];

		expect(pairInSameCluster(transactions, 'amazon-mp-1', 'amazon-prime-1')).toBe(false);
		expect(pairInSameCluster(transactions, 'amazon-mp-2', 'amazon-prime-2')).toBe(false);
	});

	it('does not cluster same-brand locations with materially different amounts', () => {
		const transactions = [
			makeTx({
				id: 'sb-5th-1',
				description: 'STARBUCKS 5TH AVE',
				amount: -450,
				accountId: 'card-1',
				clearedDate: '2026-03-05T00:00:00.000Z'
			}),
			makeTx({
				id: 'sb-5th-2',
				description: 'STARBUCKS 5TH AVE',
				amount: -480,
				accountId: 'card-1',
				clearedDate: '2026-04-05T00:00:00.000Z'
			}),
			makeTx({
				id: 'sb-air-1',
				description: 'STARBUCKS AIRPORT',
				amount: -1200,
				accountId: 'card-1',
				clearedDate: '2026-03-12T00:00:00.000Z'
			}),
			makeTx({
				id: 'sb-air-2',
				description: 'STARBUCKS AIRPORT',
				amount: -1150,
				accountId: 'card-1',
				clearedDate: '2026-04-12T00:00:00.000Z'
			})
		];

		expect(pairInSameCluster(transactions, 'sb-5th-1', 'sb-air-1')).toBe(false);
	});

	it('does not cluster opposite economic direction despite similar description and amount', () => {
		const transactions = [
			makeTx({
				id: 'borrow',
				description: 'LOAN DISBURSEMENT ACME',
				amount: -15000,
				accountId: 'acc-1',
				clearedDate: '2026-01-01T00:00:00.000Z'
			}),
			makeTx({
				id: 'return',
				description: 'LOAN DISBURSEMENT ACME RETURN',
				amount: 15000,
				accountId: 'acc-1',
				clearedDate: '2026-02-01T00:00:00.000Z'
			})
		];

		expect(pairInSameCluster(transactions, 'borrow', 'return')).toBe(false);
	});

	it('clusters true subscription occurrences with stable amount and cadence', () => {
		const transactions = [
			makeTx({
				id: 'netflix-1',
				description: 'NETFLIX SUBSCRIPTION',
				amount: -599,
				accountId: 'card-1',
				clearedDate: '2026-01-10T00:00:00.000Z'
			}),
			makeTx({
				id: 'netflix-2',
				description: 'NETFLIX SUBSCRIPTION',
				amount: -599,
				accountId: 'card-1',
				clearedDate: '2026-02-10T00:00:00.000Z'
			}),
			makeTx({
				id: 'netflix-3',
				description: 'NETFLIX SUBSCRIPTION',
				amount: -599,
				accountId: 'card-1',
				clearedDate: '2026-03-10T00:00:00.000Z'
			})
		];

		const groups = clusterIds(transactions, 2);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toEqual(['netflix-1', 'netflix-2', 'netflix-3']);
	});
});
