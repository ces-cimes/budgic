<script lang="ts">
	import { onMount } from 'svelte';
	import { appUsageAnalyticsService } from '$lib/core/services';
	import type {
		AppUsageMetrics,
		FeatureUsage
	} from '$lib/core/services/analytics/app-usage-analytics-service';
	import { Activity, Clock, Calendar, TrendingUp, Smartphone } from '@lucide/svelte';
	import { EmptyState } from '$lib/components/ui/empty-state';

	interface Props {
		days?: number;
		className?: string;
		/** When true and metrics are empty/zero, show a single line instead of full panels. */
		compactWhenEmpty?: boolean;
	}

	const { days = 30, className = '', compactWhenEmpty = false }: Props = $props();

	let metrics = $state<AppUsageMetrics | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		await loadMetrics();
	});

	async function loadMetrics() {
		isLoading = true;
		error = null;
		try {
			metrics = await appUsageAnalyticsService.getUsageMetrics(days);
		} catch (err) {
			console.error('Error loading app usage metrics:', err);
			error = err instanceof Error ? err.message : 'Failed to load usage metrics';
		} finally {
			isLoading = false;
		}
	}

	function formatDuration(seconds: number): string {
		if (seconds < 60) {
			return `${Math.round(seconds)}s`;
		}
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = Math.round(seconds % 60);
		return `${minutes}m ${remainingSeconds}s`;
	}

	function getEngagementColor(score: number): string {
		if (score >= 70) return 'text-green-600 dark:text-green-400';
		if (score >= 40) return 'text-yellow-600 dark:text-yellow-400';
		return 'text-red-600 dark:text-red-400';
	}

	function getEngagementLabel(score: number): string {
		if (score >= 70) return 'High';
		if (score >= 40) return 'Medium';
		return 'Low';
	}
</script>

