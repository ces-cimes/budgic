<script lang='ts'>
    import { onDestroy } from 'svelte';
    
    interface BehavioralNudge {
      type: 'momentum_warning' | 'positive_reinforcement' | 'cooldown' | 'discretionary_reminder' | 'velocity_alert';
      message: string;
      countdown?: number;
      show: boolean;
      data?: any;
    }
    
    export let behavioralNudge: BehavioralNudge;
    
    export let onDismiss: () => void = () => {};
    
    export let onAction: () => void = () => {};
    
    let countdownTimer: number | undefined;
    let remainingTime = behavioralNudge.countdown || 0;
    
    // Setup countdown if needed
    $: if (behavioralNudge.countdown && behavioralNudge.type === 'momentum_warning') {
      setupCountdown();
    }
    
    function setupCountdown() {
      remainingTime = behavioralNudge.countdown || 0;
      countdownTimer = setInterval(() => {
        remainingTime--;
        if (remainingTime <= 0) {
          clearInterval(countdownTimer);
          onDismiss();
        }
      }, 1000);
    }
    
    function formatTime(seconds: number) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    onDestroy(() => {
      if (countdownTimer) {
        clearInterval(countdownTimer);
      }
    });
    
    // Configure nudge appearance based on type
    $: nudgeConfig = {
      momentum_warning: {
        icon: '⏳',
        bgColor: '#242831',
        borderColor: '#E8B86D',
        textColor: '#E8B86D',
        actionText: 'Got it',
        showCountdown: true,
        priority: 'high'
      },
      positive_reinforcement: {
        icon: '🎉',
        bgColor: '#242831',
        borderColor: '#4A7C59',
        textColor: '#4A7C59',
        actionText: 'Thanks!',
        showCountdown: false,
        priority: 'low'
      },
      cooldown: {
        icon: '🧘',
        bgColor: '#242831',
        borderColor: '#6B9BD1',
        textColor: '#6B9BD1',
        actionText: 'Skip cooldown',
        showCountdown: true,
        priority: 'medium'
      },
      discretionary_reminder: {
        icon: '💡',
        bgColor: '#242831',
        borderColor: '#FFB347',
        textColor: '#FFB347',
        actionText: 'View details',
        showCountdown: false,
        priority: 'low'
      },
      velocity_alert: {
        icon: '🚨',
        bgColor: '#242831',
        borderColor: '#FF8A80',
        textColor: '#FF8A80',
        actionText: 'Review spending',
        showCountdown: false,
        priority: 'high'
      }
    };
    
    $: config = nudgeConfig[behavioralNudge.type];
  </script>
  
  {#if behavioralNudge.show}
    <div 
      class="rounded-xl p-4 mb-4 border border-primary bg-bg-secondary animate-in slide-in-from-top-2 duration-300"
      class:border-2={config.priority === 'high'}
      class:shadow-lg={config.priority === 'high'}
      style="border-color: {config.borderColor}"
    >
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xl">{config.icon}</span>
          {#if config.showCountdown && remainingTime > 0}
            <span class="font-mono text-sm font-semibold bg-bg-tertiary px-2 py-1 rounded-lg text-text-primary">
              {formatTime(remainingTime)}
            </span>
          {/if}
        </div>
        
        <div class="text-sm leading-relaxed font-medium text-text-primary">
          {behavioralNudge.message}
        </div>
        
        {#if behavioralNudge.type === 'discretionary_reminder' && behavioralNudge.data}
          <div class="mt-3 pt-3 border-t border-primary">
            <div class="flex justify-between mb-1 text-xs">
              <span class="opacity-80 text-text-secondary">Discretionary left:</span>
              <span class="font-semibold text-text-primary">{behavioralNudge.data.discretionaryLeft}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="opacity-80 text-text-secondary">Until:</span>
              <span class="font-semibold text-text-primary">{behavioralNudge.data.resetTime}</span>
            </div>
          </div>
        {/if}
        
        {#if behavioralNudge.type === 'velocity_alert' && behavioralNudge.data}
          <div class="mt-3 pt-3 border-t border-primary">
            <div class="mt-2">
              <div class="relative h-6 bg-bg-tertiary rounded-xl overflow-hidden text-xs flex items-center">
                <div class="absolute left-2 opacity-70 z-10 text-text-secondary">
                  Normal
                </div>
                <div class="h-full flex items-center justify-end pr-2 text-text-primary font-semibold transition-all duration-500 ease-in-out min-w-20"
                     style="background-color: {config.borderColor}; width: {Math.min(behavioralNudge.data.multiplier * 33.33, 100)}%">
                  {behavioralNudge.data.multiplier}x faster
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
      
      <div class="flex gap-3 justify-end">
        <button 
          class="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-bg-tertiary text-text-secondary"
          on:click={onDismiss}
        >
          Dismiss
        </button>
        <button 
          class="px-4 py-2 rounded-lg text-sm font-medium text-text-primary transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          style="background-color: {config.borderColor}"
          on:click={onAction}
        >
          {config.actionText}
        </button>
      </div>
    </div>
  {/if}