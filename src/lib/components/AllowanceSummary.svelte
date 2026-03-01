<script lang="ts">
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import type { NegativeAllowanceStatus, RecoverySuggestion } from '$lib/core/services/core/negative-allowance-service';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Lightbulb } from '@lucide/svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';

	interface Props {
		allowance: EnhancedAllowance | null;
		isLoading?: boolean;
		/** When spending exceeds allowance (user preference: allow_with_strong_warning default) */
		negativeStatus?: NegativeAllowanceStatus | null;
		/** Recovery suggestions when allowance is negative */
		recoverySuggestions?: RecoverySuggestion[];
	}

	const { allowance, isLoading = false, negativeStatus = null, recoverySuggestions = [] }: Props = $props();

	const showNegativeWarning = $derived(
		negativeStatus?.isNegative &&
			(negativeStatus.handlingMode === 'allow_with_strong_warning' || negativeStatus.handlingMode === 'block_with_warning')
	);

	const usagePercentage = $derived(() => {
		if (!allowance) return 0;
		if (allowance.total.monthly === 0) return allowance.total.spentSoFar > 0 ? 100 : 0;
		return Math.min(100, (allowance.total.spentSoFar / allowance.total.monthly) * 100);
	});

	const hasZeroAllowance = $derived(allowance?.total.monthly != null && allowance.total.monthly <= 0);

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
				<Badge variant={usagePercentage() >= 100 ? 'destructive' : usagePercentage() >= 80 ? 'secondary' : 'default'}>
					{allowance.total.daysRemaining} days left
				</Badge>
			</div>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Negative Allowance Warning (strong warning as default behaviour) -->
			{#if showNegativeWarning && negativeStatus?.warningMessage}
				<Alert variant="destructive" class="border-destructive/50">
					<AlertTriangle class="size-4" />
					<AlertTitle>Over allowance</AlertTitle>
					<AlertDescription>
						<p class="font-medium">{negativeStatus.warningMessage}</p>
						{#if recoverySuggestions.length > 0}
							<ul class="mt-2 list-none space-y-1 text-sm">
								{#each recoverySuggestions as suggestion}
									<li class="flex items-start gap-2">
										<Lightbulb class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
										<span>{suggestion.title}: {suggestion.description}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</AlertDescription>
				</Alert>
			{/if}

			{#if hasZeroAllowance}
				<div class="bg-muted/50 border-border rounded-lg border px-4 py-3 text-sm text-muted-foreground">
					No spending allowance (zero balance or no data). Add funds or historical transactions to see an allowance.
				</div>
			{/if}

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

