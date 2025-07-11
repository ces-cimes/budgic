<script lang="ts">
	import { Trophy, Target, TrendingUp } from '@lucide/svelte';

	interface FinancialGoal {
		id: string;
		name: string;
		target: number;
		current: number;
		icon: string;
		deadline?: Date;
		status: 'on-track' | 'behind' | 'ahead' | 'completed';
		progress: number; // 0-100
	}

	const { goals = [], showPlaceholder = false } = $props<{
		goals?: FinancialGoal[];
		showPlaceholder?: boolean;
	}>();

	// Placeholder goals
	const placeholderGoals: FinancialGoal[] = [
		{
			id: '1',
			name: 'Emergency Fund',
			target: 5000,
			current: 4800,
			icon: '🚨',
			status: 'on-track',
			progress: 96
		},
		{
			id: '2',
			name: 'Vacation Fund',
			target: 3000,
			current: 1200,
			icon: '✈️',
			status: 'behind',
			progress: 40
		},
		{
			id: '3',
			name: 'Investment Portfolio',
			target: 10000,
			current: 8500,
			icon: '📈',
			status: 'ahead',
			progress: 85
		}
	];

	const displayGoals = showPlaceholder ? placeholderGoals : goals;

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('en-US', { 
			style: 'currency', 
			currency: 'USD',
			minimumFractionDigits: 0
		}).format(amount);
	}

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'completed': return 'text-sage-green';
			case 'ahead': return 'text-sage-green';
			case 'on-track': return 'text-warning-amber';
			case 'behind': return 'text-warm-coral';
			default: return 'text-text-secondary';
		}
	};

	const getStatusBgColor = (status: string) => {
		switch (status) {
			case 'completed': return 'bg-sage-green/10 border-sage-green/20';
			case 'ahead': return 'bg-sage-green/10 border-sage-green/20';
			case 'on-track': return 'bg-warning-amber/10 border-warning-amber/20';
			case 'behind': return 'bg-warm-coral/10 border-warm-coral/20';
			default: return 'bg-bg-tertiary border-primary/20';
		}
	};

	const getProgressColor = (progress: number) => {
		if (progress >= 100) return '#4A7C59'; // sage green
		if (progress >= 80) return '#E8B86D'; // warning amber
		if (progress >= 60) return '#FF8A80'; // warm coral
		return '#6B7280'; // gray
	};

	const getStatusText = (status: string) => {
		switch (status) {
			case 'completed': return 'Completed! 🎉';
			case 'ahead': return 'Ahead of schedule! 🚀';
			case 'on-track': return 'On track';
			case 'behind': return 'Behind schedule';
			default: return 'Unknown';
		}
	};
</script>

<div class="space-y-4">
	<div class="flex items-center gap-2 mb-4">
		<span class="text-xl">🎯</span>
		<h3 class="text-lg font-semibold text-text-primary">Goal Progress</h3>
	</div>

	{#if displayGoals.length > 0}
		<div class="space-y-4">
			{#each displayGoals as goal}
				<div class="bg-bg-secondary rounded-2xl p-4 border border-primary">
					<div class="flex items-center justify-between mb-3">
						<div class="flex items-center gap-3">
							<span class="text-xl">{goal.icon}</span>
							<div>
								<h4 class="font-semibold text-text-primary">{goal.name}</h4>
								<div class="text-sm text-text-secondary">
									{formatCurrency(goal.current)} / {formatCurrency(goal.target)}
								</div>
							</div>
						</div>
						<div class="text-right">
							<div class="text-lg font-bold text-text-primary">{goal.progress}%</div>
							<div class="text-xs px-2 py-1 rounded-full {getStatusBgColor(goal.status)} {getStatusColor(goal.status)}">
								{getStatusText(goal.status)}
							</div>
						</div>
					</div>

					<!-- Progress Bar -->
					<div class="mb-3">
						<div class="w-full bg-bg-tertiary rounded-full h-3">
							<div 
								class="h-3 rounded-full transition-all duration-500"
								style="width: {Math.min(goal.progress, 100)}%; background-color: {getProgressColor(goal.progress)}"
							></div>
						</div>
					</div>

					<!-- Goal Details -->
					<div class="flex items-center justify-between text-sm">
						<span class="text-text-secondary">
							{goal.progress >= 100 ? 'Goal achieved!' : `${formatCurrency(goal.target - goal.current)} to go`}
						</span>
						{#if goal.progress >= 100}
							<div class="flex items-center gap-1 text-sage-green">
								<Trophy size={14} />
								<span class="text-xs">Completed!</span>
							</div>
						{:else if goal.status === 'ahead'}
							<div class="flex items-center gap-1 text-sage-green">
								<TrendingUp size={14} />
								<span class="text-xs">Ahead!</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<!-- Empty state -->
		<div class="text-center py-8 bg-bg-secondary rounded-2xl border border-primary">
			<div class="text-2xl mb-2">🎯</div>
			<h4 class="font-semibold text-text-primary mb-1">No goals set yet</h4>
			<p class="text-text-secondary text-sm">Set financial goals to track your progress</p>
		</div>
	{/if}

	{#if showPlaceholder}
		<!-- Placeholder Indicator -->
		<div class="p-3 bg-bg-tertiary rounded-lg border border-primary/20">
			<p class="text-xs text-text-secondary text-center italic">
				💡 Placeholder: Goal tracking logic not implemented
			</p>
		</div>
	{/if}
</div> 