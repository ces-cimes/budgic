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
  <div class="p-2 sm:p-4 max-w-4xl mx-auto space-y-4 sm:space-y-6">
    <!-- Header -->
    <div>
      <h2 class="text-base sm:text-lg font-semibold text-foreground mb-2">Behavioral Patterns</h2>
      <p class="text-xs sm:text-sm text-muted-foreground">
        Discover patterns in your financial behavior and app usage
      </p>
    </div>

    <!-- Behavioral Patterns -->
    <div>
      <h3 class="text-sm sm:text-md font-semibold text-foreground mb-3">Spending & Transaction Patterns</h3>
      <BehavioralPatterns days={90} />
    </div>

    <!-- App Usage Analytics -->
    <div>
      <h3 class="text-sm sm:text-md font-semibold text-foreground mb-3">App Usage Analytics</h3>
      <AppUsageAnalytics days={30} />
    </div>
  </div>
</div>
