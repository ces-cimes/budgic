<script lang="ts">
	import { onMount } from 'svelte';
	import { PageLayout, MobileNavigation } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import TabNavigation from '$lib/components/TabNavigation.svelte';
	import * as Card from '$lib/components/ui/card/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select/index.ts';
	import { ArrowRightLeft, DollarSign, AlertCircle, Target, BarChart3 } from '@lucide/svelte';

	// State
	let categories = $state<any[]>([]);
	let isLoading = $state(true);
	let isTransferring = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);

	// Tab navigation configuration
	const budgetTabs = [
		{ id: 'overview', label: 'Overview', path: '/categories', icon: BarChart3 },
		{ id: 'transfers', label: 'Transfers', path: '/categories/transfers', icon: ArrowRightLeft }
	];
	
	// Transfer form
	let fromCategory = $state('');
	let toCategory = $state('');
	let amount = $state('');
	let reason = $state('');

	// Mock categories data
	const mockCategories = [
		{ id: '1', name: 'Emergency Fund', balance: 2500.00, color: '#ef4444' },
		{ id: '2', name: 'Vacation Fund', balance: 800.00, color: '#3b82f6' },
		{ id: '3', name: 'Investment', balance: 1200.00, color: '#10b981' },
		{ id: '4', name: 'Home Improvement', balance: 450.00, color: '#f59e0b' },
		{ id: '5', name: 'Education Fund', balance: 300.00, color: '#8b5cf6' }
	];

	onMount(() => {
		// Simulate loading
		setTimeout(() => {
			categories = mockCategories;
			isLoading = false;
		}, 1000);
	});

	function getCategoryById(id: string) {
		return categories.find(c => c.id === id);
	}

	function validateTransfer() {
		if (!fromCategory || !toCategory || !amount) {
			return 'Please fill in all required fields';
		}
		
		if (fromCategory === toCategory) {
			return 'Cannot transfer to the same category';
		}
		
		const amountNum = parseFloat(amount);
		if (isNaN(amountNum) || amountNum <= 0) {
			return 'Please enter a valid amount';
		}
		
		const fromCat = getCategoryById(fromCategory);
		if (fromCat && amountNum > fromCat.balance) {
			return 'Insufficient funds in source category';
		}
		
		return null;
	}

	async function handleTransfer() {
		error = null;
		success = null;
		
		const validationError = validateTransfer();
		if (validationError) {
			error = validationError;
			return;
		}
		
		isTransferring = true;
		
		try {
			// Simulate API call
			await new Promise(resolve => setTimeout(resolve, 1500));
			
			// Update local state
			const amountNum = parseFloat(amount);
			categories = categories.map(cat => {
				if (cat.id === fromCategory) {
					return { ...cat, balance: cat.balance - amountNum };
				}
				if (cat.id === toCategory) {
					return { ...cat, balance: cat.balance + amountNum };
				}
				return cat;
			});
			
			success = `Successfully transferred $${amountNum.toFixed(2)} from ${getCategoryById(fromCategory)?.name} to ${getCategoryById(toCategory)?.name}`;
			
			// Reset form
			fromCategory = '';
			toCategory = '';
			amount = '';
			reason = '';
			
		} catch (err) {
			error = 'Transfer failed. Please try again.';
		} finally {
			isTransferring = false;
		}
	}

	function formatCurrency(value: number) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(value);
	}
</script>

