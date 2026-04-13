<script lang="ts">
	import { goto } from '$app/navigation';
	import { ResponsivePanel } from '$lib/components/ui/responsive-panel';
	import { recurringTransactionIntelligenceService } from '$lib/core/services';
	import { transactionService } from '$lib/core/services';
	import { formatAmount } from '$lib/utils/currency-utils';
	import type { RecurringPattern } from '$lib/core/services/analytics/recurring-transaction-intelligence-service';
	import type { Transaction } from '$lib/core/db';
	import { ExternalLink, Calendar, Banknote } from '@lucide/svelte';

	interface Props {
		patternId: string | null;
		userCurrency: string;
		open?: boolean;
		onClose?: () => void;
	}

	const { patternId, userCurrency, open = false, onClose }: Props = $props();

	let pattern = $state<RecurringPattern | null>(null);
	let transactions = $state<Transaction[]>([]);
	let loading = $state(false);
	let prediction = $state<{ nextDate: string; amount: number } | null>(null);

	$effect(() => {
		if (open && patternId) {
			loadPattern();
		} else if (!open) {
			pattern = null;
			transactions = [];
			prediction = null;
		}
	});

	async function loadPattern() {
		if (!patternId) return;
		loading = true;
		try {
			pattern = await recurringTransactionIntelligenceService.getPattern(patternId);
			if (!pattern) {
				loading = false;
				return;
			}
			const pred = await recurringTransactionIntelligenceService.predictNextOccurrence(patternId);
			if (pred) {
				prediction = {
					nextDate: pred.nextOccurrenceDate,
					amount: pred.predictedAmount
				};
			} else {
				prediction = null;
			}
			const ids = pattern.matchingTransactionIds || [];
			const txs = await Promise.all(ids.map((id) => transactionService.getTransaction(id)));
			transactions = txs.filter((t): t is Transaction => t != null);
			transactions.sort((a, b) => {
				const da = a.clearedDate || a.plannedDate || a.createdAt || '';
				const db = b.clearedDate || b.plannedDate || b.createdAt || '';
				return db.localeCompare(da);
			});
		} catch (e) {
			console.error('RecurringPatternSheet load error:', e);
		} finally {
			loading = false;
		}
	}

	function formatDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
		} catch {
			return iso;
		}
	}

	function viewTransaction(tx: Transaction) {
		onClose?.();
		goto(`/transactions/add/${tx.id}`);
	}

	function viewAllRecurring() {
		onClose?.();
		goto('/settings/plan');
	}

	const panelTitle = $derived(
		pattern ? pattern.metadata?.notes || pattern.descriptionPattern || 'Recurring pattern' : loading ? 'Loading…' : 'Recurring pattern'
	);
</script>

<ResponsivePanel
	{open}
	onClose={() => onClose?.()}
	title={panelTitle}
	description="Pattern details and linked transactions"
>
	{#if loading}
		<div class="py-8 flex items-center justify-center">
			<div class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
		</div>
	{:else if pattern}
		<div class="space-y-4">
			<div class="grid grid-cols-2 gap-3 text-sm">
				<div class="squircle-lg squircle-border bg-muted/50 p-3">
					<div class="flex items-center gap-1.5 text-muted-foreground mb-1">
						<Calendar class="w-3.5 h-3.5" />
						<span class="text-xs font-medium uppercase tracking-wider">Next</span>
					</div>
					<p class="font-medium text-foreground">
						{#if prediction?.nextDate}
							{formatDate(prediction.nextDate)}
						{:else}
							—
						{/if}
					</p>
				</div>
				<div class="squircle-lg squircle-border bg-muted/50 p-3">
					<div class="flex items-center gap-1.5 text-muted-foreground mb-1">
						<Banknote class="w-3.5 h-3.5" />
						<span class="text-xs font-medium uppercase tracking-wider">Amount</span>
					</div>
					<p class="font-semibold text-foreground tabular-nums text-base">
						{#if prediction != null}
							~{formatAmount(prediction.amount, pattern.metadata?.currency || userCurrency)}
						{:else}
							—
						{/if}
					</p>
				</div>
			</div>
			<p class="text-xs text-muted-foreground">
				Confidence: {pattern.confidence}% · {pattern.occurrences} occurrences · {pattern.frequency}
			</p>

			<div>
				<h4 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
					Linked transactions
				</h4>
				{#if transactions.length === 0}
					<p class="text-sm text-muted-foreground">No transactions linked.</p>
				{:else}
					<ul class="space-y-1.5">
						{#each transactions as tx (tx.id)}
							<li>
								<button
									type="button"
									class="w-full text-left squircle-lg squircle-border bg-card px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
									onclick={() => viewTransaction(tx)}
								>
									<span class="truncate text-[var(--color-text-secondary)]">
										{tx.description || 'Transaction'}
									</span>
									<span class="flex items-center gap-2 shrink-0">
										<span class="font-semibold text-foreground tabular-nums">
											{formatAmount(Math.abs(tx.amount ?? 0), tx.currency || userCurrency)}
										</span>
										<span class="text-muted-foreground text-xs">
											{formatDate(tx.clearedDate || tx.plannedDate || tx.createdAt || '')}
										</span>
										<ExternalLink class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="border-t border-border pt-4 mt-4">
				<button
					type="button"
					class="text-sm text-primary hover:underline flex items-center gap-1.5"
					onclick={viewAllRecurring}
				>
					<ExternalLink class="w-4 h-4" />
					View all recurring patterns
				</button>
			</div>
		</div>
	{:else if patternId && !loading}
		<p class="text-sm text-muted-foreground py-4">Pattern not found.</p>
	{/if}
</ResponsivePanel>
