/**
 * Account-scoped spending pace (not household allowance).
 */

import type { Account, Transaction } from '$lib/core/db';
import { db, expenseCountsTowardAllowanceAnalytics } from '$lib/core/db';
import { transactionService } from './transaction-service';

export type AccountVelocityLabel = 'slower' | 'similar' | 'faster' | 'no_prior_data';

export interface AccountPaceResult {
	currency: string;
	mtdSpend: number;
	priorPeriodSpend: number;
	velocityRatio: number | null;
	velocityLabel: AccountVelocityLabel;
	daysElapsedInMonth: number;
}

async function sumAccountExpensesInRange(
	transactions: Transaction[],
	accountId: string,
	mainCurrency: string,
	rangeStart: Date,
	rangeEnd: Date,
	tierByCategoryId: Map<string, string | undefined>
): Promise<number> {
	const { exchangeRateService } = await import('$lib/core/services');
	let total = 0;
	for (const tx of transactions) {
		if (tx.accountId !== accountId || tx.type !== 'expense' || tx.status !== 'cleared') continue;
		if (!tx.clearedDate) continue;
		const tier = tx.categoryId ? tierByCategoryId.get(tx.categoryId) : undefined;
		if (!expenseCountsTowardAllowanceAnalytics(tx, tier)) continue;
		const cd = new Date(tx.clearedDate);
		if (cd < rangeStart || cd > rangeEnd) continue;
		const amount = Math.abs(tx.amount || 0);
		const txCurrency = tx.currency || mainCurrency;
		let converted = amount;
		if (txCurrency !== mainCurrency) {
			const conv = await exchangeRateService.convertAmount(amount, txCurrency, mainCurrency, cd);
			if (conv !== null) converted = conv;
		}
		total += converted;
	}
	return total;
}

export async function getAccountPace(account: Account): Promise<AccountPaceResult> {
	const now = new Date();
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	const daysElapsed = Math.max(1, now.getDate());

	const priorStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const priorEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
	const priorRangeEnd = new Date(
		priorStart.getFullYear(),
		priorStart.getMonth(),
		Math.min(daysElapsed, priorEnd.getDate()),
		23,
		59,
		59,
		999
	);

	const prefs = await db.userPreferences.toCollection().first();
	const mainCurrency = prefs?.currency ?? account.currency ?? 'USD';
	const categories = await db.getActiveCategories();
	const tierByCategoryId = new Map(categories.map((c) => [c.id, c.waterfallTier]));
	const transactions = await transactionService.getTransactionsByAccount(account.id);

	const [mtdSpend, priorPeriodSpend] = await Promise.all([
		sumAccountExpensesInRange(
			transactions,
			account.id,
			mainCurrency,
			monthStart,
			now,
			tierByCategoryId
		),
		sumAccountExpensesInRange(
			transactions,
			account.id,
			mainCurrency,
			priorStart,
			priorRangeEnd,
			tierByCategoryId
		)
	]);

	let velocityRatio: number | null = null;
	let velocityLabel: AccountVelocityLabel = 'no_prior_data';
	if (priorPeriodSpend > 0) {
		velocityRatio = mtdSpend / priorPeriodSpend;
		if (velocityRatio > 1.1) velocityLabel = 'faster';
		else if (velocityRatio < 0.9) velocityLabel = 'slower';
		else velocityLabel = 'similar';
	} else if (mtdSpend > 0) {
		velocityLabel = 'faster';
		velocityRatio = null;
	}

	return {
		currency: mainCurrency,
		mtdSpend,
		priorPeriodSpend,
		velocityRatio,
		velocityLabel,
		daysElapsedInMonth: daysElapsed
	};
}
