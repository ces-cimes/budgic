<script lang="ts">
	import Button from '../primitives/Button.svelte';

	// Define events using the new Svelte 5 syntax
	let { onclose, onaction } = $props<{
		onclose?: () => void;
		onaction?: (action: string) => void;
	}>();

	// Close the bottom sheet
	const close = () => {
		onclose?.();
	};

	// Handle action selection
	const handleAction = (action: string) => {
		onaction?.(action);
	};

	// Prevent click propagation
	const handleContentClick = (event: Event) => {
		event.stopPropagation();
	};

	// Handle keyboard events for content div
	const handleContentKeyDown = (event: KeyboardEvent) => {
		// Prevent event bubbling for keyboard events too
		event.stopPropagation();
	};

	// Handle keyboard events for accessibility
	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			close();
		}
	};

	const handleActionKeyDown = (event: KeyboardEvent, action: string) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleAction(action);
		}
	};
</script>

<!-- Backdrop -->
<div 
	class="fixed bottom-0 left-0 right-0 inset-0 bg-black/50 z-50" 
	onclick={close}
	onkeydown={handleKeyDown}
	tabindex="0"
	role="button"
	aria-label="Close bottom sheet"
>
	<!-- Bottom Sheet Content -->
	<div 
		class="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 rounded-t-2xl p-6 pb-24 max-h-[80vh] overflow-y-auto"
		onclick={handleContentClick}
		onkeydown={handleContentKeyDown}
		role="presentation"
	>
		<!-- Handle -->
		<div class="flex justify-center mb-6">
			<div class="w-12 h-1 bg-gray-600 rounded-full"></div>
		</div>

		<!-- Header -->
		<div class="mb-6">
			<h2 class="text-xl font-bold mb-2">Plan Actions</h2>
			<p class="text-gray-400">Choose what you'd like to do</p>
		</div>

		<!-- Action Buttons -->
		<div class="space-y-4">
			<!-- Add Planned Transaction -->
			<button
				class="w-full flex items-center gap-4 p-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors text-left"
				onclick={() => handleAction('add-transaction')}
			>
				<div class="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center">
					<svg class="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
					</svg>
				</div>
				<div class="flex-1">
					<h3 class="font-semibold">Add Planned Transaction</h3>
					<p class="text-sm text-gray-400">Schedule a future expense or income</p>
				</div>
				<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
				</svg>
			</button>

			<!-- Create Scenario -->
			<button
				class="w-full flex items-center gap-4 p-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors text-left"
				onclick={() => handleAction('create-scenario')}
			>
				<div class="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
					<svg class="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
					</svg>
				</div>
				<div class="flex-1">
					<h3 class="font-semibold">Create Scenario</h3>
					<p class="text-sm text-gray-400">Model "what-if" financial scenarios</p>
				</div>
				<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
				</svg>
			</button>

			<!-- Review Overdue Items -->
			<button
				class="w-full flex items-center gap-4 p-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors text-left"
				onclick={() => handleAction('review-overdue')}
			>
				<div class="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
					<svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
					</svg>
				</div>
				<div class="flex-1">
					<h3 class="font-semibold">Review Overdue Items</h3>
					<p class="text-sm text-gray-400">Check past due planned transactions</p>
				</div>
				<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
				</svg>
			</button>

			<!-- Quick Templates -->
			<div class="pt-4 border-t border-zinc-800">
				<h3 class="font-semibold mb-3">Quick Templates</h3>
				<div class="grid grid-cols-2 gap-3">
					<button
						class="p-3 bg-zinc-800/30 hover:bg-zinc-800/50 rounded-lg transition-colors text-left"
						onclick={() => handleAction('template-rent')}
					>
						<div class="text-sm font-medium">Monthly Rent</div>
						<div class="text-xs text-gray-400">Recurring expense</div>
					</button>
					
					<button
						class="p-3 bg-zinc-800/30 hover:bg-zinc-800/50 rounded-lg transition-colors text-left"
						onclick={() => handleAction('template-salary')}
					>
						<div class="text-sm font-medium">Salary</div>
						<div class="text-xs text-gray-400">Recurring income</div>
					</button>
					
					<button
						class="p-3 bg-zinc-800/30 hover:bg-zinc-800/50 rounded-lg transition-colors text-left"
						onclick={() => handleAction('template-utilities')}
					>
						<div class="text-sm font-medium">Utilities</div>
						<div class="text-xs text-gray-400">Monthly bills</div>
					</button>
					
					<button
						class="p-3 bg-zinc-800/30 hover:bg-zinc-800/50 rounded-lg transition-colors text-left"
						onclick={() => handleAction('template-groceries')}
					>
						<div class="text-sm font-medium">Groceries</div>
						<div class="text-xs text-gray-400">Weekly expense</div>
					</button>
				</div>
			</div>
		</div>

		<!-- Cancel Button -->
		<div class="pt-4">
			<Button 
				variant="neutral" 
				fullWidth 
				onclick={close}
			>
				Cancel
			</Button>
		</div>
	</div>
</div> 