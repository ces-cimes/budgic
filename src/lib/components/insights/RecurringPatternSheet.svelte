<script lang="ts">
	import { goto } from '$app/navigation';
	import { ResponsivePanel } from '$lib/components/ui/responsive-panel';
	import { recurringTransactionIntelligenceService, transactionService } from '$lib/core/services';
	import { applyRecurringPatternWaterfallTier } from '$lib/core/services/analytics/apply-recurring-pattern-waterfall-tier';
	import { formatAmount } from '$lib/utils/currency-utils';
	import type { RecurringPattern } from '$lib/core/services/analytics/recurring-transaction-intelligence-service';
	import type { Category, Transaction } from '$lib/core/db';
	import { db } from '$lib/core/db';
	import {
		tierChipDefs,
		tierActiveClasses,
		tierChipIdleClasses
	} from '$lib/insights/recurring-tier-presets';
	import { Button } from '$lib/components/ui/button';
	import { EmptyState } from '$lib/components/ui/empty-state';
	import { ExternalLink, Calendar, Banknote } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { cn } from '$lib/utils.js';

	interface Props {
		patternId: string | null;
		userCurrency: string;
		open?: boolean;
		onClose?: () => void;
		/** After a budget tier change succeeds (DB + cache); parent should refresh recurring list. */
		onPatternBudgetTierApplied?: () => void;
	}

	const {
		patternId,
		userCurrency,
		open = false,
		onClose,
		onPatternBudgetTierApplied
	}: Props = $props();

	let pattern = $state<RecurringPattern | null>(null);
	let transactions = $state<Transaction[]>([]);
	let loading = $state(false);
	let prediction = $state<{ nextDate: string; amount: number } | null>(null);
	/** Tier on the category tied to `pattern.learnedCategoryId` (same source as Patterns list). */
	let patternWaterfallTier = $state<Category['waterfallTier'] | undefined>(undefined);
	let tierApplying = $state(false);

	$effect(() => {
		if (open && patternId) {
			void loadPattern();
		} else if (!open) {
			pattern = null;
			transactions = [];
			prediction = null;
			patternWaterfallTier = undefined;
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
			patternWaterfallTier = pattern.learnedCategoryId
				? (await db.categories.get(pattern.learnedCategoryId))?.waterfallTier
				: undefined;

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

	async function refreshPatternAndTierFromDb() {
		if (!patternId) return;
		const p = await recurringTransactionIntelligenceService.getPattern(patternId);
		if (!p) return;
		pattern = p;
		patternWaterfallTier = p.learnedCategoryId
			? (await db.categories.get(p.learnedCategoryId))?.waterfallTier
			: undefined;
	}

	async function applyTierFromSheet(tier: NonNullable<Category['waterfallTier']>) {
		if (!patternId || tierApplying) return;
		tierApplying = true;
		try {
			const res = await applyRecurringPatternWaterfallTier(patternId, tier);
			if (!res.ok) {
				if (res.reason === 'no_pattern') {
					toast.error('Pattern not found');
				} else {
					toast.message('Could not set budget tier', {
						description:
							'This pattern needs a single clear category on its matching transactions, or wait until category learning picks one.'
					});
				}
				return;
			}
			await refreshPatternAndTierFromDb();
			onPatternBudgetTierApplied?.();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to update tier');
		} finally {
			tierApplying = false;
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
		pattern
			? pattern.metadata?.notes || pattern.descriptionPattern || 'Recurring pattern'
			: loading
				? 'Loading…'
				: 'Recurring pattern'
	);
</script>

<ResponsivePanel
	{open}
	onClose={() => onClose?.()}
	title={panelTitle}
	description="Pattern details and linked transactions"
>
	{#if loading}
		<div class="flex items-center justify-center py-8">
			<div
				class="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
			></div>
		</div>
	{:else if pattern}
		<div class="space-y-4">
			<div class="grid grid-cols-2 gap-3 text-sm">
				<div class="squircle-lg squircle-border bg-muted/50 p-3">
					<div class="text-muted-foreground mb-1 flex items-center gap-1.5">
						<Calendar class="h-3.5 w-3.5" />
						<span class="text-xs font-medium tracking-wider uppercase">Next</span>
					</div>
					<p class="text-foreground font-medium">
						{#if prediction?.nextDate}
							{formatDate(prediction.nextDate)}
						{:else}
							—
						{/if}
					</p>
				</div>
				<div class="squircle-lg squircle-border bg-muted/50 p-3">
					<div class="text-muted-foreground mb-1 flex items-center gap-1.5">
						<Banknote class="h-3.5 w-3.5" />
						<span class="text-xs font-medium tracking-wider uppercase">Amount</span>
					</div>
					<p class="text-foreground text-base font-semibold tabular-nums">
						{#if prediction != null}
							~{formatAmount(prediction.amount, pattern.metadata?.currency || userCurrency)}
						{:else}
							—
						{/if}
					</p>
				</div>
			</div>
			<p class="text-muted-foreground text-xs">
				Confidence: {pattern.confidence}% · {pattern.occurrences} occurrences · {pattern.frequency}
			</p>

			<div>
				<h4 class="text-muted-foreground mb-2 text-xs font-semibold tracking-widest uppercase">
					Budget tier
				</h4>
				<div class="flex flex-wrap gap-1.5">
					{#each tierChipDefs as chip (chip.tier)}
						{@const isActive = chip.tier === patternWaterfallTier}
						<Button
							type="button"
							variant="outline"
							size="sm"
							title={chip.hint}
							disabled={tierApplying}
							aria-pressed={isActive}
							aria-label={`${chip.label}. ${chip.hint}`}
							class={cn(
								'h-7 min-h-7 shrink-0 gap-0 rounded-md px-2.5 py-0 text-[11px] font-semibold shadow-none',
								isActive ? tierActiveClasses[chip.tier] : tierChipIdleClasses[chip.tier]
							)}
							onclick={() => void applyTierFromSheet(chip.tier)}
						>
							{chip.label}
						</Button>
					{/each}
				</div>
			</div>

			<div>
				<h4 class="text-muted-foreground mb-2 text-xs font-semibold tracking-widest uppercase">
					Linked transactions
				</h4>
				{#if transactions.length === 0}
					<EmptyState body="No transactions linked." class="py-0" />
				{:else}
					<ul class="space-y-1.5">
						{#each transactions as tx (tx.id)}
							<li>
								<button
									type="button"
									class="squircle-lg squircle-border bg-card hover:bg-muted/50 flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors"
									onclick={() => viewTransaction(tx)}
								>
									<span class="truncate text-[var(--color-text-secondary)]">
										{tx.description || 'Transaction'}
									</span>
									<span class="flex shrink-0 items-center gap-2">
										<span class="text-foreground font-semibold tabular-nums">
											{formatAmount(Math.abs(tx.amount ?? 0), tx.currency || userCurrency)}
										</span>
										<span class="text-muted-foreground text-xs">
											{formatDate(tx.clearedDate || tx.plannedDate || tx.createdAt || '')}
										</span>
										<ExternalLink class="text-muted-foreground h-3.5 w-3.5 shrink-0" />
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="border-border mt-4 border-t pt-4">
				<button
					type="button"
					class="text-primary flex items-center gap-1.5 text-sm hover:underline"
					onclick={viewAllRecurring}
				>
					<ExternalLink class="h-4 w-4" />
					View all recurring patterns
				</button>
			</div>
		</div>
	{:else if patternId && !loading}
		<p class="text-muted-foreground py-4 text-sm">Pattern not found.</p>
	{/if}
</ResponsivePanel>
