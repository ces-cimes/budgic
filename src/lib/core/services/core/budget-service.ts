import {
	db,
	generateUUID,
	isAnalyticsTier,
	transactionAutomationCountsInAnalytics
} from '$lib/core/db';
import type { Category, Transaction } from '$lib/core/db';
import type { AnalyticsTier } from '$lib/core/db';
import type { AllowanceConfidence } from '$lib/core/db';
import { differenceInCalendarMonths, startOfMonth } from 'date-fns';
import { recurringTransactionIntelligenceService } from '../analytics/recurring-transaction-intelligence-service';

interface BudgetAllocation {
	categoryId: string;
	categoryName: string;
	allocatedAmount: number;
	spentAmount: number;
	remainingAmount: number;
	percentageUsed: number;
	waterfallTier: Category['waterfallTier'];
	priority: number;
}

export interface BudgetSummary {
	totalAllocated: number;
	totalSpent: number;
	totalRemaining: number;
	allocations: BudgetAllocation[];
	byTier: Record<
		AnalyticsTier,
		{
			allocated: number;
			spent: number;
			remaining: number;
		}
	>;
	confidence: AllowanceConfidence;
	unclassifiedTransactionCount: number;
}

export interface CategoryUsage {
	categoryId: string;
	spent: number;
	budget: number | null;
	usageRatio: number | null;
	color: 'green' | 'amber' | 'red' | 'gray';
}

/** Phase 5.1 — forward allowance projection (committed / planned / uncertainty) */
export interface AllowanceProjection {
	committed: number;
	planned: number;
	uncertaintyBand: number;
	available: number;
	availableMin: number;
	availableMax: number;
	confidence: AllowanceConfidence;
	periodIncome: number;
	recoveryDeduction: number;
	debtOverflowShortfall: number;
	activeDebtGroupIds: string[];
	hasAcknowledgedDebtInPeriod: boolean;
	recoveryWeeksEstimate: number | null;
	periodStart: string;
	periodEnd: string;
	currency: string;
}

function remainingCalendarMonthsInclusive(today: Date, deadline: Date): number {
	if (deadline.getTime() <= today.getTime()) return 0;
	const smToday = startOfMonth(today);
	const smDeadline = startOfMonth(deadline);
	const diff = differenceInCalendarMonths(smDeadline, smToday) + 1;
	return Math.max(1, diff);
}

/**
 * Phase 5.2 — proportional chunk of a deadline-based planned expense for the current allowance period.
 */
export function computeDeadlineChunk(
	tx: Pick<Transaction, 'amount' | 'plannedAmount' | 'deadline' | 'spreadingStrategy'>,
	currentPeriodStart: Date,
	currentPeriodEnd: Date,
	today: Date
): number {
	void currentPeriodStart;
	void currentPeriodEnd;
	const raw = Math.abs(tx.plannedAmount ?? tx.amount ?? 0);
	if (!tx.deadline) return raw;
	const deadline = new Date(tx.deadline);
	if (deadline.getTime() <= today.getTime()) {
		return raw;
	}
	const remainingPeriods = remainingCalendarMonthsInclusive(today, deadline);
	if (remainingPeriods <= 0) return raw;
	const baseChunk = raw / remainingPeriods;
	const strategy = tx.spreadingStrategy ?? 'linear';
	switch (strategy) {
		case 'front-loaded':
			return baseChunk * 1.3;
		case 'back-loaded':
			return baseChunk * 0.7;
		default:
			return baseChunk;
	}
}

class BudgetService {
	private projectionCache: AllowanceProjection | null = null;
	private projectionCacheExpiry = 0;
	private readonly PROJECTION_CACHE_TTL = 2 * 60 * 1000;

	/** Invalidate the projection cache (call after any transaction or preference write). */
	invalidateProjectionCache(): void {
		this.projectionCache = null;
		this.projectionCacheExpiry = 0;
	}

	public get ready() {
		return Promise.resolve();
	}

	public isLoading() {
		return false;
	}

	// ============================================================================
	// BUDGET MANAGEMENT
	// ============================================================================

