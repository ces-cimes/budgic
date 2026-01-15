<script lang="ts">
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { Wallet, TrendingUp, TrendingDown } from '@lucide/svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';

	interface Props {
		allowance: EnhancedAllowance | null;
		isLoading?: boolean;
	}

	const { allowance, isLoading = false }: Props = $props();

	const usagePercentage = $derived(() => {
		if (!allowance || allowance.total.monthly === 0) return 0;
		return Math.min(100, (allowance.total.spentSoFar / allowance.total.monthly) * 100);
	});

	const statusColor = $derived(() => {
		const usage = usagePercentage();
		if (usage >= 100) return 'text-destructive';
		if (usage >= 80) return 'text-warning';
		return 'text-success';
	});

	const statusIcon = $derived(() => {
		const usage = usagePercentage();
		if (usage >= 100) return TrendingDown;
		if (usage >= 80) return TrendingDown;
		return TrendingUp;
	});
</script>

{#if isLoading}
	<Card>
		<CardContent class="pt-6">
			<div class="text-center text-muted-foreground">Loading allowance...</div>
		</CardContent>
	</Card>
{:else if allowance}
	<Card>
		<CardHeader class="pb-3">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Wallet class="w-5 h-5 text-primary" />
					<CardTitle class="text-lg">Spending Allowance</CardTitle>
				</div>
				<Badge variant={usagePercentage() >= 100 ? 'destructive' : usagePercentage() >= 80 ? 'warning' : 'default'}>
					{allowance.total.daysRemaining} days left
				</Badge>
			</div>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Main Allowance Display -->
			<div class="text-center space-y-1">
				<div class="text-3xl font-bold text-primary">
					{formatTransactionAmount(allowance.total.dailySafe, allowance.total.currency)}
				</div>
				<div class="text-sm text-muted-foreground">per day</div>
				<div class="text-xs text-muted-foreground">
					{formatTransactionAmount(allowance.total.monthly, allowance.total.currency)} this month
				</div>
			</div>

			<!-- Usage Progress -->
			<div class="space-y-2">
				<div class="flex items-center justify-between text-sm">
					<span class="text-muted-foreground">Spent this month</span>
					<span class="font-medium">
						{formatTransactionAmount(allowance.total.spentSoFar, allowance.total.currency)} / {formatTransactionAmount(allowance.total.monthly, allowance.total.currency)}
					</span>
				</div>
				<Progress value={usagePercentage()} max={100} class="h-2" />
				<div class="flex items-center justify-between text-xs">
					<span class="text-muted-foreground">Remaining</span>
					<span class="font-medium {statusColor()} flex items-center gap-1">
						<svelte:component this={statusIcon()} class="w-3 h-3" />
						{formatTransactionAmount(allowance.total.remaining, allowance.total.currency)}
					</span>
				</div>
			</div>

			<!-- Quick Breakdown -->
			<div class="grid grid-cols-3 gap-2 pt-2 border-t">
				<div class="text-center">
					<div class="text-xs text-muted-foreground">Essential</div>
					<div class="text-sm font-medium">
						{formatTransactionAmount(allowance.essential.remaining, allowance.essential.currency)}
					</div>
				</div>
				<div class="text-center">
					<div class="text-xs text-muted-foreground">Discretionary</div>
					<div class="text-sm font-medium">
						{formatTransactionAmount(allowance.discretionary.remaining, allowance.discretionary.currency)}
					</div>
				</div>
				<div class="text-center">
					<div class="text-xs text-muted-foreground">Buffer</div>
					<div class="text-sm font-medium">
						{formatTransactionAmount(allowance.buffer.remaining, allowance.buffer.currency)}
					</div>
				</div>
			</div>
		</CardContent>
	</Card>
{:else}
	<Card>
		<CardContent class="pt-6">
			<div class="text-center text-muted-foreground">Unable to calculate allowance</div>
		</CardContent>
	</Card>
{/if}

