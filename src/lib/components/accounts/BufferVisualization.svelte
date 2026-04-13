<script lang="ts">
	import type { Account } from '$lib/core/db';
	import {
		getBufferAmount,
		getBufferStatus,
		getBufferThresholds,
		getBufferDeficit,
		getBufferSurplus
	} from '$lib/utils/account-metadata-utils';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { AlertCircle, CheckCircle2, AlertTriangle, TrendingUp } from '@lucide/svelte';
	import { Progress } from '$lib/components/ui/progress';

	interface Props {
		account: Account;
		showDetails?: boolean;
	}

	const { account, showDetails = true }: Props = $props();

	const bufferAmount = $derived(getBufferAmount(account));
	const bufferStatus = $derived(getBufferStatus(account));
	const thresholds = $derived(getBufferThresholds(account));
	const deficit = $derived(getBufferDeficit(account));
	const surplus = $derived(getBufferSurplus(account));

	const statusConfig = $derived({
		optimal: {
			icon: CheckCircle2,
			color: 'text-success',
			bgColor: 'bg-success/10',
			label: 'Optimal',
			description: 'Account has a healthy buffer'
		},
		comfort: {
			icon: TrendingUp,
			color: 'text-info',
			bgColor: 'bg-info/10',
			label: 'Comfortable',
			description: 'Account is above buffer threshold'
		},
		warning: {
			icon: AlertTriangle,
			color: 'text-warning',
			bgColor: 'bg-warning/10',
			label: 'Warning',
			description: 'Account is approaching buffer threshold'
		},
		critical: {
			icon: AlertCircle,
			color: 'text-destructive',
			bgColor: 'bg-destructive/10',
			label: 'Critical',
			description: 'Account is below buffer threshold'
		}
	});

	const currentConfig = $derived(statusConfig[bufferStatus]);
	const BufferStatusIcon = $derived(currentConfig.icon);

	// Calculate progress percentage (0-100) based on buffer thresholds
	const progressPercentage = $derived(() => {
		if (bufferAmount === 0) return 100; // No buffer requirement

		const balance = account.currentBalance;
		const maxThreshold = thresholds.optimal;

		if (balance >= maxThreshold) return 100;
		if (balance <= 0) return 0;

		// Map balance to 0-100% scale
		return Math.min(100, (balance / maxThreshold) * 100);
	});

	// Calculate which threshold the balance is closest to
	const currentThreshold = $derived(() => {
		const balance = account.currentBalance;

		if (balance >= thresholds.optimal) return 'optimal';
		if (balance >= thresholds.comfort) return 'comfort';
		if (balance >= thresholds.warning) return 'warning';
		return 'critical';
	});
</script>

{#if bufferAmount > 0}
	<div class="space-y-3">
		<!-- Buffer Status Header -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<BufferStatusIcon class="h-5 w-5 {currentConfig.color}" />
				<div>
					<div class="text-primary font-medium">{currentConfig.label}</div>
					{#if showDetails}
						<div class="text-muted-foreground text-sm">
							{currentConfig.description}
						</div>
					{/if}
				</div>
			</div>
			<div class="text-right">
				<div class="text-primary text-sm font-medium">
					Buffer: {formatTransactionAmount(bufferAmount, account.currency)}
				</div>
				{#if deficit > 0}
					<div class="text-destructive text-xs">
						{formatTransactionAmount(deficit, account.currency)} below
					</div>
				{:else if surplus > 0}
					<div class="text-success text-xs">
						{formatTransactionAmount(surplus, account.currency)} above
					</div>
				{/if}
			</div>
		</div>

		<!-- Progress Bar -->
		<div class="space-y-1">
			<Progress value={progressPercentage()} max={100} class="h-2" />

			{#if showDetails}
				<div class="text-muted-foreground flex justify-between text-xs">
					<span>Current: {formatTransactionAmount(account.currentBalance, account.currency)}</span>
					<span>Target: {formatTransactionAmount(thresholds.optimal, account.currency)}</span>
				</div>
			{/if}
		</div>

		<!-- Threshold Indicators (Optional - only show if details enabled) -->
		{#if showDetails && account.currentBalance < thresholds.optimal}
			<div class="grid grid-cols-4 gap-2 text-xs">
				<div
					class="rounded p-2 text-center {account.currentBalance < thresholds.critical
						? 'bg-destructive/10 text-destructive'
						: 'bg-muted/50'}"
				>
					<div class="font-medium">Critical</div>
					<div class="text-muted-foreground">
						{formatTransactionAmount(thresholds.critical, account.currency)}
					</div>
				</div>
				<div
					class="rounded p-2 text-center {account.currentBalance < thresholds.warning &&
					account.currentBalance >= thresholds.critical
						? 'bg-warning/10 text-warning'
						: 'bg-muted/50'}"
				>
					<div class="font-medium">Warning</div>
					<div class="text-muted-foreground">
						{formatTransactionAmount(thresholds.warning, account.currency)}
					</div>
				</div>
				<div
					class="rounded p-2 text-center {account.currentBalance < thresholds.comfort &&
					account.currentBalance >= thresholds.warning
						? 'bg-info/10 text-info'
						: 'bg-muted/50'}"
				>
					<div class="font-medium">Comfort</div>
					<div class="text-muted-foreground">
						{formatTransactionAmount(thresholds.comfort, account.currency)}
					</div>
				</div>
				<div
					class="rounded p-2 text-center {account.currentBalance >= thresholds.comfort
						? 'bg-success/10 text-success'
						: 'bg-muted/50'}"
				>
					<div class="font-medium">Optimal</div>
					<div class="text-muted-foreground">
						{formatTransactionAmount(thresholds.optimal, account.currency)}
					</div>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<div class="text-muted-foreground text-sm">No buffer set for this account</div>
{/if}
