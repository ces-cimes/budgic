<script lang="ts">
  interface SpendingVelocity {
    multiplier: number;
    isAlert: boolean;
    period: string;
  }
  
  export let spendingVelocity: SpendingVelocity;
  
  function formatMultiplier(multiplier: number) {
    return multiplier.toFixed(1);
  }
</script>

{#if spendingVelocity.isAlert}
  <div class="bg-bg-secondary border border-primary rounded-xl p-4 mb-4">
    <div class="flex items-center gap-3 mb-3">
      <span class="text-2xl">🚨</span>
      <div>
        <h3 class="font-semibold text-text-primary">High Spending Velocity</h3>
        <p class="text-sm text-text-secondary">You're spending {formatMultiplier(spendingVelocity.multiplier)}x faster than usual {spendingVelocity.period}</p>
      </div>
    </div>
    
    <div class="bg-bg-tertiary rounded-lg p-3 mb-3">
      <div class="flex justify-between items-center mb-2">
        <span class="text-sm text-text-secondary">Normal pace</span>
        <span class="text-sm text-text-secondary">Your pace</span>
      </div>
      <div class="relative h-4 bg-bg-surface rounded-full overflow-hidden">
        <div class="absolute inset-0 bg-sage-green rounded-full" style="width: 33.33%"></div>
        <div class="absolute inset-0 bg-warm-coral rounded-full transition-all duration-500 ease-in-out" 
             style="width: {Math.min(spendingVelocity.multiplier * 33.33, 100)}%"></div>
      </div>
    </div>
    
    <div class="flex gap-2">
      <button class="flex-1 bg-bg-tertiary text-text-primary px-4 py-2 rounded-lg text-sm font-medium hover:bg-bg-surface transition-colors">
        Review Spending
      </button>
      <button class="px-4 py-2 text-text-secondary text-sm font-medium hover:bg-bg-tertiary rounded-lg transition-colors">
        Dismiss
      </button>
    </div>
  </div>
{/if} 