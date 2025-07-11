<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Card from '../primitives/Card.svelte';
	import Button from '../primitives/Button.svelte';
	import Input from '../primitives/Input.svelte';

	const dispatch = createEventDispatcher();

	// Scenario state
	let scenarioName = $state('');
	let scenarioAmount = $state('');
	let scenarioType = $state<'expense' | 'income'>('expense');
	let scenarioDate = $state('');
	let scenarioDescription = $state('');
	let showImpact = $state(false);

	// Sample budget impact data (in a real app, this would be calculated)
	const budgetImpact = $derived.by(() => {
		if (!scenarioAmount || !scenarioDate) return null;
		
		const amount = parseFloat(scenarioAmount);
		if (isNaN(amount)) return null;

		const date = new Date(scenarioDate);
		const today = new Date();
		const daysUntil = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
		
		// Mock daily budget calculation
		const currentDailyBudget = 50; // This would come from actual budget data
		const newDailyBudget = scenarioType === 'expense' 
			? currentDailyBudget - (amount / 30) 
			: currentDailyBudget + (amount / 30);
		
		return {
			daysUntil,
			currentDailyBudget,
			newDailyBudget,
			change: newDailyBudget - currentDailyBudget,
			impact: scenarioType === 'expense' ? 'negative' : 'positive'
		};
	});

	// Close modal
	const close = () => {
		dispatch('close');
	};

	// Handle form submission
	const handleSubmit = () => {
		if (!scenarioName || !scenarioAmount || !scenarioDate) return;
		
		// In a real app, this would save the scenario
		console.log('Scenario created:', {
			name: scenarioName,
			amount: parseFloat(scenarioAmount),
			type: scenarioType,
			date: scenarioDate,
			description: scenarioDescription
		});
		
		showImpact = true;
	};

	// Reset form
	const resetForm = () => {
		scenarioName = '';
		scenarioAmount = '';
		scenarioType = 'expense';
		scenarioDate = '';
		scenarioDescription = '';
		showImpact = false;
	};

	// Get current date for min date input
	const today = new Date().toISOString().split('T')[0];
</script>

