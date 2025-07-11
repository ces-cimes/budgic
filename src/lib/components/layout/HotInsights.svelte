<script lang="ts">
	interface HotInsight {
		id: string;
		type: 'pattern' | 'optimization' | 'behavior' | 'achievement';
		title: string;
		description: string;
		icon: string;
		impact: string;
		confidence: number; // 0-100
		category: string;
	}

	const { insights = [], showPlaceholder = false } = $props<{
		insights?: HotInsight[];
		showPlaceholder?: boolean;
	}>();

	// Placeholder insights
	const placeholderInsights: HotInsight[] = [
		{
			id: '1',
			type: 'pattern',
			title: 'You spend 40% less on weekends',
			description: 'Try batch-prepping weekday meals like weekends!',
			icon: '🎯',
			impact: 'Potential savings: $120/month',
			confidence: 85,
			category: 'Spending Pattern'
		},
		{
			id: '2',
			type: 'optimization',
			title: 'Your grocery spending peaks on Thursdays',
			description: 'Shopping Monday-Wednesday saves you $23/week',
			icon: '💡',
			impact: 'Potential savings: $92/month',
			confidence: 92,
			category: 'Optimization'
		},
		{
			id: '3',
			type: 'behavior',
			title: 'Stress triggers 23% higher spending',
			description: 'Consider stress management techniques before shopping',
			icon: '🧠',
			impact: 'Risk reduction: $45/incident',
			confidence: 78,
			category: 'Behavioral'
		}
	];

	const displayInsights = showPlaceholder ? placeholderInsights : insights;

	const getInsightColor = (type: string) => {
		switch (type) {
			case 'pattern': return 'text-sage-green';
			case 'optimization': return 'text-warning-amber';
			case 'behavior': return 'text-warm-coral';
			case 'achievement': return 'text-purple-400';
			default: return 'text-text-primary';
		}
	};

	const getInsightBgColor = (type: string) => {
		switch (type) {
			case 'pattern': return 'bg-sage-green/10 border-sage-green/20';
			case 'optimization': return 'bg-warning-amber/10 border-warning-amber/20';
			case 'behavior': return 'bg-warm-coral/10 border-warm-coral/20';
			case 'achievement': return 'bg-purple-400/10 border-purple-400/20';
			default: return 'bg-bg-tertiary border-primary/20';
		}
	};

	const getConfidenceColor = (confidence: number) => {
		if (confidence >= 80) return 'text-sage-green';
		if (confidence >= 60) return 'text-warning-amber';
		return 'text-text-secondary';
	};
</script>

<div class="space-y-4">
	<div class="flex items-center gap-2 mb-4">
		<span class="text-xl">🔥</span>
		<h3 class="text-lg font-semibold text-text-primary">Hot Insights</h3>
	</div>

	{#if displayInsights.length > 0}
		<div class="space-y-3">
			{#each displayInsights as insight}
				<div class="bg-bg-secondary rounded-2xl p-4 border border-primary">
					<div class="flex items-start gap-3">
						<span class="text-2xl">{insight.icon}</span>
						<div class="flex-1">
							<div class="flex items-center gap-2 mb-1">
								<h4 class="font-semibold text-text-primary">{insight.title}</h4>
								<span class="text-xs px-2 py-1 rounded-full {getInsightBgColor(insight.type)} {getInsightColor(insight.type)}">
									{insight.category}
								</span>
							</div>
							<p class="text-sm text-text-secondary mb-2">{insight.description}</p>
							<div class="flex items-center justify-between">
								<span class="text-xs text-text-secondary">{insight.impact}</span>
								<span class="text-xs {getConfidenceColor(insight.confidence)}">
									{insight.confidence}% confidence
								</span>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<!-- Empty state -->
		<div class="text-center py-8 bg-bg-secondary rounded-2xl border border-primary">
			<div class="text-2xl mb-2">🧠</div>
			<h4 class="font-semibold text-text-primary mb-1">No insights yet</h4>
			<p class="text-text-secondary text-sm">Start tracking your spending to get personalized insights</p>
		</div>
	{/if}

	{#if showPlaceholder}
		<!-- Placeholder Indicator -->
		<div class="p-3 bg-bg-tertiary rounded-lg border border-primary/20">
			<p class="text-xs text-text-secondary text-center italic">
				💡 Placeholder: Behavioral insight logic not implemented
			</p>
		</div>
	{/if}
</div> 