import { db, generateUUID, type MerchantCategoryProfile, type Transaction } from '$lib/core/db';
import {
	hasSplit,
	resolveSplit,
	splitRepresentativeRow,
	transactionHasExistingSplit,
	type TransactionSplit
} from '$lib/utils/transaction-split';
import { persistRetrospectiveWeightedSplit } from '$lib/utils/split-persist';
import { normaliseMerchantKey } from '$lib/utils/transfer-utils';
import {
	applySliceObservation,
	recomputeStability,
	welfordPassesForSplit,
	type ProfileWeightRow
} from './merchant-profile-welford';

type ProfileWeight = ProfileWeightRow;

/** Cleared expense or income — eligible for merchant split learning (not transfers). */
function isMerchantLearningTransaction(tx: Transaction): boolean {
	return tx.status === 'cleared' && (tx.type === 'expense' || tx.type === 'income');
}

class MerchantProfileService {
	public get ready() {
		return db.isOpen();
	}

	async getProfile(
		merchantKey: string,
		accountId?: string
	): Promise<MerchantCategoryProfile | null> {
		const rows = await db.merchantCategoryProfiles
			.where('merchantKey')
			.equals(merchantKey)
			.toArray();
		const want = accountId ?? '';
		const match = rows.find((p) => (p.accountId ?? '') === want);
		return match ?? null;
	}

	/**
	 * Stable learned split for autocomplete when profile is mature enough.
	 */
	async suggestWeights(
		merchantKey: string,
		accountId?: string
	): Promise<{
		weights: { categoryId: string; weight: number }[];
		stability: number;
		totalObservations: number;
	} | null> {
		const p = await this.getProfile(merchantKey, accountId);
		if (!p || p.totalObservations < 5 || p.stability < 0.7) return null;
		const weights = p.weights
			.filter((w) => w.observationCount > 0 && w.meanWeight > 0)
			.map((w) => ({ categoryId: w.categoryId, weight: w.meanWeight }));
		if (weights.length < 2) return null;
		return { weights, stability: p.stability, totalObservations: p.totalObservations };
	}

	/**
	 * Accumulate merchant → category weight stats from a cleared expense or income (Phase 9.5).
	 * Partitioned groups: one observation per `split.id` (representative row only).
	 */
	async onTransactionSaved(tx: Transaction): Promise<void> {
		if (!isMerchantLearningTransaction(tx)) return;
		const key = normaliseMerchantKey(tx.description ?? '');
		if (!key) return;

		let members: Transaction[] | undefined;
		if (tx.groupId) {
			members = await db.transactions
				.where('groupId')
				.equals(tx.groupId)
				.filter((t) => !t.deletedAt)
				.toArray();
			if (members.length > 0) {
				const rep = splitRepresentativeRow(members);
				if (tx.id !== rep.id) return;
			}
		}

		const split = resolveSplit(tx, members);
		const slices: { categoryId: string; weight: number }[] =
			split && hasSplit(split)
				? split.slices.map((s) => ({ categoryId: s.categoryId, weight: s.share }))
				: tx.categoryId
					? [{ categoryId: tx.categoryId, weight: 1 }]
					: [];
		if (slices.length === 0) return;

		const welfordPasses = welfordPassesForSplit(split);

		const accountId = tx.accountId;
		const existing = await this.getProfile(key, accountId);
		const now = new Date().toISOString();

		const weightByCat = new Map<string, ProfileWeight>();
		if (existing) {
			for (const w of existing.weights) {
				weightByCat.set(w.categoryId, { ...w });
			}
		}

		for (const { categoryId, weight } of slices) {
			const prev =
				weightByCat.get(categoryId) ??
				({
					categoryId,
					meanWeight: 0,
					stdDev: 0,
					observationCount: 0,
					weightM2: 0
				} as ProfileWeight);
			weightByCat.set(categoryId, applySliceObservation(prev, weight, welfordPasses));
		}

		const weights = Array.from(weightByCat.values());
		const totalObservations = (existing?.totalObservations ?? 0) + 1;
		const stability = recomputeStability(weights);

		const payload: MerchantCategoryProfile = {
			id: existing?.id ?? generateUUID(),
			merchantKey: key,
			accountId,
			weights,
			totalObservations,
			stability,
			lastUpdated: now,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
			deletedAt: null
		};

		if (existing) {
			await db.merchantCategoryProfiles.put(payload);
		} else {
			await db.merchantCategoryProfiles.add(payload);
		}
	}

