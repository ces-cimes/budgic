<script lang="ts">
	import { onMount } from 'svelte';
	import * as Select from '$lib/components/ui/select/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { transactionService } from '$lib/core/services';
	import { personService } from '$lib/core/services/person-ledger';
	import type { ReimbursementEntry, Transaction } from '$lib/core/db';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { Skeleton } from '$lib/components/ui/skeleton';

	type OutstandingItem = {
		transactionId: string;
		transactionDescription: string;
		transactionDate: string;
		reimbursement: ReimbursementEntry;
		ageDays: number;
	};

	type GroupKey = 'expecting' | 'owed';

	let isLoading = $state(true);
	let items = $state<OutstandingItem[]>([]);
	let settlingKey = $state('');
	let selectedSettlementTx = $state('');
	let settlementCandidates = $state<Transaction[]>([]);
	let error = $state<string | null>(null);
	let peopleById = $state<Map<string, string>>(new Map());

	function personLabel(reimbursement: ReimbursementEntry): string {
		if (reimbursement.personId) {
			const fromPerson = peopleById.get(reimbursement.personId);
			if (fromPerson) return fromPerson;
		}
		return reimbursement.person || 'Unknown person';
	}

	const expectingItems = $derived(
		items.filter((item) => item.reimbursement.status === 'expecting')
	);
	const owedItems = $derived(items.filter((item) => item.reimbursement.status === 'owed'));
	const expectingTotal = $derived(
		expectingItems.reduce((sum, item) => sum + item.reimbursement.amount, 0)
	);
	const owedTotal = $derived(owedItems.reduce((sum, item) => sum + item.reimbursement.amount, 0));

	const ageTintClass = (ageDays: number): string =>
		ageDays > 30 ? 'border-[var(--color-amber)]/40 bg-[var(--color-amber-subtle)]' : '';

	function itemKey(item: OutstandingItem): string {
		return `${item.transactionId}::${item.reimbursement.id}`;
	}

	function ageLabel(ageDays: number): string {
		if (ageDays <= 0) return 'today';
		if (ageDays === 1) return '1 day';
		return `${ageDays} days`;
	}

	function buildOutstandingItems(transactions: Transaction[]): OutstandingItem[] {
		const now = Date.now();
		const result: OutstandingItem[] = [];
		for (const tx of transactions) {
			for (const reimbursement of tx.reimbursements || []) {
				if (reimbursement.status !== 'expecting' && reimbursement.status !== 'owed')
					continue;
				const txDate = tx.clearedDate || tx.plannedDate || tx.createdAt;
				const ageDays = Math.max(
					0,
					Math.floor((now - new Date(txDate).getTime()) / 86400000)
				);
				result.push({
					transactionId: tx.id,
					transactionDescription: tx.description || 'Untitled transaction',
					transactionDate: txDate,
					reimbursement,
					ageDays
				});
			}
		}
		return result.sort((a, b) => b.ageDays - a.ageDays);
	}

	async function loadData(): Promise<void> {
		error = null;
		try {
			const [allTransactions, people] = await Promise.all([
				transactionService.getAllTransactions(),
				personService.listPeople()
			]);
			peopleById = new Map(people.map((p) => [p.id, p.displayName]));
			items = buildOutstandingItems(allTransactions);
			settlementCandidates = allTransactions
				.filter((tx) => tx.type === 'income' && tx.status === 'cleared')
				.sort(
					(a, b) =>
						new Date(b.clearedDate || b.createdAt).getTime() -
						new Date(a.clearedDate || a.createdAt).getTime()
				);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load reimbursements';
		} finally {
			isLoading = false;
		}
	}

	async function updateEntry(
		item: OutstandingItem,
		status: ReimbursementEntry['status']
	): Promise<void> {
		const sourceTx = await transactionService.getTransaction(item.transactionId);
		if (!sourceTx) return;
		const now = new Date().toISOString();
		const reimbursements = (sourceTx.reimbursements || []).map((entry) => {
			if (entry.id !== item.reimbursement.id) return entry;
			return {
				...entry,
				status,
				updatedAt: now
			};
		});
		await transactionService.updateTransaction(sourceTx.id, { reimbursements });
	}

	async function markForgiven(item: OutstandingItem): Promise<void> {
		await updateEntry(item, 'forgiven');
		await loadData();
	}

	async function markSettled(item: OutstandingItem): Promise<void> {
		if (!selectedSettlementTx) return;
		const sourceTx = await transactionService.getTransaction(item.transactionId);
		if (!sourceTx) return;
		const now = new Date().toISOString();
		const reimbursements = (sourceTx.reimbursements || []).map((entry) => {
			if (entry.id !== item.reimbursement.id) return entry;
			return {
				...entry,
				status: 'settled' as const,
				settledTransactionId: selectedSettlementTx,
				updatedAt: now
			};
		});
		await transactionService.updateTransaction(sourceTx.id, { reimbursements });
		settlingKey = '';
		selectedSettlementTx = '';
		await loadData();
	}

	onMount(loadData);
