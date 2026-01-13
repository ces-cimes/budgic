<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { transactionService, accountService, budgetService } from '$lib/core/services';
	import { db } from '$lib/core/db';
	import type { Account, Transaction, Category } from '$lib/core/db';
	import * as Form from '$lib/components/ui/form/index.ts';
	import * as Select from '$lib/components/ui/select/index.ts';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.ts';
	import * as Label from '$lib/components/ui/label/index.ts';
	import * as Alert from '$lib/components/ui/alert/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';
	import * as Input from '$lib/components/ui/input/index.ts';
	import * as Switch from '$lib/components/ui/switch/index.ts';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Sheet from '$lib/components/ui/sheet/index.ts';
	import * as Tooltip from '$lib/components/ui/tooltip/index.ts';
	import { Trash2, HelpCircle, ChevronDown } from '@lucide/svelte';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import type { DirectionalConstraint, CurrencyInfo } from '$lib/core/db';
	import { PRIORITY_LEVELS, suggestPriority } from '$lib/utils/priority-utils';
	import { DIRECTIONAL_CONSTRAINTS, suggestConstraint } from '$lib/utils/directional-constraint-utils';
	import { getCurrencyInfo } from '$lib/utils/currency-utils';

	let accounts = $state<Account[]>([]);
	let categories = $state<Category[]>([]);
	let transaction = $state<Transaction | null>(null);
	
	// Form state
	let selectedAccount = $state('');
	let description = $state('');
	let amount = $state(0);
	let currency = $state('USD');
	let transactionType = $state<Transaction['type']>('expense');
	let status = $state<Transaction['status']>('cleared');
	let selectedCategory = $state('');
	let notes = $state('');
	let reference = $state('');
	let toAccountId = $state('');
	let plannedDate = $state('');
	let clearedDate = $state('');
	let isRecurring = $state(false);
	let recurrenceRule = $state('');
	let isGroupTransaction = $state(false);
	let groupName = $state('');
	let isLoading = $state(false);
	let error = $state('');
	
	// Currency selection state
	let currencies = $state<Array<{ code: string; name: string; symbol: string; placement: 'before' | 'after'; decimalPlaces: number }>>([]);
	let showCurrencySheet = $state(false);
	
	// Currency button ref and dynamic padding
	let currencyButtonRef: HTMLButtonElement | null = $state(null);
	let currencyButtonPadding = $state(64); // Default padding in pixels (button width + spacing)
	
	// Transfer fee fields
	let transferFeeAmount = $state(0);
	let transferFeeAccountId = $state('');
	let transferFeeCategoryId = $state('');
	let hasTransferFee = $state(false);
	
	// Optimization fields
	let priority = $state<number | undefined>(undefined);
	let directionalConstraint = $state<DirectionalConstraint | undefined>(undefined);
	
	// String version of priority for Select component (Select expects strings)
	let priorityString = $state<string>('');


	// UI state
	let showDeleteDialog = $state(false);
	let isDeleting = $state(false);
	
	// Computed date label
	let dateLabel = $derived(() => {
		if (status === 'cleared') return 'Date *';
		if (status === 'planned') return 'Planned Date *';
		if (status === 'pending') return 'Date';
		return 'Date';
	});
	
	// Get current currency info
	let currentCurrencyInfo = $derived(() => {
		return getCurrencyInfo(currency) || {
			code: 'USD',
			name: 'US Dollar',
			symbol: '$',
			placement: 'before' as const,
			decimalPlaces: 2,
			isSystem: true,
			isActive: true
		};
	});
	
	// Get currency symbol for display
	let currencySymbol = $derived(() => currentCurrencyInfo().symbol);
	
	// Get account currency when account is selected
	$effect(() => {
		if (selectedAccount && accounts.length > 0) {
			const account = accounts.find(a => a.id === selectedAccount);
			if (account && account.currency) {
				// Only update currency if it's not set yet (new transaction) or if editing and currency matches account
				if (!transaction || transaction.currency === account.currency) {
					currency = account.currency;
				}
			}
		}
	});
	
	// Measure currency button width and update padding
	$effect(() => {
		// Trigger measurement when currency changes
		const currentCurrency = currency;
		
		if (currencyButtonRef) {
			// Use ResizeObserver to track button width changes
			const resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const width = entry.contentRect.width;
					// Add 8px (0.5rem) base spacing + 8px (pl-2) for extra breathing room
					currencyButtonPadding = width + 12;
				}
			});
			
			resizeObserver.observe(currencyButtonRef);
			
			// Initial measurement with a small delay to ensure DOM is updated
			const updatePadding = () => {
				if (currencyButtonRef) {
					const width = currencyButtonRef.offsetWidth;
					// Add 8px (0.5rem) base spacing + 8px (pl-2) for extra breathing room
					currencyButtonPadding = width + 12;
				}
			};
			
			// Immediate measurement
			updatePadding();
			
			// Also measure after a short delay to catch any layout changes
			const timeoutId = setTimeout(updatePadding, 50);
			
			return () => {
				resizeObserver.disconnect();
				clearTimeout(timeoutId);
			};
		}
	});

	// Mobile keyboard handling - scroll to focused input
	function handleInputFocus(event: FocusEvent) {
		const target = event.target as HTMLElement;
		if (target && 'scrollIntoView' in target) {
			// Small delay to ensure keyboard is shown
			setTimeout(() => {
				target.scrollIntoView({ 
					behavior: 'smooth', 
					block: 'center',
					inline: 'nearest'
				});
			}, 300);
		}
	}

	onMount(async () => {
		try {
			[accounts, categories] = await Promise.all([
				accountService.getAccounts(),
				db.getActiveCategories()
			]);
			
			// Load available currencies
			const activeCurrencies = await db.getActiveCurrencies();
			currencies = activeCurrencies
				.filter(c => c.isActive)
				.sort((a, b) => {
					// Sort system currencies first, then by code
					if (a.isSystem && !b.isSystem) return -1;
					if (!a.isSystem && b.isSystem) return 1;
					return a.code.localeCompare(b.code);
				})
				.map(curr => ({
					code: curr.code,
					name: curr.name,
					symbol: curr.symbol,
					placement: curr.placement,
					decimalPlaces: curr.decimalPlaces
				}));
			
			// If no currencies found, use default USD
			if (currencies.length === 0) {
				currencies = [{
					code: 'USD',
					name: 'US Dollar',
					symbol: '$',
					placement: 'before' as const,
					decimalPlaces: 2
				}];
			}
			
			// Check if we have an ID parameter (edit mode)
			const transactionId = $page.params.id;
			if (transactionId) {
				transaction = await transactionService.getTransaction(transactionId);
				if (transaction) {
					// Populate form with existing transaction data
					selectedAccount = transaction.accountId;
					description = transaction.description || '';
					amount = transaction.amount || 0;
					currency = transaction.currency || 'USD';
					transactionType = transaction.type;
					status = transaction.status;
					selectedCategory = transaction.categoryId || '';
					notes = transaction.notes || '';
					reference = transaction.reference || '';
					toAccountId = transaction.toAccountId || '';
					plannedDate = transaction.plannedDate ? new Date(transaction.plannedDate).toISOString().slice(0, 16) : '';
					clearedDate = transaction.clearedDate ? new Date(transaction.clearedDate).toISOString().slice(0, 16) : '';
					isRecurring = !!transaction.recurrenceRule;
					recurrenceRule = transaction.recurrenceRule || '';
					isGroupTransaction = !!transaction.groupName;
					groupName = transaction.groupName || '';
					priority = transaction.priority;
					priorityString = transaction.priority?.toString() || '';
					directionalConstraint = transaction.directionalConstraint || undefined;
					// Reset suggestion flags when editing
					hasSuggestedPriority = true;
					hasSuggestedConstraint = true;
				} else {
					error = 'Transaction not found';
				}
			} else {
				// Default values for new transaction
				if (accounts.length > 0) {
					selectedAccount = accounts[0].id;
					transferFeeAccountId = accounts[0].id; // Default fee account to first account
					// Set currency to account currency
					currency = accounts[0].currency || 'USD';
				}
				// Set default dates
				const now = new Date();
				clearedDate = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM format
				plannedDate = now.toISOString().slice(0, 16);
			}
		} catch (err) {
			error = 'Failed to load data';
			console.error(err);
		}
	});

	// Computed properties
	let isEditMode = $derived(!!transaction);
	let pageTitle = $derived(isEditMode ? 'Edit Transaction' : 'Add Transaction');
	let submitButtonText = $derived(isLoading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update' : 'Create'));

	// Auto-suggest priority and constraint when category or type changes
	// Only suggest once when category/type is first set, not on every change
	let hasSuggestedPriority = $state(false);
	let hasSuggestedConstraint = $state(false);
	
	$effect(() => {
		// Only auto-suggest for new transactions (not when editing)
		if (!isEditMode && (selectedCategory || transactionType)) {
			const category = selectedCategory ? categories.find(c => c.id === selectedCategory) : undefined;
			const categoryName = category?.name;
			
			// Auto-suggest priority if not set and haven't suggested yet
			if (!hasSuggestedPriority && priority === undefined && (transactionType || categoryName)) {
				priority = suggestPriority(transactionType, categoryName);
				hasSuggestedPriority = true;
			}
			
			// Auto-suggest constraint if not set and haven't suggested yet
			if (!hasSuggestedConstraint && directionalConstraint === undefined && (transactionType || categoryName)) {
				directionalConstraint = suggestConstraint(transactionType, categoryName, isRecurring);
				hasSuggestedConstraint = true;
			}
		}
	});

	async function handleSubmit(event: Event) {
		event.preventDefault();
		isLoading = true;
		error = '';

		try {
			// Validate required fields
			if (!selectedAccount) {
				throw new Error('Please select an account');
			}
			if (!description.trim()) {
				throw new Error('Please enter a description');
			}
			if (amount === 0) {
				throw new Error('Please enter a valid amount (cannot be zero)');
			}
			if (transactionType === 'expense' && !selectedCategory) {
				throw new Error('Please select a category for expenses');
			}
			if (transactionType === 'transfer' && !toAccountId) {
				throw new Error('Please select a destination account for transfers');
			}

			// Prepare transaction data
			const transactionData: any = {
				accountId: selectedAccount,
				description: description.trim(),
				amount: amount,
				type: transactionType,
				status: status,
				currency: currency,
				categoryId: selectedCategory || undefined,
				notes: notes || undefined,
				reference: reference || undefined,
				toAccountId: transactionType === 'transfer' ? toAccountId : undefined,
				plannedDate: status === 'planned' ? (plannedDate ? new Date(plannedDate).toISOString() : undefined) : undefined,
				clearedDate: status === 'cleared' ? (clearedDate ? new Date(clearedDate).toISOString() : undefined) : undefined,
				recurrenceRule: isRecurring ? recurrenceRule : undefined,
				groupName: isGroupTransaction ? groupName : undefined,
				groupId: isGroupTransaction ? crypto.randomUUID() : undefined,
				priority: priority,
				directionalConstraint: directionalConstraint === 'none' ? undefined : directionalConstraint
			};

			// Handle transfer details if it's a transfer
			if (transactionType === 'transfer' && hasTransferFee) {
				transactionData.transferDetails = {
					toAccountId: toAccountId!,
					transferAmount: Math.abs(amount),
					feeAmount: transferFeeAmount,
					feeAccountId: transferFeeAccountId || selectedAccount,
					feeCategoryId: transferFeeCategoryId || undefined
				};
			}

			// Create or update transaction
			if (isEditMode && transaction) {
				await transactionService.updateTransaction(transaction.id, transactionData);
			} else {
				await transactionService.createTransaction(transactionData);
			}

			// Redirect to transactions list
			goto('/transactions');
		} catch (err) {
			error = err instanceof Error ? err.message : (isEditMode ? 'Failed to update transaction' : 'Failed to create transaction');
			console.error(err);
		} finally {
			isLoading = false;
		}
	}

	function formatDateForInput(dateString: string): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toISOString().slice(0, 16);
	}

	async function handleDelete() {
		if (!transaction) return;
		
		isDeleting = true;
		error = '';

		try {
			await transactionService.deleteTransaction(transaction.id);
			// Redirect to transactions list after successful deletion
			goto('/transactions');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete transaction';
			console.error(err);
			showDeleteDialog = false;
		} finally {
			isDeleting = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle} - Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header 
			title={pageTitle}
			showBackButton={true}
			backButtonLink="/transactions"
			backButtonLabel="Back to Transactions"
		/>
	{/snippet}

	<div class="container mx-auto px-4 py-4 md:py-6 max-w-2xl">

	{#if error}
		<Alert.Root variant="destructive" class="mb-6">
			<Alert.Title>Error</Alert.Title>
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
	{/if}

	<!-- Transaction Form -->
	<section class="mb-6">
		<form id="transaction-form" onsubmit={handleSubmit} class="space-y-4">
			<!-- Transaction Type and Status - Always Visible -->
			<div class="space-y-4 mb-6">
				<!-- Transaction Type -->
				<div class="space-y-2">
					<Label.Root>Transaction Type *</Label.Root>
					<RadioGroup.Root bind:value={transactionType} class="flex space-x-4">
						<div class="flex items-center space-x-2">
							<RadioGroup.Item value="expense" id="expense" />
							<Label.Root for="expense">Expense</Label.Root>
						</div>
						<div class="flex items-center space-x-2">
							<RadioGroup.Item value="income" id="income" />
							<Label.Root for="income">Income</Label.Root>
						</div>
						<div class="flex items-center space-x-2">
							<RadioGroup.Item value="transfer" id="transfer" />
							<Label.Root for="transfer">Transfer</Label.Root>
						</div>
						<div class="flex items-center space-x-2">
							<RadioGroup.Item value="adjustment" id="adjustment" />
							<Label.Root for="adjustment">Adjustment</Label.Root>
						</div>
					</RadioGroup.Root>
				</div>

				<!-- Transaction Status -->
				<div class="space-y-2">
					<Label.Root>Transaction Status *</Label.Root>
					<RadioGroup.Root bind:value={status} class="flex flex-wrap gap-3">
						<div class="flex items-center space-x-2">
							<RadioGroup.Item value="cleared" id="cleared" />
							<Label.Root for="cleared">Cleared</Label.Root>
						</div>
						<div class="flex items-center space-x-2">
							<RadioGroup.Item value="planned" id="planned" />
							<Label.Root for="planned">Planned</Label.Root>
						</div>
						<div class="flex items-center space-x-2">
							<RadioGroup.Item value="pending" id="pending" />
							<Label.Root for="pending">Pending</Label.Root>
						</div>
					</RadioGroup.Root>
				</div>
			</div>

			<!-- Main Form Fields -->
			<div class="space-y-4">
				<!-- Account Selection -->
				<div class="space-y-2">
					<Label.Root for="account">Account *</Label.Root>
					<Select.Root type="single" bind:value={selectedAccount} required>
						<Select.Trigger>
							{selectedAccount ? accounts.find(a => a.id === selectedAccount)?.name : "Select an account"}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="">Select an account</Select.Item>
							{#each accounts as account}
								<Select.Item value={account.id}>
									{account.name} (${account.currentBalance.toFixed(2)})
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<!-- Description -->
				<div class="space-y-2">
					<Label.Root for="description">Description *</Label.Root>
					<Input.Root
						id="description"
						bind:value={description}
						placeholder="e.g., Grocery shopping, Salary deposit"
						required
						onfocus={handleInputFocus}
					/>
				</div>

				<!-- Amount -->
				<div class="space-y-2">
					<Label.Root for="amount">Amount *</Label.Root>
					<div class="relative flex items-center">
						<button
							type="button"
							bind:this={currencyButtonRef}
							onclick={() => showCurrencySheet = true}
							class="absolute left-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-secondary transition-colors z-10"
							aria-label="Change currency"
						>
							<span class="text-sm font-medium text-primary">{currencySymbol()}</span>
							<ChevronDown class="w-3 h-3 text-muted-foreground" />
						</button>
						<Input.Root
							id="amount"
							type="number"
							bind:value={amount}
							placeholder="0.00"
							step={(() => {
								const decimals = currentCurrencyInfo().decimalPlaces;
								if (decimals === 0) return '1';
								if (decimals === 1) return '0.1';
								if (decimals === 2) return '0.01';
								return `0.${'0'.repeat(decimals - 1)}1`;
							})()}
							style="padding-left: {currencyButtonPadding}px;"
							required
							onfocus={handleInputFocus}
						/>
					</div>
				</div>

				<!-- Category -->
				<div class="space-y-2">
					<Label.Root for="category">Category</Label.Root>
					<Select.Root type="single" bind:value={selectedCategory}>
						<Select.Trigger>
							{selectedCategory ? categories.find(c => c.id === selectedCategory)?.name : "Select a category (optional)"}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="">Select a category (optional)</Select.Item>
							{#each categories as category}
								<Select.Item value={category.id} style="color: {category.color}">
									{category.name}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<!-- Transfer Destination (only for transfers) -->
				{#if transactionType === 'transfer'}
					<div class="space-y-2">
						<Label.Root for="toAccount">Destination Account *</Label.Root>
						<Select.Root type="single" bind:value={toAccountId} required>
							<Select.Trigger>
								{toAccountId ? accounts.find(a => a.id === toAccountId)?.name : "Select destination account"}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="">Select destination account</Select.Item>
								{#each accounts as account}
									<Select.Item value={account.id}>
										{account.name} (${account.currentBalance.toFixed(2)})
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					
					<!-- Transfer Fee (simplified) -->
					{#if hasTransferFee}
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<Label.Root for="transferFee">Transfer Fee</Label.Root>
								<button
									type="button"
									onclick={() => hasTransferFee = false}
									class="text-xs text-muted-foreground hover:text-primary"
								>
									Remove
								</button>
							</div>
							<div class="grid grid-cols-1 md:grid-cols-3 gap-2">
								<div class="relative">
									<span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm">{currencySymbol()}</span>
									<Input.Root
										id="feeAmount"
										type="number"
										bind:value={transferFeeAmount}
										placeholder="0.00"
										step={(() => {
											const decimals = currentCurrencyInfo().decimalPlaces;
											if (decimals === 0) return '1';
											if (decimals === 1) return '0.1';
											if (decimals === 2) return '0.01';
											return `0.${'0'.repeat(decimals - 1)}1`;
										})()}
										class="pl-8"
										min="0"
										onfocus={handleInputFocus}
									/>
								</div>
								<Select.Root type="single" bind:value={transferFeeAccountId}>
									<Select.Trigger class="text-sm">
										{transferFeeAccountId ? accounts.find(a => a.id === transferFeeAccountId)?.name : "Account"}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="">Source account</Select.Item>
										{#each accounts as account}
											<Select.Item value={account.id}>{account.name}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
								<Select.Root type="single" bind:value={transferFeeCategoryId}>
									<Select.Trigger class="text-sm">
										{transferFeeCategoryId ? categories.find(c => c.id === transferFeeCategoryId)?.name : "Category"}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="">Default</Select.Item>
										{#each categories as category}
											<Select.Item value={category.id}>{category.name}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
						</div>
					{:else}
						<button
							type="button"
							onclick={() => hasTransferFee = true}
							class="text-sm text-muted-foreground hover:text-primary"
						>
							+ Add transfer fee
						</button>
					{/if}
				{/if}

				<!-- Consolidated Date Field -->
				<div class="space-y-2">
					<Label.Root for="transactionDate">{dateLabel()}</Label.Root>
					{#if status === 'cleared'}
						<Input.Root
							id="transactionDate"
							type="datetime-local"
							bind:value={clearedDate}
							required
							onfocus={handleInputFocus}
						/>
					{:else if status === 'planned'}
						<Input.Root
							id="transactionDate"
							type="datetime-local"
							bind:value={plannedDate}
							required
							onfocus={handleInputFocus}
						/>
					{:else}
						<Input.Root
							id="transactionDate"
							type="datetime-local"
							bind:value={clearedDate}
							onfocus={handleInputFocus}
						/>
					{/if}
				</div>

				<!-- Recurring Transaction (only for planned/cleared) -->
				{#if status === 'planned' || status === 'cleared'}
					<div class="space-y-2">
						<div class="flex items-center space-x-2">
							<Switch.Root bind:checked={isRecurring} />
							<Label.Root for="recurring">Recurring transaction</Label.Root>
						</div>
						
						{#if isRecurring}
							<Select.Root type="single" bind:value={recurrenceRule}>
								<Select.Trigger>
									{recurrenceRule || "Select frequency"}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="daily">Daily</Select.Item>
									<Select.Item value="weekly">Weekly</Select.Item>
									<Select.Item value="biweekly">Bi-weekly</Select.Item>
									<Select.Item value="monthly">Monthly</Select.Item>
									<Select.Item value="quarterly">Quarterly</Select.Item>
									<Select.Item value="yearly">Yearly</Select.Item>
								</Select.Content>
							</Select.Root>
						{/if}
					</div>
				{/if}

				<!-- Advanced Options -->
				<div class="border-t border-border pt-6 mt-6">
					<div class="mb-4">
						<h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wide">Advanced Options</h3>
					</div>
					<div class="space-y-4">
						<!-- Group Transaction -->
						<div class="space-y-2">
							<div class="flex items-center space-x-2">
								<Switch.Root bind:checked={isGroupTransaction} />
								<Label.Root for="group">Grouped transaction</Label.Root>
							</div>
							
								{#if isGroupTransaction}
									<Input.Root
										id="groupName"
										bind:value={groupName}
										placeholder="Group name"
										required
										onfocus={handleInputFocus}
									/>
								{/if}
						</div>

						<!-- Reference -->
						<div class="space-y-2">
							<Label.Root for="reference">Reference</Label.Root>
							<Input.Root
								id="reference"
								bind:value={reference}
								placeholder="e.g., Check #1234, Invoice #ABC123"
								onfocus={handleInputFocus}
							/>
						</div>

						<!-- Notes -->
						<div class="space-y-2">
							<Label.Root for="notes">Notes</Label.Root>
							<textarea
								id="notes"
								bind:value={notes}
								placeholder="Additional notes..."
								rows="3"
								class="w-full px-3 py-2 border border-input rounded-md bg-background text-primary resize-none focus:ring-2 focus:ring-ring focus:border-transparent"
								onfocus={handleInputFocus}
							></textarea>
						</div>

						<!-- Priority -->
						<div class="space-y-2">
							<div class="flex items-center gap-2">
								<Label.Root for="priority">Priority</Label.Root>
								<Tooltip.Root>
									<Tooltip.Trigger>
										<HelpCircle class="w-4 h-4 text-muted-foreground" />
									</Tooltip.Trigger>
									<Tooltip.Content>
										<p class="max-w-xs">Priority helps the optimization system understand transaction importance. Higher numbers = more important.</p>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<Select.Root 
								type="single" 
								value={priorityString}
								onValueChange={(value) => {
									if (value && value !== '') {
										const numValue = parseInt(value, 10);
										if (!isNaN(numValue)) {
											priority = numValue;
											priorityString = value;
										}
									} else {
										priority = undefined;
										priorityString = '';
									}
								}}
							>
								<Select.Trigger>
									{priority ? `${priority} - ${PRIORITY_LEVELS.find(p => p.value === priority)?.name || 'Unknown'}` : "Select priority"}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="">No priority</Select.Item>
									{#each PRIORITY_LEVELS as level}
										<Select.Item value={level.value.toString()}>
											{level.value} - {level.name}
										</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>

						<!-- Directional Constraint -->
						<div class="space-y-2">
							<div class="flex items-center gap-2">
								<Label.Root for="directionalConstraint">Directional Constraint</Label.Root>
								<Tooltip.Root>
									<Tooltip.Trigger>
										<HelpCircle class="w-4 h-4 text-muted-foreground" />
									</Tooltip.Trigger>
									<Tooltip.Content>
										<p class="max-w-xs">Controls how the transaction date can be moved during optimization. Leave empty for full flexibility.</p>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
							<Select.Root 
								type="single" 
								value={directionalConstraint || 'none'}
								onValueChange={(value) => {
									directionalConstraint = (value === 'none' || value === '') ? undefined : (value as DirectionalConstraint);
								}}
							>
								<Select.Trigger>
									{directionalConstraint && directionalConstraint !== 'none' ? DIRECTIONAL_CONSTRAINTS.find(c => c.value === directionalConstraint)?.name : "Select constraint"}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="none">No constraint</Select.Item>
									{#each DIRECTIONAL_CONSTRAINTS.filter(c => c.value !== 'none') as constraint}
										<Select.Item value={constraint.value}>
											{constraint.icon} {constraint.name}
										</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					</div>
				</div>
			</div>
		</form>
	</section>
	</div>

	{#snippet bottomBar()}
		<!-- Action buttons for form submission - Sticky on mobile -->
		<div class="sticky bottom-0 bg-background border-t border-border py-3 md:py-4 z-10">
			<div class="flex justify-between max-w-2xl mx-auto px-4">
			<!-- Delete Button (only in edit mode) -->
			{#if isEditMode}
				<Button.Root
					type="button"
					variant="destructive"
					onclick={() => showDeleteDialog = true}
					disabled={isLoading || isDeleting}
					class="flex items-center gap-2"
				>
					<Trash2 size={16} />
					Delete
				</Button.Root>
			{:else}
				<div></div>
			{/if}
			
			<div class="flex space-x-4">
				<Button.Root
					type="button"
					variant="outline"
					onclick={() => goto('/transactions')}
					disabled={isLoading || isDeleting}
				>
					Cancel
				</Button.Root>
				<Button.Root
					type="submit"
					form="transaction-form"
					disabled={isLoading || isDeleting}
				>
					{submitButtonText}
				</Button.Root>
			</div>
			</div>
		</div>
	{/snippet}

	<!-- Delete Confirmation Dialog -->
	<Dialog.Root bind:open={showDeleteDialog}>
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>Delete Transaction</Dialog.Title>
				<Dialog.Description>
					Are you sure you want to delete this transaction? This action cannot be undone.
					{#if transaction}
						<br />
						<br />
						<strong>Transaction:</strong> {transaction.description || 'Untitled'}
						{#if transaction.amount !== undefined}
							<br />
							<strong>Amount:</strong> ${Math.abs(transaction.amount).toFixed(2)}
						{/if}
					{/if}
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
				<Button.Root
					variant="outline"
					onclick={() => showDeleteDialog = false}
					disabled={isDeleting}
				>
					Cancel
				</Button.Root>
				<Button.Root
					variant="destructive"
					onclick={handleDelete}
					disabled={isDeleting}
					class="flex items-center gap-2"
				>
					{#if isDeleting}
						<span>Deleting...</span>
					{:else}
						<Trash2 size={16} />
						<span>Delete Transaction</span>
					{/if}
				</Button.Root>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>

	<!-- Currency Selection Sheet -->
	<Sheet.Root bind:open={showCurrencySheet}>
		<Sheet.Content side="bottom" class="sm:max-w-md mx-auto">
			<Sheet.Header>
				<Sheet.Title>Select Currency</Sheet.Title>
				<Sheet.Description>
					Choose the currency for this transaction
				</Sheet.Description>
			</Sheet.Header>
			<div class="max-h-[60vh] overflow-y-auto py-4">
				<div class="space-y-1">
					{#each currencies as curr}
						<button
							type="button"
							onclick={() => {
								currency = curr.code;
								showCurrencySheet = false;
							}}
							class="w-full flex items-center justify-between px-4 py-3 rounded-md hover:bg-secondary transition-colors text-left {currency === curr.code ? 'bg-secondary border border-primary' : ''}"
						>
							<div class="flex items-center gap-3">
								<span class="text-lg font-medium">{curr.symbol}</span>
								<div class="flex flex-col">
									<span class="text-sm font-medium text-primary">{curr.name}</span>
									<span class="text-xs text-muted-foreground">{curr.code}</span>
								</div>
							</div>
							{#if currency === curr.code}
								<div class="w-2 h-2 rounded-full bg-primary"></div>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		</Sheet.Content>
	</Sheet.Root>
</PageLayout>