<div class="app-usage-analytics {className}">
	{#if isLoading}
		<div class="py-12 text-center">
			<div
				class="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
			>
				<svg
					class="text-muted-foreground h-8 w-8 animate-spin"
					fill="none"
					viewBox="0 0 24 24"
				>
					<circle
						class="opacity-25"
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
			</div>
			<p class="text-muted-foreground">Loading usage analytics...</p>
		</div>
	{:else if error}
		<div class="py-12 text-center">
			<div
				class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20"
			>
				<Activity class="h-8 w-8 text-red-600 dark:text-red-400" />
			</div>
			<h3 class="text-foreground mb-2 text-lg font-semibold">Error Loading Analytics</h3>
			<p class="text-muted-foreground mb-4">{error}</p>
			<button
				onclick={loadMetrics}
				class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 transition-colors"
			>
				Retry
			</button>
		</div>
	{:else if !metrics}
		<EmptyState
			icon={Smartphone}
			iconVariant="circle"
			heading="No Usage Data"
			body="Start using the app to see your usage analytics."
			bodyClass="text-muted-foreground mx-auto max-w-md"
		/>
	{:else if compactWhenEmpty && metrics.totalSessions === 0 && metrics.mostActiveDay === 'Unknown'}
		<p class="text-muted-foreground py-1 text-sm">
			App usage insights will appear here once you use the app more.
		</p>
	{:else}
		<div class="space-y-6">
			<!-- Summary Cards -->
			<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
				<div class="bg-card border-border rounded-lg border p-4">
					<div class="mb-2 flex items-center gap-2">
						<Activity class="text-primary h-4 w-4" />
						<span class="text-muted-foreground text-xs">Sessions</span>
					</div>
					<div class="text-foreground text-2xl font-bold">{metrics.totalSessions}</div>
				</div>

				<div class="bg-card border-border rounded-lg border p-4">
					<div class="mb-2 flex items-center gap-2">
						<TrendingUp class="text-primary h-4 w-4" />
						<span class="text-muted-foreground text-xs">Actions</span>
					</div>
					<div class="text-foreground text-2xl font-bold">{metrics.totalActions}</div>
				</div>

				<div class="bg-card border-border rounded-lg border p-4">
					<div class="mb-2 flex items-center gap-2">
						<Clock class="text-primary h-4 w-4" />
						<span class="text-muted-foreground text-xs">Avg Session</span>
					</div>
					<div class="text-foreground text-lg font-bold">
						{formatDuration(metrics.averageSessionDuration)}
					</div>
				</div>

				<div class="bg-card border-border rounded-lg border p-4">
					<div class="mb-2 flex items-center gap-2">
						<Calendar class="text-primary h-4 w-4" />
						<span class="text-muted-foreground text-xs">Engagement</span>
					</div>
					<div class="text-lg font-bold {getEngagementColor(metrics.engagementScore)}">
						{metrics.engagementScore}
					</div>
					<div class="text-muted-foreground mt-0.5 text-xs">
						{getEngagementLabel(metrics.engagementScore)}
					</div>
				</div>
			</div>

			<!-- Engagement Score -->
			<div class="bg-card border-border rounded-lg border p-4">
				<h3 class="text-foreground mb-3 text-sm font-semibold">Engagement Score</h3>
				<div class="space-y-2">
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">Overall Score</span>
						<span class="font-semibold {getEngagementColor(metrics.engagementScore)}">
							{metrics.engagementScore}/100
						</span>
					</div>
					<div class="bg-muted h-3 overflow-hidden rounded-full">
						<div
							class="h-full transition-all {metrics.engagementScore >= 70
								? 'bg-green-500'
								: metrics.engagementScore >= 40
									? 'bg-yellow-500'
									: 'bg-red-500'}"
							style="width: {metrics.engagementScore}%"
						></div>
					</div>
					<p class="text-muted-foreground text-xs">
						Based on session frequency, actions per session, and session duration
					</p>
				</div>
			</div>

			<!-- Usage Patterns -->
			<div class="bg-card border-border rounded-lg border p-4">
				<h3 class="text-foreground mb-3 text-sm font-semibold">Usage Patterns</h3>
				<div class="grid grid-cols-2 gap-4 text-sm">
					<div>
						<p class="text-muted-foreground mb-1 text-xs">Most Active Day</p>
						<p class="text-foreground font-semibold">{metrics.mostActiveDay}</p>
					</div>
					<div>
						<p class="text-muted-foreground mb-1 text-xs">Most Active Hour</p>
						<p class="text-foreground font-semibold">
							{metrics.mostActiveHour}:00
						</p>
					</div>
					<div>
						<p class="text-muted-foreground mb-1 text-xs">Session Frequency</p>
						<p class="text-foreground font-semibold capitalize">
							{metrics.sessionFrequency}
						</p>
					</div>
					<div>
						<p class="text-muted-foreground mb-1 text-xs">Avg Actions/Session</p>
						<p class="text-foreground font-semibold">
							{metrics.averageActionsPerSession.toFixed(1)}
						</p>
					</div>
				</div>
			</div>

			<!-- Feature Usage -->
			{#if metrics.featureUsage && metrics.featureUsage.length > 0}
				<div class="bg-card border-border rounded-lg border p-4">
					<h3 class="text-foreground mb-3 text-sm font-semibold">Feature Usage</h3>
					<div class="space-y-3">
						{#each metrics.featureUsage.slice(0, 5) as feature (feature.feature)}
							<div class="flex items-center justify-between">
								<div class="flex-1">
									<p class="text-foreground text-sm font-medium">
										{feature.feature}
									</p>
									<p class="text-muted-foreground text-xs">
										{feature.usageCount} uses • {feature.percentage.toFixed(1)}%
									</p>
								</div>
								{#if feature.averageTimeSpent}
									<div class="text-muted-foreground text-xs">
										{formatDuration(feature.averageTimeSpent)} avg
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
