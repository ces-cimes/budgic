<script lang="ts">
	import Button from '$lib/components/primitives/Button.svelte';
	import { Receipt } from '@lucide/svelte';
	import type { Component } from 'svelte';
	
	export let majorActions: Array<{
		icon: Component;
		label: string;
		action: () => void;
		disabled?: boolean;
	}> = [];

	export let transactionType: 'income' | 'expense' | 'transfer' | 'adjustment' = 'expense';
	export let onTypeChange: (type: 'income' | 'expense' | 'transfer' | 'adjustment') => void = () => {};
	
	export let isSplitMode: boolean = false;
	export let onModeToggle: () => void = () => {};
	
	export let totalAmount: number = 0;
	export let splitItemCount: number = 0;
</script>

<div class="space-y-3">
	<!-- Top Section: Back, Title, Actions -->
	<div class="flex items-center justify-between">
		<!-- Major Actions (Save, Delete, Copy) -->
		<div class="grid grid-cols-3 gap-2 w-full items-center">
			{#each majorActions as action}
				<Button 
					variant={action.label === 'Delete' ? 'neutral' : 'primary'}
					size="sm"
					onclick={action.action}
					disabled={action.disabled}
					class={action.label === 'Delete' 
						? 'bg-alert/10 hover:bg-alert/20 border-alert/20 text-alert' 
						: 'bg-gradient-to-r from-sage-green to-info hover:from-sage-green/90 hover:to-info/90 text-warm-charcoal'
					}
				>
					<svelte:component this={action.icon} class="w-4 h-4 mr-2" />
					{action.label}
				</Button>
			{/each}
		</div>
	</div>

	<!-- Transaction Type Pills -->
	<div class="flex items-center gap-2">
		<Button 
			variant={transactionType === 'income' ? 'primary' : 'neutral'}
			size="sm"
			onclick={() => onTypeChange('income')}
			class="flex-1 truncate"
		>
			Income
		</Button>
		<Button 
			variant={transactionType === 'expense' ? 'primary' : 'neutral'}
			size="sm"
			onclick={() => onTypeChange('expense')}
			class="flex-1 truncate"
		>
			Expense
		</Button>
		<Button 
			variant={transactionType === 'transfer' ? 'primary' : 'neutral'}
			size="sm"
			onclick={() => onTypeChange('transfer')}
			class="flex-1 truncate"
		>
			Transfer
		</Button>
		<Button 
			variant={transactionType === 'adjustment' ? 'primary' : 'neutral'}
			size="sm"
			onclick={() => onTypeChange('adjustment')}
			class="flex-1 truncate"
		>
			Adjustment
		</Button>
	</div>

	<!-- Mode Toggle Row -->
	<div class="flex items-center gap-2">
		<Button 
			variant="primary"
			size="sm"
			onclick={onModeToggle}
			class="flex-1"
		>
			{isSplitMode ? 'Single' : 'Split'}
		</Button>
	</div>

	<!-- Amount Display Row (for split mode) -->
	{#if isSplitMode}
		<div class="flex items-center justify-between">
			<div class="text-text-primary font-semibold">
				Total: ${totalAmount.toFixed(2)}
			</div>
			<div class="flex items-center gap-2 text-text-secondary">
				<Receipt class="w-4 h-4" />
				<span class="text-sm">{splitItemCount} item{splitItemCount !== 1 ? 's' : ''}</span>
			</div>
		</div>
	{/if}
</div> 