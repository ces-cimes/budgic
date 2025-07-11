<script lang="ts">
	import StatusLabel from '../primitives/Label.svelte';
	import TransactionItem from '../TransactionItem.svelte';
	import type { Transaction } from '$lib/core/db';
	import { settingsService } from '$lib/core/services/settings-service';

	interface Props {
		transactions: ProcessedTransaction[];
		groupKey: string;
		groupLabel: string;
		groupDate: Date;
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
		groupKey,
		groupLabel,
		groupDate,
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

	// Reactive stores for date formats
	let plannedFormat = $state<'date' | 'time' | 'datetime'>('date');
	let clearedFormat = $state<'date' | 'time' | 'datetime'>('time');

	// Load date formats from settings
	$effect(() => {
		if (plannedDateDisplay === 'auto') {
			settingsService.getPlannedDateDisplayFormat().then(format => {
				plannedFormat = format;
			});
		} else {
			plannedFormat = plannedDateDisplay;
		}

		if (clearedDateDisplay === 'auto') {
			settingsService.getClearedDateDisplayFormat().then(format => {
				clearedFormat = format;
			});
		} else {
			clearedFormat = clearedDateDisplay;
		}
	});

	// Format dates based on current settings
	const formatTransactionDate = (transaction: ProcessedTransaction) => {
		if (transaction.plannedDate) {
			return settingsService.formatDate(transaction.plannedDate, plannedFormat);
		} else if (transaction.clearedDate) {
			return settingsService.formatDate(transaction.clearedDate, clearedFormat);
		}
		return '';
	};

	// Get group styling based on group type
	const getGroupStyling = () => {
		if (groupKey === 'today') {
			return 'text-blue-400';
		} else if (groupKey === 'yesterday') {
			return 'text-purple-400';
		} else if (groupKey === 'this_week') {
			return 'text-green-400';
		} else if (groupKey === 'last_week') {
			return 'text-orange-400';
		} else if (groupKey === 'next_week') {
			return 'text-cyan-400';
		} else if (groupKey.startsWith('future_')) {
			return 'text-amber-400';
		} else if (groupKey.startsWith('past_')) {
			return 'text-gray-400';
		}
		return 'text-text-secondary';
	};

	// Get group icon based on group type
	const getGroupIcon = () => {
		if (groupKey === 'today') {
			return `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
				<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"></path>
			</svg>`;
		} else if (groupKey === 'yesterday') {
			return `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
				<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"></path>
			</svg>`;
		} else if (groupKey.startsWith('future_')) {
			return `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
				<path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"></path>
			</svg>`;
		}
		return `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
			<path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"></path>
		</svg>`;
	};

	const groupStyling = $derived.by(getGroupStyling);
	const groupIcon = $derived.by(getGroupIcon);
	
	// Ensure topBarHeight is a valid number
	const stickyTop = $derived.by(() => {
		return Math.max(0, topBarHeight || 0);
	});

	// Create a reactive function to check if a transaction is selected
	const isTransactionSelected = (transactionId: string) => {
		const isSelected = selectedTransactions.has(transactionId);
		console.log(`[TransactionGroup] Transaction ${transactionId} selected: ${isSelected}`);
		return isSelected;
	};

	// Create a reactive map of selected transactions
	const selectedTransactionIds = $derived.by(() => {
		return new Set(selectedTransactions);
	});
</script>

<div class="relative pt-2 border-t border-bg-tertiary rounded-t-xl">
	<!-- Date Header with PlanList styling -->
	<div class="sticky z-20 bg-bg-primary/60 backdrop-blur-sm py-1 px-2 border-b border-bg-tertiary text-shadow-lg" style="top: {stickyTop}px;">
		<h3 class="text-lg font-semibold {groupStyling} flex items-center gap-2">
			{@html groupIcon}
			{groupLabel}
		</h3>
	</div>

	<!-- Transactions for this date -->
	<div class="space-y-2 p-2 overflow-visible from-bg-secondary/50 to-transparent bg-gradient-to-t rounded-b-xl border-b border-bg-tertiary border-t-0">
		{#each transactions as transaction (transaction.id)}
			{@const isSelected = selectedTransactionIds.has(transaction.id)}
			<TransactionItem
				{transaction}
				onClick={onTransactionClick}
				onLongPress={onTransactionLongPress}
				{plannedDateDisplay}
				{clearedDateDisplay}
				isSelected={isSelected}
				{selectionMode}
				{selectionColor}
			/>
		{/each}
	</div>
</div> 