<script lang="ts">
	import { onMount } from 'svelte';
	import { userActionsService, unifiedInsightsService, analyticsCoreService, settingsService } from '$lib/core/services';
	import type { BehaviorPattern, UserPreferences } from '$lib/core/services';
	import Card from '$lib/components/primitives/Card.svelte';
	import Button from '$lib/components/primitives/Button.svelte';

	// Props
	export let showPrivacyControls = true;
	export let autoRefresh = true;

	// State
	let insights: any[] = [];
	let patterns: BehaviorPattern[] = [];
	let loading = false;
	let trackingEnabled = true;
	let trackingPreferences: Record<string, boolean> = {};
	let userPreferences: UserPreferences | null = null;

	// Load tracking preferences
	onMount(async () => {
		try {
			userPreferences = await settingsService.getUserPreferences();
			trackingEnabled = userPreferences?.userActionsTrackingEnabled ?? true;
			trackingPreferences = userPreferences?.userActionsTrackingPreferences ?? {
				transaction_timing: true,
				budget_adherence: true,
				spending_patterns: true,
				habit_formation: true
			};
		} catch (error) {
			console.warn('Failed to load user preferences:', error);
		}
		
		if (autoRefresh) {
			loadInsights();
		}
	});

	async function loadInsights() {
		if (!trackingEnabled) return;
		
		loading = true;
		try {
			// Use unified insights service instead of user-actions service
			const allInsights = await unifiedInsightsService.generateAllInsights();
			
			// Convert unified insights to predictive insights format
			insights = allInsights.insights.map(insight => ({
				insightType: insight.type as any,
				confidence: insight.confidence / 100, // Convert from 0-100 to 0-1
				title: insight.title,
				description: insight.message,
				actionable: insight.actionable,
				priority: insight.severity === 'alert' ? 'high' : insight.severity === 'warning' ? 'medium' : 'low',
				metadata: insight.data,
				expiresAt: insight.expiresAt
			})).slice(0, 5); // Show top 5 insights

			// Use analytics core service for patterns
			const analysis = await analyticsCoreService.analyzeTransactions(
				new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
				new Date().toISOString()
			);
			
			// Create simple patterns from analytics
			patterns = [{
				patternType: 'engagement_frequency',
				confidence: 0.7,
				description: `Average daily spending: $${(analysis.totalSpending / 30).toFixed(2)}`,
				metadata: { averageDailySpending: analysis.totalSpending / 30 },
				firstObserved: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
				lastObserved: new Date().toISOString(),
				frequency: analysis.transactionCount / 30
			}];

		} catch (error) {
			console.error('Failed to load insights:', error);
		} finally {
			loading = false;
		}
	}

	async function toggleTracking() {
		trackingEnabled = !trackingEnabled;
		
		if (userPreferences) {
			userPreferences.userActionsTrackingEnabled = trackingEnabled;
			await settingsService.updateUserPreferences(userPreferences);
		}
		
		if (trackingEnabled) {
			loadInsights();
		} else {
			insights = [];
			patterns = [];
		}
	}

	async function updateTrackingPreference(key: string, enabled: boolean) {
		trackingPreferences[key] = enabled;
		
		if (userPreferences) {
			userPreferences.userActionsTrackingPreferences = trackingPreferences;
			await settingsService.updateUserPreferences(userPreferences);
		}
	}

	function getInsightIcon(insightType: string): string {
		switch (insightType) {
			case 'spending_prediction': return '📊';
			case 'budget_recommendation': return '💡';
			case 'habit_improvement': return '🎯';
			case 'anomaly_detection': return '⚠️';
			default: return 'ℹ️';
		}
	}

	function getPriorityColor(priority: string): string {
		switch (priority) {
			case 'high': return 'text-red-600';
			case 'medium': return 'text-yellow-600';
			case 'low': return 'text-green-600';
			default: return 'text-gray-600';
		}
	}

	function getConfidenceColor(confidence: number): string {
		if (confidence >= 0.8) return 'text-green-600';
		if (confidence >= 0.6) return 'text-yellow-600';
		return 'text-red-600';
	}

	// Auto-refresh every 5 minutes
	let refreshInterval: number;
	onMount(() => {
		if (autoRefresh) {
			refreshInterval = setInterval(loadInsights, 5 * 60 * 1000);
		}
		
		return () => {
			if (refreshInterval) {
				clearInterval(refreshInterval);
			}
		};
	});
</script>