<!-- Modal Backdrop -->
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onclick={close}>
	<!-- Modal Content -->
	<div 
		class="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.key === 'Escape' && close()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="scenario-modal-title"
		tabindex="-1"
	>
		<!-- Header -->
		<div class="p-6 border-b border-zinc-800">
			<div class="flex items-center justify-between">
				<h2 id="scenario-modal-title" class="text-xl font-bold">Create Scenario</h2>
				<Button variant="neutral" size="sm" onclick={close}>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
					</svg>
				</Button>
			</div>
			<p class="text-gray-400 mt-2">Model a "what-if" financial scenario</p>
		</div>

		<!-- Form Content -->
		<div class="p-6 space-y-6">
			{#if !showImpact}
				<!-- Scenario Form -->
				<div class="space-y-4">
					<!-- Scenario Name -->
					<div>
						<label for="scenario-name" class="block text-sm font-medium mb-2">Scenario Name</label>
						<Input 
							id="scenario-name"
							bind:value={scenarioName}
							placeholder="e.g., Buy new laptop"
							class="w-full"
						/>
					</div>

					<!-- Transaction Type -->
					<div>
						<fieldset>
							<legend class="block text-sm font-medium mb-2">Type</legend>
							<div class="flex gap-2">
								<Button 
									variant={scenarioType === 'expense' ? 'primary' : 'neutral'}
									size="sm"
									onclick={() => scenarioType = 'expense'}
								>
									Expense
								</Button>
								<Button 
									variant={scenarioType === 'income' ? 'primary' : 'neutral'}
									size="sm"
									onclick={() => scenarioType = 'income'}
								>
									Income
								</Button>
							</div>
						</fieldset>
					</div>

					<!-- Amount -->
					<div>
						<label for="scenario-amount" class="block text-sm font-medium mb-2">Amount</label>
						<Input 
							id="scenario-amount"
							bind:value={scenarioAmount}
							type="number"
							placeholder="0.00"
							class="w-full"
						/>
					</div>

					<!-- Date -->
					<div>
						<label for="scenario-date" class="block text-sm font-medium mb-2">Date</label>
						<Input 
							id="scenario-date"
							bind:value={scenarioDate}
							type="date"
							min={today}
							class="w-full"
						/>
					</div>

					<!-- Description -->
					<div>
						<label for="scenario-description" class="block text-sm font-medium mb-2">Description (Optional)</label>
						<Input 
							id="scenario-description"
							bind:value={scenarioDescription}
							placeholder="Additional details..."
							class="w-full"
						/>
					</div>
				</div>

				<!-- Action Buttons -->
				<div class="flex gap-3 pt-4">
					<Button variant="neutral" fullWidth onclick={close}>
						Cancel
					</Button>
					<Button 
						variant="primary" 
						fullWidth 
						disabled={!scenarioName || !scenarioAmount || !scenarioDate}
						onclick={handleSubmit}
					>
						See Impact
					</Button>
				</div>
			{:else}
				<!-- Impact Analysis -->
				<div class="space-y-6">
					<!-- Scenario Summary -->
					<Card class="p-4">
						<h3 class="font-semibold mb-3">Scenario: {scenarioName}</h3>
						<div class="space-y-2 text-sm">
							<div class="flex justify-between">
								<span class="text-gray-400">Amount:</span>
								<span class="font-medium {scenarioType === 'expense' ? 'text-red-400' : 'text-green-400'}">
									${Math.abs(parseFloat(scenarioAmount))}
								</span>
							</div>
							<div class="flex justify-between">
								<span class="text-gray-400">Date:</span>
								<span>{new Date(scenarioDate).toLocaleDateString()}</span>
							</div>
							{#if scenarioDescription}
								<div class="flex justify-between">
									<span class="text-gray-400">Description:</span>
									<span>{scenarioDescription}</span>
								</div>
							{/if}
						</div>
					</Card>

					<!-- Budget Impact -->
					{#if budgetImpact}
						<Card class="p-4">
							<h3 class="font-semibold mb-3">Budget Impact</h3>
							<div class="space-y-4">
								<div class="flex justify-between items-center">
									<span class="text-text-secondary">Current Daily Budget:</span>
									<span class="font-medium">${budgetImpact.currentDailyBudget}</span>
								</div>
								<div class="flex justify-between items-center">
									<span class="text-text-secondary">New Daily Budget:</span>
									<span class="font-medium {budgetImpact.impact === 'positive' ? 'text-sage-green' : 'text-warm-coral'}">
										${budgetImpact.newDailyBudget.toFixed(2)}
									</span>
								</div>
								<div class="flex justify-between items-center">
									<span class="text-text-secondary">Change:</span>
									<span class="font-medium {budgetImpact.impact === 'positive' ? 'text-sage-green' : 'text-warm-coral'}">
										{budgetImpact.impact === 'positive' ? '+' : ''}${budgetImpact.change.toFixed(2)}
									</span>
								</div>
								<div class="flex justify-between items-center">
									<span class="text-text-secondary">Days Until:</span>
									<span class="font-medium">{budgetImpact.daysUntil} days</span>
								</div>
							</div>
						</Card>

						<!-- Impact Visualization -->
						<Card class="p-4">
							<h3 class="font-semibold mb-3">Visual Impact</h3>
							<div class="space-y-3">
								<div>
									<div class="flex justify-between text-sm mb-1">
										<span>Current Budget</span>
										<span>${budgetImpact.currentDailyBudget}</span>
									</div>
									<div class="w-full bg-zinc-800 rounded-full h-2">
										<div class="bg-teal-500 h-2 rounded-full" style="width: 100%"></div>
									</div>
								</div>
								<div>
									<div class="flex justify-between text-sm mb-1">
										<span>With Scenario</span>
										<span>${budgetImpact.newDailyBudget.toFixed(2)}</span>
									</div>
									<div class="w-full bg-zinc-800 rounded-full h-2">
										<div 
											class="h-2 rounded-full {budgetImpact.impact === 'positive' ? 'bg-green-500' : 'bg-red-500'}" 
											style="width: {Math.max(0, (budgetImpact.newDailyBudget / budgetImpact.currentDailyBudget) * 100)}%"
										></div>
									</div>
								</div>
							</div>
						</Card>
					{/if}

					<!-- Action Buttons -->
					<div class="flex gap-3 pt-4">
						<Button variant="neutral" fullWidth onclick={resetForm}>
							New Scenario
						</Button>
						<Button variant="primary" fullWidth onclick={close}>
							Save Scenario
						</Button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div> 