	/**
	 * Bulk-apply mean split to historical cleared expenses (Phase 9.5 retrospective).
	 * Skips partitioned groups and rows that already have soft splits (B-Split Phase 2 guard).
	 */
	async applyRetrospectiveSplits(
		merchantKey: string,
		accountId: string | undefined,
		transactionIds: string[]
	): Promise<number> {
		const profile = await this.getProfile(merchantKey, accountId);
		if (!profile || profile.stability < 0.85 || profile.totalObservations < 8) return 0;

		const raw = profile.weights.filter((w) => w.meanWeight > 0 && w.observationCount > 0);
		if (raw.length < 2) return 0;
		const sum = raw.reduce((s, w) => s + w.meanWeight, 0);
		if (sum < 1e-9) return 0;
		const normalized = raw.map((w) => ({
			categoryId: w.categoryId,
			weight: w.meanWeight / sum
		}));
		const primary = normalized.reduce((a, b) => (b.weight > a.weight ? b : a), normalized[0]);

		let updated = 0;
		for (const id of transactionIds) {
			const tx = await db.transactions.get(id);
			if (!tx || tx.deletedAt || !isMerchantLearningTransaction(tx)) continue;
			if (normaliseMerchantKey(tx.description ?? '') !== merchantKey) continue;
			if ((tx.accountId ?? '') !== (accountId ?? '')) continue;
			if (transactionHasExistingSplit(tx)) continue;

			const applied = await persistRetrospectiveWeightedSplit(
				id,
				normalized,
				primary.categoryId
			);
			if (applied) updated++;
		}
		return updated;
	}

	/**
	 * Run {@link applyRetrospectiveSplits} for every merchant+account bucket that has eligible history.
	 */
	async applyAllRetrospectiveEligible(): Promise<number> {
		const txs = await db.transactions
			.filter(
				(t) =>
					!t.deletedAt &&
					t.status === 'cleared' &&
					(t.type === 'expense' || t.type === 'income')
			)
			.toArray();
		const byKey = new Map<string, string[]>();
		for (const t of txs) {
			const mk = normaliseMerchantKey(t.description ?? '');
			if (!mk) continue;
			const key = `${mk}|||${t.accountId ?? ''}`;
			const arr = byKey.get(key) ?? [];
			arr.push(t.id);
			byKey.set(key, arr);
		}
		let total = 0;
		for (const [key, ids] of byKey) {
			const sep = key.indexOf('|||');
			const mk = key.slice(0, sep);
			const accStr = key.slice(sep + 3);
			const accountId = accStr === '' ? undefined : accStr;
			total += await this.applyRetrospectiveSplits(mk, accountId, ids);
		}
		return total;
	}

	/**
	 * User dismissed a goal-relative split nudge ("No") — slightly down-weight that category in the profile.
	 */
	async applyNegativeCategoryHint(
		merchantKey: string,
		accountId: string | undefined,
		categoryId: string
	): Promise<void> {
		const existing = await this.getProfile(merchantKey, accountId);
		if (!existing) return;
		const now = new Date().toISOString();
		const weights = existing.weights.map((w) => {
			if (w.categoryId !== categoryId) return { ...w };
			const nextMean = Math.max(0, w.meanWeight - 0.04);
			return { ...w, meanWeight: nextMean };
		});
		const stability = recomputeStability(weights);
		await db.merchantCategoryProfiles.put({
			...existing,
			weights,
			stability,
			lastUpdated: now,
			updatedAt: now
		});
	}
}

export const merchantProfileService = new MerchantProfileService();
