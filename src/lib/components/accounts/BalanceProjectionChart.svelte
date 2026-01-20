<script lang="ts">
	import { onMount } from 'svelte';
	import type { AccountProjection, DailyBalanceProjection } from '$lib/core/services/analytics/balance-projection-service';
	import { balanceProjectionService } from '$lib/core/services/analytics/balance-projection-service';
	import { formatCurrencyAmount } from '$lib/utils/currency-utils';
	import type { BufferStatus } from '$lib/utils/account-metadata-utils';
	import { format, startOfDay, addDays } from 'date-fns';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge';
	import { AlertTriangle, TrendingDown, TrendingUp, Calendar, Wallet, AlertCircle } from '@lucide/svelte';
	import { Progress } from '$lib/components/ui/progress';

	interface Props {
		accountId?: string;
		daysAhead?: number;
		showDetails?: boolean;
		className?: string;
	}

	const { 
		accountId, 
		daysAhead = 90, 
		showDetails = true,
		className = '' 
	}: Props = $props();

	let projections = $state<AccountProjection[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedAccountId = $state<string | null>(accountId || null);
	let selectedProjection = $derived(
		selectedAccountId 
			? projections.find(p => p.accountId === selectedAccountId) 
			: projections[0] || null
	);

	// Calculate chart data
	type ChartData = {
		points: Array<{
			date: Date;
			balance: number;
			bufferAmount: number;
			bufferStatus: BufferStatus;
			isLowBalance: boolean;
			isBelowBuffer: boolean;
		}>;
		minBalance: number;
		maxBalance: number;
		bufferLine: number;
	};

	const chartData = $derived.by((): ChartData => {
		if (!selectedProjection) return { points: [], minBalance: 0, maxBalance: 0, bufferLine: 0 };
		
		const points = selectedProjection.projections.map(p => ({
			date: p.date,
			balance: p.balance,
			bufferAmount: p.bufferAmount,
			bufferStatus: p.bufferStatus,
			isLowBalance: p.isLowBalance,
			isBelowBuffer: p.isBelowBuffer
		}));

		const balances = points.map(p => p.balance);
		const minBalance = Math.min(...balances, 0);
		const maxBalance = Math.max(...balances, selectedProjection.startBalance * 1.1);

		return {
			points,
			minBalance,
			maxBalance,
			bufferLine: selectedProjection.projections[0]?.bufferAmount || 0
		};
	});

	// Get status color
	function getStatusColor(status: string): string {
		switch (status) {
			case 'optimal': return 'text-green-600 dark:text-green-400';
			case 'comfort': return 'text-blue-600 dark:text-blue-400';
			case 'warning': return 'text-yellow-600 dark:text-yellow-400';
			case 'critical': return 'text-red-600 dark:text-red-400';
			default: return 'text-gray-600 dark:text-gray-400';
		}
	}

	function getStatusBgColor(status: string): string {
		switch (status) {
			case 'optimal': return 'bg-green-100 dark:bg-green-900/20';
			case 'comfort': return 'bg-blue-100 dark:bg-blue-900/20';
			case 'warning': return 'bg-yellow-100 dark:bg-yellow-900/20';
			case 'critical': return 'bg-red-100 dark:bg-red-900/20';
			default: return 'bg-gray-100 dark:bg-gray-800';
		}
	}

	onMount(async () => {
		try {
			isLoading = true;
			error = null;
			
			const options = {
				accountIds: accountId ? [accountId] : undefined,
				daysAhead
			};
			
			projections = await balanceProjectionService.generateProjections(options);
			
			if (projections.length > 0 && !selectedAccountId) {
				selectedAccountId = projections[0].accountId;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load projections';
			console.error('Error loading balance projections:', err);
		} finally {
			isLoading = false;
		}
	});

	function formatDate(date: Date): string {
		return format(date, 'MMM d');
	}

	function getBalanceColor(balance: number, bufferAmount: number): string {
		if (balance < bufferAmount * 0.5) return 'stroke-red-500 fill-red-500/20';
		if (balance < bufferAmount) return 'stroke-yellow-500 fill-yellow-500/20';
		if (balance < bufferAmount * 1.5) return 'stroke-blue-500 fill-blue-500/20';
		return 'stroke-green-500 fill-green-500/20';
	}
</script>

<div class={className}>
	{#if isLoading}
		<Card>
			<CardContent class="p-6">
				<div class="flex items-center justify-center py-8">
					<div class="text-muted-foreground">Loading projections...</div>
				</div>
			</CardContent>
		</Card>
	{:else if error}
		<Card>
			<CardContent class="p-6">
				<div class="flex items-center gap-2 text-destructive">
					<AlertCircle class="w-5 h-5" />
					<div>{error}</div>
				</div>
			</CardContent>
		</Card>
	{:else if projections.length === 0}
		<Card>
			<CardContent class="p-6">
				<div class="text-center text-muted-foreground py-8">
					No accounts available for projection
				</div>
			</CardContent>
		</Card>
	{:else}
		<!-- Account Selector (if multiple accounts) -->
		{#if projections.length > 1}
			<Card class="mb-4">
				<CardContent class="p-4">
					<div class="flex gap-2 flex-wrap">
						{#each projections as projection (projection.accountId)}
							<button
								onclick={() => selectedAccountId = projection.accountId}
								class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {selectedAccountId === projection.accountId 
									? 'bg-primary text-primary-foreground' 
									: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
							>
								{projection.accountName}
							</button>
						{/each}
					</div>
				</CardContent>
			</Card>
		{/if}

		{#if selectedProjection}
			<!-- Summary Cards -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
				<Card>
					<CardHeader class="pb-3">
						<CardTitle class="text-sm font-medium text-muted-foreground">Minimum Balance</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="flex items-center gap-2">
							<Wallet class="w-5 h-5 text-muted-foreground" />
							<div>
								<div class="text-2xl font-bold">
									{formatCurrencyAmount(selectedProjection.minimumBalance, selectedProjection.currency)}
								</div>
								{#if selectedProjection.minimumBalanceDate}
									<div class="text-xs text-muted-foreground">
										{format(selectedProjection.minimumBalanceDate, 'MMM d, yyyy')}
									</div>
								{/if}
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader class="pb-3">
						<CardTitle class="text-sm font-medium text-muted-foreground">Low Balance Days</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="flex items-center gap-2">
							<AlertTriangle class="w-5 h-5 {selectedProjection.lowBalanceDays > 0 ? 'text-yellow-500' : 'text-muted-foreground'}" />
							<div>
								<div class="text-2xl font-bold">
									{selectedProjection.lowBalanceDays}
								</div>
								<div class="text-xs text-muted-foreground">days below buffer</div>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader class="pb-3">
						<CardTitle class="text-sm font-medium text-muted-foreground">Below Buffer</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="flex items-center gap-2">
							<AlertCircle class="w-5 h-5 {selectedProjection.belowBufferDays > 0 ? 'text-red-500' : 'text-muted-foreground'}" />
							<div>
								<div class="text-2xl font-bold">
									{selectedProjection.belowBufferDays}
								</div>
								<div class="text-xs text-muted-foreground">days</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<!-- Projection Chart -->
			<Card>
				<CardHeader>
					<CardTitle>Balance Projection</CardTitle>
					<CardDescription>
						{daysAhead}-day projection based on scheduled and recurring transactions
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="space-y-4">
						<!-- Simple Line Chart Visualization -->
						<div class="relative h-64 w-full">
							<svg class="w-full h-full" viewBox="0 0 800 200" preserveAspectRatio="none">
								<!-- Buffer line -->
								<line
									x1="0"
									y1={200 - (chartData.bufferLine - chartData.minBalance) / (chartData.maxBalance - chartData.minBalance) * 200}
									x2="800"
									y2={200 - (chartData.bufferLine - chartData.minBalance) / (chartData.maxBalance - chartData.minBalance) * 200}
									stroke="rgb(234, 179, 8)"
									stroke-width="2"
									stroke-dasharray="4 4"
									opacity="0.6"
								/>
								
								<!-- Balance line -->
								<polyline
									points={chartData.points.map((p: { balance: number }, i: number) => 
										`${(i / (chartData.points.length - 1)) * 800},${200 - ((p.balance - chartData.minBalance) / (chartData.maxBalance - chartData.minBalance)) * 200}`
									).join(' ')}
									fill="none"
									stroke="rgb(59, 130, 246)"
									stroke-width="2"
								/>
								
								<!-- Low balance areas -->
								{#each chartData.points as point, i (i)}
									{#if point.isBelowBuffer}
										<circle
											cx={(i / (chartData.points.length - 1)) * 800}
											cy={200 - ((point.balance - chartData.minBalance) / (chartData.maxBalance - chartData.minBalance)) * 200}
											r="4"
											fill="rgb(239, 68, 68)"
										/>
									{/if}
								{/each}
							</svg>
							
							<!-- Legend -->
							<div class="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-muted-foreground px-2">
								<span>{formatDate(selectedProjection.projections[0]?.date || new Date())}</span>
								<span>{formatDate(selectedProjection.projections[selectedProjection.projections.length - 1]?.date || new Date())}</span>
							</div>
						</div>

						<!-- Legend -->
						<div class="flex items-center gap-4 text-xs">
							<div class="flex items-center gap-2">
								<div class="w-4 h-0.5 bg-blue-500"></div>
								<span class="text-muted-foreground">Projected Balance</span>
							</div>
							<div class="flex items-center gap-2">
								<div class="w-4 h-0.5 bg-yellow-500 border-dashed border-t-2"></div>
								<span class="text-muted-foreground">Buffer Level</span>
							</div>
							<div class="flex items-center gap-2">
								<div class="w-2 h-2 rounded-full bg-red-500"></div>
								<span class="text-muted-foreground">Below Buffer</span>
							</div>
						</div>

						<!-- Key Dates -->
						{#if showDetails && selectedProjection.minimumBalanceDate}
							<div class="pt-4 border-t">
								<div class="flex items-center gap-2 text-sm">
									<Calendar class="w-4 h-4 text-muted-foreground" />
									<span class="text-muted-foreground">Lowest balance:</span>
									<span class="font-medium">
										{formatCurrencyAmount(selectedProjection.minimumBalance, selectedProjection.currency)}
									</span>
									<span class="text-muted-foreground">on</span>
									<span class="font-medium">
										{format(selectedProjection.minimumBalanceDate, 'MMM d, yyyy')}
									</span>
								</div>
							</div>
						{/if}
					</div>
				</CardContent>
			</Card>

			<!-- Alerts Section -->
			{#if selectedProjection.belowBufferDays > 0}
				<Card class="mt-4 border-yellow-500/50">
					<CardHeader>
						<CardTitle class="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
							<AlertTriangle class="w-5 h-5" />
							Low Balance Alerts
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="space-y-2">
							<p class="text-sm text-muted-foreground">
								Your account will go below the buffer on <strong>{selectedProjection.belowBufferDays}</strong> day{selectedProjection.belowBufferDays !== 1 ? 's' : ''} in the next {daysAhead} days.
							</p>
							{#if selectedProjection.minimumBalanceDate}
								<p class="text-sm">
									The lowest projected balance is <strong>{formatCurrencyAmount(selectedProjection.minimumBalance, selectedProjection.currency)}</strong> on {format(selectedProjection.minimumBalanceDate, 'MMMM d, yyyy')}.
								</p>
							{/if}
						</div>
					</CardContent>
				</Card>
			{/if}
		{/if}
	{/if}
</div>
