<script lang="ts">
	interface EmotionalTrigger {
		emotion: string;
		emoji: string;
		avgSpending: number;
		frequency: number;
		trend: 'up' | 'down' | 'stable';
	}

	interface SpendingPattern {
		category: string;
		pattern: string;
		impact: string;
		recommendation: string;
	}

	const { emotionalTriggers = [], spendingPatterns = [], showPlaceholder = false } = $props<{
		emotionalTriggers?: EmotionalTrigger[];
		spendingPatterns?: SpendingPattern[];
		showPlaceholder?: boolean;
	}>();

	// Placeholder data
	const placeholderTriggers: EmotionalTrigger[] = [
		{ emotion: 'Stress', emoji: '😰', avgSpending: 45, frequency: 3, trend: 'up' },
		{ emotion: 'Celebration', emoji: '🎉', avgSpending: 78, frequency: 1, trend: 'stable' },
		{ emotion: 'Tired', emoji: '😴', avgSpending: 23, frequency: 2, trend: 'down' },
		{ emotion: 'Bored', emoji: '📱', avgSpending: 12, frequency: 4, trend: 'up' }
	];

	const placeholderPatterns: SpendingPattern[] = [
		{
			category: 'Time-based',
			pattern: 'Peak spending on Thursdays',
			impact: '+$23 average vs. other days',
			recommendation: 'Try shopping Monday-Wednesday'
		},
		{
			category: 'Location-based',
			pattern: 'Higher spending near malls',
			impact: '+$34 average per visit',
			recommendation: 'Use online shopping when possible'
		}
	];

	const displayTriggers = showPlaceholder ? placeholderTriggers : emotionalTriggers;
	const displayPatterns = showPlaceholder ? placeholderPatterns : spendingPatterns;

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('en-US', { 
			style: 'currency', 
			currency: 'USD',
			minimumFractionDigits: 0
		}).format(amount);
	}

	const getTrendColor = (trend: string) => {
		switch (trend) {
			case 'up': return 'text-warm-coral';
			case 'down': return 'text-sage-green';
			case 'stable': return 'text-text-secondary';
			default: return 'text-text-secondary';
		}
	};

	const getTrendIcon = (trend: string) => {
		switch (trend) {
			case 'up': return '↗️';
			case 'down': return '↘️';
			case 'stable': return '→';
			default: return '→';
		}
	};
</script>

<div class="space-y-6">
	<!-- Emotional Spending Triggers -->
	<div>
		<div class="flex items-center gap-2 mb-4">
			<span class="text-xl">📊</span>
			<h3 class="text-lg font-semibold text-text-primary">Spending Patterns</h3>
		</div>

		<div class="bg-bg-secondary rounded-2xl p-4 border border-primary">
			<h4 class="font-semibold text-text-primary mb-3">Emotional Spending Triggers:</h4>
			
			{#if displayTriggers.length > 0}
				<div class="grid grid-cols-2 gap-3">
					{#each displayTriggers as trigger}
						<div class="bg-bg-tertiary rounded-xl p-3 border border-primary/20">
							<div class="flex items-center gap-2 mb-2">
								<span class="text-lg">{trigger.emoji}</span>
								<span class="font-medium text-text-primary text-sm">{trigger.emotion}</span>
								<span class="text-xs {getTrendColor(trigger.trend)}">
									{getTrendIcon(trigger.trend)}
								</span>
							</div>
							<div class="text-xs text-text-secondary mb-1">
								{formatCurrency(trigger.avgSpending)} avg
							</div>
							<div class="text-xs text-text-secondary">
								{trigger.frequency}x per week
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="text-center py-4">
					<p class="text-text-secondary text-sm">No emotional triggers detected yet</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- Spending Pattern Analysis -->
	{#if displayPatterns.length > 0}
		<div class="space-y-3">
			{#each displayPatterns as pattern}
				<div class="bg-bg-secondary rounded-2xl p-4 border border-primary">
					<div class="flex items-start gap-3">
						<div class="flex-1">
							<div class="flex items-center gap-2 mb-1">
								<span class="text-xs px-2 py-1 rounded-full bg-bg-tertiary text-text-secondary">
									{pattern.category}
								</span>
								<h4 class="font-semibold text-text-primary">{pattern.pattern}</h4>
							</div>
							<p class="text-sm text-text-secondary mb-2">{pattern.impact}</p>
							<p class="text-xs text-text-secondary italic">💡 {pattern.recommendation}</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if showPlaceholder}
		<!-- Placeholder Indicator -->
		<div class="p-3 bg-bg-tertiary rounded-lg border border-primary/20">
			<p class="text-xs text-text-secondary text-center italic">
				💡 Placeholder: Spending pattern analysis logic not implemented
			</p>
		</div>
	{/if}
</div> 