<PageLayout>
	{#snippet topBar()}
		<Header title="Fund Transfers" variant="with-tabs">
			<TabNavigation tabs={budgetTabs} />
		</Header>	
	{/snippet}

	<div class="p-4 space-y-6">
		{#if isLoading}
			<div class="space-y-4">
				<Card.Root class="p-6">
					<div class="animate-pulse">
						<div class="h-8 bg-muted rounded w-1/3 mb-4"></div>
						<div class="h-4 bg-muted rounded w-2/3 mb-2"></div>
						<div class="h-4 bg-muted rounded w-1/2"></div>
					</div>
				</Card.Root>
			</div>
		{:else}
			<!-- Transfer Form -->
			<Card.Root class="p-6">
				<div class="flex items-center gap-3 mb-6">
					<ArrowRightLeft class="w-6 h-6 text-primary" />
					<h2 class="text-xl font-semibold text-primary">Transfer Funds</h2>
				</div>
				
				<form onsubmit={(e) => { e.preventDefault(); handleTransfer(); }} class="space-y-4">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<!-- From Category -->
						<div class="space-y-2">
							<Label for="from-category">From Category</Label>
							<Select.Root bind:value={fromCategory}>
								<SelectTrigger>
									{getCategoryById(fromCategory)?.name || 'Select source category'}
								</SelectTrigger>
								<SelectContent>
									{#each categories as category (category.id)}
										<SelectItem value={category.id}>
											<div class="flex items-center gap-2">
												<div class="w-3 h-3 rounded-full" style="background-color: {category.color}"></div>
												<span>{category.name}</span>
												<span class="text-muted-foreground">({formatCurrency(category.balance)})</span>
											</div>
										</SelectItem>
									{/each}
								</SelectContent>
							</Select.Root>
						</div>
						
						<!-- To Category -->
						<div class="space-y-2">
							<Label for="to-category">To Category</Label>
							<Select.Root bind:value={toCategory}>
								<SelectTrigger>
									{getCategoryById(toCategory)?.name || 'Select destination category'}
								</SelectTrigger>
								<SelectContent>
									{#each categories as category (category.id)}
										<SelectItem value={category.id}>
											<div class="flex items-center gap-2">
												<div class="w-3 h-3 rounded-full" style="background-color: {category.color}"></div>
												<span>{category.name}</span>
												<span class="text-muted-foreground">({formatCurrency(category.balance)})</span>
											</div>
										</SelectItem>
									{/each}
								</SelectContent>
							</Select.Root>
						</div>
					</div>
					
					<!-- Amount -->
					<div class="space-y-2">
						<Label for="amount">Amount</Label>
						<div class="relative">
							<DollarSign class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
							<Input 
								id="amount"
								type="number" 
								step="0.01" 
								min="0.01"
								bind:value={amount}
								placeholder="0.00"
								class="pl-10"
								required
							/>
						</div>
					</div>
					
					<!-- Reason -->
					<div class="space-y-2">
						<Label for="reason">Reason (Optional)</Label>
						<Input 
							id="reason"
							bind:value={reason}
							placeholder="e.g., Emergency expense, Goal adjustment"
						/>
					</div>
					
					<!-- Error/Success Messages -->
					{#if error}
						<div class="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
							<AlertCircle class="w-4 h-4 text-red-500" />
							<span class="text-sm text-red-700">{error}</span>
						</div>
					{/if}
					
					{#if success}
						<div class="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
							<AlertCircle class="w-4 h-4 text-green-500" />
							<span class="text-sm text-green-700">{success}</span>
						</div>
					{/if}
					
					<!-- Submit Button -->
					<Button.Root 
						type="submit" 
						disabled={isTransferring || !fromCategory || !toCategory || !amount}
						class="w-full"
					>
						{isTransferring ? 'Transferring...' : 'Transfer Funds'}
					</Button.Root>
				</form>
			</Card.Root>

			<!-- Category Balances -->
			<Card.Root class="p-6">
				<h3 class="text-lg font-semibold text-primary mb-4">Current Balances</h3>
				<div class="space-y-3">
					{#each categories as category (category.id)}
						<div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
							<div class="flex items-center gap-3">
								<div class="w-4 h-4 rounded-full" style="background-color: {category.color}"></div>
								<span class="font-medium text-primary">{category.name}</span>
							</div>
							<div class="text-right">
								<div class="font-semibold text-primary">{formatCurrency(category.balance)}</div>
							</div>
						</div>
					{/each}
				</div>
			</Card.Root>

			<!-- Transfer History -->
			<Card.Root class="p-6">
				<h3 class="text-lg font-semibold text-primary mb-4">Recent Transfers</h3>
				<div class="space-y-3">
					<div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
						<div class="flex items-center gap-3">
							<ArrowRightLeft class="w-4 h-4 text-muted-foreground" />
							<div>
								<div class="text-sm font-medium text-primary">Emergency Fund → Vacation Fund</div>
								<div class="text-xs text-muted-foreground">Dec 10, 2024</div>
							</div>
						</div>
						<div class="text-right">
							<div class="text-sm font-semibold text-primary">$200.00</div>
							<div class="text-xs text-muted-foreground">Emergency expense</div>
						</div>
					</div>
					
					<div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
						<div class="flex items-center gap-3">
							<ArrowRightLeft class="w-4 h-4 text-muted-foreground" />
							<div>
								<div class="text-sm font-medium text-primary">Investment → Education Fund</div>
								<div class="text-xs text-muted-foreground">Dec 5, 2024</div>
							</div>
						</div>
						<div class="text-right">
							<div class="text-sm font-semibold text-primary">$150.00</div>
							<div class="text-xs text-muted-foreground">Goal adjustment</div>
						</div>
					</div>
				</div>
			</Card.Root>
		{/if}
	</div>
</PageLayout>
