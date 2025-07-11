<script lang="ts">
	interface HealthScore {
		score: number; // 0-100
		level: 'excellent' | 'good' | 'fair' | 'poor';
		title: string;
		description: string;
		trend: 'up' | 'down' | 'stable';
		trendValue: number;
	}

	export let healthScore: HealthScore | null = null;
	export let showPlaceholder = false;

	$: levelConfig = {
		excellent: { color: '#4A7C59', bgColor: '#4A7C59/10', emoji: '🏆', label: 'Excellent' },
		good: { color: '#E8B86D', bgColor: '#E8B86D/10', emoji: '✅', label: 'Good' },
		fair: { color: '#FF8A80', bgColor: '#FF8A80/10', emoji: '⚠️', label: 'Fair' },
		poor: { color: '#FF6B6B', bgColor: '#FF6B6B/10', emoji: '🚨', label: 'Poor' }
	};

	$: trendIcon = healthScore?.trend === 'up' ? '📈' : healthScore?.trend === 'down' ? '📉' : '➡️';
	$: trendColor = healthScore?.trend === 'up' ? 'text-sage-green' : 
		healthScore?.trend === 'down' ? 'text-warm-coral' : 'text-text-secondary';
</script>

{#if showPlaceholder}
	<div class="rounded-2xl p-4 border border-primary bg-bg-secondary">
		<div class="flex items-center gap-2 mb-4">
			<span class="text-xl">🏆</span>
			<h3 class="text-lg font-semibold text-text-primary">Financial Health Score</h3>
		</div>
		
		<div class="text-center mb-4">
			<div class="relative w-24 h-24 mx-auto mb-3">
				<svg class="w-full h-full -rotate-90" viewBox="0 0 100 100">
					<circle
						cx="50"
						cy="50"
						r="40"
						fill="none"
						stroke="#2D3339"
						stroke-width="8"
					/>
					<circle
						cx="50"
						cy="50"
						r="40"
						fill="none"
						stroke="#4A7C59"
						stroke-width="8"
						stroke-linecap="round"
						stroke-dasharray="251.2"
						stroke-dashoffset="75.36"
						class="transition-all duration-500 ease-in-out"
					/>
				</svg>
				<div class="absolute inset-0 flex items-center justify-center">
					<div class="text-center">
						<span class="block text-2xl font-bold text-sage-green">85</span>
						<span class="block text-xs text-text-secondary">Excellent</span>
					</div>
				</div>
			</div>
			<p class="text-sm text-text-primary font-medium">Excellent Financial Health</p>
			<p class="text-xs text-text-secondary mt-1">You're managing your money wisely!</p>
		</div>

		<div class="flex items-center justify-center gap-2 text-xs text-sage-green">
			<span>📈</span>
			<span>+5 points this week</span>
		</div>

		<div class="mt-3 p-2 bg-bg-tertiary rounded-lg border border-primary/20">
			<p class="text-xs text-text-secondary text-center italic">
				💡 Placeholder: Health score calculation not implemented
			</p>
		</div>
	</div>
{:else if healthScore}
	{@const config = levelConfig[healthScore.level]}
	<div class="rounded-2xl p-4 border border-primary bg-bg-secondary">
		<div class="flex items-center gap-2 mb-4">
			<span class="text-xl">{config.emoji}</span>
			<h3 class="text-lg font-semibold text-text-primary">Financial Health Score</h3>
		</div>
		
		<div class="text-center mb-4">
			<div class="relative w-24 h-24 mx-auto mb-3">
				<svg class="w-full h-full -rotate-90" viewBox="0 0 100 100">
					<circle
						cx="50"
						cy="50"
						r="40"
						fill="none"
						stroke="#2D3339"
						stroke-width="8"
					/>
					<circle
						cx="50"
						cy="50"
						r="40"
						fill="none"
						stroke={config.color}
						stroke-width="8"
						stroke-linecap="round"
						stroke-dasharray="251.2"
						stroke-dashoffset="{251.2 - (healthScore.score / 100) * 251.2}"
						class="transition-all duration-500 ease-in-out"
					/>
				</svg>
				<div class="absolute inset-0 flex items-center justify-center">
					<div class="text-center">
						<span class="block text-2xl font-bold" style="color: {config.color}">{healthScore.score}</span>
						<span class="block text-xs text-text-secondary">{config.label}</span>
					</div>
				</div>
			</div>
			<p class="text-sm text-text-primary font-medium">{healthScore.title}</p>
			<p class="text-xs text-text-secondary mt-1">{healthScore.description}</p>
		</div>

		<div class="flex items-center justify-center gap-2 text-xs {trendColor}">
			<span>{trendIcon}</span>
			<span>{healthScore.trendValue > 0 ? '+' : ''}{healthScore.trendValue} points this week</span>
		</div>
	</div>
{/if} 