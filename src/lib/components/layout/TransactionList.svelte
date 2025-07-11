<script lang="ts">
	import TransactionGroup from './TransactionGroup.svelte';
	import type { Transaction } from '$lib/core/db';
	import { getGroupKey, getGroupDate, getGroupLabel } from '$lib/utils/date-grouping';
	import { tagService } from '$lib/core/services/tag-service';

	interface Props {
		transactions: Transaction[];
		onTransactionClick?: (transaction: ProcessedTransaction) => void;
		onTransactionLongPress?: (transaction: ProcessedTransaction) => void;
		plannedDateDisplay?: 'date' | 'time' | 'datetime' | 'auto';
		clearedDateDisplay?: 'date' | 'time' | 'datetime' | 'auto';
		topBarHeight?: number;
		// Selection props
		selectedTransactions?: Set<string>;
		selectionMode?: 'checkbox' | 'highlight' | 'ring' | 'none';
		selectionColor?: 'primary' | 'success' | 'warning' | 'danger';
	}

	let {
		transactions,
		onTransactionClick = () => {},
		onTransactionLongPress = () => {},
		plannedDateDisplay = 'auto',
		clearedDateDisplay = 'auto',
		topBarHeight = 0,
		selectedTransactions = new Set<string>(),
		selectionMode = 'none',
		selectionColor = 'primary'
	}: Props = $props();

	interface ProcessedTransaction extends Transaction {
		tagNames?: {
			what?: string;
			why?: string;
			where?: string;
			custom?: string[];
		};
		tagColors?: {
			what?: string;
			why?: string;
			where?: string;
			custom?: Record<string, string>;
		};
		isOverdue?: boolean;
		isFuture?: boolean;
		isPlanned?: boolean;
		splitCount?: number;
		confidenceLevel?: 'confirmed' | 'likely' | 'maybe';
		isRecurring?: boolean;
	}

	// State for processed transactions
	let processedTransactions = $state<ProcessedTransaction[]>([]);

	// Process transactions with additional data including tags
	$effect(() => {
		const processTransactions = async () => {
			const processed: ProcessedTransaction[] = [];
			
			for (const tx of transactions) {
				// Determine confidence level based on transaction data
				let confidenceLevel: 'confirmed' | 'likely' | 'maybe' = 'maybe';
				if (tx.confidence === 'confirmed') {
					confidenceLevel = 'confirmed';
				} else if (tx.confidence === 'expected' || tx.amount > 0) {
					confidenceLevel = 'likely';
				}

				// Check if overdue (planned date is in the past)
				const isOverdue = tx.plannedDate ? new Date(tx.plannedDate) < new Date() : false;

				// Check if recurring (has description that suggests recurrence)
				const isRecurring = tx.description?.toLowerCase().includes('monthly') || 
								   tx.description?.toLowerCase().includes('rent') ||
								   tx.description?.toLowerCase().includes('subscription') || false;

				// Get tag information
				const tagNames: ProcessedTransaction['tagNames'] = {
					what: tx.whatTag,
					why: tx.whyTag,
					custom: []
				};

				const tagColors: ProcessedTransaction['tagColors'] = {
					what: undefined,
					why: undefined,
					where: undefined,
					custom: {}
				};

				// Get colors for system tags
				if (tx.whatTag) {
					try {
						const whatTag = await tagService.getTagByNameAndDimension(tx.whatTag, 'what');
						if (whatTag?.color) {
							tagColors.what = whatTag.color;
						}
					} catch (error) {
						console.warn('Failed to load what tag color:', error);
					}
				}

				if (tx.whyTag) {
					try {
						const whyTag = await tagService.getTagByNameAndDimension(tx.whyTag, 'why');
						if (whyTag?.color) {
							tagColors.why = whyTag.color;
						}
					} catch (error) {
						console.warn('Failed to load why tag color:', error);
					}
				}

				// Custom tags functionality removed - transaction-tag-service was removed

				processed.push({
					...tx,
					tagNames,
					tagColors,
					confidenceLevel,
					isOverdue,
					isRecurring
				});
			}

			processedTransactions = processed;
		};

		processTransactions();
	});

	// Group transactions by date using the smart grouping logic from transactions page
	const groupedTransactions = $derived.by(() => {
		const groups: Record<string, ProcessedTransaction[]> = {};
		
		processedTransactions.forEach(tx => {
			const date = tx.clearedDate ? new Date(tx.clearedDate) : new Date(tx.plannedDate!);
			const groupKey = getGroupKey(date);
			groups[groupKey] ??= [];
			groups[groupKey].push(tx);
		});

		// Sort transactions within each group by date (most recent first)
		Object.values(groups).forEach(group => {
			group.sort((a, b) => {
				const dateA = a.clearedDate ? new Date(a.clearedDate) : new Date(a.plannedDate!);
				const dateB = b.clearedDate ? new Date(b.clearedDate) : new Date(b.plannedDate!);
				return dateB.getTime() - dateA.getTime();
			});
		});

		return Object.entries(groups)
			.map(([groupKey, txs]) => ({
				key: groupKey,
				date: getGroupDate(groupKey),
				transactions: txs,
				label: getGroupLabel(groupKey)
			}))
			.sort((a, b) => b.date.getTime() - a.date.getTime());
	});

	// Handle long press to trigger selection mode
	const handleTransactionLongPress = (transaction: ProcessedTransaction) => {
		onTransactionLongPress(transaction);
	};
</script>

{#if groupedTransactions.length === 0}
	<div class="flex flex-col items-center justify-center py-8 text-center">
		<svg class="w-12 h-12 text-text-tertiary mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
		</svg>
		<p class="text-text-secondary">No transactions found</p>
		<p class="text-sm text-text-tertiary">Try adjusting your search or filters</p>
	</div>
{:else}
	<div class="space-y-4 transaction-list">
		{#each groupedTransactions as group (group.key)}
			<TransactionGroup
				transactions={group.transactions}
				groupKey={group.key}
				groupLabel={group.label}
				groupDate={group.date}
				onTransactionClick={onTransactionClick}
				onTransactionLongPress={handleTransactionLongPress}
				{plannedDateDisplay}
				{clearedDateDisplay}
				{topBarHeight}
				{selectedTransactions}
				{selectionMode}
				{selectionColor}
			/>
		{/each}
	</div>
{/if} 