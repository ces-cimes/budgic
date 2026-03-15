<script lang="ts">
	/**
	 * Patterns tab content aligned with UX_SPEC §3.4:
	 * Spending pulse, Recurring, Anomalies, Your patterns, Upcoming.
	 */
	import { onMount } from 'svelte';
	import { insightsService } from '$lib/core/services';
	import { recurringTransactionIntelligenceService } from '$lib/core/services';
	import { transactionService } from '$lib/core/services';
	import { formatAmount } from '$lib/utils/currency-utils';
	import BehavioralPatterns from './BehavioralPatterns.svelte';
	import AppUsageAnalytics from './AppUsageAnalytics.svelte';

	interface Props {
		isLoading: boolean;
		userCurrency: string;
		className?: string;
	}

	const { isLoading: parentLoading = false, userCurrency = 'USD', className = '' }: Props = $props();

	const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	let spendingPulse = $state<string>('Loading your spending pulse…');
	let isNewUser = $state(false);
	let recurringList = $state<Array<{ description: string; amount: string; nextDate: string; inferred: boolean }>>([]);
	let anomalies = $state<Array<{ description: string }>>([]);
	let patternStats = $state<{
		peakDay: string;
		peakTime: string;
		biggestCategory: string;
		mostFrequentCategory: string;
		avgAmount: number;
	} | null>(null);
	let upcomingSummary = $state<string>('');
	let loading = $state(true);

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
				const first = behavioral[0];
				const text = [first.description, first.title].filter(Boolean).join(' ').trim();
				spendingPulse = text || 'Your spending looks consistent. No notable patterns to highlight this week.';
			} else {
				spendingPulse = 'Your spending looks consistent. No notable patterns to highlight this week.';
			}

			// Recurring
			const recurringPatterns = await recurringTransactionIntelligenceService.detectPatterns(90, 2);
			recurringList = [];
			for (const p of recurringPatterns.slice(0, 5)) {
				const pred = await recurringTransactionIntelligenceService.predictNextOccurrence(p.id);
				recurringList.push({
					description: p.metadata?.notes || p.descriptionPattern || 'Recurring',
					amount: pred ? `~${formatAmount(pred.predictedAmount, p.metadata?.currency || userCurrency)}` : '—',
					nextDate: pred?.nextOccurrenceDate
						? new Date(pred.nextOccurrenceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
						: '—',
					inferred: p.patternType === 'approximate' || p.patternType === 'seasonal'
				});
			}

			// Anomalies
			anomalies = (patternsResult.anomalyPatterns || []).slice(0, 5).map((a) => ({ description: a.description }));

			// Your patterns (compact stats)
			const tp = patternsResult.timingPatterns;
			const vp = patternsResult.velocityPatterns;
			const cp = patternsResult.categoryPatterns || [];
			const biggest = cp[0];
			const mostFreq = [...cp].sort((a, b) => (b.frequency || 0) - (a.frequency || 0))[0];
			patternStats = {
				peakDay: tp?.mostActiveDay || '—',
				peakTime: tp?.mostActiveHour != null ? `${tp.mostActiveHour}:00` : '—',
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
				upcomingSummary = `Expected recurring spending this week: ~${formatAmount(weekTotal, userCurrency)}.`;
			} else {
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

			<!-- 2. Recurring transactions -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-2">
					Recurring
				</h2>
				{#if recurringList.length === 0}
					<p class="text-sm text-muted-foreground">No recurring transactions detected yet.</p>
				{:else}
					<ul class="space-y-2">
						{#each recurringList as item}
							<li
								class="flex items-center justify-between squircle-2xl squircle-border bg-card px-4 py-2.5 text-sm"
							>
								<span>{item.inferred ? '~' : ''}{item.description}</span>
								<span class="text-muted-foreground">
									{item.amount} · {item.nextDate}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- 3. Anomalies (only if any) -->
			{#if anomalies.length > 0}
				<section>
					<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-2">
						Anomalies
					</h2>
					<ul class="space-y-1.5">
						{#each anomalies as a}
							<li class="text-sm text-[var(--color-text-secondary)]">{a.description}</li>
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

			<!-- 5. Upcoming (one-line predicted spending this week) -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-2">
					Upcoming
				</h2>
				<p class="text-sm text-[var(--color-text-secondary)]">{upcomingSummary}</p>
			</section>

			<!-- Existing behavioral + app usage (kept below spec sections) -->
			<div class="pt-4 border-t border-border">
				<h3 class="text-sm font-semibold text-foreground mb-3">Spending & transaction patterns</h3>
				<BehavioralPatterns days={90} />
			</div>
			<div>
				<h3 class="text-sm font-semibold text-foreground mb-3">App usage analytics</h3>
				<AppUsageAnalytics days={30} />
			</div>
		{/if}
	</div>
</div>
