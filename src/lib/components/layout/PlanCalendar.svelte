<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Card from '../primitives/Card.svelte';
	import Button from '../primitives/Button.svelte';
	import type { Transaction } from '$lib/core/db';

	interface Props {
		transactions: Transaction[];
	}

	let { transactions }: Props = $props();
	const dispatch = createEventDispatcher();

	// Calendar state
	let currentDate = $state(new Date());
	let selectedDate = $state<Date | null>(null);
	let showDayDetails = $state(false);

	// Get calendar data for current month
	const calendarData = $derived.by(() => {
		const year = currentDate.getFullYear();
		const month = currentDate.getMonth();
		
		// Get first day of month and number of days
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const daysInMonth = lastDay.getDate();
		const startDayOfWeek = firstDay.getDay();
		
		// Create calendar grid
		const days: Array<{ date: Date; isCurrentMonth: boolean; transactions: Transaction[] }> = [];
		
		// Add days from previous month
		for (let i = startDayOfWeek - 1; i >= 0; i--) {
			const date = new Date(year, month, -i);
			days.push({
				date,
				isCurrentMonth: false,
				transactions: getTransactionsForDate(date)
			});
		}
		
		// Add days from current month
		for (let day = 1; day <= daysInMonth; day++) {
			const date = new Date(year, month, day);
			days.push({
				date,
				isCurrentMonth: true,
				transactions: getTransactionsForDate(date)
			});
		}
		
		// Add days from next month to complete the grid
		const remainingDays = 42 - days.length; // 6 rows * 7 days
		for (let day = 1; day <= remainingDays; day++) {
			const date = new Date(year, month + 1, day);
			days.push({
				date,
				isCurrentMonth: false,
				transactions: getTransactionsForDate(date)
			});
		}
		
		return days;
	});

	// Get transactions for a specific date
	const getTransactionsForDate = (date: Date): Transaction[] => {
		return transactions.filter(tx => {
			if (!tx.plannedDate) return false;
			const txDate = new Date(tx.plannedDate);
			return txDate.toDateString() === date.toDateString();
		});
	};

	// Navigation functions
	const previousMonth = () => {
		currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
	};

	const nextMonth = () => {
		currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
	};

	const goToToday = () => {
		currentDate = new Date();
		selectedDate = null;
		showDayDetails = false;
	};

	// Handle day click
	const handleDayClick = (day: { date: Date; isCurrentMonth: boolean; transactions: Transaction[] }) => {
		if (day.transactions.length > 0 || day.isCurrentMonth) {
			selectedDate = day.date;
			showDayDetails = true;
		}
	};

	// Close day details
	const closeDayDetails = () => {
		showDayDetails = false;
		selectedDate = null;
	};

	// Get transaction color based on type
	const getTransactionColor = (tx: Transaction) => {
		if (tx.amount > 0) return 'bg-green-500'; // Income
		return 'bg-red-500'; // Expense
	};

	// Get transaction indicator size based on amount
	const getTransactionSize = (tx: Transaction) => {
		const absAmount = Math.abs(tx.amount);
		if (absAmount > 1000) return 'w-3 h-3';
		if (absAmount > 500) return 'w-2.5 h-2.5';
		return 'w-2 h-2';
	};

	// Format month/year for display
	const monthYearDisplay = $derived(currentDate.toLocaleDateString(undefined, { 
		month: 'long', 
		year: 'numeric' 
	}));

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
</script>

<div class="space-y-4">
	<!-- Calendar Header -->
	<div class="flex items-center justify-between">
		<Button variant="neutral" size="sm" onclick={previousMonth}>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
			</svg>
		</Button>
		
		<div class="flex items-center gap-2">
			<h2 class="text-lg font-semibold">{monthYearDisplay}</h2>
			<Button variant="secondary" size="sm" onclick={goToToday}>
				Today
			</Button>
		</div>
		
		<Button variant="neutral" size="sm" onclick={nextMonth}>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
			</svg>
		</Button>
	</div>

	<!-- Calendar Grid -->
	<Card class="p-4">
		<!-- Day names header -->
		<div class="grid grid-cols-7 gap-1 mb-2">
			{#each dayNames as dayName}
				<div class="text-center text-sm font-medium text-gray-400 py-2">
					{dayName}
				</div>
			{/each}
		</div>

		<!-- Calendar days -->
		<div class="grid grid-cols-7 gap-1">
			{#each calendarData as day, index}
				<button
					class="relative p-2 text-sm rounded-lg transition-colors {day.isCurrentMonth 
						? 'hover:bg-zinc-800/50' 
						: 'text-gray-600'} {selectedDate?.toDateString() === day.date.toDateString() 
						? 'bg-teal-500/20 border border-teal-500/30' 
						: ''}"
					onclick={() => handleDayClick(day)}
				>
					<div class="text-center mb-1">
						{day.date.getDate()}
					</div>
					
					<!-- Transaction indicators -->
					{#if day.transactions.length > 0}
						<div class="flex flex-wrap gap-0.5 justify-center">
							{#each day.transactions.slice(0, 3) as tx}
								<div class="{getTransactionColor(tx)} {getTransactionSize(tx)} rounded-full"></div>
							{/each}
							{#if day.transactions.length > 3}
								<div class="w-2 h-2 bg-gray-500 rounded-full text-xs flex items-center justify-center">
									+
								</div>
							{/if}
						</div>
					{/if}
				</button>
			{/each}
		</div>
	</Card>

	<!-- Day Details Modal -->
	{#if showDayDetails && selectedDate}
		<button 
			class="fixed inset-0 bg-black/50 flex items-end justify-center z-50" 
			onclick={closeDayDetails}
			onkeydown={(e) => e.key === 'Escape' && closeDayDetails()}
			type="button"
		>
			<div 
				class="bg-zinc-900 border-t border-zinc-800 rounded-t-2xl w-full max-w-md max-h-[70vh] overflow-hidden" 
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="0"
			>
				<div class="p-4 border-b border-zinc-800">
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">
							{selectedDate.toLocaleDateString(undefined, { 
								weekday: 'long', 
								month: 'long', 
								day: 'numeric' 
							})}
						</h3>
						<Button variant="neutral" size="sm" onclick={closeDayDetails}>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
							</svg>
						</Button>
					</div>
				</div>
				
				<div class="p-4 max-h-[60vh] overflow-y-auto">
					{#if getTransactionsForDate(selectedDate).length > 0}
						<div class="space-y-3">
							{#each getTransactionsForDate(selectedDate) as tx (tx.id)}
								<div class="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
									<div class="flex-1">
										<p class="font-medium">{tx.description || 'Uncategorized'}</p>
										<p class="text-sm text-gray-400">
											{tx.whatTag ? tx.whatTag : 'No tag'}
										</p>
									</div>
									<div class="text-right">
										<p class="font-bold {tx.amount > 0 ? 'text-green-400' : 'text-red-400'}">
											${Math.abs(tx.amount)}
										</p>
										<p class="text-xs text-gray-400">
											{tx.confidence || 'Planned'}
										</p>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="text-center py-8">
							<p class="text-gray-400">No planned transactions for this date</p>
							<Button 
								variant="primary" 
								size="sm" 
								class="mt-4"
								onclick={() => {
									dispatch('add-transaction', { date: selectedDate });
									closeDayDetails();
								}}
							>
								Add Transaction
							</Button>
						</div>
					{/if}
				</div>
			</div>
		</button>
	{/if}
</div> 