<Card class="p-4">
	<div class="flex items-center justify-between mb-4">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
			Behavioral Insights
		</h3>
		
		{#if showPrivacyControls}
			<div class="flex items-center space-x-2">
				<label class="flex items-center space-x-2 text-sm">
					<input
						type="checkbox"
						bind:checked={trackingEnabled}
						on:change={toggleTracking}
						class="rounded border-gray-300"
					/>
					<span>Track behavior</span>
				</label>
			</div>
		{/if}
	</div>

	{#if showPrivacyControls && trackingEnabled}
		<div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
			<h4 class="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
				Tracking Preferences
			</h4>
			<div class="grid grid-cols-2 gap-2 text-sm">
				<label class="flex items-center space-x-2">
					<input
						type="checkbox"
						bind:checked={trackingPreferences.transaction_timing}
						on:change={(e) => updateTrackingPreference('transaction_timing', (e.target as HTMLInputElement).checked)}
						class="rounded border-gray-300"
					/>
					<span>Transaction timing</span>
				</label>
				<label class="flex items-center space-x-2">
					<input
						type="checkbox"
						bind:checked={trackingPreferences.budget_adherence}
						on:change={(e) => updateTrackingPreference('budget_adherence', (e.target as HTMLInputElement).checked)}
						class="rounded border-gray-300"
					/>
					<span>Budget adherence</span>
				</label>
				<label class="flex items-center space-x-2">
					<input
						type="checkbox"
						bind:checked={trackingPreferences.spending_patterns}
						on:change={(e) => updateTrackingPreference('spending_patterns', (e.target as HTMLInputElement).checked)}
						class="rounded border-gray-300"
					/>
					<span>Spending patterns</span>
				</label>
				<label class="flex items-center space-x-2">
					<input
						type="checkbox"
						bind:checked={trackingPreferences.habit_formation}
						on:change={(e) => updateTrackingPreference('habit_formation', (e.target as HTMLInputElement).checked)}
						class="rounded border-gray-300"
					/>
					<span>Habit formation</span>
				</label>
			</div>
		</div>
	{/if}

	{#if !trackingEnabled}
		<div class="text-center py-8 text-gray-500">
			<p class="mb-2">Behavior tracking is disabled</p>
			<p class="text-sm">Enable tracking to get personalized insights about your financial habits</p>
		</div>
	{:else if loading}
		<div class="text-center py-8">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
			<p class="mt-2 text-sm text-gray-500">Loading insights...</p>
		</div>
	{:else if insights.length === 0}
		<div class="text-center py-8 text-gray-500">
			<p class="mb-2">No insights yet</p>
			<p class="text-sm">Start using the app to generate personalized insights</p>
			<Button variant="neutral" on:click={loadInsights} class="mt-3">
				Refresh Insights
			</Button>
		</div>
	{:else}
		<div class="space-y-4">
			<!-- Insights -->
			<div>
				<h4 class="text-md font-medium text-gray-900 dark:text-white mb-3">
					Personalized Insights
				</h4>
				<div class="space-y-3">
					{#each insights as insight}
						<div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border-l-4 border-blue-500">
							<div class="flex items-start space-x-3">
								<span class="text-xl">{getInsightIcon(insight.insightType)}</span>
								<div class="flex-1">
									<div class="flex items-center space-x-2 mb-1">
										<h5 class="font-medium text-gray-900 dark:text-white">
											{insight.title}
										</h5>
										<span class="text-xs px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-700 {getPriorityColor(insight.priority)}">
											{insight.priority}
										</span>
										<span class="text-xs text-gray-500">
											{Math.round(insight.confidence * 100)}% confidence
										</span>
									</div>
									<p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
										{insight.description}
									</p>
									{#if insight.actionable}
										<div class="flex items-center space-x-2">
											<span class="text-xs text-green-600">✓ Actionable</span>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Behavior Patterns -->
			{#if patterns.length > 0}
				<div>
					<h4 class="text-md font-medium text-gray-900 dark:text-white mb-3">
						Behavior Patterns
					</h4>
					<div class="space-y-2">
						{#each patterns as pattern}
							<div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
								<div class="flex items-center justify-between">
									<div>
										<p class="text-sm font-medium text-gray-900 dark:text-white">
											{pattern.description}
										</p>
										<p class="text-xs text-gray-500">
											{pattern.frequency.toFixed(1)} times per month • {Math.round(pattern.confidence * 100)}% confidence
										</p>
									</div>
									<span class="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
										{pattern.patternType.replace('_', ' ')}
									</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
			<div class="flex items-center justify-between text-xs text-gray-500">
				<span>Insights generated from your behavior patterns</span>
				<Button variant="neutral" size="sm" on:click={loadInsights}>
					Refresh
				</Button>
			</div>
		</div>
	{/if}
</Card> 