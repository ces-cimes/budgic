<script lang="ts">
	import { rolloverService } from '$lib/core/services';
	import type {
		PeriodSurplusDeficit,
		RolloverSuggestion
	} from '$lib/core/services/core/rollover-service';
	import type { EnhancedAllowance } from '$lib/core/services/core/budget-service';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { RefreshCw, TrendingUp, TrendingDown, CheckCircle } from '@lucide/svelte';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		accountId?: string;
		allowance: EnhancedAllowance | null;
		/** Called after rollover is applied so parent can refresh allowance */
		onRolloverApplied?: () => void;
	}

	const { accountId, allowance, onRolloverApplied }: Props = $props();

	let surplusDeficit = $state<PeriodSurplusDeficit | null>(null);
	let suggestions = $state<RolloverSuggestion[]>([]);
	let loading = $state(true);
	let applying = $state(false);

	async function load() {
		if (!allowance) {
			surplusDeficit = null;
			suggestions = [];
			loading = false;
			return;
		}
		loading = true;
		try {
			surplusDeficit = rolloverService.computeSurplusDeficit(allowance);
			suggestions = await rolloverService.getRolloverSuggestions(allowance);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	async function applyRollover() {
		if (!allowance) return;
		applying = true;
		try {
			await rolloverService.applyRollover({ accountId, allowance });
			onRolloverApplied?.();
			await load();
		} finally {
			applying = false;
		}
	}

	const hasSurplusOrDeficit = $derived(
		surplusDeficit && (surplusDeficit.totalSurplus > 0 || surplusDeficit.totalDeficit > 0)
	);
</script>

{#if allowance && (loading ? surplusDeficit : true)}
	<Card class="border-border">
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<RefreshCw class="h-5 w-5" />
				Period rollover
			</CardTitle>
			<CardDescription>
				Surplus and deficit at period end; apply to adjust next period&apos;s allowance
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if loading}
				<p class="text-muted-foreground text-sm">Loading…</p>
			{:else if surplusDeficit}
				<!-- Summary -->
				<div class="grid grid-cols-2 gap-3">
					<div class="border-border bg-muted/30 rounded-lg border p-3">
						<div class="text-muted-foreground flex items-center gap-2 text-sm">
							<TrendingUp class="text-success h-4 w-4" />
							Total surplus
						</div>
						<div class="text-success text-lg font-semibold">
							{formatTransactionAmount(
								surplusDeficit.totalSurplus,
								surplusDeficit.currency
							)}
						</div>
					</div>
					<div class="border-border bg-muted/30 rounded-lg border p-3">
						<div class="text-muted-foreground flex items-center gap-2 text-sm">
							<TrendingDown class="text-destructive h-4 w-4" />
							Total deficit
						</div>
						<div class="text-destructive text-lg font-semibold">
							{formatTransactionAmount(
								surplusDeficit.totalDeficit,
								surplusDeficit.currency
							)}
						</div>
					</div>
				</div>

				{#if surplusDeficit.categories.length > 0}
					<div class="space-y-2">
						<div class="text-sm font-medium">By category</div>
						<ul class="space-y-1 text-sm">
							{#each surplusDeficit.categories as cat (cat.categoryId)}
								<li class="flex justify-between gap-2">
									<span class="text-muted-foreground">{cat.categoryName}</span>
									<span>
										{#if cat.surplus > 0}
											<span class="text-success"
												>+{formatTransactionAmount(
													cat.surplus,
													cat.currency
												)}</span
											>
										{:else if cat.deficit > 0}
											<span class="text-destructive"
												>−{formatTransactionAmount(
													cat.deficit,
													cat.currency
												)}</span
											>
										{:else}
											<span class="text-muted-foreground">—</span>
										{/if}
									</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if suggestions.length > 0}
					<div class="space-y-2">
						<div class="text-sm font-medium">Suggested actions</div>
						<ul class="text-muted-foreground space-y-1 text-sm">
							{#each suggestions as s}
								<li class="flex items-start gap-2">
									<CheckCircle
										class="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
									/>
									<span
										>{s.categoryName}: {s.action} ({formatTransactionAmount(
											s.amount,
											s.currency
										)})</span
									>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if hasSurplusOrDeficit}
					<Button onclick={applyRollover} disabled={applying}>
						{applying ? 'Applying…' : 'Apply rollover to next period'}
					</Button>
				{:else}
					<p class="text-muted-foreground text-sm">No surplus or deficit this period.</p>
				{/if}
			{/if}
		</CardContent>
	</Card>
{/if}
