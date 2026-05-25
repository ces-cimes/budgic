<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		AccountProjection,
		DailyBalanceProjection
	} from '$lib/core/services/analytics/balance-projection-service';
	import { balanceProjectionService } from '$lib/core/services/analytics/balance-projection-service';
	import { formatCurrencyAmount } from '$lib/utils/currency-utils';
	import type { BufferStatus } from '$lib/utils/account-metadata-utils';
	import { format, startOfDay, addDays } from 'date-fns';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card/index.ts';
	import { EmptyState } from '$lib/components/ui/empty-state';
	import { Badge } from '$lib/components/ui/badge';
	import {
		AlertTriangle,
		TrendingDown,
		TrendingUp,
		Calendar,
		Wallet,
		AlertCircle
	} from '@lucide/svelte';
	import { Progress } from '$lib/components/ui/progress';

	interface Props {
		accountId?: string;
		daysAhead?: number;
		showDetails?: boolean;
		className?: string;
		showTemporalBoundary?: boolean;
	}

	const {
		accountId,
		daysAhead = 90,
		showDetails = true,
		className = '',
		showTemporalBoundary = false
	}: Props = $props();

	let projections = $state<AccountProjection[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedAccountId = $state<string | null>(null);

	$effect.pre(() => {
		selectedAccountId = accountId || null;
	});
	let selectedProjection = $derived(
		selectedAccountId
			? projections.find((p) => p.accountId === selectedAccountId)
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

		const points = selectedProjection.projections.map((p) => ({
			date: p.date,
			balance: p.balance,
			bufferAmount: p.bufferAmount,
			bufferStatus: p.bufferStatus,
			isLowBalance: p.isLowBalance,
			isBelowBuffer: p.isBelowBuffer
		}));

		const balances = points.map((p) => p.balance);
		const bufferLine = selectedProjection.projections[0]?.bufferAmount ?? 0;
		// Scale Y-axis from actual data range + buffer so the balance line is visible (not squashed by startBalance)
		const dataMin = balances.length ? Math.min(...balances, 0) : 0;
		const dataMax = balances.length
			? Math.max(...balances, bufferLine)
			: Math.max(bufferLine, selectedProjection.startBalance);
		const range = Math.max(dataMax - dataMin, 1);
		const padding = range * 0.1;
		const minBalance = dataMin - padding;
		const maxBalance = dataMax + padding;

		return {
			points,
			minBalance,
			maxBalance,
			bufferLine
		};
	});

	// Get status color
	function getStatusColor(status: string): string {
		switch (status) {
			case 'optimal':
				return 'text-green-600 dark:text-green-400';
			case 'comfort':
				return 'text-blue-600 dark:text-blue-400';
			case 'warning':
				return 'text-yellow-600 dark:text-yellow-400';
			case 'critical':
				return 'text-red-600 dark:text-red-400';
			default:
				return 'text-gray-600 dark:text-gray-400';
		}
	}

	function getStatusBgColor(status: string): string {
		switch (status) {
			case 'optimal':
				return 'bg-green-100 dark:bg-green-900/20';
			case 'comfort':
				return 'bg-blue-100 dark:bg-blue-900/20';
			case 'warning':
				return 'bg-yellow-100 dark:bg-yellow-900/20';
			case 'critical':
				return 'bg-red-100 dark:bg-red-900/20';
			default:
				return 'bg-gray-100 dark:bg-gray-800';
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
		if (balance < bufferAmount * 1.5)
			return 'stroke-[var(--color-amber)] fill-[var(--color-amber)]/20';
		return 'stroke-green-500 fill-green-500/20';
	}

	function getXPosition(index: number, total: number): number {
		if (total <= 1) return 0;
		return (index / (total - 1)) * 800;
	}

	function getYPosition(balance: number): number {
		const range = chartData.maxBalance - chartData.minBalance;
		if (range <= 0) return 200;
		return 200 - ((balance - chartData.minBalance) / range) * 200;
	}

	const temporalBoundary = $derived.by(() => {
		const points = chartData.points;
		if (!showTemporalBoundary || points.length <= 1) {
			return {
				actualPolylinePoints: '',
				forecastPolylinePoints: '',
				todayX: null as number | null,
				hasTemporalSegments: false
			};
		}

		const todayStart = startOfDay(new Date()).getTime();
		const firstForecastIndex = points.findIndex((point) => point.date.getTime() >= todayStart);
		if (firstForecastIndex <= 0 || firstForecastIndex >= points.length) {
			return {
				actualPolylinePoints: '',
				forecastPolylinePoints: '',
				todayX: null,
				hasTemporalSegments: false
			};
		}

		const actualIndices = Array.from({ length: firstForecastIndex + 1 }, (_, i) => i);
		const forecastIndices = Array.from(
			{ length: points.length - firstForecastIndex + 1 },
			(_, i) => i + firstForecastIndex - 1
		);

		const actualPolylinePoints = actualIndices
			.map(
				(index) => `${getXPosition(index, points.length)},${getYPosition(points[index].balance)}`
			)
			.join(' ');
		const forecastPolylinePoints = forecastIndices
			.map(
				(index) => `${getXPosition(index, points.length)},${getYPosition(points[index].balance)}`
			)
			.join(' ');

		return {
			actualPolylinePoints,
			forecastPolylinePoints,
			todayX: getXPosition(firstForecastIndex, points.length),
			hasTemporalSegments: true
		};
	});
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
				<div class="text-destructive flex items-center gap-2">
					<AlertCircle class="h-5 w-5" />
					<div>{error}</div>
				</div>
			</CardContent>
		</Card>
	{:else if projections.length === 0}
		<Card>
			<CardContent class="p-6">
				<EmptyState body="No accounts available for projection" class="py-8" />
			</CardContent>
		</Card>
	{:else}
		<!-- Account Selector (if multiple accounts) -->
		{#if projections.length > 1}
			<Card class="mb-4">
				<CardContent class="p-4">
					<div class="flex flex-wrap gap-2">
						{#each projections as projection (projection.accountId)}
							<button
								onclick={() => (selectedAccountId = projection.accountId)}
								class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {selectedAccountId ===
								projection.accountId
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
			<div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
				<Card>
					<CardHeader class="pb-3">
						<CardTitle class="text-muted-foreground text-sm font-medium">Minimum Balance</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="flex items-center gap-2">
							<Wallet class="text-muted-foreground h-5 w-5" />
							<div>
								<div class="text-2xl font-bold">
									{formatCurrencyAmount(
										selectedProjection.minimumBalance,
										selectedProjection.currency
									)}
								</div>
								{#if selectedProjection.minimumBalanceDate}
									<div class="text-muted-foreground text-xs">
										{format(selectedProjection.minimumBalanceDate, 'MMM d, yyyy')}
									</div>
								{/if}
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader class="pb-3">
						<CardTitle class="text-muted-foreground text-sm font-medium">Low Balance Days</CardTitle
						>
					</CardHeader>
					<CardContent>
						<div class="flex items-center gap-2">
							<AlertTriangle
								class="h-5 w-5 {selectedProjection.lowBalanceDays > 0
									? 'text-yellow-500'
									: 'text-muted-foreground'}"
							/>
							<div>
								<div class="text-2xl font-bold">
									{selectedProjection.lowBalanceDays}
								</div>
								<div class="text-muted-foreground text-xs">days below buffer</div>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader class="pb-3">
						<CardTitle class="text-muted-foreground text-sm font-medium">Below Buffer</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="flex items-center gap-2">
							<AlertCircle
								class="h-5 w-5 {selectedProjection.belowBufferDays > 0
									? 'text-red-500'
									: 'text-muted-foreground'}"
							/>
							<div>
								<div class="text-2xl font-bold">
									{selectedProjection.belowBufferDays}
								</div>
								<div class="text-muted-foreground text-xs">days</div>
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
							<svg class="h-full w-full" viewBox="0 0 800 200" preserveAspectRatio="none">
								<!-- Buffer line -->
								<line
									x1="0"
									y1={200 -
										((chartData.bufferLine - chartData.minBalance) /
											(chartData.maxBalance - chartData.minBalance)) *
											200}
									x2="800"
									y2={200 -
										((chartData.bufferLine - chartData.minBalance) /
											(chartData.maxBalance - chartData.minBalance)) *
											200}
									stroke="rgb(234, 179, 8)"
									stroke-width="2"
									stroke-dasharray="4 4"
									opacity="0.6"
								/>

								<!-- Balance line -->
								{#if temporalBoundary.hasTemporalSegments}
									{#if temporalBoundary.todayX !== null}
										<line
											x1={temporalBoundary.todayX}
											y1="0"
											x2={temporalBoundary.todayX}
											y2="200"
											stroke="var(--color-text-tertiary)"
											stroke-width="1.5"
											stroke-dasharray="3 3"
											opacity="0.75"
										/>
									{/if}
									<polyline
										points={temporalBoundary.actualPolylinePoints}
										fill="none"
										stroke="var(--color-amber)"
										stroke-width="2"
									/>
									<polyline
										points={temporalBoundary.forecastPolylinePoints}
										fill="none"
										stroke="var(--color-amber)"
										stroke-width="2"
										stroke-dasharray="5 4"
									/>
								{:else if chartData.points.length > 1 && chartData.maxBalance - chartData.minBalance > 0}
									<polyline
										points={chartData.points
											.map(
												(p: { balance: number }, i: number) =>
													`${(i / (chartData.points.length - 1)) * 800},${200 - ((p.balance - chartData.minBalance) / (chartData.maxBalance - chartData.minBalance)) * 200}`
											)
											.join(' ')}
										fill="none"
										stroke="var(--color-amber)"
										stroke-width="2"
									/>
								{/if}

								<!-- Low balance areas -->
								{#each chartData.points as point, i (i)}
									{#if point.isBelowBuffer}
										<circle
											cx={(i / (chartData.points.length - 1)) * 800}
											cy={200 -
												((point.balance - chartData.minBalance) /
													(chartData.maxBalance - chartData.minBalance)) *
													200}
											r="4"
											fill="rgb(239, 68, 68)"
										/>
									{/if}
								{/each}
							</svg>

							<!-- Legend -->
							<div
								class="text-muted-foreground absolute right-0 bottom-0 left-0 flex justify-between px-2 text-xs"
							>
								<span>{formatDate(selectedProjection.projections[0]?.date || new Date())}</span>
								<span
									>{formatDate(
										selectedProjection.projections[selectedProjection.projections.length - 1]
											?.date || new Date()
									)}</span
								>
							</div>
						</div>

						<!-- Legend -->
						<div class="flex items-center gap-4 text-xs">
							{#if temporalBoundary.hasTemporalSegments}
								<div class="flex items-center gap-2">
									<div class="h-0.5 w-4 bg-[var(--color-amber)]"></div>
									<span class="text-muted-foreground">Actual balance</span>
								</div>
								<div class="flex items-center gap-2">
									<div class="h-0.5 w-4 border-t-2 border-dashed border-[var(--color-amber)]"></div>
									<span class="text-muted-foreground">Projected balance</span>
								</div>
								<div class="flex items-center gap-2">
									<div
										class="h-3 w-0 border-r-2 border-dashed border-[var(--color-text-tertiary)]"
									></div>
									<span class="text-muted-foreground">Today boundary</span>
								</div>
							{:else}
								<div class="flex items-center gap-2">
									<div class="h-0.5 w-4 bg-[var(--color-amber)]"></div>
									<span class="text-muted-foreground">Projected Balance</span>
								</div>
							{/if}
							<div class="flex items-center gap-2">
								<div class="h-0.5 w-4 border-t-2 border-dashed bg-yellow-500"></div>
								<span class="text-muted-foreground">Buffer Level</span>
							</div>
							<div class="flex items-center gap-2">
								<div class="h-2 w-2 rounded-full bg-red-500"></div>
								<span class="text-muted-foreground">Below Buffer</span>
							</div>
						</div>

						<!-- Key Dates -->
						{#if showDetails && selectedProjection.minimumBalanceDate}
							<div class="border-t pt-4">
								<div class="flex items-center gap-2 text-sm">
									<Calendar class="text-muted-foreground h-4 w-4" />
									<span class="text-muted-foreground">Lowest balance:</span>
									<span class="font-medium">
										{formatCurrencyAmount(
											selectedProjection.minimumBalance,
											selectedProjection.currency
										)}
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
							<AlertTriangle class="h-5 w-5" />
							Low Balance Alerts
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="space-y-2">
							<p class="text-muted-foreground text-sm">
								Your account will go below the buffer on <strong
									>{selectedProjection.belowBufferDays}</strong
								>
								day{selectedProjection.belowBufferDays !== 1 ? 's' : ''} in the next {daysAhead} days.
							</p>
							{#if selectedProjection.minimumBalanceDate}
								<p class="text-sm">
									The lowest projected balance is <strong
										>{formatCurrencyAmount(
											selectedProjection.minimumBalance,
											selectedProjection.currency
										)}</strong
									>
									on {format(selectedProjection.minimumBalanceDate, 'MMMM d, yyyy')}.
								</p>
							{/if}
						</div>
					</CardContent>
				</Card>
			{/if}
		{/if}
	{/if}
</div>
