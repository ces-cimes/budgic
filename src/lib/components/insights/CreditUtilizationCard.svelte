<script lang="ts">
	import { onMount } from 'svelte';
	import { creditUtilizationService } from '$lib/core/services/analytics/credit-utilization-service';
	import type { AggregateCreditUtilizationAnalysis } from '$lib/core/services/analytics/credit-utilization-service';
	import { formatMainCurrencyAmount } from '$lib/utils/currency-utils';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import { CreditCard, AlertCircle, ArrowRight } from '@lucide/svelte';
	import { goto } from '$app/navigation';

	interface Props {
		userCurrency?: string;
	}

	const { userCurrency = 'USD' }: Props = $props();

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let analysis = $state<AggregateCreditUtilizationAnalysis | null>(null);

	onMount(async () => {
		try {
			analysis = await creditUtilizationService.analyzeAggregate();
		} catch (err) {
			console.error('Failed to load credit utilization:', err);
			error = err instanceof Error ? err.message : 'Failed to load credit utilization data';
		} finally {
			isLoading = false;
		}
	});

	function utilizationColor(utilization: number): string {
		if (utilization <= 30) return 'text-green-500';
		if (utilization <= 50) return 'text-amber-500';
		if (utilization <= 70) return 'text-orange-500';
		return 'text-red-500';
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'excellent':
				return 'Excellent';
			case 'good':
				return 'Good';
			case 'fair':
				return 'Fair';
			case 'poor':
				return 'Needs attention';
			default:
				return status;
		}
	}

	function statusBadgeVariant(
		status: string
	): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (status) {
			case 'excellent':
				return 'default';
			case 'good':
				return 'secondary';
			case 'fair':
				return 'outline';
			case 'poor':
				return 'destructive';
			default:
				return 'outline';
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<div class="flex items-center gap-2">
			<CreditCard class="text-primary h-5 w-5" />
			<Card.Title class="text-base">Credit utilisation</Card.Title>
		</div>
	</Card.Header>
	<Card.Content>
		{#if isLoading}
			<div class="space-y-3">
				<Skeleton class="h-8 w-24" />
				<Skeleton class="h-2 w-full" />
				<Skeleton class="h-4 w-40" />
			</div>
		{:else if error}
			<p class="text-destructive flex items-center gap-2 text-sm">
				<AlertCircle class="h-4 w-4" />
				{error}
			</p>
		{:else if !analysis || analysis.accountCount === 0}
			<p class="text-muted-foreground text-sm">No credit accounts found.</p>
		{:else}
			<div class="mb-4 flex items-baseline justify-between">
				<span class="text-3xl font-bold {utilizationColor(analysis.totalUtilization)}">
					{analysis.totalUtilization.toFixed(1)}%
				</span>
				<Badge variant={statusBadgeVariant(analysis.status)}>
					{statusLabel(analysis.status)}
				</Badge>
			</div>

			<Progress value={analysis.totalUtilization} max={100} class="mb-3 h-2" />

			<div class="text-muted-foreground mb-4 space-y-1 text-sm">
				<div class="flex justify-between">
					<span>Total debt</span>
					<span class="text-foreground font-medium"
						>{formatMainCurrencyAmount(analysis.totalDebt, userCurrency)}</span
					>
				</div>
				<div class="flex justify-between">
					<span>Credit limit</span>
					<span class="text-foreground font-medium"
						>{formatMainCurrencyAmount(analysis.totalCreditLimit, userCurrency)}</span
					>
				</div>
				<div class="flex justify-between">
					<span>Accounts</span>
					<span class="text-foreground font-medium">{analysis.accountCount}</span>
				</div>
			</div>

			{#if analysis.accounts.length > 0}
				<div class="border-border mb-4 space-y-2 border-t pt-3">
					{#each analysis.accounts.slice(0, 5) as account}
						<div class="flex items-center justify-between text-sm">
							<div class="flex items-center gap-2">
								<div
									class="h-2 w-2 rounded-full {utilizationColor(
										account.utilization
									)}"
									style="background: currentColor"
								></div>
								<span class="text-muted-foreground max-w-[140px] truncate"
									>{account.accountName}</span
								>
							</div>
							<span class="font-medium">{account.utilization.toFixed(1)}%</span>
						</div>
					{/each}
				</div>
			{/if}

			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={() => goto('/settings/accounts')}>
					Manage limits
					<ArrowRight class="ml-1 h-3 w-3" />
				</Button>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
