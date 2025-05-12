<script lang="ts">
	import { stores } from '$lib/stores.svelte';
	import type { Transaction } from '$lib/core/models/types';
	import { onMount } from 'svelte';
	import Button from './ui/Button.svelte';

	interface Props {
		filterName?: 'all' | 'completed' | 'future' | 'current-week'
	}

	// Props
	let {
		filterName = 'all'
	}: Props = $props();

	// Reactive values
	let transactions: Transaction[] = $state([]);
	let isLoading = $state(true);
	let error: Error | null = null;

	interface TransactionGroup {
		date: Date;
		transactions: Transaction[];
	}

	// Function to load transactions based on the filter
	const loadTransactions = async () => {
		try {
		isLoading = true;
		error = null;

		switch (filterName) {
			case 'completed':
			transactions = await stores.transactions.getCompletedTransactions();
			break;
			case 'future':
			transactions = await stores.transactions.getFutureTransactions();
			break;
			case 'current-week':
			transactions = await stores.transactions.getCurrentWeekTransactions();
			break;
			case 'all':
			default:
			transactions = await stores.transactions.getAllTransactions();
		}
		} catch (err) {
		error = err instanceof Error ? err : new Error('Failed to load transactions');
		console.error('Error loading transactions:', error);
		} finally {
		isLoading = false;
		}
	};

	const groupedTransactions = $derived.by(() => {
		const groups: Record<string, Transaction[]> = {};
		
		transactions.forEach(tx => {
			const dateKey = new Date(tx.date).toDateString();
			groups[dateKey] ??= [];
			groups[dateKey].push(tx);
		});

		const sortedGroups = Object.entries(groups).map(([dateKey, txs]) => ({
			date: new Date(dateKey),
			transactions: filterName === 'completed' ? txs : [...txs].reverse() // Only reverse if completed is explicitly false
		})).sort((a, b) => b.date.getTime() - a.date.getTime());

		return filterName === 'completed' ? sortedGroups : [...sortedGroups].reverse(); // Only reverse groups if completed is explicitly false
	}) as TransactionGroup[];

	// Load transactions when component mounts or filter changes
	onMount (() => {
		loadTransactions();
	});

	$effect(() => {
		loadTransactions();
	});
</script>

{#if isLoading}
	<p>Loading transactions...</p>
{:else}
	<div class="mb-2">
		{#each groupedTransactions as group (group.date.toString())}
			<div class="border-b border-zinc-800">
				<div class="sticky top-0 bg-zinc-800 z-10 py-2 px-8 rounded-t-xl">
					<div class="flex items-center gap-2">
						<span class="text-lg font-semibold">
							{group.date.toLocaleDateString(undefined, { weekday: 'long' })}
						</span>
						<span class="text-gray-500 dark:text-gray-400">
							{group.date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
						</span>
					</div>
				</div>

				<div class="space-y-1 my-1">
					{#each group.transactions as tx (tx.id)}
						<button class="flex w-full justify-between items-center px-2 py-1 rounded-lg hover:bg-zinc-100 focus:bg-zinc-50 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800/50 transition-colors">
							<div class="flex items-center gap-3">
								<div>
									<p class="font-medium">{tx.category}</p>
									{#if tx.description}
										<p class="text-sm text-gray-500 dark:text-gray-400">{tx.description}</p>
									{/if}
								</div>
							</div>
							
							<div class="text-right">
								<p class="
									{tx.type === 'income' ? "font-bold text-income" : "" }
									{tx.type === 'expense' ? "text-expense" : "" }">
									${tx.plannedAmount ?? tx.actualAmount}
								</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									{new Date(tx.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
								</p>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<!-- <div class="w-full flex justify-center py-4">
		<Button 
			element={loadMoreButton}
			onclick={loadMore} 
			disabled={isLoading || !hasMore}
			class="min-w-[200px]"
		>
			{#if isLoading}
				Loading...
			{:else if hasMore}
				Load More
			{:else}
				No more transactions...
			{/if}
		</Button>
	</div> -->
{/if}