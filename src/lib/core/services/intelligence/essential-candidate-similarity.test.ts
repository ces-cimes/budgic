import { describe, expect, it } from 'vitest';

import type { Transaction } from '$lib/core/db';

import type { ClassificationCandidate } from './essential-detector';
import { expandEssentialCandidatesWithSimilarity } from './essential-candidate-similarity';

function makeExpense(
	id: string,
	description: string,
	amount: number,
	clearedDate = '2026-03-01T10:00:00.000Z'
): Transaction {
	return {
		id,
		type: 'expense',
		status: 'cleared',
		amount,
		currency: 'USD',
		description,
		accountId: 'acc-x',
		clearedDate,
		createdAt: clearedDate,
		updatedAt: clearedDate,
		deletedAt: null
	} as Transaction;
}

describe('expandEssentialCandidatesWithSimilarity', () => {
	it('merges typo variants into one candidate', () => {
		const pool: Transaction[] = [
			makeExpense('a', 'Netflix subscription', -15.99, '2026-03-05T08:00:00.000Z'),
			makeExpense('b', 'netflix subscripton', -15.99, '2026-04-05T08:00:00.000Z'),
			makeExpense('c', 'Coffee shop', -4, '2026-03-06T08:00:00.000Z')
		];
		const candidate: ClassificationCandidate = {
			patternKey: 'netflix subscription',
			suggestedTier: 'lifestyle',
			matchedTransactionIds: ['a'],
			allowanceImpact: 0.1,
			cadence: 'monthly',
			confidence: 0.7,
			reason: 'Test seed'
		};
		const out = expandEssentialCandidatesWithSimilarity([candidate], pool);
		expect(out[0].matchedTransactionIds.sort()).toEqual(['a', 'b'].sort());
		expect(out[0].reason).toContain('merged similar');
	});
});
