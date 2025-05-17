<script lang="ts">
	import { onMount } from 'svelte';
	import Button from './primitives/Button.svelte';
	import StatusLabel from './primitives/Label.svelte';
	
	import { transactionService } from '$lib/core/services/transaction-service';
	import type { Transaction } from '$lib/core/models/types';

	import { categoryService } from '$lib/core/services/category-service';

	interface Props {
		filterName?: 'all' | 'cleared' | 'future' | 'current-week'
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
				case 'cleared':
					transactions = await transactionService.getClearedTransactions();
					break;
				case 'future':
					transactions = await transactionService.getFutureTransactions();
					break;
				case 'current-week':
					transactions = await transactionService.getCurrentWeekTransactions();
					break;
				case 'all':
				default:
					transactions = await transactionService.getAllTransactions();
			}

			// TODO: remove this dumb thing and implement
			transactions.forEach(async tx => {
				if (!tx.categoryId) {
					tx.categoryId = undefined;
					return
				}
				
				const category = await categoryService.getCategoryById(tx.categoryId);

				if (!category) {
					tx.categoryId = undefined;
					return
				}

				tx.categoryId = category.name;
			}); 
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
			if (!tx.clearedDate && !tx.pendingDate) return;

			let protoDateKey: string;

			if (tx.pendingDate && tx.clearedDate) {
				protoDateKey = new Date(tx.clearedDate!).toDateString();
			} else if (tx.pendingDate) {
				protoDateKey = new Date(tx.pendingDate!).toDateString();
			} else {
				protoDateKey = new Date(tx.clearedDate!).toDateString();
			}

			const dateKey = protoDateKey;
			groups[dateKey] ??= [];
			groups[dateKey].push(tx);
		});

		const sortedGroups = Object.entries(groups).map(([dateKey, txs]) => ({
			date: new Date(dateKey),
			transactions: filterName === 'cleared' ? txs : [...txs].reverse()
		})).sort((a, b) => b.date.getTime() - a.date.getTime());

		return filterName === 'cleared' ? sortedGroups : [...sortedGroups].reverse();
	}) as TransactionGroup[];

	// Load transactions when component mounts or filter changes
	onMount(() => {
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
								{#if tx.clearedDate}
									<StatusLabel class="bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-400">
										Cleared
									</StatusLabel>
								{:else if tx.pendingDate}
									<StatusLabel class="bg-blue-100 text-blue-800 dark:bg-blue-800/30 dark:text-blue-400">
										Pending
									</StatusLabel>
								{/if}
								<div class="text-left">
									<p class="font-medium">{tx.categoryId}</p>
									{#if tx.description}
										<p class="text-sm text-gray-500 dark:text-gray-400">{tx.description}</p>
									{/if}
								</div>
							</div>
							
							<div class="text-right">
								<p class={tx.type === 'payment' ? "font-bold text-income" : "text-expense"}>
									${tx.pendingAmount ?? tx.clearedAmount}
								</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									{#if tx.clearedDate}
										{new Date(tx.clearedDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
									{/if}
								</p>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/if}