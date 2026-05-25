<script lang="ts">
	import InsightCard from './InsightCard.svelte';
	import { Lightbulb } from '@lucide/svelte';
	import { EmptyState } from '$lib/components/ui/empty-state';
	import type { InsightListProps, UnifiedInsight } from '../types';

	interface Props {
		insights: UnifiedInsight[];
		maxItems?: number;
		showViewAll?: boolean;
		onViewAll?: () => void;
		onDismiss?: (insightId: string) => void;
		onAction?: (insightId: string) => void;
		className?: string;
		descriptionClass?: string;
	}

	const {
		insights,
		maxItems,
		showViewAll = false,
		onViewAll,
		onDismiss,
		onAction,
		className = '',
		descriptionClass
	}: Props = $props();

	// Sort insights by priority (severity) and then by date
	const sortedInsights = $derived(() => {
		const severityOrder: Record<string, number> = {
			alert: 0,
			warning: 1,
			info: 2,
			success: 3,
			celebration: 4
		};

		return [...insights].sort((a, b) => {
			// First sort by severity
			const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
			if (severityDiff !== 0) return severityDiff;

			// Then sort by date (newest first)
			return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
		});
	});

	const displayedInsights = $derived(() => {
		if (maxItems && maxItems > 0) {
			return sortedInsights().slice(0, maxItems);
		}
		return sortedInsights();
	});

	const hasMoreInsights = $derived(() => {
		return maxItems && maxItems > 0 && insights.length > maxItems;
	});
</script>

<div class="insight-list {className}">
	{#if displayedInsights().length === 0}
		<EmptyState
			icon={Lightbulb}
			iconVariant="circle"
			heading="No insights yet"
			body="Insights will appear here as we analyze your financial patterns."
			class="py-8"
			headingClass="text-lg font-medium"
		/>
	{:else}
		<div class="space-y-3">
			{#each displayedInsights() as insight (insight.id)}
				<InsightCard {insight} {onDismiss} {onAction} {descriptionClass} />
			{/each}
		</div>

		<!-- View All button -->
		{#if showViewAll && hasMoreInsights() && onViewAll}
			<div class="mt-4 text-center">
				<button
					onclick={onViewAll}
					class="text-primary hover:text-primary/80 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors"
				>
					View all {insights.length} insights
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
	{/if}
</div>
