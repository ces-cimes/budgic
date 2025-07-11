<script lang="ts">
	import { TrendingDown, TrendingUp } from '@lucide/svelte';

	const { 
		transactionAmount = 0,
		transactionType = 'expense',
		dailyBudget = 100, // Placeholder - should come from budget service
		dailySpent = 45 // Placeholder - should come from budget service
	} = $props<{
		transactionAmount?: number;
		transactionType?: 'income' | 'expense' | 'transfer' | 'adjustment';
		dailyBudget?: number;
		dailySpent?: number;
	}>();

	// Calculate budget impact
	const budgetLeft = $derived(dailyBudget - dailySpent);
	const transactionImpact = $derived(
		transactionType === 'income' ? transactionAmount : -transactionAmount
	);
	const newBudgetLeft = $derived(budgetLeft + transactionImpact);

	// Progress bar calculations
	const totalBudget = $derived(dailyBudget);
	const spentPercentage = $derived((dailySpent / totalBudget) * 100);
	const transactionPercentage = $derived((Math.abs(transactionAmount) / totalBudget) * 100);
	const remainingPercentage = $derived(100 - spentPercentage - transactionPercentage);

	// Color coding
	const getImpactColor = () => {
		if (transactionType === 'income') return 'text-sage-green';
		if (transactionType === 'expense') return 'text-warm-coral';
		return 'text-text-secondary';
	};

	const getProgressColor = () => {
		if (newBudgetLeft < 0) return 'bg-alert';
		if (newBudgetLeft < totalBudget * 0.2) return 'bg-golden-amber';
		return 'bg-sage-green';
	};
</script>

<div class="glass p-4 border border-sage-green/20 bg-gradient-to-r from-sage-green/10 to-info/10">
	<div class="flex items-center justify-between mb-3">
		<h3 class="text-base font-semibold text-text-primary">Budget Impact</h3>
		<div class="flex items-center gap-1 {getImpactColor()}">
			{#if transactionType === 'income'}
				<TrendingUp class="w-4 h-4" />
			{:else if transactionType === 'expense'}
				<TrendingDown class="w-4 h-4" />
			{/if}
			<span class="text-sm font-medium">
				{transactionType === 'income' ? '+' : '-'}${Math.abs(transactionAmount).toFixed(2)}
			</span>
		</div>
	</div>

	<!-- Budget Progress Bar -->
	<div class="mb-3">
		<div class="flex justify-between text-xs text-text-secondary mb-1">
			<span>Daily Budget: ${totalBudget.toFixed(2)}</span>
			<span>Left: ${newBudgetLeft.toFixed(2)}</span>
		</div>
		<div class="w-full bg-bg-tertiary/50 rounded-full h-2 overflow-hidden">
			<!-- Already spent (gray) -->
			<div 
				class="h-full bg-text-tertiary/30" 
				style="width: {spentPercentage}%"
			></div>
			<!-- Transaction impact (colored) -->
			<div 
				class="h-full {getProgressColor()}" 
				style="width: {transactionPercentage}%"
			></div>
			<!-- Remaining (green) -->
			<div 
				class="h-full bg-sage-green/30" 
				style="width: {remainingPercentage}%"
			></div>
		</div>
	</div>

	<!-- Budget Status -->
	<div class="text-center">
		<div class="text-lg font-bold {newBudgetLeft < 0 ? 'text-alert' : 'text-sage-green'}">
			${newBudgetLeft.toFixed(2)}
		</div>
		<div class="text-xs text-text-secondary">
			{newBudgetLeft < 0 ? 'Over budget' : 'Daily budget left'}
		</div>
	</div>
</div> 