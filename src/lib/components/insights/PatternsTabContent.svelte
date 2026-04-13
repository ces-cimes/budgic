<script lang="ts">
	/**
	 * Patterns tab content aligned with UX_SPEC §3.4:
	 * Spending pulse, Recurring, Anomalies, Your patterns, Upcoming.
	 * Spending primary; app usage secondary and de-emphasized.
	 */
	import { onMount } from 'svelte';
	import { insightsService } from '$lib/core/services';
	import { recurringTransactionIntelligenceService } from '$lib/core/services';
	import { transactionService } from '$lib/core/services';
	import { formatAmount, formatTransactionAmount } from '$lib/utils/currency-utils';
	import { dismissedAnomalies, dismissAnomaly } from '$lib/stores/dismissed-anomalies';
	import { db } from '$lib/core/db';
	import BehavioralPatterns from './BehavioralPatterns.svelte';
	import AppUsageAnalytics from './AppUsageAnalytics.svelte';
	import { goto } from '$app/navigation';
	import RecurringPatternSheet from './RecurringPatternSheet.svelte';
	import { ChevronRight } from '@lucide/svelte';

	interface Props {
		isLoading: boolean;
		userCurrency: string;
		className?: string;
	}

	const { isLoading: parentLoading = false, userCurrency = 'USD', className = '' }: Props = $props();

	let spendingPulse = $state<string>('Loading your spending pulse…');
	let isNewUser = $state(false);
	let recurringList = $state<
		Array<{
			patternId: string;
			description: string;
			amount: string;
			nextDate: string;
			inferred: boolean;
		}>
	>([]);
	let anomalies = $state<
		Array<{
			type: 'unusual_amount' | 'unusual_timing' | 'unusual_category';
			transactionId: string;
			description?: string;
			amount?: number;
			currency?: string;
			txType?: 'expense' | 'income' | 'transfer' | 'adjustment';
			categoryName?: string;
		}>
	>([]);
	let patternStats = $state<{
		peakDay: string;
		peakTime: string;
		biggestCategory: string;
		mostFrequentCategory: string;
		avgAmount: number;
	} | null>(null);
	let upcomingSummary = $state<string>('');
	let upcomingWeekAmount = $state<number | null>(null);
	let loading = $state(true);
	let recurringSheetOpen = $state(false);
	let selectedPatternId = $state<string | null>(null);

	function formatPeakTime(hour: number): string {
		const period = hour >= 12 ? 'PM' : 'AM';
		const h = hour % 12 || 12;
		return `${h}:00 ${period}`;
	}

	function anomalyTypeLabel(type: 'unusual_amount' | 'unusual_timing' | 'unusual_category'): string {
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

	function anomalyBadgeClass(type: 'unusual_amount' | 'unusual_timing' | 'unusual_category'): string {
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

	onMount(async () => {
		loading = true;
		try {
			const days = 90;
			const [behavioral, patternsResult, allTx] = await Promise.all([
				insightsService.getBehavioralPatternInsights(),
				insightsService.analyzeSpendingPatternsAsync(days),
				transactionService.getAllTransactions()
			]);

			const cleared = (allTx || []).filter((t) => t && !t.deletedAt && t.status === 'cleared');
			const firstTx = cleared.length
				? cleared.reduce((a, b) => {
						const da = a.clearedDate || a.createdAt || '';
						const db = b.clearedDate || b.createdAt || '';
						return da < db ? a : b;
					}, cleared[0])
				: null;
			const firstDate = firstTx ? new Date(firstTx.clearedDate || firstTx.createdAt || 0) : new Date();
			const daysSinceFirst = (Date.now() - firstDate.getTime()) / (24 * 60 * 60 * 1000);
			isNewUser = daysSinceFirst < 14;

			if (isNewUser) {
				spendingPulse = "We're building your picture. Keep logging transactions and we'll start spotting patterns in about 2 weeks.";
			} else if (behavioral?.length > 0) {
				// Never use "Predictions Updated" / "X predictions available" as pulse — reserve for real spending summary only
				const spendingInsight = behavioral.find(
					(i) =>
						i.title !== 'Predictions Updated' &&
						!(i.description?.toLowerCase().includes('prediction') && i.description?.toLowerCase().includes('available'))
				);
				if (spendingInsight) {
					const text = [spendingInsight.description, spendingInsight.title].filter(Boolean).join(' ').trim();
					spendingPulse = text || 'Your spending looks consistent. No notable patterns to highlight this week.';
				} else {
					spendingPulse = 'Your spending looks consistent. No notable patterns to highlight this week.';
				}
			} else {
				spendingPulse = 'Your spending looks consistent. No notable patterns to highlight this week.';
			}

			// Recurring (include patternId for drill-in sheet)
			const recurringPatterns = await recurringTransactionIntelligenceService.detectPatterns(90, 2);
			recurringList = [];
			for (const p of recurringPatterns.slice(0, 5)) {
				const pred = await recurringTransactionIntelligenceService.predictNextOccurrence(p.id);
				recurringList.push({
					patternId: p.id,
					description: p.metadata?.notes || p.descriptionPattern || 'Recurring',
					amount: pred ? `~${formatAmount(pred.predictedAmount, p.metadata?.currency || userCurrency)}` : '—',
					nextDate: pred?.nextOccurrenceDate
						? new Date(pred.nextOccurrenceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
						: '—',
					inferred: p.patternType === 'approximate' || p.patternType === 'seasonal'
				});
			}

			// Anomalies: enrich with transaction + category for transaction-like display (no "Unusually large..." text)
			const rawAnomalies = (patternsResult.anomalyPatterns || []).slice(0, 10);
			const enriched: typeof anomalies = [];
			for (const a of rawAnomalies) {
				const tx = await transactionService.getTransaction(a.transactionId);
				let categoryName: string | undefined;
				if (tx?.categoryId) {
					const cat = await db.categories.get(tx.categoryId);
					categoryName = cat?.name;
				}
				const rawAmount = tx?.amount ?? 0;
				const displayAmount =
					tx?.type === 'expense' ? -Math.abs(rawAmount) : tx?.type === 'income' ? Math.abs(rawAmount) : rawAmount;
				enriched.push({
					type: a.type,
					transactionId: a.transactionId,
					description: tx?.description || 'Transaction',
					amount: displayAmount,
					currency: tx?.currency,
					txType: tx?.type,
					categoryName
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
		}
	});
</script>

<div class="patterns-tab h-full overflow-y-auto {className}">
	<div class="p-2 sm:p-4 max-w-4xl mx-auto space-y-6">
		{#if parentLoading || loading}
			<div class="space-y-4">
				<div class="h-20 rounded-xl bg-[var(--color-bg-tertiary)] animate-pulse"></div>
				<div class="grid grid-cols-2 gap-2">
					{#each Array(4) as _}
						<div class="h-16 rounded-lg bg-[var(--color-bg-tertiary)] animate-pulse"></div>
					{/each}
				</div>
			</div>
		{:else}
			<!-- 1. Spending pulse (UX_SPEC §3.4) -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-2">
					Spending pulse
				</h2>
				<div
					class="squircle-2xl squircle-border bg-card px-4 py-3 text-sm min-h-[3rem]"
				>
					<p class="relative z-[2] text-[var(--color-text-secondary)]">
						{spendingPulse || 'Your spending at a glance. Add more transactions to see patterns here.'}
					</p>
				</div>
			</section>

			<!-- 2. Recurring (transaction-like cards) -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-2">
					Recurring
				</h2>
				{#if recurringList.length === 0}
					<p class="text-sm text-muted-foreground">No recurring transactions detected yet.</p>
				{:else}
					<ul class="space-y-2">
						{#each recurringList as item}
							<li>
								<button
									type="button"
									class="w-full text-left rounded-xl border-2 border-border bg-card px-4 py-3 flex items-center gap-2 hover:bg-muted/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									onclick={() => {
										selectedPatternId = item.patternId;
										recurringSheetOpen = true;
									}}
								>
									<div class="flex-1 min-w-0">
										<p class="font-semibold text-foreground text-base truncate">
											{item.inferred ? '~' : ''}{item.description}
										</p>
										<p class="text-sm text-muted-foreground truncate mt-0.5">Next: {item.nextDate}</p>
									</div>
									<div class="flex items-center gap-2 shrink-0">
										<span class="text-amount text-foreground">{item.amount}</span>
										<ChevronRight class="w-4 h-4 text-muted-foreground" />
									</div>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- 3. Anomalies (transaction-like: description + category left, amount + type badge right; no "Unusually large..." text) -->
			{@const visibleAnomalies = anomalies.filter((a) => !$dismissedAnomalies.has(a.transactionId))}
			{#if visibleAnomalies.length > 0}
				<section>
					<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-2">
						Anomalies
					</h2>
					<ul class="space-y-2">
						{#each visibleAnomalies as a (a.transactionId)}
							<li class="rounded-xl border-2 border-border bg-card overflow-hidden">
								<div
									role="button"
									tabindex="0"
									class="w-full text-left px-4 py-3 flex items-center gap-2 hover:bg-muted/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									onclick={() => goto(`/transactions/add/${a.transactionId}`)}
									onkeydown={(e) => e.key === 'Enter' && goto(`/transactions/add/${a.transactionId}`)}
								>
									<div class="flex-1 min-w-0">
										<p class="font-semibold text-foreground text-base truncate">
											{a.description ?? 'Transaction'}
										</p>
										{#if a.categoryName}
											<p class="text-sm text-muted-foreground truncate mt-0.5">{a.categoryName}</p>
										{/if}
									</div>
									<div class="flex items-center gap-2 shrink-0 flex-wrap justify-end">
										<span
											class="text-amount {a.txType === 'income'
												? 'text-[var(--color-sage-green)]'
												: a.txType === 'transfer'
													? 'text-[var(--color-info)]'
													: 'text-foreground'}"
										>
											{formatTransactionAmount(a.amount ?? 0, a.currency ?? userCurrency, true)}
										</span>
										<span
											class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider border {anomalyBadgeClass(a.type)}"
										>
											{anomalyTypeLabel(a.type)}
										</span>
										<button
											type="button"
											class="text-muted-foreground text-xs font-medium hover:text-foreground"
											onclick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												dismissAnomaly(a.transactionId);
											}}
											title="This transaction is normal for you"
										>
											This is normal
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
				<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-3">
					Your patterns
				</h2>
				{#if patternStats}
					<div class="grid grid-cols-2 gap-2">
						<div class="squircle-2xl squircle-border bg-card px-3 py-3">
							<p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Peak day</p>
							<p class="text-sm font-medium">{patternStats.peakDay}</p>
						</div>
						<div class="squircle-2xl squircle-border bg-card px-3 py-3">
							<p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Peak time</p>
							<p class="text-sm font-medium">{patternStats.peakTime}</p>
						</div>
						<div class="squircle-2xl squircle-border bg-card px-3 py-3">
							<p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Biggest category</p>
							<p class="text-sm font-medium truncate" title={patternStats.biggestCategory}>{patternStats.biggestCategory}</p>
						</div>
						<div class="squircle-2xl squircle-border bg-card px-3 py-3">
							<p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Most frequent</p>
							<p class="text-sm font-medium truncate" title={patternStats.mostFrequentCategory}>{patternStats.mostFrequentCategory}</p>
						</div>
						<div class="col-span-2 squircle-2xl squircle-border bg-card px-3 py-3">
							<p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Average transaction</p>
							<p class="text-sm font-medium">{formatAmount(patternStats.avgAmount, userCurrency)}</p>
						</div>
					</div>
				{/if}
			</section>

			<!-- 5. Upcoming (amount prominent) -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-2">
					Upcoming
				</h2>
				{#if upcomingWeekAmount != null && upcomingWeekAmount > 0}
					<p class="text-sm text-[var(--color-text-secondary)]">
						Expected recurring spending this week:
						<span class="font-semibold text-foreground tabular-nums ml-1">~{formatAmount(upcomingWeekAmount, userCurrency)}</span>
					</p>
				{:else}
					<p class="text-sm text-[var(--color-text-secondary)]">{upcomingSummary}</p>
				{/if}
			</section>

			<!-- Spending patterns (primary — based on transactions only) -->
			<div class="pt-4 border-t border-border">
				<h3 class="text-sm font-semibold text-foreground mb-1">Spending patterns</h3>
				<p class="text-xs text-muted-foreground mb-3">Based on your transactions</p>
				<BehavioralPatterns days={90} />
			</div>

			<!-- App usage (always visible; illustrative / for reference) -->
			<div class="pt-4 border-t border-border">
				<div class="rounded-lg border border-border bg-muted/20 px-3 py-2 mb-3">
					<p class="text-xs text-muted-foreground">
						<strong class="text-[var(--color-text-tertiary)]">App usage</strong> — for reference only. This data is used to improve your experience and is not part of your financial insights.
					</p>
				</div>
				<AppUsageAnalytics days={30} compactWhenEmpty />
			</div>
		{/if}
	</div>

	<!-- Recurring pattern drill-in sheet -->
	<RecurringPatternSheet
		open={recurringSheetOpen}
		patternId={selectedPatternId}
		userCurrency={userCurrency}
		onClose={() => {
			recurringSheetOpen = false;
			selectedPatternId = null;
		}}
	/>
</div>