	/**
	 * Get budget summary for all categories (converted to main currency)
	 */
	async getBudgetSummary(): Promise<BudgetSummary> {
		const categories = await db.getActiveCategories();
		const transactions = await db.transactions.toArray();
		const accounts = await db.getActiveAccounts();
		const prefs = await db.userPreferences.toCollection().first();
		const reimbursementAllowanceMode =
			prefs?.reimbursementAllowanceMode === 'optimistic' ? 'optimistic' : 'conservative';
		const creditPaymentTransferIds = this.detectCreditPaymentTransfers(transactions, accounts);

		const nowForBudget = new Date();
		const budgetPeriodStart = new Date(nowForBudget.getFullYear(), nowForBudget.getMonth(), 1);
		const mainCurrency = prefs?.currency ?? 'USD';

		const allocations: BudgetAllocation[] = [];
		let totalAllocated = 0;
		let totalSpent = 0;
		let exactSpend = 0;
		let unclassifiedSpend = 0;
		let unclassifiedTransactionCount = 0;
		const categoryById = new Map(categories.map((category) => [category.id, category]));

		// Calculate budget allocations for each category
		for (const category of categories) {
			if (category.budgetAmount && category.budgetAmount > 0) {
				const spentAmount = await this.calculateCategorySpending(
					category.id,
					transactions,
					creditPaymentTransferIds,
					mainCurrency,
					budgetPeriodStart
				);
				const remainingAmount = category.budgetAmount - spentAmount;
				const percentageUsed =
					category.budgetAmount > 0 ? (spentAmount / category.budgetAmount) * 100 : 0;

				allocations.push({
					categoryId: category.id,
					categoryName: category.name,
					allocatedAmount: category.budgetAmount,
					spentAmount,
					remainingAmount,
					percentageUsed,
					waterfallTier: category.waterfallTier,
					priority: category.priority
				});

				totalAllocated += category.budgetAmount;
				totalSpent += spentAmount;
			}
		}

		// Calculate by tier
		const byTier: Record<
			AnalyticsTier,
			{ allocated: number; spent: number; remaining: number }
		> = {
			survival: { allocated: 0, spent: 0, remaining: 0 },
			security: { allocated: 0, spent: 0, remaining: 0 },
			growth: { allocated: 0, spent: 0, remaining: 0 },
			lifestyle: { allocated: 0, spent: 0, remaining: 0 }
		};

		allocations.forEach((allocation) => {
			const tier = allocation.waterfallTier;
			if (!isAnalyticsTier(tier)) {
				return;
			}
			byTier[tier].allocated += allocation.allocatedAmount;
			byTier[tier].spent += allocation.spentAmount;
			byTier[tier].remaining += allocation.remainingAmount;
		});

		for (const tx of transactions) {
			if (tx.type !== 'expense' || tx.status !== 'cleared') continue;
			if (!transactionAutomationCountsInAnalytics(tx)) continue;
			if (creditPaymentTransferIds.has(tx.id)) continue;

			const tier = tx.categoryId ? categoryById.get(tx.categoryId)?.waterfallTier : undefined;
			let amount = Math.abs(tx.amount || 0);
			if (reimbursementAllowanceMode === 'optimistic' && tx.reimbursements?.length) {
				const openExpected = tx.reimbursements
					.filter((entry) => entry.direction === 'lending' && entry.status === 'expecting')
					.reduce((sum, entry) => sum + entry.amount, 0);
				amount = Math.max(0, amount - openExpected);
			}
			amount = await this.convertToMainCurrency(
				amount,
				tx.currency ?? mainCurrency,
				mainCurrency,
				tx.clearedDate ? new Date(tx.clearedDate) : undefined
			);
			if (isAnalyticsTier(tier)) {
				exactSpend += amount;
			} else {
				unclassifiedSpend += amount;
				unclassifiedTransactionCount += 1;
			}
		}

		const inferredSpend = 0;
		const totalSpend = exactSpend + inferredSpend + unclassifiedSpend;
		const ratio = totalSpend > 0 ? exactSpend / totalSpend : 0;
		const confidence: AllowanceConfidence = {
			exactSpend,
			inferredSpend,
			unclassifiedSpend,
			totalSpend,
			ratio,
			tier: ratio < 0.5 ? 'low' : ratio <= 0.85 ? 'medium' : 'high'
		};

		return {
			totalAllocated,
			totalSpent,
			totalRemaining: totalAllocated - totalSpent,
			allocations,
			byTier,
			confidence,
			unclassifiedTransactionCount
		};
	}

