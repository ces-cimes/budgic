<script lang="ts">
	import { onMount } from 'svelte';
	import { interestOptimizationService } from '$lib/core/services/analytics/interest-optimization-service';
	import type {
		AggregateInterestAnalysis,
		InterestRecommendation
	} from '$lib/core/services/analytics/interest-optimization-service';
	import { formatMainCurrencyAmount } from '$lib/utils/currency-utils';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { TrendingUp, TrendingDown, AlertCircle, ArrowRight } from '@lucide/svelte';
	import { goto } from '$app/navigation';

	interface Props {
		userCurrency?: string;
	}

	const { userCurrency = 'USD' }: Props = $props();

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let analysis = $state<AggregateInterestAnalysis | null>(null);

	onMount(async () => {
		try {
			analysis = await interestOptimizationService.analyzeAggregate();
		} catch (err) {
			console.error('Failed to load interest analysis:', err);
			error = err instanceof Error ? err.message : 'Failed to load interest data';
		} finally {
			isLoading = false;
		}
	});

	function topRecommendations(recs: InterestRecommendation[]): InterestRecommendation[] {
		const sorted = [...recs].sort((a, b) => {
			const order = { urgent: 0, high: 1, medium: 2, low: 3 };
			return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
		});
		return sorted.slice(0, 3);
	}
</script>

<Card.Root>
	<Card.Header>
		<div class="flex items-center gap-2">
			<TrendingUp class="text-primary h-5 w-5" />
			<Card.Title class="text-base">Interest opportunities</Card.Title>
		</div>
	</Card.Header>
	<Card.Content>
		{#if isLoading}
			<div class="space-y-3">
				<Skeleton class="h-8 w-28" />
				<Skeleton class="h-4 w-48" />
				<Skeleton class="h-4 w-36" />
			</div>
		{:else if error}
			<p class="text-destructive flex items-center gap-2 text-sm">
				<AlertCircle class="h-4 w-4" />
				{error}
			</p>
		{:else if !analysis}
			<p class="text-muted-foreground text-sm">No interest-bearing accounts found.</p>
		{:else}
			<!-- Net annual -->
			<div class="mb-4 flex items-baseline justify-between">
				<div>
					<p class="text-muted-foreground text-xs">Net annual interest</p>
					<span
						class="text-2xl font-bold {analysis.netAnnualInterest >= 0
							? 'text-green-500'
							: 'text-red-500'}"
					>
						{analysis.netAnnualInterest >= 0 ? '+' : ''}{formatMainCurrencyAmount(analysis.netAnnualInterest, userCurrency)}
					</span>
				</div>
				{#if analysis.optimizationPotential > 0}
					<Badge variant="outline" class="text-amber-500">
						{formatMainCurrencyAmount(analysis.optimizationPotential, userCurrency)} potential
					</Badge>
				{/if}
			</div>

			<!-- Earnings vs costs -->
			<div class="text-muted-foreground mb-4 space-y-1 text-sm">
				<div class="flex justify-between">
					<div class="flex items-center gap-1.5">
						<TrendingUp class="h-3.5 w-3.5 text-green-500" />
						<span>Annual earnings</span>
					</div>
					<span class="text-foreground font-medium text-green-500">
						+{formatMainCurrencyAmount(analysis.totalAnnualEarnings, userCurrency)}
					</span>
				</div>
				<div class="flex justify-between">
					<div class="flex items-center gap-1.5">
						<TrendingDown class="h-3.5 w-3.5 text-red-500" />
						<span>Annual costs</span>
					</div>
					<span class="text-foreground font-medium text-red-500">
						-{formatMainCurrencyAmount(analysis.totalAnnualCosts, userCurrency)}
					</span>
				</div>
			</div>

			<!-- Top recommendations -->
			{#if analysis.recommendations.length > 0}
				<div class="border-border space-y-2 border-t pt-3">
					<p class="text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase">
						Suggestions
					</p>
					{#each topRecommendations(analysis.recommendations) as rec}
						<div class="flex items-start justify-between gap-2 rounded-lg border p-2.5 text-sm">
							<div class="min-w-0 flex-1">
								<p class="font-medium">{rec.title}</p>
								<p class="text-muted-foreground truncate text-xs">{rec.description}</p>
							</div>
							<span class="shrink-0 text-xs font-medium text-green-500">
								+{formatMainCurrencyAmount(rec.estimatedAnnualValue, userCurrency)}/yr
							</span>
						</div>
					{/each}
				</div>
			{/if}

			<div class="flex gap-2 pt-1">
				<Button variant="outline" size="sm" onclick={() => goto('/accounts')}>
					View accounts
					<ArrowRight class="ml-1 h-3 w-3" />
				</Button>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
