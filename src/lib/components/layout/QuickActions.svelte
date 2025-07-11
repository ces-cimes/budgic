<script lang="ts">
	interface QuickAction {
		id: string;
		label: string;
		icon: string;
		category: string;
		onClick: () => void;
	}

	export let actions: QuickAction[] = [];
	export let onCustomClick: () => void;
	export let showPlaceholder = false;

	// Default quick actions for placeholder
	const defaultActions = [
		{ id: 'coffee', label: 'Coffee', icon: '☕', category: 'food' },
		{ id: 'lunch', label: 'Lunch', icon: '🍔', category: 'food' },
		{ id: 'gas', label: 'Gas', icon: '⛽', category: 'transport' },
		{ id: 'shopping', label: 'Shopping', icon: '🛒', category: 'shopping' }
	];
</script>

<div class="rounded-2xl p-4 border border-primary bg-bg-secondary">
	<div class="flex items-center gap-2 mb-4">
		<span class="text-xl">⚡</span>
		<h3 class="text-lg font-semibold text-text-primary">Quick Add</h3>
	</div>

	{#if showPlaceholder}
		<div class="grid grid-cols-2 gap-3 mb-3">
			{#each defaultActions as action}
				<button 
					class="flex items-center gap-2 p-3 bg-bg-tertiary rounded-lg border border-primary/20 hover:bg-bg-surface transition-colors"
					onclick={() => console.log(`Quick action: ${action.label}`)}
				>
					<span class="text-lg">{action.icon}</span>
					<span class="text-sm text-text-primary">{action.label}</span>
				</button>
			{/each}
		</div>
		<button 
			class="w-full flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg border border-primary/20 hover:bg-bg-surface transition-colors"
			onclick={onCustomClick}
		>
			<span class="text-lg">+</span>
			<span class="text-sm text-text-primary">Custom</span>
		</button>
		<div class="mt-3 p-2 bg-bg-tertiary rounded-lg border border-primary/20">
			<p class="text-xs text-text-secondary text-center italic">
				💡 Placeholder: Quick action logic not implemented
			</p>
		</div>
	{:else if actions.length > 0}
		<div class="grid grid-cols-2 gap-3 mb-3">
			{#each actions as action}
				<button 
					class="flex items-center gap-2 p-3 bg-bg-tertiary rounded-lg border border-primary/20 hover:bg-bg-surface transition-colors"
					onclick={action.onClick}
				>
					<span class="text-lg">{action.icon}</span>
					<span class="text-sm text-text-primary">{action.label}</span>
				</button>
			{/each}
		</div>
		<button 
			class="w-full flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg border border-primary/20 hover:bg-bg-surface transition-colors"
			onclick={onCustomClick}
		>
			<span class="text-lg">+</span>
			<span class="text-sm text-text-primary">Custom</span>
		</button>
	{:else}
		<div class="text-center py-6">
			<p class="text-text-secondary text-sm">No quick actions configured</p>
			<p class="text-text-secondary text-xs mt-1">Set up your most common transactions</p>
		</div>
	{/if}
</div> 