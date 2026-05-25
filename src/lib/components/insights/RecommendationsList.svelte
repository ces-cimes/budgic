<script lang="ts">
	import { onMount } from 'svelte';
	import { recommendationService, type Recommendation } from '$lib/core/services';
	import { Lightbulb, AlertCircle, Target, TrendingUp, Settings, Clock, Tag } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { EmptyState } from '$lib/components/ui/empty-state';

	interface Props {
		days?: number;
		maxItems?: number;
		className?: string;
	}

	const { days = 90, maxItems, className = '' }: Props = $props();

	let recommendations = $state<Recommendation[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		await loadRecommendations();
	});

	async function loadRecommendations() {
		isLoading = true;
		error = null;
		try {
			const allRecommendations = await recommendationService.generateRecommendations(days);
			recommendations = maxItems ? allRecommendations.slice(0, maxItems) : allRecommendations;
		} catch (err) {
			console.error('Error loading recommendations:', err);
			error = err instanceof Error ? err.message : 'Failed to load recommendations';
		} finally {
			isLoading = false;
		}
	}

	function getRecommendationIcon(type: Recommendation['type']) {
		switch (type) {
			case 'budget':
				return TrendingUp;
			case 'spending':
				return AlertCircle;
			case 'goal':
				return Target;
			case 'behavior':
				return Lightbulb;
			case 'feature':
				return Settings;
			case 'timing':
				return Clock;
			case 'category':
				return Tag;
			default:
				return Lightbulb;
		}
	}

	function getPriorityColor(priority: Recommendation['priority']): string {
		switch (priority) {
			case 'urgent':
				return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800';
			case 'high':
				return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400 border-orange-200 dark:border-orange-800';
			case 'medium':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
			case 'low':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800';
			default:
				return 'bg-secondary text-secondary-foreground border-border';
		}
	}

	function getImpactColor(impact: Recommendation['estimatedImpact']): string {
		switch (impact) {
			case 'high':
				return 'text-green-600 dark:text-green-400';
			case 'medium':
				return 'text-yellow-600 dark:text-yellow-400';
			case 'low':
				return 'text-muted-foreground';
			default:
				return 'text-muted-foreground';
		}
	}

	function handleAction(recommendation: Recommendation) {
		if (recommendation.actionUrl) {
			goto(recommendation.actionUrl);
		}
	}
</script>

<div class="recommendations-list {className}">
	{#if isLoading}
		<div class="py-8 text-center">
			<div class="bg-muted mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
				<svg class="text-muted-foreground h-6 w-6 animate-spin" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
			</div>
			<p class="text-muted-foreground text-sm">Generating recommendations...</p>
		</div>
	{:else if error}
		<div class="py-8 text-center">
			<div
				class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20"
			>
				<AlertCircle class="h-6 w-6 text-red-600 dark:text-red-400" />
			</div>
			<h3 class="text-foreground mb-1 text-sm font-semibold">Error Loading Recommendations</h3>
			<p class="text-muted-foreground mb-3 text-xs">{error}</p>
			<button
				onclick={loadRecommendations}
				class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-3 py-1.5 text-xs transition-colors"
			>
				Retry
			</button>
		</div>
	{:else if recommendations.length === 0}
		<EmptyState
			icon={Lightbulb}
			iconVariant="circle"
			heading="No Recommendations Yet"
			body="We'll provide personalized recommendations as we learn more about your financial patterns."
			class="py-8"
			iconClass="h-6 w-6"
			headingClass="text-sm font-semibold mb-1"
			bodyClass="text-muted-foreground mx-auto max-w-sm text-xs"
		/>
	{:else}
		<div class="space-y-3">
			{#each recommendations as recommendation (recommendation.id)}
				{@const Icon = getRecommendationIcon(recommendation.type)}
				<div
					class="bg-card border-border hover:border-primary/50 rounded-lg border p-3 transition-colors"
				>
					<div class="flex items-start gap-3">
						<!-- Icon -->
						<div class="mt-0.5 flex-shrink-0">
							<div class="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
								<Icon class="text-primary h-4 w-4" />
							</div>
						</div>

						<!-- Content -->
						<div class="min-w-0 flex-1">
							<div class="mb-1 flex items-start justify-between gap-2">
								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<h3 class="text-foreground text-sm font-semibold">
											{recommendation.title}
										</h3>
										<span
											class="rounded-full border px-2 py-0.5 text-xs font-medium {getPriorityColor(
												recommendation.priority
											)}"
										>
											{recommendation.priority}
										</span>
									</div>
									<p class="text-muted-foreground text-xs leading-relaxed">
										{recommendation.description}
									</p>
								</div>
							</div>

							<!-- Metadata -->
							<div class="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
								<span
									class="flex items-center gap-1 {getImpactColor(recommendation.estimatedImpact)}"
								>
									<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M13 10V3L4 14h7v7l9-11h-7z"
										/>
									</svg>
									{recommendation.estimatedImpact} impact
								</span>

								<span class="flex items-center gap-1">
									<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									{recommendation.confidence}% confidence
								</span>
							</div>

							<!-- Action Button -->
							{#if recommendation.actionable && recommendation.actionText}
								<div class="mt-2">
									<button
										onclick={() => handleAction(recommendation)}
										class="text-primary bg-primary/10 hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
									>
										{recommendation.actionText}
										<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M9 5l7 7-7 7"
											/>
										</svg>
									</button>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
