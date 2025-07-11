<script lang="ts">
    interface DailyBudget {
      allocated: number;
      spent: number;
      remaining: number;
      borrowed: number;
      rollover: number;
      status: 'good' | 'warning' | 'danger';
    }
    
    export let dailyBudget: DailyBudget;
    
    $: percentageSpent = Math.min((dailyBudget.spent / dailyBudget.allocated) * 100, 100);
    $: isOverBudget = dailyBudget.spent > dailyBudget.allocated;
    $: borrowedAmount = dailyBudget.borrowed;
    
    // Determine the visual style based on status - updated for Warm Midnight
    $: statusConfig = {
      good: { 
        color: '#4A7C59', // sage green
        bgColor: '#242831', // bg-secondary
        textColor: '#4A7C59',
        emoji: '✅'
      },
      warning: { 
        color: '#E8B86D', // warning amber
        bgColor: '#242831', // bg-secondary
        textColor: '#E8B86D',
        emoji: '⚠️'
      },
      danger: { 
        color: '#FF8A80', // warm coral
        bgColor: '#242831', // bg-secondary
        textColor: '#FF8A80',
        emoji: '🚨'
      }
    };
    
    $: currentStatus = statusConfig[dailyBudget.status];
    
    function formatCurrency(amount: number) {
      return new Intl.NumberFormat('en-NL', { 
        style: 'currency', 
        currency: 'EUR',
        minimumFractionDigits: 2
      }).format(Math.abs(amount));
    }
  </script>
  
  <div class="glass p-4 text-center">
    <!-- Main circular progress -->
    <div class="relative w-30 h-30 mx-auto mb-4">
      <svg class="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <!-- Background circle -->
        <circle
          cx="60"
          cy="60"
          r="50"
          fill="none"
          stroke="#2D3339"
          stroke-width="8"
        />
        <!-- Progress circle -->
        <circle
          cx="60"
          cy="60"
          r="50"
          fill="none"
          stroke="{currentStatus.color}"
          stroke-width="8"
          stroke-linecap="round"
          stroke-dasharray="314.16"
          stroke-dashoffset="{314.16 - (percentageSpent / 100) * 314.16}"
          class="transition-all duration-500 ease-in-out"
        />
      </svg>
      
      <!-- Center content -->
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="text-center">
          <span class="block text-2xl font-bold leading-tight text-text-primary">
            {#if isOverBudget}
              -{formatCurrency(dailyBudget.spent - dailyBudget.allocated)}
            {:else}
              {formatCurrency(dailyBudget.remaining)}
            {/if}
          </span>
          <span class="block text-xs opacity-80 uppercase tracking-wider mt-1 text-text-secondary">
            {isOverBudget ? 'over budget' : 'remaining'}
          </span>
        </div>
      </div>
    </div>
  
    <!-- Status indicator -->
    <div class="inline-flex items-center gap-2 bg-bg-tertiary px-4 py-2 rounded-full border border-primary mb-4 text-sm font-medium text-text-primary">
      <span class="status-emoji">{currentStatus.emoji}</span>
      <span class="status-text">
        {#if dailyBudget.status === 'good'}
          On track
        {:else if dailyBudget.status === 'warning'}
          Watch spending
        {:else}
          Over budget
        {/if}
      </span>
    </div>
  
    <!-- Budget breakdown -->
    <div class="border-t border-primary pt-4 mt-4">
      <div class="flex justify-between items-center mb-2 text-sm">
        <span class="text-text-secondary">Today's budget</span>
        <span class="font-semibold text-text-primary">{formatCurrency(dailyBudget.allocated)}</span>
      </div>
      <div class="flex justify-between items-center mb-2 text-sm">
        <span class="text-text-secondary">Spent so far</span>
        <span class="font-semibold text-warm-coral">{formatCurrency(dailyBudget.spent)}</span>
      </div>
      
      {#if dailyBudget.rollover > 0}
        <div class="flex justify-between items-center mb-2 text-sm text-sage-green">
          <span class="opacity-90">+ Yesterday's rollover</span>
          <span class="font-semibold">+{formatCurrency(dailyBudget.rollover)}</span>
        </div>
      {/if}
      
      {#if borrowedAmount > 0}
        <div class="flex justify-between items-center mb-2 text-sm text-warm-coral">
          <span class="opacity-90">⚠️ Borrowed from tomorrow</span>
          <span class="font-semibold">{formatCurrency(borrowedAmount)}</span>
        </div>
      {/if}
    </div>
  </div>