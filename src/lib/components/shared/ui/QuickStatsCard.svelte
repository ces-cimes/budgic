<script lang="ts">
	import type { QuickStatsCardProps } from '../types.js';
	import * as Card from '$lib/components/ui/card/index.ts';

	interface Props extends QuickStatsCardProps {
		children?: any;
	}

	const { title, value, subtitle, icon: Icon, trend, className = '', children }: Props = $props();

	function getTrendColor(trend: QuickStatsCardProps['trend']) {
		if (!trend) return 'text-primary';
		return trend.isPositive ? 'text-green-500' : 'text-red-500';
	}

	function getTrendIcon(trend: QuickStatsCardProps['trend']) {
		if (!trend) return null;
		return trend.isPositive ? '↗' : '↘';
	}
</script>

<Card.Root class="p-4 {className}">
	<div class="mb-2 flex items-center gap-3">
		{#if Icon}
			<Icon class="text-primary h-5 w-5" />
		{/if}
		<h3 class="text-primary font-semibold">{title}</h3>
	</div>

	<div class="flex items-center justify-between">
		<div class="text-2xl font-bold {getTrendColor(trend)}">
			{value}
		</div>

		{#if trend}
			<div class="text-sm {getTrendColor(trend)}">
				{getTrendIcon(trend)}
				{Math.abs(trend.value).toFixed(1)}%
			</div>
		{/if}
	</div>

	{#if subtitle}
		<div class="text-muted-foreground mt-1 text-sm">
			{subtitle}
		</div>
	{/if}

	{#if children}
		<div class="mt-3">
			{@render children()}
		</div>
	{/if}
</Card.Root>