	/**
	 * Set budget amount for a category
	 */
	async setCategoryBudget(categoryId: string, amount: number): Promise<void> {
		const category = await db.categories.get(categoryId);
		if (!category) {
			throw new Error(`Category ${categoryId} not found`);
		}

		await db.categories.update(categoryId, {
			budgetAmount: amount,
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Get budget for a specific category
	 */
	async getCategoryBudget(categoryId: string): Promise<BudgetAllocation | null> {
		const category = await db.categories.get(categoryId);
		if (!category || !category.budgetAmount) {
			return null;
		}

		const transactions = await db.transactions.toArray();
		const prefs = await db.userPreferences.toCollection().first();
		const mainCurrency = prefs?.currency ?? 'USD';
		const now = new Date();
		const budgetPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
		const spentAmount = await this.calculateCategorySpending(
			categoryId,
			transactions,
			new Set(),
			mainCurrency,
			budgetPeriodStart
		);
		const remainingAmount = category.budgetAmount - spentAmount;
		const percentageUsed =
			category.budgetAmount > 0 ? (spentAmount / category.budgetAmount) * 100 : 0;

		return {
			categoryId: category.id,
			categoryName: category.name,
			allocatedAmount: category.budgetAmount,
			spentAmount,
			remainingAmount,
			percentageUsed,
			waterfallTier: category.waterfallTier,
			priority: category.priority
		};
	}

	async getCategoryUsage(): Promise<Map<string, CategoryUsage>> {
		const categories = await db.getActiveCategories();
		const transactions = await db.transactions.toArray();
		const accounts = await db.getActiveAccounts();
		const prefs = await db.userPreferences.toCollection().first();
		const mainCurrency = prefs?.currency ?? 'USD';
		const creditPaymentTransferIds = this.detectCreditPaymentTransfers(transactions, accounts);
		const now = new Date();
		const budgetPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);

		const usage = new Map<string, CategoryUsage>();
		for (const category of categories) {
			const budget = category.budgetAmount && category.budgetAmount > 0 ? category.budgetAmount : null;
			let spent = 0;
			if (budget !== null) {
				spent = await this.calculateCategorySpending(
					category.id,
					transactions,
					creditPaymentTransferIds,
					mainCurrency,
					budgetPeriodStart
				);
			}

			const usageRatio = budget !== null && budget > 0 ? spent / budget : null;
			usage.set(category.id, {
				categoryId: category.id,
				spent,
				budget,
				usageRatio,
				color:
					usageRatio === null
						? 'gray'
						: usageRatio > 0.9
							? 'red'
							: usageRatio >= 0.7
								? 'amber'
								: 'green'
			});
		}
		return usage;
	}

	/**
	 * Get budget recommendations based on spending patterns
	 */
	async getBudgetRecommendations(): Promise<
		{
			categoryId: string;
			categoryName: string;
			currentSpending: number;
			recommendedBudget: number;
			reasoning: string;
		}[]
	> {
		const categories = await db.getActiveCategories();
		const transactions = await db.transactions.toArray();
		const recommendations: {
			categoryId: string;
			categoryName: string;
			currentSpending: number;
			recommendedBudget: number;
			reasoning: string;
		}[] = [];

		// Calculate average spending over last 3 months
		const threeMonthsAgo = new Date();
		threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
		const recentTransactions = transactions.filter(
			(tx: Transaction) => tx.clearedDate && new Date(tx.clearedDate) >= threeMonthsAgo
		);

		// Get user's main currency
		const { userService, exchangeRateService } = await import('$lib/core/services');
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';

		for (const category of categories) {
			const categoryTransactions = recentTransactions.filter(
				(tx: Transaction) =>
					tx.categoryId === category.id &&
					(tx.type !== 'expense' || transactionAutomationCountsInAnalytics(tx))
			);

			// Convert all amounts to main currency
			let totalSpending = 0;
			for (const tx of categoryTransactions) {
				if (tx.type === 'expense') {
					const amount = Math.abs(tx.amount || 0);
					const transactionCurrency = tx.currency || mainCurrency;

					let convertedAmount = amount;
					if (transactionCurrency !== mainCurrency) {
						const converted = await exchangeRateService.convertAmount(
							amount,
							transactionCurrency,
							mainCurrency,
							tx.clearedDate ? new Date(tx.clearedDate) : undefined
						);
						if (converted !== null) {
							convertedAmount = converted;
						} else {
							console.warn(
								`Failed to convert ${transactionCurrency} to ${mainCurrency} for transaction ${tx.id}`
							);
						}
					}

					totalSpending += convertedAmount;
				}
			}

			const averageMonthlySpending = totalSpending / 3;
			const recommendedBudget = averageMonthlySpending * 1.1; // 10% buffer

			if (averageMonthlySpending > 0) {
				recommendations.push({
					categoryId: category.id,
					categoryName: category.name,
					currentSpending: averageMonthlySpending,
					recommendedBudget,
					reasoning: `Based on ${categoryTransactions.length} transactions over the last 3 months`
				});
			}
		}

		return recommendations.sort((a, b) => b.currentSpending - a.currentSpending);
	}

	/**
	 * Get budget alerts (over budget categories)
	 */
	async getBudgetAlerts(): Promise<
		{
			categoryId: string;
			categoryName: string;
			allocatedAmount: number;
			spentAmount: number;
			overageAmount: number;
			percentageOver: number;
		}[]
	> {
		const budgetSummary = await this.getBudgetSummary();
		const alerts: {
			categoryId: string;
			categoryName: string;
			allocatedAmount: number;
			spentAmount: number;
			overageAmount: number;
			percentageOver: number;
		}[] = [];

		budgetSummary.allocations.forEach((allocation) => {
			if (allocation.spentAmount > allocation.allocatedAmount) {
				alerts.push({
					categoryId: allocation.categoryId,
					categoryName: allocation.categoryName,
					allocatedAmount: allocation.allocatedAmount,
					spentAmount: allocation.spentAmount,
					overageAmount: allocation.spentAmount - allocation.allocatedAmount,
					percentageOver: allocation.percentageUsed - 100
				});
			}
		});

		return alerts.sort((a, b) => b.percentageOver - a.percentageOver);
	}

	/**
	 * Get waterfall budget progress
	 */
	async getWaterfallProgress(): Promise<
		{
			tier: Category['waterfallTier'];
			totalAllocated: number;
			totalSpent: number;
			remaining: number;
			percentageUsed: number;
			categories: BudgetAllocation[];
		}[]
	> {
		const budgetSummary = await this.getBudgetSummary();
		const tierProgress: {
			tier: Category['waterfallTier'];
			totalAllocated: number;
			totalSpent: number;
			remaining: number;
			percentageUsed: number;
			categories: BudgetAllocation[];
		}[] = [];

		const tiers = ['survival', 'security', 'growth', 'lifestyle'] as const;

		tiers.forEach((tier) => {
			const tierCategories = budgetSummary.allocations.filter((a) => a.waterfallTier === tier);
			const tierData = budgetSummary.byTier[tier];

			tierProgress.push({
				tier,
				totalAllocated: tierData.allocated,
				totalSpent: tierData.spent,
				remaining: tierData.remaining,
				percentageUsed: tierData.allocated > 0 ? (tierData.spent / tierData.allocated) * 100 : 0,
				categories: tierCategories.sort((a, b) => a.priority - b.priority)
			});
		});

		return tierProgress;
	}

	/**
	 * Phase 5.1–5.4 — three-layer forward allowance projection for the current calendar month.
	 */
	async getAllowanceProjection(): Promise<AllowanceProjection> {
		const nowMs = Date.now();
		if (this.projectionCache && this.projectionCacheExpiry > nowMs) {
			return this.projectionCache;
		}
		const result = await this._computeAllowanceProjection();
		this.projectionCache = result;
		this.projectionCacheExpiry = Date.now() + this.PROJECTION_CACHE_TTL;
		return result;
	}

	private async _computeAllowanceProjection(): Promise<AllowanceProjection> {
		const now = new Date();
		const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
		const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
		const categories = await db.getActiveCategories();
		const transactions = await db.transactions.toArray();
		const accounts = await db.getActiveAccounts();
		const prefs = await db.userPreferences.toCollection().first();
		const reimbursementAllowanceMode =
			prefs?.reimbursementAllowanceMode === 'optimistic' ? 'optimistic' : 'conservative';
		const creditPaymentTransferIds = this.detectCreditPaymentTransfers(transactions, accounts);
		const categoryById = new Map(categories.map((c) => [c.id, c]));
		const userCurrency = prefs?.currency ?? 'USD';

		const budgetSummary = await this.getBudgetSummary();
		const confidence = budgetSummary.confidence;

		const daysInPeriod = Math.max(
			1,
			Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86_400_000)
		);
		const daysElapsed = Math.max(
			1,
			Math.ceil((Math.min(now.getTime(), periodEnd.getTime()) - periodStart.getTime()) / 86_400_000)
		);
		const daysRemaining = Math.max(
			1,
			Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000)
		);

		// Build a lookup from txId → currency for pattern currency inference
		const txCurrencyById = new Map(transactions.map((t) => [t.id, t.currency ?? userCurrency]));

		let periodIncome = 0;
		for (const tx of transactions) {
			if (tx.deletedAt || tx.type !== 'income') continue;
			const d =
				tx.status === 'cleared' && tx.clearedDate
					? new Date(tx.clearedDate)
					: tx.status === 'planned' && tx.plannedDate
						? new Date(tx.plannedDate)
						: null;
			if (!d || d < periodStart || d > periodEnd) continue;
			periodIncome += await this.convertToMainCurrency(
				tx.amount ?? 0,
				tx.currency ?? userCurrency,
				userCurrency,
				d
			);
		}

		// Uncertainty band: use trailing 90-day spend (FX-converted), not all-time totalSpend
		const ninetyDaysAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
		let trailing90Spend = 0;
		for (const tx of transactions) {
			if (tx.type !== 'expense' || tx.status !== 'cleared' || !tx.clearedDate || tx.deletedAt) continue;
			const cd = new Date(tx.clearedDate);
			if (cd < ninetyDaysAgo || cd > now) continue;
			if (!transactionAutomationCountsInAnalytics(tx)) continue;
			if (creditPaymentTransferIds.has(tx.id)) continue;
			trailing90Spend += await this.convertToMainCurrency(
				Math.abs(tx.amount || 0),
				tx.currency ?? userCurrency,
				userCurrency,
				cd
			);
		}
		const trailingMonthlyAvg =
			trailing90Spend > 0 ? (trailing90Spend / 90) * 30.44 : 0;
		const uncertaintyBand = Math.min(
			(1 - confidence.ratio) * trailingMonthlyAvg * 0.2 * (daysRemaining / daysInPeriod),
			periodIncome * 0.5
		);

		let committed = 0;
		const clearedIdsThisMonth = new Set<string>();
		for (const tx of transactions) {
			if (tx.type !== 'expense' || tx.status !== 'cleared' || !tx.clearedDate || tx.deletedAt) continue;
			const cd = new Date(tx.clearedDate);
			if (cd < periodStart || cd > now) continue;
			if (!transactionAutomationCountsInAnalytics(tx)) continue;
			if (creditPaymentTransferIds.has(tx.id)) continue;
			const tier = tx.categoryId ? categoryById.get(tx.categoryId)?.waterfallTier : undefined;
			if (!isAnalyticsTier(tier)) continue;
			let amount = Math.abs(tx.amount || 0);
			if (reimbursementAllowanceMode === 'optimistic' && tx.reimbursements?.length) {
				const openExpected = tx.reimbursements
					.filter((e) => e.direction === 'lending' && e.status === 'expecting')
					.reduce((s, e) => s + e.amount, 0);
				amount = Math.max(0, amount - openExpected);
			}
			committed += await this.convertToMainCurrency(amount, tx.currency ?? userCurrency, userCurrency, cd);
			clearedIdsThisMonth.add(tx.id);
		}

		for (const tx of transactions) {
			if (tx.deletedAt || tx.status !== 'planned' || tx.type !== 'expense') continue;
			if (!tx.plannedDate) continue;
			const pd = new Date(tx.plannedDate);
			if (pd < periodStart || pd > periodEnd) continue;
			const ref = tx.reference ?? '';
			if (ref.startsWith('loan_schedule:') || ref.startsWith('repayment:')) {
				committed += await this.convertToMainCurrency(
					Math.abs(tx.plannedAmount ?? tx.amount ?? 0),
					tx.currency ?? userCurrency,
					userCurrency,
					pd
				);
			}
		}

		let patterns: Awaited<ReturnType<typeof recurringTransactionIntelligenceService.detectPatterns>> =
			[];
		try {
			patterns = await recurringTransactionIntelligenceService.detectPatterns(365, 3);
		} catch {
			patterns = [];
		}
		for (const p of patterns) {
			if (p.confidence <= 90) continue;
			const metaType = p.metadata?.type;
			if (metaType && metaType !== 'expense') continue;
			if (!p.isActive) continue;
			if (p.matchingTransactionIds.some((id) => clearedIdsThisMonth.has(id))) continue;
			// Infer currency from the first known matching transaction
			const patternCurrency = txCurrencyById.get(p.matchingTransactionIds[0]) ?? userCurrency;
			committed += await this.convertToMainCurrency(
				Math.abs(p.averageAmount),
				patternCurrency,
				userCurrency
			);
		}

		let planned = 0;
		const plannedExpenseIds = new Set<string>();
		for (const tx of transactions) {
			if (tx.deletedAt || tx.status !== 'planned' || tx.type !== 'expense') continue;
			if (!tx.plannedDate) continue;
			const pd = new Date(tx.plannedDate);
			if (pd < periodStart || pd > periodEnd) continue;
			const ref = tx.reference ?? '';
			if (ref.startsWith('loan_schedule:') || ref.startsWith('repayment:')) continue;
			plannedExpenseIds.add(tx.id);
			const rawChunk = tx.deadline
				? computeDeadlineChunk(tx, periodStart, periodEnd, now)
				: Math.abs(tx.plannedAmount ?? tx.amount ?? 0);
			planned += await this.convertToMainCurrency(rawChunk, tx.currency ?? userCurrency, userCurrency, pd);
		}

		for (const p of patterns) {
			if (p.confidence < 70 || p.confidence > 90) continue;
			const metaType = p.metadata?.type;
			if (metaType && metaType !== 'expense') continue;
			if (!p.isActive) continue;
			const hasPlannedOverlap = p.matchingTransactionIds.some((id) => plannedExpenseIds.has(id));
			if (hasPlannedOverlap) continue;
			const patternCurrency = txCurrencyById.get(p.matchingTransactionIds[0]) ?? userCurrency;
			planned += await this.convertToMainCurrency(
				Math.abs(p.averageAmount),
				patternCurrency,
				userCurrency
			);
		}

		const recoveryAgg = prefs?.recoveryAggressiveness ?? 0.2;
		const recoveryActive = prefs?.debtRecoveryActive ?? false;
		const recoveryDeduction = recoveryActive ? recoveryAgg * periodIncome : 0;

		const available = periodIncome - committed - planned - recoveryDeduction;
		const availableMin = available - uncertaintyBand;
		const availableMax = periodIncome - committed;

		const debtOverflowShortfall = Math.max(0, committed + planned - periodIncome);
		const activeDebtGroupIds = new Set<string>();
		if (debtOverflowShortfall > 0) {
			for (const tx of transactions) {
				if (tx.deletedAt || tx.status !== 'planned' || tx.type !== 'expense') continue;
				if (!tx.debtGroupId) continue;
				if (!tx.plannedDate) continue;
				const pd = new Date(tx.plannedDate);
				if (pd < periodStart || pd > periodEnd) continue;
				activeDebtGroupIds.add(tx.debtGroupId);
			}
		}

		const hasAcknowledgedDebtInPeriod = transactions.some(
			(tx) =>
				!tx.deletedAt &&
				Boolean(tx.acknowledgedDebtPeriod) &&
				Boolean(tx.debtGroupId) &&
				tx.status === 'planned'
		);

		let recoveryWeeksEstimate: number | null = null;
		if (hasAcknowledgedDebtInPeriod && debtOverflowShortfall > 0) {
			const weeklyRoom = Math.max(
				0.01,
				(periodIncome * (1 - recoveryAgg) - committed) / 4.33
			);
			recoveryWeeksEstimate = Math.ceil(debtOverflowShortfall / weeklyRoom);
		}

		return {
			committed,
			planned,
			uncertaintyBand,
			available,
			availableMin,
			availableMax,
			confidence,
			periodIncome,
			recoveryDeduction,
			debtOverflowShortfall,
			activeDebtGroupIds: Array.from(activeDebtGroupIds),
			hasAcknowledgedDebtInPeriod,
			recoveryWeeksEstimate,
			periodStart: periodStart.toISOString(),
			periodEnd: periodEnd.toISOString(),
			currency: userCurrency
		};
	}

