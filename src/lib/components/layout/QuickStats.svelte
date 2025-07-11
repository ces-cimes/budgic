<script lang="ts">
  interface Props {
    daysAhead?: number;
    streak?: number;
  }
  
  let { daysAhead = 0, streak = 0 }: Props = $props();
</script>

<div class="flex justify-center gap-6 text-center">
  <div class="bg-bg-secondary border border-primary rounded-lg p-3 min-w-20">
    <div class="text-2xl font-bold text-text-primary">{daysAhead}</div>
    <div class="text-xs text-text-secondary font-medium">Days Ahead</div>
  </div>
  
  <div class="bg-bg-secondary border border-primary rounded-lg p-3 min-w-20">
    <div class="text-2xl font-bold text-text-primary">{streak}</div>
    <div class="text-xs text-text-secondary font-medium">Day Streak</div>
  </div>
</div> 