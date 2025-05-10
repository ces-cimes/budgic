<script lang="ts">
	import { transactions } from '$lib/utils/stores';
	import Button from './ui/Button.svelte';
	import { onMount } from 'svelte';
	import type { Transaction } from '$lib/utils/types';

	interface Props {
		completed?: boolean;
	}

	let { completed }: Props = $props(); // Remove default value here
	let loading = $state(false);
	let observer = $state<IntersectionObserver | null>(null);
	let loadMoreButton = $state<HTMLElement | null>(null);
	let hasMore = $state(false);

	// Reactive derived state - show all transactions if completed is undefined
	const filteredTransactions = $derived(
		typeof completed === 'boolean' 
			? transactions.value.filter(tx => tx.isCompleted === completed)
			: transactions.value
	);

	interface TransactionGroup {
		date: Date;
		transactions: Transaction[];
	}

	const groupedTransactions = $derived.by(() => {
		const groups: Record<string, Transaction[]> = {};
		
		filteredTransactions.forEach(tx => {
			const dateKey = new Date(tx.date).toDateString();
			groups[dateKey] ??= [];
			groups[dateKey].push(tx);
		});

		const sortedGroups = Object.entries(groups).map(([dateKey, txs]) => ({
			date: new Date(dateKey),
			transactions: completed === true ? txs : [...txs].reverse() // Only reverse if completed is explicitly false
		})).sort((a, b) => b.date.getTime() - a.date.getTime());

		return completed === true ? sortedGroups : [...sortedGroups].reverse(); // Only reverse groups if completed is explicitly false
	}) as TransactionGroup[];

	async function loadMore() {
		if (loading || !(await transactions.hasMore())) return;
		loading = true;
		hasMore = await transactions.hasMore();
		await transactions.loadMore(50);
		loading = false;
		hasMore = await transactions.hasMore();
	}

	onMount(() => {
		// Initial load if no transactions are loaded yet
		if (transactions.value.length === 0) {
			loadMore();
		}

		// Set up intersection observer
		observer = new IntersectionObserver(async (entries) => {
			if (entries[0]?.isIntersecting && 
				!(loading || transactions.isLoading) && 
				await transactions.hasMore()) {
				await loadMore();
			}
		}, { threshold: 0.1 });

		if (loadMoreButton) observer.observe(loadMoreButton);

		return () => {
			if (observer) {
				observer.disconnect();
			}
		};
	});

	$effect(() => {
		if (loadMoreButton && observer) {
			observer.disconnect();
			observer.observe(loadMoreButton);
		}
	});
</script>

{#if transactions.isLoading && loading}
	<p>Loading transactions...</p>
{:else}
	<div class="mb-4 space-y-2">
		{#each groupedTransactions as group (group.date.toString())}
			<div class="border-b border-zinc-800">
				<div class="sticky top-0 bg-zinc-800 z-10 py-2 px-4 rounded-t-xl">
					<div class="flex items-center gap-2">
						<span class="text-lg font-semibold">
							{group.date.toLocaleDateString(undefined, { weekday: 'long' })}
						</span>
						<span class="text-gray-500 dark:text-gray-400">
							{group.date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
						</span>
					</div>
				</div>

				<div class="pt-2">
					{#each group.transactions as tx (tx.id)}
						<div class="flex justify-between items-center px-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2">
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
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<div class="w-full flex justify-center py-4">
		<Button 
			element={loadMoreButton}
			onclick={loadMore} 
			disabled={loading || !hasMore}
			class="min-w-[200px]"
		>
			{#if loading}
				Loading...
			{:else if hasMore}
				Load More
			{:else}
				No more transactions...
			{/if}
		</Button>
	</div>
{/if}