	/**
	 * Phase 5.3 — mark all planned transactions in a debt group as acknowledged for this period.
	 */
	async acknowledgeIntentionalDebt(
		debtGroupId: string,
		periodKey: string
	): Promise<void> {
		const prefsRow = await db.userPreferences.toCollection().first();
		if (!prefsRow) return;
		const mergedAck = {
			...(prefsRow.debtAcknowledgedPeriodByGroup ?? {}),
			[debtGroupId]: periodKey
		};
		await db.userPreferences.update(prefsRow.id, {
			debtAcknowledgedPeriodByGroup: mergedAck,
			debtRecoveryActive: true,
			updatedAt: new Date().toISOString()
		});

		const txs = await db.transactions.toArray();
		for (const tx of txs) {
			if (tx.debtGroupId === debtGroupId && tx.status === 'planned' && !tx.deletedAt) {
				await db.transactions.update(tx.id, {
					acknowledgedDebtPeriod: true,
					updatedAt: new Date().toISOString()
				});
			}
		}
	}

	/**
	 * Phase 5.3 — dismiss debt prompt for this group/period without acknowledging.
	 */
	async dismissDebtPromptForPeriod(debtGroupId: string, periodKey: string): Promise<void> {
		const prefsRow = await db.userPreferences.toCollection().first();
		if (!prefsRow) return;
		const merged = {
			...(prefsRow.debtPromptDismissedPeriodByGroup ?? {}),
			[debtGroupId]: periodKey
		};
		await db.userPreferences.update(prefsRow.id, {
			debtPromptDismissedPeriodByGroup: merged,
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Get all budget categories (for compatibility with old interface)
	 */
	async getBudgetCategories(): Promise<Category[]> {
		return await db.getActiveCategories();
	}

	/**
	 * Update a budget category (for compatibility with old interface)
	 */
	async updateBudgetCategory(categoryId: string, updates: Partial<Category>): Promise<void> {
		const category = await db.categories.get(categoryId);
		if (!category) {
			throw new Error(`Category ${categoryId} not found`);
		}

		await db.categories.update(categoryId, {
			...updates,
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Create a new category
	 */
	async createCategory(categoryData: {
		name: string;
		type: Category['type'];
		waterfallTier?: Category['waterfallTier'];
		priority: number;
		budgetAmount?: number;
		color?: string;
		description?: string;
		isActive?: boolean;
	}): Promise<Category> {
		const category: Category = {
			id: generateUUID(),
			name: categoryData.name,
			type: categoryData.type,
			waterfallTier: categoryData.waterfallTier ?? 'unclassified',
			priority: categoryData.priority,
			budgetAmount: categoryData.budgetAmount,
			color: categoryData.color,
			description: categoryData.description,
			isActive: categoryData.isActive ?? true,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};

		await db.categories.add(category);
		return category;
	}

	// ============================================================================
	// PRIVATE METHODS
	// ============================================================================

	/**
	 * Calculate spending for a category
	 */
	/**
	 * Convert an amount from txCurrency to mainCurrency using the exchange rate service.
	 * Falls back to the raw amount if a rate is unavailable.
	 */
	private async convertToMainCurrency(
		amount: number,
		txCurrency: string,
		mainCurrency: string,
		date?: Date
	): Promise<number> {
		if (!txCurrency || txCurrency === mainCurrency) return amount;
		const { exchangeRateService } = await import('$lib/core/services');
		const converted = await exchangeRateService.convertAmount(amount, txCurrency, mainCurrency, date);
		return converted ?? amount;
	}

	/**
	 * Cleared spend for a category in the current calendar month (periodStart → now), in main currency.
	 */
	private async calculateCategorySpending(
		categoryId: string,
		transactions: Transaction[],
		excludedIds: Set<string>,
		mainCurrency: string,
		periodStart: Date
	): Promise<number> {
		const now = new Date();
		let sum = 0;
		for (const tx of transactions) {
			if (excludedIds.has(tx.id)) continue;
			if (tx.categoryId !== categoryId) continue;
			if (tx.type !== 'expense' || tx.status !== 'cleared') continue;
			if (!transactionAutomationCountsInAnalytics(tx)) continue;
			if (!tx.clearedDate) continue;
			const cd = new Date(tx.clearedDate);
			if (cd < periodStart || cd > now) continue;
			sum += await this.convertToMainCurrency(
				Math.abs(tx.amount || 0),
				tx.currency ?? mainCurrency,
				mainCurrency,
				cd
			);
		}
		return sum;
	}

	private detectCreditPaymentTransfers(
		transactions: Transaction[],
		accounts: Array<{ id: string; type: string }>
	): Set<string> {
		const creditIds = new Set(accounts.filter((a) => a.type === 'credit').map((a) => a.id));
		const result = new Set<string>();
		if (creditIds.size === 0) return result;

		const expensesByCredit = new Map<string, Transaction[]>();
		for (const tx of transactions) {
			if (
				tx.type === 'expense' &&
				tx.status === 'cleared' &&
				tx.accountId &&
				creditIds.has(tx.accountId)
			) {
				const list = expensesByCredit.get(tx.accountId) ?? [];
				list.push(tx);
				expensesByCredit.set(tx.accountId, list);
			}
		}

		for (const tx of transactions) {
			if (tx.type !== 'transfer' || tx.status !== 'cleared') continue;
			const targetId = tx.transferDetails?.toAccountId ?? tx.toAccountId;
			if (!targetId || !creditIds.has(targetId)) continue;
			const transferAmount = Math.abs(tx.transferDetails?.transferAmount ?? tx.amount ?? 0);
			if (transferAmount <= 0) continue;
			const candidateExpenses = expensesByCredit.get(targetId) ?? [];
			const hasMatch = candidateExpenses.some((expenseTx) => {
				const expenseAmount = Math.abs(expenseTx.amount ?? 0);
				if (Math.abs(expenseAmount - transferAmount) > 0.01) return false;
				const expenseDate = new Date(expenseTx.clearedDate ?? expenseTx.createdAt).getTime();
				const transferDate = new Date(tx.clearedDate ?? tx.createdAt).getTime();
				const sameMonth =
					new Date(expenseDate).getUTCFullYear() === new Date(transferDate).getUTCFullYear() &&
					new Date(expenseDate).getUTCMonth() === new Date(transferDate).getUTCMonth();
				return sameMonth;
			});
			if (hasMatch) result.add(tx.id);
		}

		return result;
	}
}

export const budgetService = new BudgetService();