</script>

<section class="squircle-4xl squircle-border squircle-fill-tertiary space-y-4 p-5">
	<div>
		<h3
			class="text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
		>
			Outstanding reimbursements
		</h3>
		<p class="mt-1 text-xs text-[var(--color-text-tertiary)]">
			Track unsettled amounts by direction.
		</p>
	</div>

	{#if isLoading}
		<Skeleton class="h-24 w-full rounded-xl bg-[var(--color-bg-tertiary)]" />
	{:else if error}
		<p class="text-sm text-[var(--color-warm-coral)]">{error}</p>
	{:else if items.length === 0}
		<p class="text-sm text-[var(--color-text-tertiary)]">No open reimbursements.</p>
	{:else}
		<div class="space-y-4">
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium">Expecting back</p>
					<p class="text-sm font-semibold">
						{formatTransactionAmount(
							expectingTotal,
							expectingItems[0]?.reimbursement.currency || 'USD'
						)}
					</p>
				</div>
				{#each expectingItems as item (itemKey(item))}
					<div
						class="rounded-xl border border-[var(--color-border)] p-3 {ageTintClass(
							item.ageDays
						)}"
					>
						<div class="flex items-start justify-between gap-2">
							<div>
								<p class="text-sm font-medium">{personLabel(item.reimbursement)}</p>
								<p class="text-xs text-[var(--color-text-tertiary)]">
									{item.transactionDescription}
								</p>
							</div>
							<p class="text-sm font-semibold">
								{formatTransactionAmount(
									item.reimbursement.amount,
									item.reimbursement.currency
								)}
							</p>
						</div>
						<div class="mt-2 flex items-center justify-between gap-2">
							<span class="text-xs text-[var(--color-text-tertiary)]"
								>{ageLabel(item.ageDays)}</span
							>
							<div class="flex items-center gap-2">
								<Button variant="ghost" size="sm" onclick={() => markForgiven(item)}
									>Forgive</Button
								>
								{#if settlingKey === itemKey(item)}
									<div class="flex items-center gap-2">
										<Select.Root
											type="single"
											bind:value={selectedSettlementTx}
										>
											<Select.Trigger class="w-56"
												>Pick settlement transaction</Select.Trigger
											>
											<Select.Content>
												{#each settlementCandidates as tx (tx.id)}
													<Select.Item value={tx.id}>
														{tx.description || 'Income transaction'} ·
														{formatTransactionAmount(
															tx.amount || 0,
															tx.currency
														)}
													</Select.Item>
												{/each}
											</Select.Content>
										</Select.Root>
										<Button size="sm" onclick={() => markSettled(item)}
											>Mark settled</Button
										>
									</div>
								{:else}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => {
											settlingKey = itemKey(item);
											selectedSettlementTx = '';
										}}
									>
										Mark settled
									</Button>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>

			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium">I owe</p>
					<p class="text-sm font-semibold">
						{formatTransactionAmount(
							owedTotal,
							owedItems[0]?.reimbursement.currency || 'USD'
						)}
					</p>
				</div>
				{#each owedItems as item (itemKey(item))}
					<div
						class="rounded-xl border border-[var(--color-border)] p-3 {ageTintClass(
							item.ageDays
						)}"
					>
						<div class="flex items-start justify-between gap-2">
							<div>
								<p class="text-sm font-medium">{personLabel(item.reimbursement)}</p>
								<p class="text-xs text-[var(--color-text-tertiary)]">
									{item.transactionDescription}
								</p>
							</div>
							<p class="text-sm font-semibold">
								{formatTransactionAmount(
									item.reimbursement.amount,
									item.reimbursement.currency
								)}
							</p>
						</div>
						<div class="mt-2 flex items-center justify-end">
							<Button variant="ghost" size="sm" onclick={() => markForgiven(item)}
								>Forgive</Button
							>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</section>
