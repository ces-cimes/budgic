<script lang="ts">
	import type { PredictionsTabProps, PredictionInsight } from '../types';
	import { insightsService } from '$lib/core/services';
	import { formatAmount, getUserMainCurrency } from '$lib/utils/currency-utils';
	import { onMount } from 'svelte';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import {
		TrendingUp,
		Target,
		AlertTriangle,
		DollarSign,
		Calendar,
		Search,
		Sparkles,
		Clock,
		BarChart3,
		ArrowRight
	} from '@lucide/svelte';

	interface Props {
		isLoading: boolean;
		onAction?: (predictionId: string) => void;
		className?: string;
	}

	const { isLoading, onAction, className = '' }: Props = $props();

	// Real predictions from insights service
	let predictions = $state<PredictionInsight[]>([]);
	let localLoading = $state(false);
	let userCurrency = $state<string>('');

	// Load predictions function
	async function loadPredictions() {
		localLoading = true;
		try {
			predictions = await insightsService.getPredictionInsights();
		} catch (error) {
			console.error('Error loading predictions:', error);
			predictions = [];
		} finally {
			localLoading = false;
		}
	}

	// Load currency and predictions on mount
	onMount(async () => {
		// Get user currency preference
		userCurrency = await getUserMainCurrency();
		await loadPredictions();
	});

	function handleAction(predictionId: string) {
		if (onAction) {
			onAction(predictionId);
		}
	}

	function getPredictionIcon(type: string) {
		switch (type) {
			case 'spending_forecast':
				return TrendingUp;
			case 'goal_completion':
				return Target;
			case 'budget_risk':
				return AlertTriangle;
			case 'income_timing':
				return DollarSign;
			case 'seasonal_pattern':
				return Calendar;
			case 'anomaly_detection':
				return Search;
			default:
				return Sparkles;
		}
	}

	function getRiskBadgeVariant(
		riskLevel: string
	): 'default' | 'destructive' | 'secondary' | 'outline' {
		switch (riskLevel) {
			case 'high':
				return 'destructive';
			case 'medium':
				return 'secondary';
			case 'low':
				return 'default';
			default:
				return 'outline';
		}
	}

	function formatCurrency(amount: number) {
		// Use currency if available, otherwise format will handle it
		return formatAmount(amount, userCurrency || 'USD');
	}

	function formatTimeRemaining(expiresAt: string) {
		const now = new Date();
		const expiry = new Date(expiresAt);
		const diffMs = expiry.getTime() - now.getTime();
		const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays <= 0) return 'Expired';
		if (diffDays === 1) return '1 day left';
		return `${diffDays} days left`;
	}
</script>

<div class="predictions-tab h-full overflow-y-auto {className}">
	<div class="space-y-4 py-2 sm:space-y-6 sm:py-4">
		<!-- Loading State -->
		{#if isLoading || localLoading}
			<div class="space-y-3">
				{#each Array(3) as _}
					<div class="h-20 animate-pulse rounded-xl bg-[var(--color-bg-tertiary)]"></div>
				{/each}
			</div>
		{:else if predictions.length === 0}
			<div class="py-12 text-center">
				<div
					class="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full sm:mb-6 sm:h-20 sm:w-20"
				>
					<Sparkles class="text-muted-foreground h-8 w-8 sm:h-10 sm:w-10" />
				</div>
				<h3 class="text-foreground mb-2 text-lg font-semibold sm:text-xl">
					No predictions available
				</h3>
				<p class="text-muted-foreground mx-auto mb-6 max-w-md px-4 text-sm">
					We need more data to generate accurate predictions. Keep tracking your finances and we'll
					start providing forecasts soon.
				</p>
			</div>
		{:else}
			<div class="space-y-3 sm:space-y-4">
				{#each predictions as prediction (prediction.id)}
					{@const Icon = getPredictionIcon(prediction.type)}
					<div class="bg-card border-border rounded-lg border p-3 sm:p-4">
						<div class="flex items-start gap-2 sm:gap-3">
							<!-- Prediction Icon -->
							<div class="flex-shrink-0">
								<div
									class="bg-secondary flex h-7 w-7 items-center justify-center rounded-full sm:h-8 sm:w-8"
								>
									<Icon class="text-secondary-foreground h-4 w-4 sm:h-5 sm:w-5" />
								</div>
							</div>

							<!-- Content -->
							<div class="min-w-0 flex-1">
								<!-- Header: Title and Risk Badge -->
								<div class="mb-2 flex items-start justify-between gap-2">
									<h3
										class="text-foreground min-w-0 flex-1 text-sm leading-tight font-semibold sm:text-base"
									>
										{prediction.title}
									</h3>
									<Badge
										variant={getRiskBadgeVariant(prediction.riskLevel)}
										class="flex-shrink-0 text-[10px] sm:text-xs"
									>
										{prediction.riskLevel}
									</Badge>
								</div>

								<!-- Prediction Metrics - Compact Grid -->
								<div class="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
									{#if prediction.predictedValue !== undefined && prediction.predictedValue !== null}
										<div class="min-w-0">
											<div class="text-muted-foreground truncate text-[10px] sm:text-xs">
												Predicted
											</div>
											<div class="text-foreground truncate text-xs font-semibold sm:text-sm">
												{formatCurrency(prediction.predictedValue)}
											</div>
										</div>
									{/if}

									{#if prediction.currentValue !== undefined && prediction.currentValue !== null && prediction.currentValue > 0}
										<div class="min-w-0">
											<div class="text-muted-foreground truncate text-[10px] sm:text-xs">
												Current
											</div>
											<div class="text-foreground truncate text-xs font-semibold sm:text-sm">
												{formatCurrency(prediction.currentValue)}
											</div>
										</div>
									{/if}

									<div class="min-w-0">
										<div class="text-muted-foreground truncate text-[10px] sm:text-xs">
											Confidence
										</div>
										<div class="text-foreground truncate text-xs font-semibold sm:text-sm">
											{prediction.confidence}%
										</div>
									</div>

									<div class="min-w-0">
										<div class="text-muted-foreground truncate text-[10px] sm:text-xs">
											Timeframe
										</div>
										<div class="text-foreground truncate text-xs font-semibold sm:text-sm">
											{prediction.timeframe}
										</div>
									</div>
								</div>

								<!-- Footer: Metadata and Action -->
								<div
									class="text-muted-foreground flex flex-wrap items-center gap-2 text-[10px] sm:gap-3 sm:text-xs"
								>
									<span class="flex flex-shrink-0 items-center gap-1">
										<Clock class="h-3 w-3" />
										{formatTimeRemaining(prediction.expiresAt)}
									</span>

									{#if prediction.metadata.algorithm}
										<span class="flex flex-shrink-0 items-center gap-1">
											<BarChart3 class="h-3 w-3" />
											<span class="max-w-[100px] truncate sm:max-w-none"
												>{prediction.metadata.algorithm}</span
											>
										</span>
									{/if}

									{#if prediction.actionable && prediction.actionText}
										<Button
											onclick={() => handleAction(prediction.id)}
											variant="outline"
											size="sm"
											class="ml-auto h-auto flex-shrink-0 px-2 py-1 text-[10px] sm:px-3 sm:text-xs"
										>
											{prediction.actionText}
											<ArrowRight class="ml-1 h-3 w-3" />
										</Button>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
