<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import TransactionList from './TransactionList.svelte';
	import type { Transaction } from '$lib/core/db';
	import type { ProcessedTransaction } from './types';

	interface Props {
		transactions: Transaction[];
		// Selection props
		selectedTransactions?: Set<string>;
		selectionMode?: 'checkbox' | 'highlight' | 'ring' | 'none';
		selectionColor?: 'primary' | 'success' | 'warning' | 'danger';
	}

	let { 
		transactions,
		selectedTransactions = new Set<string>(),
		selectionMode = 'none',
		selectionColor = 'primary'
	}: Props = $props();
	const dispatch = createEventDispatcher();

	// Handle transaction click
	const handleTransactionClick = (transaction: ProcessedTransaction) => {
		dispatch('transactionClick', { transaction });
	};

	// Handle transaction long press
	const handleTransactionLongPress = (transaction: ProcessedTransaction) => {
		dispatch('transactionLongPress', { transaction });
	};
</script>

<TransactionList
	{transactions}
	onTransactionClick={handleTransactionClick}
	onTransactionLongPress={handleTransactionLongPress}
	plannedDateDisplay="date"
	{selectedTransactions}
	{selectionMode}
	{selectionColor}
/>

{#if transactions.length === 0}
	<div class="text-center py-12">
		<div class="text-gray-400 mb-4">
			<svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
			</svg>
		</div>
		<p class="text-gray-400">No planned transactions yet</p>
		<p class="text-sm text-gray-500 mt-2">Tap the + button to add your first planned transaction</p>
	</div>
{/if} 