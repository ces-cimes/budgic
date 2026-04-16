import type { Transaction, Category } from '$lib/core/db';

type WaterfallTier = Category['waterfallTier'];

export interface ClassificationCandidate {
	patternKey: string;
	suggestedTier: WaterfallTier;
	matchedTransactionIds: string[];
	allowanceImpact: number;
	cadence: 'monthly' | 'weekly' | 'irregular';
	confidence: number;
	reason: string;
}

const RENT_REGEX = /rent|housing|lease|аренда|жиль/i;
const SUBSCRIPTION_REGEX = /netflix|spotify|apple|google|яндекс|amediateka|okko/i;
const LOAN_REGEX = /loan|кредит|ипотека|долг|payment/i;
const FEE_REGEX = /fee|commission|обслуживание|комиссия/i;

function normalizeKey(tx: Transaction): string {
	return (tx.description || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getCadence(dates: Date[]): 'monthly' | 'weekly' | 'irregular' {
	if (dates.length < 2) return 'irregular';
	const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
	const deltas = sorted.slice(1).map((d, i) => (d.getTime() - sorted[i].getTime()) / 86_400_000);
	const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length;
	if (avg >= 25 && avg <= 35) return 'monthly';
	if (avg >= 6 && avg <= 8) return 'weekly';
	return 'irregular';
}

function confidenceForCadence(cadence: 'monthly' | 'weekly' | 'irregular', occurrences: number): number {
	const base = cadence === 'monthly' ? 0.75 : cadence === 'weekly' ? 0.65 : 0.45;
	return Math.min(0.95, base + Math.min(0.2, occurrences * 0.03));
}

export function detectEssentials(
	transactions: Transaction[],
	monthlyIncome: number
): ClassificationCandidate[] {
	const valid = transactions.filter((tx) => tx.status === 'cleared' && !!tx.clearedDate);
	const totalSpend = valid
		.filter((tx) => tx.type === 'expense')
		.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
	const avgMonthlySpend = totalSpend > 0 ? totalSpend : 1;

	const groups = new Map<string, Transaction[]>();
	for (const tx of valid) {
		const key = normalizeKey(tx);
		if (!key) continue;
		const arr = groups.get(key) ?? [];
		arr.push(tx);
		groups.set(key, arr);
	}

	const out: ClassificationCandidate[] = [];

	for (const [patternKey, group] of groups.entries()) {
		const dates = group.map((tx) => new Date(tx.clearedDate!));
		const cadence = getCadence(dates);
		const ids = group.map((tx) => tx.id);
		const expenseAmounts = group.filter((tx) => tx.type === 'expense').map((tx) => Math.abs(tx.amount || 0));
		const avgExpense = expenseAmounts.length
			? expenseAmounts.reduce((a, b) => a + b, 0) / expenseAmounts.length
			: 0;
		const allowanceImpact = totalSpend > 0 ? avgExpense / totalSpend : 0;
		const confidence = confidenceForCadence(cadence, group.length);

		const dayOfMonthAligned = dates.some((d) => {
			const day = d.getDate();
			return Math.abs(day - 1) <= 3 || day >= 28;
		});

		if (
			group.length >= 2 &&
			avgExpense > monthlyIncome * 0.15 &&
			dayOfMonthAligned &&
			(RENT_REGEX.test(patternKey) || cadence === 'monthly')
		) {
			out.push({
				patternKey,
				suggestedTier: 'survival',
				matchedTransactionIds: ids,
				allowanceImpact,
				cadence,
				confidence,
				reason: 'Recurring housing-like charge near month boundary'
			});
			continue;
		}

		const incomeAmounts = group.filter((tx) => tx.type === 'income').map((tx) => Math.abs(tx.amount || 0));
		const avgIncome = incomeAmounts.length
			? incomeAmounts.reduce((a, b) => a + b, 0) / incomeAmounts.length
			: 0;
		if (group.length >= 2 && avgIncome > avgMonthlySpend * 0.3 && cadence === 'monthly') {
			out.push({
				patternKey,
				suggestedTier: 'survival',
				matchedTransactionIds: ids,
				allowanceImpact: Math.min(1, avgIncome / Math.max(avgMonthlySpend, 1)),
				cadence,
				confidence: Math.min(0.9, confidence + 0.1),
				reason: 'Large recurring income source'
			});
			continue;
		}

		if (avgExpense >= 2 && avgExpense <= 3000 && cadence === 'monthly' && SUBSCRIPTION_REGEX.test(patternKey)) {
			out.push({
				patternKey,
				suggestedTier: 'lifestyle',
				matchedTransactionIds: ids,
				allowanceImpact,
				cadence,
				confidence,
				reason: 'Recurring subscription pattern'
			});
			continue;
		}

		if (group.length >= 2 && cadence === 'monthly' && LOAN_REGEX.test(patternKey)) {
			out.push({
				patternKey,
				suggestedTier: 'security',
				matchedTransactionIds: ids,
				allowanceImpact,
				cadence,
				confidence,
				reason: 'Recurring loan repayment pattern'
			});
			continue;
		}

		const isSavingsTransfer = group.every(
			(tx) => tx.type === 'transfer' && Math.abs((tx.transferDetails?.transferAmount ?? tx.amount ?? 0)) > 0
		);
		if (isSavingsTransfer && cadence === 'monthly') {
			out.push({
				patternKey,
				suggestedTier: 'security',
				matchedTransactionIds: ids,
				allowanceImpact,
				cadence,
				confidence,
				reason: 'Recurring savings contribution transfer'
			});
			continue;
		}

		if (avgExpense < 500 && group.length >= 2 && FEE_REGEX.test(patternKey)) {
			out.push({
				patternKey,
				suggestedTier: 'security',
				matchedTransactionIds: ids,
				allowanceImpact,
				cadence,
				confidence: Math.min(0.85, confidence),
				reason: 'Recurring bank fee pattern'
			});
		}
	}

	return out.sort((a, b) => b.allowanceImpact - a.allowanceImpact);
}
