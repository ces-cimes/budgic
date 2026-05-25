<script lang="ts">
	/**
	 * Patterns tab content aligned with UX_SPEC §3.4:
	 * Spending pulse, Recurring, Anomalies, Your patterns, Upcoming.
	 * Spending primary; app usage secondary and de-emphasized.
	 */
	import { onMount } from 'svelte';
	import { EmptyState } from '$lib/components/ui/empty-state';
	import {
		insightsService,
		recurringTransactionIntelligenceService,
		transactionService,
		budgetService,
		merchantProfileService
	} from '$lib/core/services';
	import { invalidateAll } from '$app/navigation';
	import type { RecurringPattern } from '$lib/core/services/analytics/recurring-transaction-intelligence-service';
	import type { Category, Insight } from '$lib/core/db';
	import { formatAmount, formatTransactionAmount } from '$lib/utils/currency-utils';
	import { isAnomalyDismissed, dismissAnomaly } from '$lib/stores/dismissed-anomalies.svelte';
	import { db } from '$lib/core/db';
	import BehavioralPatterns from './BehavioralPatterns.svelte';
	import AppUsageAnalytics from './AppUsageAnalytics.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { toast } from 'svelte-sonner';
	import RecurringPatternPanel from './RecurringPatternPanel.svelte';
	import ReviewSession from '$lib/components/review/ReviewSession.svelte';
	import { ChevronRight } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { tierChipDefs, tierActiveClasses } from '$lib/insights/recurring-tier-presets';
	import { crossRouteSyncService } from '$lib/core/services/analytics/cross-route-sync-service';

	type Phase8Surface = {
		spendComparativeLine: string | null;
		incomeComparativeLine: string | null;
		savingsTrendSymbol: string | null;
		feeDriftLine: string | null;
		shadowCategoryViewEnabled?: boolean;
		shadowEstimatedNote?: string | null;
	};

	type AnomalyRow = {
		type: 'unusual_amount' | 'unusual_timing' | 'unusual_category';
		transactionId: string;
		description?: string;
		amount?: number;
		currency?: string;
		txType?: 'expense' | 'income' | 'transfer' | 'adjustment';
		categoryName?: string;
		/** Human-readable explanation, e.g. "3.2× your typical 38 000 ₽" */
		context?: string;
		/** patternId of the recurring pattern this anomaly relates to, if any */
		relatedPatternId?: string;
	};

	type PatternStatsRow = {
		peakDay: string;
		peakTime: string;
		biggestCategory: string;
		mostFrequentCategory: string;
		avgAmount: number;
	};

	interface Props {
		isLoading: boolean;
		userCurrency: string;
		className?: string;
		/** When set (e.g. from /insights?insightType=…), show matching stored insights at top. */
		insightTypeFilter?: string;
		/** False when Insights tab is not Patterns (inactive panels stay mounted). */
		patternsTabActive?: boolean;
		/** Increment from parent on manual refresh to bypass navigation cache. */
		patternsDataNonce?: number;
	}

	const {
		isLoading: parentLoading = false,
		userCurrency = 'USD',
		className = '',
		insightTypeFilter,
		patternsTabActive = true,
		patternsDataNonce = 0
	}: Props = $props();

	let spendingPulse = $state<string>('Loading your spending pulse…');
	let isNewUser = $state(false);
	type RecurringRow = {
		patternId: string;
		description: string;
		amount: string;
		nextDate: string;
		inferred: boolean;
		allowanceImpact: number;
		needsReview: boolean;
		type: 'expense' | 'income' | 'transfer' | undefined;
		waterfallTier: NonNullable<import('$lib/core/db').Category['waterfallTier']> | undefined;
		/** 0–100 from recurring intelligence `confidence` */
		confidence: number;
	};
	let recurringList = $state<RecurringRow[]>([]);

	type PatternsTabCacheSnapshot = {
		spendingPulse: string;
		isNewUser: boolean;
		recurringList: RecurringRow[];
		dataQualityRatio: number | null;
		unclassifiedTxCount: number;
		phase8Surface: Phase8Surface | null;
		anomalies: AnomalyRow[];
		patternStats: PatternStatsRow | null;
		upcomingSummary: string;
		upcomingWeekAmount: number | null;
	};

	let patternsTabCacheKey = '';
	let patternsTabCache: PatternsTabCacheSnapshot | null = null;

	let dataQualityRatio = $state<number | null>(null);
	let unclassifiedTxCount = $state(0);
	let phase8Surface = $state<Phase8Surface | null>(null);
	let anomalies = $state<AnomalyRow[]>([]);
	let patternStats = $state<PatternStatsRow | null>(null);
	let upcomingSummary = $state<string>('');
	let upcomingWeekAmount = $state<number | null>(null);
	let loading = $state(true);
	let loadingPatterns = $state(false);
	let reviewSessionOpen = $state(false);
	let reviewUrlHandled = $state(false);
	let retrospectiveApplying = $state(false);
	let recurringPanelOpen = $state(false);
	let selectedPatternId = $state<string | null>(null);
	let alertTypeInsights = $state<Insight[]>([]);

	function clearInsightTypeFilter() {
		const url = new URL($page.url);
		url.searchParams.delete('insightType');
		goto(url.pathname + url.search, { replaceState: true, noScroll: true });
	}

	/** Phase 9.7 — guided review session from plan/allowance nudge (`reviewSession=1`) or legacy `review=1`. */
	$effect(() => {
		if (!patternsTabActive) return;
		const url = $page.url;
		const want =
			url.searchParams.get('reviewSession') === '1' || url.searchParams.get('review') === '1';
		if (!want || reviewUrlHandled) return;
		reviewUrlHandled = true;
		reviewSessionOpen = true;
		const next = new URL(url);
		next.searchParams.delete('reviewSession');
		next.searchParams.delete('review');
		void goto(`${next.pathname}${next.search}`, { replaceState: true, noScroll: true });
	});

	$effect(() => {
		if (reviewSessionOpen) return;
		reviewUrlHandled = false;
	});

	$effect(() => {
		const t = insightTypeFilter;
		if (!t || typeof window === 'undefined') {
			alertTypeInsights = [];
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const all = await insightsService.getInsights();
				if (cancelled) return;
				alertTypeInsights = all.filter((i) => i.isActive && i.type === t);
			} catch {
				if (!cancelled) alertTypeInsights = [];
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	function formatPeakTime(hour: number): string {
		const period = hour >= 12 ? 'PM' : 'AM';
		const h = hour % 12 || 12;
		return `${h}:00 ${period}`;
	}

	function anomalyTypeLabel(
		type: 'unusual_amount' | 'unusual_timing' | 'unusual_category'
	): string {
		switch (type) {
			case 'unusual_amount':
				return 'Unusual amount';
			case 'unusual_timing':
				return 'Unusual timing';
			case 'unusual_category':
				return 'Unusual category';
			default:
				return 'Anomaly';
		}
	}

	function anomalyBadgeClass(
		type: 'unusual_amount' | 'unusual_timing' | 'unusual_category'
	): string {
		switch (type) {
			case 'unusual_amount':
				return 'bg-[var(--color-warm-coral)]/15 text-[var(--color-warm-coral)] border border-[var(--color-warm-coral)]/40';
			case 'unusual_timing':
				return 'bg-[var(--color-info)]/15 text-[var(--color-info)] border border-[var(--color-info)]/40';
			case 'unusual_category':
				return 'bg-[var(--color-amber)]/15 text-[var(--color-amber)] border border-[var(--color-amber)]/40';
			default:
				return 'bg-muted text-muted-foreground border border-border';
		}
	}

	function patternMonthlyEstimate(p: RecurringPattern): number {
		const a = Math.abs(p.averageAmount);
		switch (p.frequency) {
			case 'daily':
				return a * 30;
			case 'weekly':
				return a * (365 / 7 / 12);
			case 'biweekly':
				return a * (365 / 14 / 12);
			case 'monthly':
				return a;
			case 'quarterly':
				return a / 3;
			case 'yearly':
				return a / 12;
			default:
				return a;
		}
	}

	function patternNeedsReviewHeuristic(p: RecurringPattern): boolean {
		const relVar =
			Math.abs(p.averageAmount) > 0.01
				? (p.amountVariability / Math.abs(p.averageAmount)) * 100
				: 0;
		return relVar > 40 || p.categoryConfidence < 45 || !p.learnedCategoryId;
	}

	function baseConfidenceDots(confidence: number): 1 | 2 | 3 {
		if (confidence < 50) return 1;
		if (confidence < 80) return 2;
		return 3;
	}

	function recurringConfidenceDotCount(item: RecurringRow): number {
		if (item.waterfallTier === undefined) return 0;
		const base = baseConfidenceDots(item.confidence);
		if (item.waterfallTier === 'unclassified') return Math.min(1, base);
		return base;
	}

	function recurringConfidenceAria(dotCount: number): string {
		if (dotCount <= 0) return 'Recurring pattern: tier not assigned — confidence not shown';
		if (dotCount === 1) return 'Pattern confidence: low';
		if (dotCount === 2) return 'Pattern confidence: medium';
		return 'Pattern confidence: high';
	}

	async function buildRecurringRows(
		patterns: RecurringPattern[],
		currency: string,
		totalMonthlySpend: number
	): Promise<RecurringRow[]> {
		const rows: RecurringRow[] = [];
		for (const p of patterns) {
			const pred = await recurringTransactionIntelligenceService.predictNextOccurrence(p.id);
			const pm = patternMonthlyEstimate(p);
			const allowanceImpact = totalMonthlySpend > 0 ? pm / totalMonthlySpend : 0;
			const rawType = p.metadata?.type;
			const txType: RecurringRow['type'] =
				rawType === 'expense' || rawType === 'income' || rawType === 'transfer'
					? rawType
					: undefined;
			const approxPrefix =
				p.patternType === 'approximate' || p.patternType === 'seasonal' ? '~' : '';
			rows.push({
				patternId: p.id,
				description: p.metadata?.notes || p.descriptionPattern || 'Recurring',
				amount: pred
					? `${approxPrefix}${formatAmount(pred.predictedAmount, p.metadata?.currency || currency)}`
					: '—',
				nextDate: pred?.nextOccurrenceDate
					? new Date(pred.nextOccurrenceDate).toLocaleDateString('en-US', {
							month: 'short',
							day: 'numeric'
						})
					: '—',
				inferred: p.patternType === 'approximate' || p.patternType === 'seasonal',
				allowanceImpact,
				needsReview: patternNeedsReviewHeuristic(p),
				type: txType,
				waterfallTier: p.learnedCategoryId
					? (await db.categories.get(p.learnedCategoryId))?.waterfallTier
					: undefined,
				confidence: typeof p.confidence === 'number' ? p.confidence : 0
			});
		}
		// Sort: no tier first (needs action), then explicitly unclassified, then assigned — all by impact within group
		rows.sort(recurringRowComparator);
		return rows;
	}

	/** Stable sort used in buildRecurringRows and after recurring list refresh */
	function recurringRowComparator(a: RecurringRow, b: RecurringRow): number {
		const tierOrder = (t: RecurringRow['waterfallTier']) =>
			t === undefined ? 0 : t === 'unclassified' ? 1 : 2;
		const ord = tierOrder(a.waterfallTier) - tierOrder(b.waterfallTier);
		return ord !== 0 ? ord : b.allowanceImpact - a.allowanceImpact;
	}

	function handleDataQualityBarClick() {
		if (unclassifiedTxCount > 0) {
			reviewSessionOpen = true;
		}
	}

	async function applyRetrospectiveBulk() {
		if (retrospectiveApplying) return;
		retrospectiveApplying = true;
		try {
			const n = await merchantProfileService.applyAllRetrospectiveEligible();
			if (n === 0) {
				toast.message('No updates applied', {
					description:
						'Stable multi-category merchant profiles need at least 8 observations and 85% stability.'
				});
			} else {
				toast.success(`Applied learned splits to ${n} transaction(s).`);
				await invalidateAll();
			}
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Bulk apply failed');
		} finally {
			retrospectiveApplying = false;
		}
	}

	async function refreshRecurringFromServices(currency: string) {
		const cutoff90 = new Date();
		cutoff90.setDate(cutoff90.getDate() - 90);
		const rangeStart = cutoff90.toISOString();
		const rangeEnd = new Date().toISOString();
		const [summary, recurringPatterns, rangeTxs] = await Promise.all([
			budgetService.getBudgetSummary(),
			recurringTransactionIntelligenceService.detectPatterns(90, 2),
			transactionService.getTransactionsByDateRange(rangeStart, rangeEnd)
		]);
		dataQualityRatio = summary?.confidence?.ratio ?? null;
		unclassifiedTxCount = summary?.unclassifiedTransactionCount ?? 0;
		const cleared = (rangeTxs || []).filter((t) => t && !t.deletedAt && t.status === 'cleared');
		const expenseSum = cleared
			.filter((t) => t.type === 'expense')
			.reduce((s, t) => s + Math.abs(t.amount || 0), 0);
		const months = 90 / 30;
		const totalMonthlySpend = months > 0 ? expenseSum / months : 0;

		// Snapshot tiers that are already known (e.g. from an optimistic patch) so that a
		// learnedCategoryId mismatch in the rebuilt rows doesn't wipe them out and cause a flicker.
		const knownTiers = new Map(recurringList.map((r) => [r.patternId, r.waterfallTier]));

		const rebuilt = await buildRecurringRows(recurringPatterns, currency, totalMonthlySpend);
		// Merge: if the rebuild couldn't resolve a tier (undefined) but we already knew it, keep it.
		recurringList = rebuilt
			.map((r) => ({
				...r,
				waterfallTier: r.waterfallTier ?? knownTiers.get(r.patternId)
			}))
			.sort(recurringRowComparator);
		// Invalidate navigation cache so restored state matches fresh recurring rows
		patternsTabCacheKey = '';
		patternsTabCache = null;
	}

	function applyPatternsCache(s: PatternsTabCacheSnapshot) {
		spendingPulse = s.spendingPulse;
		isNewUser = s.isNewUser;
		recurringList = s.recurringList;
		dataQualityRatio = s.dataQualityRatio;
		unclassifiedTxCount = s.unclassifiedTxCount;
		phase8Surface = s.phase8Surface;
		anomalies = s.anomalies;
		patternStats = s.patternStats;
		upcomingSummary = s.upcomingSummary;
		upcomingWeekAmount = s.upcomingWeekAmount;
	}

	function capturePatternsCache(): PatternsTabCacheSnapshot {
		return {
			spendingPulse,
			isNewUser,
			recurringList: recurringList.map((r) => ({ ...r })),
			dataQualityRatio,
			unclassifiedTxCount,
			phase8Surface: phase8Surface ? { ...phase8Surface } : null,
			anomalies: anomalies.map((a) => ({ ...a })),
			patternStats: patternStats ? { ...patternStats } : null,
			upcomingSummary,
			upcomingWeekAmount
		};
	}

	async function loadPatternsHeavy(options?: { force?: boolean }) {
		const rev = crossRouteSyncService.getSurfaceDataRevision();
		const cacheKey = `${rev}:${userCurrency}`;
		if (!options?.force && patternsTabCache && patternsTabCacheKey === cacheKey) {
			applyPatternsCache(patternsTabCache);
			loading = false;
			return;
		}

		loading = true;
		try {
			// === Tier 1: fast data — unblock the loading spinner immediately ===
			const [behavioral, budgetSummary] = await Promise.all([
				insightsService.getBehavioralPatternInsights(),
				budgetService.getBudgetSummary()
			]);
			dataQualityRatio = budgetSummary?.confidence?.ratio ?? null;
			unclassifiedTxCount = budgetSummary?.unclassifiedTransactionCount ?? 0;
			loading = false;
			loadingPatterns = true;

			// === Tier 2: heavy data — fill in while UI is already showing ===
			const days = 90;
			const cutoff90 = new Date();
			cutoff90.setDate(cutoff90.getDate() - days);
			const rangeStart = cutoff90.toISOString();
			const rangeEnd = new Date().toISOString();

			const [patternsResult, patterns120, firstCleared, rangeTxs] = await Promise.all([
				insightsService.analyzeSpendingPatternsAsync(days),
				recurringTransactionIntelligenceService.detectPatterns(120, 3),
				db.transactions
					.orderBy('clearedDate')
					.filter(
						(t) =>
							Boolean(t) &&
							!t.deletedAt &&
							t.status === 'cleared' &&
							typeof t.clearedDate === 'string'
					)
					.first(),
				transactionService.getTransactionsByDateRange(rangeStart, rangeEnd)
			]);
			const surface = await insightsService.getPhase8PatternsSurfaceMetrics(
				userCurrency,
				patterns120
			);
			phase8Surface = surface;

			const cleared = (rangeTxs || []).filter((t) => t && !t.deletedAt && t.status === 'cleared');
			const firstTx = firstCleared ?? null;
			const firstDate = firstTx
				? new Date(firstTx.clearedDate || firstTx.createdAt || 0)
				: new Date();
			const daysSinceFirst = (Date.now() - firstDate.getTime()) / (24 * 60 * 60 * 1000);
			isNewUser = daysSinceFirst < 14;

			if (isNewUser) {
				spendingPulse =
					"We're building your picture. Keep logging transactions and we'll start spotting patterns in about 2 weeks.";
			} else if (behavioral?.length > 0) {
				// Never use "Predictions Updated" / "X predictions available" as pulse — reserve for real spending summary only
				const spendingInsight = behavioral.find(
					(i) =>
						i.title !== 'Predictions Updated' &&
						!(
							i.description?.toLowerCase().includes('prediction') &&
							i.description?.toLowerCase().includes('available')
						)
				);
				if (spendingInsight) {
					const text = [spendingInsight.description, spendingInsight.title]
						.filter(Boolean)
						.join(' ')
						.trim();
					spendingPulse =
						text || 'Your spending looks consistent. No notable patterns to highlight this week.';
				} else {
					spendingPulse =
						'Your spending looks consistent. No notable patterns to highlight this week.';
				}
			} else {
				spendingPulse =
					'Your spending looks consistent. No notable patterns to highlight this week.';
			}

			// Recurring — allowance-impact sort (Phase 8)
			const expenseSum = cleared
				.filter((t) => t.type === 'expense')
				.reduce((s, t) => s + Math.abs(t.amount || 0), 0);
			const months = days / 30;
			const totalMonthlySpend = months > 0 ? expenseSum / months : 0;
			const recurringPatterns = await recurringTransactionIntelligenceService.detectPatterns(90, 2);
			recurringList = await buildRecurringRows(recurringPatterns, userCurrency, totalMonthlySpend);

			// Unusual Activity: only surface unusual_amount anomalies — the most actionable type.
			// unusual_timing / unusual_category are low-signal without additional context.
			const rawAnomalies = (patternsResult.anomalyPatterns || [])
				.filter((a) => a.type === 'unusual_amount')
				.slice(0, 8);
			const enriched: AnomalyRow[] = [];
			for (const a of rawAnomalies) {
				const tx = await transactionService.getTransaction(a.transactionId);
				let categoryName: string | undefined;
				if (tx?.categoryId) {
					const cat = await db.categories.get(tx.categoryId);
					categoryName = cat?.name;
				}
				const rawAmount = tx?.amount ?? 0;
				const displayAmount =
					tx?.type === 'expense'
						? -Math.abs(rawAmount)
						: tx?.type === 'income'
							? Math.abs(rawAmount)
							: rawAmount;

				// Find a related recurring pattern to give the anomaly context
				const matchingPattern = recurringPatterns.find(
					(p) =>
						p.matchingTransactionIds.includes(a.transactionId) ||
						(tx?.description &&
							p.descriptionPattern &&
							tx.description.toLowerCase().includes(p.descriptionPattern.toLowerCase()))
				);
				let context: string | undefined;
				if (matchingPattern && matchingPattern.averageAmount > 0) {
					const ratio = Math.abs(rawAmount) / matchingPattern.averageAmount;
					const typical = formatAmount(matchingPattern.averageAmount, tx?.currency ?? userCurrency);
					context = `${ratio.toFixed(1)}× your typical ${typical}`;
				}

				enriched.push({
					type: a.type,
					transactionId: a.transactionId,
					description: tx?.description || 'Transaction',
					amount: displayAmount,
					currency: tx?.currency,
					txType: tx?.type,
					categoryName,
					context,
					relatedPatternId: matchingPattern?.id
				});
			}
			anomalies = enriched;

			// Your patterns (compact stats)
			const tp = patternsResult.timingPatterns;
			const vp = patternsResult.velocityPatterns;
			const cp = patternsResult.categoryPatterns || [];
			const biggest = cp[0];
			const mostFreq = [...cp].sort((a, b) => (b.frequency || 0) - (a.frequency || 0))[0];
			patternStats = {
				peakDay: tp?.mostActiveDay || '—',
				peakTime: tp?.mostActiveHour != null ? formatPeakTime(tp.mostActiveHour) : '—',
				biggestCategory: biggest?.categoryName || '—',
				mostFrequentCategory: mostFreq?.categoryName || '—',
				avgAmount: vp?.averageTransactionAmount ?? 0
			};

			// Upcoming (one-line predicted spending this week)
			const weekStart = new Date();
			weekStart.setDate(weekStart.getDate() - weekStart.getDay());
			weekStart.setHours(0, 0, 0, 0);
			const weekEnd = new Date(weekStart);
			weekEnd.setDate(weekEnd.getDate() + 7);
			let weekTotal = 0;
			for (const p of recurringPatterns) {
				const pred = await recurringTransactionIntelligenceService.predictNextOccurrence(p.id);
				if (pred?.nextOccurrenceDate) {
					const d = new Date(pred.nextOccurrenceDate);
					if (d >= weekStart && d < weekEnd) weekTotal += pred.predictedAmount || 0;
				}
			}
			if (weekTotal > 0) {
				upcomingWeekAmount = weekTotal;
				upcomingSummary = `Expected recurring spending this week: ~${formatAmount(weekTotal, userCurrency)}.`;
			} else {
				upcomingWeekAmount = null;
				upcomingSummary = 'No major recurring spending predicted this week.';
			}

			const revAfter = crossRouteSyncService.getSurfaceDataRevision();
			patternsTabCacheKey = `${revAfter}:${userCurrency}`;
			patternsTabCache = capturePatternsCache();
		} catch (e) {
			console.error('PatternsTabContent load error:', e);
			spendingPulse = 'Unable to load patterns right now. Try refreshing.';
			recurringList = [];
			anomalies = [];
			patternStats = {
				peakDay: '—',
				peakTime: '—',
				biggestCategory: '—',
				mostFrequentCategory: '—',
				avgAmount: 0
			};
			upcomingSummary = 'Prediction unavailable.';
			upcomingWeekAmount = null;
		} finally {
			loading = false;
			loadingPatterns = false;
		}
	}

	onMount(() => {
		void loadPatternsHeavy();
	});

	let lastPatternsDataNonce = $state(-1);
	$effect(() => {
		const n = patternsDataNonce;
		if (n <= 0 || n === lastPatternsDataNonce) return;
		lastPatternsDataNonce = n;
		void loadPatternsHeavy({ force: true });
	});
</script>

<div class="patterns-tab {className}">
	<div class="space-y-6 py-2 sm:py-4">
		{#if parentLoading || loading}
			<div class="space-y-4">
				<Skeleton class="h-20 w-full rounded-xl bg-[var(--color-bg-tertiary)]" />
				<div class="grid grid-cols-2 gap-2">
					{#each Array(4) as _}
						<Skeleton class="h-16 w-full rounded-lg bg-[var(--color-bg-tertiary)]" />
					{/each}
				</div>
			</div>
		{:else}
			{#if insightTypeFilter && alertTypeInsights.length > 0}
				<section class="border-border bg-muted/30 mb-4 rounded-xl border px-4 py-3">
					<div class="mb-2 flex items-start justify-between gap-2">
						<h2
							class="text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							From alerts ({insightTypeFilter})
						</h2>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 shrink-0 text-xs"
							onclick={clearInsightTypeFilter}
						>
							Clear filter
						</Button>
					</div>
					<ul class="space-y-2">
						{#each alertTypeInsights as ins (ins.id)}
							<li class="text-sm">
								<p class="text-foreground font-medium">{ins.title}</p>
								<p class="text-muted-foreground mt-0.5 text-xs">{ins.message}</p>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			<!-- 1. Spending pulse (UX_SPEC §3.4) -->
			<section>
				<h2
					class="mb-2 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Spending pulse
				</h2>
				<div
					class="squircle-2xl squircle-border bg-card min-h-[3rem] space-y-1.5 px-4 py-3 text-sm"
				>
					<p class="relative z-[2] text-[var(--color-text-secondary)]">
						{spendingPulse ||
							'Your spending at a glance. Add more transactions to see patterns here.'}
					</p>
					{#if phase8Surface}
						{#if phase8Surface.spendComparativeLine}
							<p class="text-muted-foreground text-xs">{phase8Surface.spendComparativeLine}</p>
						{/if}
						{#if phase8Surface.incomeComparativeLine}
							<p class="text-muted-foreground text-xs">{phase8Surface.incomeComparativeLine}</p>
						{/if}
						{#if phase8Surface.savingsTrendSymbol}
							<p class="text-muted-foreground text-xs">
								Savings contributions trend: {phase8Surface.savingsTrendSymbol}
							</p>
						{/if}
						{#if phase8Surface.feeDriftLine}
							<p class="text-muted-foreground text-xs">{phase8Surface.feeDriftLine}</p>
						{/if}
						{#if phase8Surface.shadowEstimatedNote}
							<p class="text-muted-foreground text-xs italic">
								{phase8Surface.shadowEstimatedNote}
							</p>
						{/if}
					{/if}
				</div>
			</section>

			{#if dataQualityRatio != null}
				<section id="insights-data-quality">
					<button
						type="button"
						class="border-border bg-card hover:bg-muted/40 squircle-2xl squircle-border w-full px-4 py-3 text-left transition-colors"
						onclick={handleDataQualityBarClick}
					>
						<div class="mb-2 flex items-center justify-between gap-2">
							<span class="text-muted-foreground text-xs font-semibold tracking-widest uppercase"
								>Data quality</span
							>
							<span class="text-foreground text-sm font-medium"
								>{Math.round(dataQualityRatio * 100)}% classified</span
							>
						</div>
						<Progress value={Math.round(dataQualityRatio * 100)} max={100} class="h-1.5" />
						{#if unclassifiedTxCount > 0}
							<p class="text-muted-foreground mt-2 text-xs">
								Tap to review unclassified transactions.
							</p>
						{/if}
					</button>
				</section>
			{/if}

			{#if !loading}
				<section class="border-border bg-card mt-3 rounded-xl border px-4 py-3">
					<p class="text-muted-foreground mb-2 text-xs">
						When merchant profiles are very stable, apply their mean split to past matching cleared
						expenses (optional).
					</p>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						class="text-xs"
						disabled={retrospectiveApplying}
						onclick={() => void applyRetrospectiveBulk()}
					>
						{retrospectiveApplying ? 'Applying…' : 'Apply learned splits to history'}
					</Button>
				</section>
			{/if}

			<!-- 2. Recurring (transaction-like cards) -->
			<section>
				<h2
					class="mb-2 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Recurring
				</h2>
				{#if loadingPatterns && recurringList.length === 0}
					<Skeleton class="h-10 w-full rounded-lg bg-[var(--color-bg-tertiary)]" />
				{:else if recurringList.length === 0}
					<EmptyState body="No recurring transactions detected yet." class="py-0" />
				{:else}
					<ul class="space-y-2">
						{#each recurringList as item}
							{@const isUnassigned = item.waterfallTier === undefined}
							{@const dotN = recurringConfidenceDotCount(item)}
							<li
								class="bg-card rounded-xl border-2 {isUnassigned
									? 'border-amber-400/40 dark:border-amber-500/30'
									: 'border-border'}"
							>
								<button
									type="button"
									class="hover:bg-muted/30 focus-visible:ring-ring flex w-full items-center gap-2 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2"
									onclick={() => {
										selectedPatternId = item.patternId;
										recurringPanelOpen = true;
									}}
								>
									<div class="min-w-0 flex-1">
										<p
											class="text-foreground flex flex-wrap items-center gap-2 truncate font-semibold"
										>
											<!-- direction badge: ↑ income (green), ↓ expense (muted-red), ⇄ transfer (info) -->
											{#if item.type === 'income'}
												<span class="inline-flex shrink-0 items-center gap-0">
													<span class="text-xs text-[var(--color-sage-green)]" aria-hidden="true"
														>↑</span
													>
													<span class="sr-only">Income</span>
												</span>
											{:else if item.type === 'transfer'}
												<span class="inline-flex shrink-0 items-center gap-0">
													<span class="text-xs text-[var(--color-info)]" aria-hidden="true">⇄</span>
													<span class="sr-only">Transfer</span>
												</span>
											{:else}
												<span class="inline-flex shrink-0 items-center gap-0">
													<span class="text-xs text-[var(--color-expense)]" aria-hidden="true"
														>↓</span
													>
													<span class="sr-only">Expense</span>
												</span>
											{/if}
											<span class="truncate">{item.description}</span>
											{#if isUnassigned}
												<span
													class="shrink-0 rounded border border-amber-400/50 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
												>
													Unassigned
												</span>
											{:else if item.waterfallTier !== 'unclassified'}
												<span
													class="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium {tierActiveClasses[
														item.waterfallTier!
													]}"
												>
													{tierChipDefs.find((c) => c.tier === item.waterfallTier)?.label}
												</span>
											{/if}
											{#if item.needsReview}
												<span
													class="border-border text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
													>Needs review</span
												>
											{/if}
										</p>
										<p class="text-muted-foreground mt-0.5 truncate text-sm">
											Next: {item.nextDate}
										</p>
									</div>
									<div class="flex shrink-0 items-center gap-2">
										<span
											class="text-amount {item.type === 'income'
												? 'text-[var(--color-sage-green)]'
												: item.type === 'transfer'
													? 'text-[var(--color-info)]'
													: 'text-[var(--color-expense)]'}"
										>
											{item.type === 'income'
												? '+'
												: item.type === 'expense'
													? '−'
													: ''}{item.amount}
										</span>
										{#if dotN > 0}
											<span
												class="text-muted-foreground shrink-0 text-[10px] tracking-tight select-none"
												aria-label={recurringConfidenceAria(dotN)}
											>
												{'●'.repeat(dotN)}
											</span>
										{/if}
										<ChevronRight class="text-muted-foreground h-4 w-4" />
									</div>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- 3. Unusual Activity — only unusual_amount, with context ratio and pattern link -->
			{@const visibleAnomalies = anomalies.filter((a) => !isAnomalyDismissed(a.transactionId))}
			{#if visibleAnomalies.length > 0}
				<section>
					<div class="mb-2">
						<h2
							class="text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Unusual Activity
						</h2>
						<p class="text-muted-foreground mt-0.5 text-xs">
							Transactions that look out of the ordinary for your spending history.
						</p>
					</div>
					<ul class="space-y-2">
						{#each visibleAnomalies as a (a.transactionId)}
							<li class="border-border bg-card overflow-hidden rounded-xl border-2">
								<div class="px-4 py-3">
									<div class="flex items-start gap-2">
										<div class="min-w-0 flex-1">
											<p class="text-foreground truncate text-base font-semibold">
												{a.description ?? 'Transaction'}
											</p>
											{#if a.categoryName}
												<p class="text-muted-foreground mt-0.5 truncate text-sm">
													{a.categoryName}
												</p>
											{/if}
											{#if a.context}
												<p class="mt-1 text-xs font-medium text-[var(--color-warning)]">
													{a.context}
												</p>
											{/if}
										</div>
										<div class="flex shrink-0 flex-col items-end gap-1">
											<span
												class="text-amount {a.txType === 'income'
													? 'text-[var(--color-sage-green)]'
													: a.txType === 'transfer'
														? 'text-[var(--color-info)]'
														: 'text-foreground'}"
											>
												{formatTransactionAmount(a.amount ?? 0, a.currency ?? userCurrency, true)}
											</span>
										</div>
									</div>
									<div class="mt-2 flex flex-wrap items-center gap-2">
										<button
											type="button"
											class="text-muted-foreground hover:text-foreground text-xs font-medium underline-offset-2 hover:underline"
											onclick={() => goto(`/transactions/add/${a.transactionId}`)}
										>
											View transaction
										</button>
										{#if a.relatedPatternId}
											<button
												type="button"
												class="text-muted-foreground hover:text-foreground text-xs font-medium underline-offset-2 hover:underline"
												onclick={() => {
													selectedPatternId = a.relatedPatternId!;
													recurringPanelOpen = true;
												}}
											>
												View pattern
											</button>
										{/if}
										<button
											type="button"
											class="text-muted-foreground hover:text-foreground ml-auto text-xs font-medium"
											onclick={() => dismissAnomaly(a.transactionId)}
											title="This transaction is normal for you"
										>
											Dismiss
										</button>
									</div>
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<!-- 4. Your patterns (compact stat cards) -->
			<section>
				<h2
					class="mb-3 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Your patterns
				</h2>
				{#if patternStats}
					<div class="grid grid-cols-2 gap-2">
						<div class="squircle-2xl squircle-border bg-card px-3 py-3">
							<p class="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
								Peak day
							</p>
							<p class="text-sm font-medium">{patternStats.peakDay}</p>
						</div>
						<div class="squircle-2xl squircle-border bg-card px-3 py-3">
							<p class="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
								Peak time
							</p>
							<p class="text-sm font-medium">{patternStats.peakTime}</p>
						</div>
						<div class="squircle-2xl squircle-border bg-card px-3 py-3">
							<p class="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
								Biggest category
							</p>
							<p class="truncate text-sm font-medium" title={patternStats.biggestCategory}>
								{patternStats.biggestCategory}
							</p>
						</div>
						<div class="squircle-2xl squircle-border bg-card px-3 py-3">
							<p class="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
								Most frequent
							</p>
							<p class="truncate text-sm font-medium" title={patternStats.mostFrequentCategory}>
								{patternStats.mostFrequentCategory}
							</p>
						</div>
						<div class="squircle-2xl squircle-border bg-card col-span-2 px-3 py-3">
							<p class="text-muted-foreground text-[10px] font-semibold tracking-widest uppercase">
								Average transaction
							</p>
							<p class="text-sm font-medium">
								{formatAmount(patternStats.avgAmount, userCurrency)}
							</p>
						</div>
					</div>
				{/if}
			</section>

			<!-- 5. Upcoming (amount prominent) -->
			<section>
				<h2
					class="mb-2 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Upcoming
				</h2>
				{#if upcomingWeekAmount != null && upcomingWeekAmount > 0}
					<p class="text-sm text-[var(--color-text-secondary)]">
						Expected recurring spending this week:
						<span class="text-foreground ml-1 font-semibold tabular-nums"
							>~{formatAmount(upcomingWeekAmount, userCurrency)}</span
						>
					</p>
				{:else}
					<p class="text-sm text-[var(--color-text-secondary)]">{upcomingSummary}</p>
				{/if}
			</section>

			<!-- Spending patterns (primary — based on transactions only) -->
			<div class="border-border border-t pt-4">
				<h3 class="text-foreground mb-1 text-sm font-semibold">Spending patterns</h3>
				<p class="text-muted-foreground mb-3 text-xs">Based on your transactions</p>
				<BehavioralPatterns days={90} />
			</div>

			<!-- App usage (always visible; illustrative / for reference) -->
			<div class="border-border border-t pt-4">
				<div class="border-border bg-muted/20 mb-3 rounded-lg border px-3 py-2">
					<p class="text-muted-foreground text-xs">
						<strong class="text-[var(--color-text-tertiary)]">App usage</strong> — for reference only.
						This data is used to improve your experience and is not part of your financial insights.
					</p>
				</div>
				<AppUsageAnalytics days={30} compactWhenEmpty />
			</div>
		{/if}
	</div>

	<ReviewSession
		bind:open={reviewSessionOpen}
		{userCurrency}
		onClose={() => {
			reviewSessionOpen = false;
			void refreshRecurringFromServices(userCurrency);
		}}
	/>

	<!-- Recurring pattern drill-in panel -->
	<RecurringPatternPanel
		open={recurringPanelOpen}
		patternId={selectedPatternId}
		{userCurrency}
		onClose={() => {
			recurringPanelOpen = false;
			selectedPatternId = null;
		}}
		onPatternBudgetTierApplied={() => void refreshRecurringFromServices(userCurrency)}
	/>
</div>
