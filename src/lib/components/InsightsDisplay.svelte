<script lang="ts">
	import { onMount } from 'svelte';
	import { insightsService, settingsService } from '$lib/core/services';
	import { AlertTriangle, CheckCircle, Info, X } from '@lucide/svelte';
	import * as Alert from '$lib/components/ui/alert/index.ts';
	import { Button }from '$lib/components/ui/button/index.ts';
	import type { Insight } from '$lib/core/services/insights-service';

	interface Props {
		maxInsights?: number;
		showDismiss?: boolean;
		filterBySeverity?: Insight['severity'][];
		filterByType?: Insight['type'][];
		className?: string;
	}

	const { 
		maxInsights = 5, 
		showDismiss = true, 
		filterBySeverity = undefined,
		filterByType = undefined,
		className = ''
	}: Props = $props();

	let insights = $state<Insight[]>([]);
	let isLoading = $state(true);
	let userCurrency = $state<string>('USD');

	onMount(() => {
		// Load user currency preference and insights
		(async () => {
			try {
				userCurrency = await settingsService.getCurrency();
			} catch (error) {
				console.error('Error loading user currency:', error);
			}
			
			loadInsights();
		})();
		
		// Set up reactive updates
		const interval = setInterval(() => {
			loadInsights();
		}, 30000); // Update every 30 seconds

		return () => clearInterval(interval);
	});

	function loadInsights() {
		let filteredInsights = insightsService.getInsights();

		// Apply filters
		if (filterBySeverity) {
			filteredInsights = filteredInsights.filter(insight => 
				filterBySeverity.includes(insight.severity)
			);
		}

		if (filterByType) {
			filteredInsights = filteredInsights.filter(insight => 
				filterByType.includes(insight.type)
			);
		}

		// Limit number of insights
		insights = filteredInsights.slice(0, maxInsights);
		isLoading = false;
	}

	async function dismissInsight(insightId: string) {
		await insightsService.dismissInsight(insightId);
		loadInsights(); // Reload to reflect changes
	}

	function getSeverityIcon(severity: Insight['severity']) {
		switch (severity) {
			case 'alert': return AlertTriangle;
			case 'warning': return AlertTriangle;
			case 'success': return CheckCircle;
			case 'info': return Info;
			default: return Info;
		}
	}

	function getSeverityColor(severity: Insight['severity']) {
		switch (severity) {
			case 'alert': return 'border-destructive/50 bg-destructive/10';
			case 'warning': return 'border-warning/50 bg-warning/10';
			case 'success': return 'border-success/50 bg-success/10';
			case 'info': return 'border-info/50 bg-info/10';
			default: return 'border-border bg-muted/50';
		}
	}

	function getSeverityTextColor(severity: Insight['severity']) {
		switch (severity) {
			case 'alert': return 'text-destructive';
			case 'warning': return 'text-warning';
			case 'success': return 'text-success';
			case 'info': return 'text-info';
			default: return 'text-foreground';
		}
	}

	function formatAmount(amount?: number) {
		if (amount === undefined) return '';
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: userCurrency || 'USD'
		}).format(amount);
	}

	function formatPercentage(percentage?: number) {
		if (percentage === undefined) return '';
		return `${Math.round(percentage * 100)}%`;
	}
</script>

<div class={className}>
	{#if isLoading}
		<div class="flex items-center justify-center p-4">
			<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
		</div>
	{:else if insights.length === 0}
		<div class="text-center p-4 text-muted-foreground">
			<Info size={24} class="mx-auto mb-2 opacity-50" />
			<p class="text-sm">No insights to display</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each insights as insight (insight.id)}
				{@const Icon = getSeverityIcon(insight.severity)}
				<Alert.Root class={getSeverityColor(insight.severity)}>
					<Icon
						size={20} 
						class={getSeverityTextColor(insight.severity) + " mt-0.5 flex-shrink-0"} 
					></Icon>
					<Alert.Title class={getSeverityTextColor(insight.severity) + " font-semibold"}>
						{insight.title}
					</Alert.Title>
					<Alert.Description class="text-sm mt-1">
						{insight.message}
						{#if insight.amount}
							<span class="font-medium ml-1">
								{formatAmount(insight.amount)}
							</span>
						{/if}
						{#if insight.percentage}
							<span class="font-medium ml-1">
								({formatPercentage(insight.percentage)})
							</span>
						{/if}
						{#if insight.actionable && insight.actionText}
							<Button 
								variant="outline" 
								size="sm"
								class="text-xs"
								onclick={() => {
									if (insight.actionUrl) {
										window.location.href = insight.actionUrl;
									}
								}}
							>
								{insight.actionText}
							</Button>
						{/if}
						{#if showDismiss}
							<Button
								variant="ghost"
								size="icon"
								class="size-8 absolute top-3 right-4"
								onclick={() => dismissInsight(insight.id)}
							>
								<X />
							</Button>
						{/if}
					</Alert.Description>
				</Alert.Root>
			{/each}
		</div>
	{/if}
</div> 