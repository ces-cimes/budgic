<script lang="ts">
	import { TrendingUp, TrendingDown } from '@lucide/svelte';

	interface NetWorthData {
		date: string;
		value: number;
		change: number;
	}

	const { data = [], showPlaceholder = false } = $props<{
		data?: NetWorthData[];
		showPlaceholder?: boolean;
	}>();

	// Placeholder data for demonstration
	const placeholderData: NetWorthData[] = [
		{ date: 'Jan', value: 12000, change: 0 },
		{ date: 'Feb', value: 12500, change: 500 },
		{ date: 'Mar', value: 11800, change: -700 },
		{ date: 'Apr', value: 13200, change: 1400 },
		{ date: 'May', value: 14100, change: 900 },
		{ date: 'Jun', value: 15200, change: 1100 }
	];

	const displayData = showPlaceholder ? placeholderData : data;
	const currentValue = displayData.length > 0 ? displayData[displayData.length - 1].value : 0;
	const monthlyChange = displayData.length > 0 ? displayData[displayData.length - 1].change : 0;
	const isPositive = monthlyChange >= 0;

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('en-US', { 
			style: 'currency', 
			currency: 'USD',
			minimumFractionDigits: 0
		}).format(amount);
	}

	// Calculate SVG path for the trend line
	function generateTrendPath(data: NetWorthData[]): string {
		if (data.length < 2) return '';
		
		const width = 280; // SVG width
		const height = 120; // SVG height
		const padding = 20;
		const chartWidth = width - (padding * 2);
		const chartHeight = height - (padding * 2);
		
		const minValue = Math.min(...data.map(d => d.value));
		const maxValue = Math.max(...data.map(d => d.value));
		const valueRange = maxValue - minValue;
		
		const points = data.map((point, index) => {
			const x = padding + (index / (data.length - 1)) * chartWidth;
			const y = height - padding - ((point.value - minValue) / valueRange) * chartHeight;
			return `${x},${y}`;
		});
		
		return `M ${points.join(' L ')}`;
	}
</script>

<div class="bg-bg-secondary rounded-2xl p-4 border border-primary">
	<div class="flex items-center justify-between mb-4">
		<div class="flex items-center gap-2">
			<span class="text-xl">💰</span>
			<h3 class="text-lg font-semibold text-text-primary">Net Worth Trend</h3>
		</div>
		<div class="text-right">
			<div class="text-2xl font-bold text-text-primary">{formatCurrency(currentValue)}</div>
			<div class="flex items-center gap-1 text-sm {isPositive ? 'text-sage-green' : 'text-warm-coral'}">
				{#if isPositive}
					<TrendingUp size={14} />
				{:else}
					<TrendingDown size={14} />
				{/if}
				<span>{isPositive ? '+' : ''}{formatCurrency(monthlyChange)} this month</span>
			</div>
		</div>
	</div>

	{#if displayData.length > 0}
		<!-- Chart -->
		<div class="relative">
			<svg width="280" height="120" class="w-full">
				<!-- Grid lines -->
				<defs>
					<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
						<path d="M 40 0 L 0 0 0 40" fill="none" stroke="#2D3339" stroke-width="0.5" opacity="0.3"/>
					</pattern>
				</defs>
				<rect width="100%" height="100%" fill="url(#grid)" />
				
				<!-- Trend line -->
				<path 
					d={generateTrendPath(displayData)}
					fill="none"
					stroke={isPositive ? '#4A7C59' : '#FF8A80'}
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				
				<!-- Data points -->
				{#each displayData as point, index}
					{@const width = 280}
					{@const height = 120}
					{@const padding = 20}
					{@const chartWidth = width - (padding * 2)}
					{@const chartHeight = height - (padding * 2)}
					{@const minValue = Math.min(...displayData.map((d: NetWorthData) => d.value))}
					{@const maxValue = Math.max(...displayData.map((d: NetWorthData) => d.value))}
					{@const valueRange = maxValue - minValue}
					{@const x = padding + (index / (displayData.length - 1)) * chartWidth}
					{@const y = height - padding - ((point.value - minValue) / valueRange) * chartHeight}
					<circle 
						cx={x} 
						cy={y} 
						r="4" 
						fill={isPositive ? '#4A7C59' : '#FF8A80'}
						stroke="#1A1D21"
						stroke-width="2"
					/>
				{/each}
			</svg>
			
			<!-- X-axis labels -->
			<div class="flex justify-between text-xs text-text-secondary mt-2">
				{#each displayData as point}
					<span>{point.date}</span>
				{/each}
			</div>
		</div>
	{:else}
		<!-- Empty state -->
		<div class="text-center py-8">
			<div class="text-2xl mb-2">📊</div>
			<p class="text-text-secondary text-sm">No net worth data available</p>
		</div>
	{/if}

	{#if showPlaceholder}
		<!-- Placeholder Indicator -->
		<div class="mt-3 p-2 bg-bg-tertiary rounded-lg border border-primary/20">
			<p class="text-xs text-text-secondary text-center italic">
				💡 Placeholder: Net worth tracking logic not implemented
			</p>
		</div>
	{/if}
</div> 