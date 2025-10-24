<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { transactionService } from '$lib/core/services/transaction-service';
	import { transferService } from '$lib/core/services/transfer-service';
	import { accountService } from '$lib/core/services/account-service';
	import { budgetService } from '$lib/core/services/budget-service';
	import { payeeService } from '$lib/core/services/payee-service';
	import { tagService } from '$lib/core/services/tag-service';
	import type { Account, Transaction, WhatTagType } from '$lib/core/db';
	import type { TransactionBudgetCategory } from '$lib/core/services/budget-service';
	import type { Payee } from '$lib/core/db';
	import * as Form from '$lib/components/ui/form/index.ts';
	import * as Select from '$lib/components/ui/select/index.ts';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.ts';
	import * as Label from '$lib/components/ui/label/index.ts';
	import * as Alert from '$lib/components/ui/alert/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';
	import * as Input from '$lib/components/ui/input/index.ts';
	import * as Switch from '$lib/components/ui/switch/index.ts';
	import * as Tabs from '$lib/components/ui/tabs/index.ts';
	import { PageLayout } from '$lib/components/layouts';

	let accounts = $state<Account[]>([]);
	let budgetCategories = $state<TransactionBudgetCategory[]>([]);
	let payees = $state<Payee[]>([]);
	let whatTags = $state<{ value: WhatTagType; label: string }[]>([]);
	let transaction = $state<Transaction | null>(null);
	
	// Form state
	let selectedAccount = $state('');
	let description = $state('');
	let amount = $state(0);
	let transactionType = $state<Transaction['type']>('expense');
	let status = $state<Transaction['status']>('cleared');
	let selectedBudgetCategory = $state('');
	let selectedPayee = $state('');
	let selectedWhatTag = $state<WhatTagType | ''>('');
	let notes = $state('');
	let reference = $state('');
	let toAccountId = $state('');
	let plannedDate = $state('');
	let clearedDate = $state('');
	let isRecurring = $state(false);
	let recurrenceRule = $state('');
	let isSplitTransaction = $state(false);
	let splitName = $state('');
	let isLoading = $state(false);
	let error = $state('');
	
	// Transfer fee fields
	let transferFeeAmount = $state(0);
	let transferFeeAccountId = $state('');
	let transferFeeCategoryId = $state('');
	let transferFeeWhatTag = $state<WhatTagType | ''>('');
	let hasTransferFee = $state(false);


	// UI state
	let activeTab = $state('basic');

	// What tag options
	const whatTagOptions: { value: WhatTagType; label: string }[] = [
		{ value: 'coffee', label: 'Coffee' },
		{ value: 'groceries', label: 'Groceries' },
		{ value: 'dining', label: 'Dining' },
		{ value: 'gas', label: 'Gas' },
		{ value: 'rent', label: 'Rent' },
		{ value: 'utilities', label: 'Utilities' },
		{ value: 'entertainment', label: 'Entertainment' },
		{ value: 'clothing', label: 'Clothing' },
		{ value: 'electronics', label: 'Electronics' },
		{ value: 'medical', label: 'Medical' },
		{ value: 'transportation', label: 'Transportation' },
		{ value: 'shopping', label: 'Shopping' },
		{ value: 'income', label: 'Income' },
		{ value: 'freelance', label: 'Freelance' },
		{ value: 'investment', label: 'Investment' },
		{ value: 'gift', label: 'Gift' },
		{ value: 'salary', label: 'Salary' },
		{ value: 'maintenance', label: 'Maintenance' },
		{ value: 'insurance', label: 'Insurance' },
		{ value: 'fitness', label: 'Fitness' },
		{ value: 'hobbies', label: 'Hobbies' },
		{ value: 'streaming', label: 'Streaming' },
		{ value: 'parking', label: 'Parking' },
		{ value: 'tolls', label: 'Tolls' },
		{ value: 'other', label: 'Other' }
	];

	// Computed properties
	let isEditMode = $derived(!!transaction);
	let pageTitle = $derived(isEditMode ? 'Edit Transaction' : 'Add Transaction');
	let submitButtonText = $derived(isLoading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Transaction' : 'Create Transaction'));

	onMount(async () => {
		try {
			[accounts, budgetCategories, payees] = await Promise.all([
				accountService.getAccounts(),
				budgetService.getTransactionBudgetCategories(),
				payeeService.getAllPayees()
			]);
			
			whatTags = whatTagOptions;
			
			// Check if we have an ID parameter (edit mode)
			const transactionId = $page.params.id;
			if (transactionId) {
				transaction = await transactionService.getTransactionById(transactionId);
				if (transaction) {
					// Populate form with existing transaction data
					selectedAccount = transaction.accountId;
					description = transaction.description || '';
					amount = transaction.amount || 0;
					transactionType = transaction.type;
					status = transaction.status;
					selectedBudgetCategory = transaction.budgetCategoryId || '';
					selectedWhatTag = transaction.whatTag || '';
					selectedPayee = transaction.payeeId || '';
					notes = transaction.notes || '';
					reference = transaction.reference || '';
					toAccountId = transaction.toAccountId || '';
					plannedDate = transaction.plannedDate ? new Date(transaction.plannedDate).toISOString().slice(0, 16) : '';
					clearedDate = transaction.clearedDate ? new Date(transaction.clearedDate).toISOString().slice(0, 16) : '';
					isRecurring = !!transaction.recurrenceRule;
					recurrenceRule = transaction.recurrenceRule || '';
					isSplitTransaction = !!transaction.splitName;
					splitName = transaction.splitName || '';
				} else {
					error = 'Transaction not found';
				}
			} else {
				// Default values for new transaction
				if (accounts.length > 0) {
					selectedAccount = accounts[0].id;
					transferFeeAccountId = accounts[0].id; // Default fee account to first account
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
			if (transactionType === 'expense' && !selectedBudgetCategory) {
				throw new Error('Please select a budget category for expenses');
			}
			if (transactionType === 'transfer' && !toAccountId) {
				throw new Error('Please select a destination account for transfers');
			}

			// Prepare transaction data
			const transactionData = {
				accountId: selectedAccount,
				description: description.trim(),
				amount: amount,
				type: transactionType,
				status: status,
				currency: 'USD', // Default currency
				whatTag: selectedWhatTag || undefined,
				budgetCategoryId: selectedBudgetCategory || undefined,
				payeeId: selectedPayee || undefined,
				notes: notes || undefined,
				reference: reference || undefined,
				toAccountId: transactionType === 'transfer' ? toAccountId : undefined,
				plannedDate: status === 'planned' ? (plannedDate ? new Date(plannedDate).toISOString() : undefined) : undefined,
				clearedDate: status === 'cleared' ? (clearedDate ? new Date(clearedDate).toISOString() : undefined) : undefined,
				recurrenceRule: isRecurring ? recurrenceRule : undefined,
				splitName: isSplitTransaction ? splitName : undefined
			};

			// Create or update transaction
			if (isEditMode && transaction) {
				await transactionService.updateTransaction(transaction.id, transactionData);
			} else if (transactionType === 'transfer') {
				// Use new single transaction transfer service
				await transferService.createTransfer(
					selectedAccount,
					toAccountId!,
					Math.abs(amount), // Ensure positive amount
					description.trim(),
					{
						status,
						currency: 'USD',
						whatTag: selectedWhatTag === '' ? undefined : selectedWhatTag,
						budgetCategoryId: selectedBudgetCategory,
						payeeId: selectedPayee,
						notes: notes,
						reference: reference,
						plannedDate: status === 'planned' ? (plannedDate ? new Date(plannedDate).toISOString() : undefined) : undefined,
						clearedDate: status === 'cleared' ? (clearedDate ? new Date(clearedDate).toISOString() : undefined) : undefined,
						// Fee options
						feeAmount: hasTransferFee ? transferFeeAmount : 0,
						feeAccountId: transferFeeAccountId || selectedAccount,
						feeCategoryId: transferFeeCategoryId || 'banking_fees',
						feeWhatTag: transferFeeWhatTag || 'banking_fees'
					}
				);
			} else {
				await transactionService.createNewTransaction(transactionData);
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

	function getBudgetCategoryColor(categoryName: string): string {
		const category = budgetCategories.find(cat => cat.name === categoryName);
		return category?.color || '#6B7280';
	}

	function getBudgetStatusText(categoryName: string): string {
		const category = budgetCategories.find(cat => cat.name === categoryName);
		if (!category) return '';
		
		const remaining = category.remaining;
		const allocated = category.allocatedAmount;
		const percentage = allocated > 0 ? (remaining / allocated) * 100 : 0;
		
		if (remaining < 0) {
			return `Over budget by $${Math.abs(remaining).toFixed(2)}`;
		} else if (percentage < 20) {
			return `Low budget: $${remaining.toFixed(2)} remaining`;
		} else {
			return `$${remaining.toFixed(2)} remaining`;
		}
	}

	function formatDateForInput(dateString: string): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toISOString().slice(0, 16);
	}
</script>

<svelte:head>
	<title>{pageTitle} - Budgic</title>
</svelte:head>

<PageLayout>
	

	<div class="container mx-auto px-4 py-8 max-w-4xl">
	<h1 class="text-3xl font-bold text-primary mb-8">{pageTitle}</h1>

	{#if error}
		<Alert.Root variant="destructive" class="mb-6">
			<Alert.Title>Error</Alert.Title>
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
	{/if}

	<!-- Transaction Form -->
	<section class="mb-8">
		<form onsubmit={handleSubmit} class="space-y-6">
			<!-- Transaction Type and Status - Always Visible -->
			<div class="space-y-6 mb-8">
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
				<div class="space-y-4">
					<Label.Root>Transaction Status *</Label.Root>
					<RadioGroup.Root bind:value={status} class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<!-- Cleared Transaction -->
						<div class="border rounded-lg p-4 {status === 'cleared' ? 'border-primary bg-primary/5' : 'border-border'}">
							<div class="flex items-center space-x-2 mb-2">
								<RadioGroup.Item value="cleared" id="cleared" />
								<Label.Root for="cleared" class="font-medium">Cleared</Label.Root>
							</div>
							<p class="text-sm text-muted-foreground">Transaction has been completed and affects your account balance</p>
						</div>

						<!-- Planned Transaction -->
						<div class="border rounded-lg p-4 {status === 'planned' ? 'border-primary bg-primary/5' : 'border-border'}">
							<div class="flex items-center space-x-2 mb-2">
								<RadioGroup.Item value="planned" id="planned" />
								<Label.Root for="planned" class="font-medium">Planned</Label.Root>
							</div>
							<p class="text-sm text-muted-foreground">Future transaction that hasn't happened yet</p>
						</div>

						<!-- Pending Transaction -->
						<div class="border rounded-lg p-4 {status === 'pending' ? 'border-primary bg-primary/5' : 'border-border'}">
							<div class="flex items-center space-x-2 mb-2">
								<RadioGroup.Item value="pending" id="pending" />
								<Label.Root for="pending" class="font-medium">Pending</Label.Root>
							</div>
							<p class="text-sm text-muted-foreground">Transaction is processing or awaiting confirmation</p>
						</div>
					</RadioGroup.Root>
				</div>
			</div>

			<!-- Tabs for different sections -->
			<Tabs.Root bind:value={activeTab} class="w-full">
				<Tabs.List class="grid w-full grid-cols-3">
					<Tabs.Trigger value="basic">Basic Info</Tabs.Trigger>
					<Tabs.Trigger value="categorization">Categorization</Tabs.Trigger>
					<Tabs.Trigger value="advanced">Advanced</Tabs.Trigger>
				</Tabs.List>

				<!-- Basic Information Tab -->
				<Tabs.Content value="basic" class="space-y-6 mt-6">
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
						/>
					</div>

					<!-- Amount -->
					<div class="space-y-2">
						<Label.Root for="amount">Amount *</Label.Root>
						<div class="relative">
							<span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
							<Input.Root
								id="amount"
								type="number"
								bind:value={amount}
								placeholder="0.00"
								step="0.01"
								class="pl-8"
								required
							/>
						</div>
						<div class="text-xs text-muted-foreground mt-1">
							💡 Use negative amounts for: cashback (expenses), fees (income), refunds, etc.
						</div>
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
						
						<!-- Transfer Fee (optional) -->
						<div class="space-y-4 p-4 border border-border rounded-lg bg-muted/20">
							<div class="flex items-center space-x-2">
								<Switch.Root bind:checked={hasTransferFee} />
								<Label.Root for="transferFee">This transfer has a fee</Label.Root>
							</div>
							
							{#if hasTransferFee}
								<div class="space-y-3">
									<!-- Fee Amount -->
									<div class="space-y-2">
										<Label.Root for="feeAmount">Fee Amount *</Label.Root>
										<div class="relative">
											<span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
											<Input.Root
												id="feeAmount"
												type="number"
												bind:value={transferFeeAmount}
												placeholder="0.00"
												step="0.01"
												class="pl-8"
												min="0"
											/>
										</div>
									</div>
									
									<!-- Fee Account -->
									<div class="space-y-2">
										<Label.Root for="feeAccount">Fee Account</Label.Root>
										<Select.Root type="single" bind:value={transferFeeAccountId}>
											<Select.Trigger>
												{transferFeeAccountId ? accounts.find(a => a.id === transferFeeAccountId)?.name : "Select fee account (default: source account)"}
											</Select.Trigger>
											<Select.Content>
												<Select.Item value="">Use source account</Select.Item>
												{#each accounts as account}
													<Select.Item value={account.id}>
														{account.name} (${account.currentBalance.toFixed(2)})
													</Select.Item>
												{/each}
											</Select.Content>
										</Select.Root>
									</div>
									
									<!-- Fee Category -->
									<div class="space-y-2">
										<Label.Root for="feeCategory">Fee Category</Label.Root>
										<Select.Root type="single" bind:value={transferFeeCategoryId}>
											<Select.Trigger>
												{transferFeeCategoryId ? budgetCategories.find(c => c.id === transferFeeCategoryId)?.name : "Select fee category"}
											</Select.Trigger>
											<Select.Content>
												<Select.Item value="">Use default (Banking Fees)</Select.Item>
												{#each budgetCategories as category}
													<Select.Item value={category.id}>
														{category.name}
													</Select.Item>
												{/each}
											</Select.Content>
										</Select.Root>
									</div>
									
									<!-- Fee What Tag -->
									<div class="space-y-2">
										<Label.Root for="feeWhatTag">Fee What Tag</Label.Root>
										<Select.Root type="single" bind:value={transferFeeWhatTag}>
											<Select.Trigger>
												{transferFeeWhatTag ? whatTags.find(t => t.value === transferFeeWhatTag)?.label : "Select fee what tag"}
											</Select.Trigger>
											<Select.Content>
												<Select.Item value="">Use default (Banking Fees)</Select.Item>
												{#each whatTags as tag}
													<Select.Item value={tag.value}>
														{tag.label}
													</Select.Item>
												{/each}
											</Select.Content>
										</Select.Root>
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Date Selection Based on Status -->
					{#if status === 'cleared'}
						<div class="space-y-2">
							<Label.Root for="clearedDate">When did this transaction occur? *</Label.Root>
							<Input.Root
								id="clearedDate"
								type="datetime-local"
								bind:value={clearedDate}
								required
							/>
							<p class="text-xs text-muted-foreground">This date will be used for balance calculations and reporting</p>
						</div>
					{/if}

					{#if status === 'planned'}
						<div class="space-y-2">
							<Label.Root for="plannedDate">When do you plan for this transaction? *</Label.Root>
							<Input.Root
								id="plannedDate"
								type="datetime-local"
								bind:value={plannedDate}
								required
							/>
							<p class="text-xs text-muted-foreground">This helps with budget planning and future balance projections</p>
						</div>
					{/if}

					{#if status === 'pending'}
						<div class="space-y-2">
							<Label.Root for="pendingDate">When did this transaction start processing?</Label.Root>
							<Input.Root
								id="pendingDate"
								type="datetime-local"
								bind:value={clearedDate}
							/>
							<p class="text-xs text-muted-foreground">Optional: When the transaction was initiated</p>
						</div>
					{/if}

					<!-- Recurring Transaction (only for planned/cleared) -->
					{#if status === 'planned' || status === 'cleared'}
						<div class="space-y-4">
							<div class="flex items-center space-x-2">
								<Switch.Root bind:checked={isRecurring} />
								<Label.Root for="recurring">This is a recurring transaction</Label.Root>
							</div>
							
							{#if isRecurring}
								<div class="space-y-2">
									<Label.Root for="recurrenceRule">How often does this repeat? *</Label.Root>
									<Select.Root type="single" bind:value={recurrenceRule}>
										<Select.Trigger>
											{recurrenceRule || "Select frequency"}
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="daily">Daily</Select.Item>
											<Select.Item value="weekly">Weekly</Select.Item>
											<Select.Item value="biweekly">Bi-weekly (every 2 weeks)</Select.Item>
											<Select.Item value="monthly">Monthly</Select.Item>
											<Select.Item value="quarterly">Quarterly (every 3 months)</Select.Item>
											<Select.Item value="yearly">Yearly</Select.Item>
										</Select.Content>
									</Select.Root>
									<p class="text-xs text-muted-foreground">This will help create future instances automatically</p>
								</div>
							{/if}
						</div>
					{/if}
				</Tabs.Content>

				<!-- Categorization Tab -->
				<Tabs.Content value="categorization" class="space-y-6 mt-6">
					<!-- Budget Category (only for expenses) -->
					{#if transactionType === 'expense'}
						<div class="space-y-2">
							<Label.Root for="budgetCategory">Budget Category *</Label.Root>
							<Select.Root type="single" bind:value={selectedBudgetCategory} required>
								<Select.Trigger>
									{selectedBudgetCategory ? budgetCategories.find(c => c.id === selectedBudgetCategory)?.name : "Select a budget category"}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="">Select a budget category</Select.Item>
									{#each budgetCategories as category}
										<Select.Item value={category.id} style="color: {category.color}">
											{category.name} - {getBudgetStatusText(category.name)}
										</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
							
							{#if selectedBudgetCategory}
								<div class="mt-2 text-sm text-muted-foreground">
									{getBudgetStatusText(selectedBudgetCategory)}
								</div>
							{/if}
						</div>
					{/if}

					<!-- What Tag -->
					<div class="space-y-2">
						<Label.Root for="whatTag">What Tag</Label.Root>
						<Select.Root type="single" bind:value={selectedWhatTag}>
							<Select.Trigger>
								{selectedWhatTag ? whatTags.find(t => t.value === selectedWhatTag)?.label : "Select what tag (optional)"}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="">Select what tag (optional)</Select.Item>
								{#each whatTags as tag}
									<Select.Item value={tag.value}>
										{tag.label}
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<!-- Payee -->
					<div class="space-y-2">
						<Label.Root for="payee">Payee</Label.Root>
						<Select.Root type="single" bind:value={selectedPayee}>
							<Select.Trigger>
								{selectedPayee ? payees.find(p => p.id === selectedPayee)?.name : "Select payee (optional)"}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="">Select payee (optional)</Select.Item>
								{#each payees as payee}
									<Select.Item value={payee.id}>
										{payee.name}
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				</Tabs.Content>


				<!-- Advanced Tab -->
				<Tabs.Content value="advanced" class="space-y-6 mt-6">
					<!-- Split Transaction -->
					<div class="space-y-4">
						<div class="flex items-center space-x-2">
							<Switch.Root bind:checked={isSplitTransaction} />
							<Label.Root for="split">This is a split transaction</Label.Root>
						</div>
						<p class="text-xs text-muted-foreground">
							Split transactions allow you to divide a single transaction across multiple budget categories
						</p>
						
						{#if isSplitTransaction}
							<div class="space-y-4 p-4 border border-border rounded-lg bg-muted/20">
								<div class="space-y-2">
									<Label.Root for="splitName">Split Name *</Label.Root>
									<Input.Root
										id="splitName"
										bind:value={splitName}
										placeholder="e.g., Grocery Shopping Split"
										required
									/>
									<p class="text-xs text-muted-foreground">
										This will group related split transactions together
									</p>
								</div>

								<!-- Split Transaction Parts -->
								<div class="space-y-3">
									<Label.Root>Split Parts</Label.Root>
									<div class="space-y-3">
										<!-- Main transaction amount -->
										<div class="flex items-center space-x-2 p-3 bg-background rounded border">
											<div class="flex-1">
												<Label.Root class="text-sm font-medium">Main Transaction</Label.Root>
												<p class="text-xs text-muted-foreground">This is the total amount being split</p>
											</div>
											<div class="text-right">
												<span class="font-mono text-lg">${amount || '0.00'}</span>
											</div>
										</div>

										<!-- Split parts will be handled by the backend -->
										<div class="text-center py-4 text-muted-foreground">
											<p class="text-sm">Split parts will be created automatically</p>
											<p class="text-xs">Each part can be assigned to different budget categories</p>
										</div>
									</div>
								</div>
							</div>
						{/if}
					</div>

					<!-- Reference -->
					<div class="space-y-2">
						<Label.Root for="reference">Reference</Label.Root>
						<Input.Root
							id="reference"
							bind:value={reference}
							placeholder="e.g., Check #1234, Invoice #ABC123"
						/>
						<p class="text-xs text-muted-foreground">
							Optional reference number or identifier
						</p>
					</div>

					<!-- Notes -->
					<div class="space-y-2">
						<Label.Root for="notes">Notes</Label.Root>
						<textarea
							id="notes"
							bind:value={notes}
							placeholder="Additional notes about this transaction..."
							rows="3"
							class="w-full px-3 py-2 border border-input rounded-md bg-background text-primary resize-none focus:ring-2 focus:ring-ring focus:border-transparent"
						></textarea>
						<p class="text-xs text-muted-foreground">
							Optional notes for your own reference
						</p>
					</div>
				</Tabs.Content>
			</Tabs.Root>

			<!-- Submit Button -->
			<div class="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 md:left-64 z-50">
				<div class="flex justify-end space-x-4 max-w-4xl mx-auto">
					<Button.Root
						type="button"
						variant="outline"
						onclick={() => goto('/transactions')}
						disabled={isLoading}
					>
						Cancel
					</Button.Root>
					<Button.Root
						type="submit"
						disabled={isLoading}
					>
						{submitButtonText}
					</Button.Root>
				</div>
			</div>
		</form>
	</section>

	<!-- Budget Categories Overview -->
	{#if transactionType === 'expense' && budgetCategories.length > 0}
		<section class="bg-muted rounded-lg p-6">
			<h2 class="text-lg font-semibold text-primary mb-4">Budget Categories Overview</h2>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				{#each budgetCategories as category}
					<div class="bg-card rounded-lg p-4 border border-border">
						<div class="flex items-center justify-between mb-2">
							<span class="font-medium" style="color: {category.color}">
								{category.name}
							</span>
							<span class="text-sm text-muted-foreground">
								{category.waterfallCategory}
							</span>
						</div>
						<div class="text-sm text-muted-foreground">
							${category.allocatedAmount.toFixed(2)} allocated
						</div>
						<div class="text-sm text-muted-foreground">
							{getBudgetStatusText(category.name)}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}
	</div>
</PageLayout>
