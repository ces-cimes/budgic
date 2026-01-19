<script lang="ts">
  import type { PatternsTabProps } from '../types';
  import BehavioralPatterns from '../BehavioralPatterns.svelte';
  import AppUsageAnalytics from '../AppUsageAnalytics.svelte';

  interface Props {
    userCurrency: string;
    isLoading: boolean;
    onRecommendation?: (patternId: string) => void;
    className?: string;
  }

  const { userCurrency, isLoading, onRecommendation, className = '' }: Props = $props();
</script>

<div class="patterns-tab h-full overflow-y-auto {className}">
  <div class="p-4 space-y-6">
    <!-- Header -->
    <div>
      <h2 class="text-lg font-semibold text-foreground mb-2">Behavioral Patterns</h2>
      <p class="text-sm text-muted-foreground">
        Discover patterns in your financial behavior and app usage
      </p>
    </div>

    <!-- Behavioral Patterns -->
    <div>
      <h3 class="text-md font-semibold text-foreground mb-3">Spending & Transaction Patterns</h3>
      <BehavioralPatterns days={90} />
    </div>

    <!-- App Usage Analytics -->
    <div>
      <h3 class="text-md font-semibold text-foreground mb-3">App Usage Analytics</h3>
      <AppUsageAnalytics days={30} />
    </div>
  </div>
</div>
