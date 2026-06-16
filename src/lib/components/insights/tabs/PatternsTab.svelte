<script lang="ts">
	import type { PatternsTabProps } from '../types';
	import BehavioralPatterns from '../BehavioralPatterns.svelte';
	import AppUsageAnalytics from '../AppUsageAnalytics.svelte';

	interface Props {
		isLoading: boolean;
		onRecommendation?: (patternId: string) => void;
		className?: string;
	}

	const { isLoading, onRecommendation, className = '' }: Props = $props();
</script>

<div class="patterns-tab h-full overflow-y-auto {className}">
	<div class="space-y-4 py-2 sm:space-y-6 sm:py-4">
		<!-- Header -->
		<div>
			<h2 class="text-foreground mb-2 text-base font-semibold sm:text-lg">
				Behavioral Patterns
			</h2>
			<p class="text-muted-foreground text-xs sm:text-sm">
				Discover patterns in your financial behavior and app usage
			</p>
		</div>

		<!-- Behavioral Patterns -->
		<div>
			<h3 class="sm:text-md text-foreground mb-3 text-sm font-semibold">
				Spending & Transaction Patterns
			</h3>
			<BehavioralPatterns days={90} />
		</div>

		<!-- App Usage Analytics -->
		<div>
			<h3 class="sm:text-md text-foreground mb-3 text-sm font-semibold">
				App Usage Analytics
			</h3>
			<AppUsageAnalytics days={30} />
		</div>
	</div>
</div>
