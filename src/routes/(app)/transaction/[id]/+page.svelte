<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Save, Trash2, Copy, Plus, X, Split, DollarSign, Calendar, Tag, FileText, Settings } from '@lucide/svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Input from '$lib/components/primitives/Input.svelte';
	import Label from '$lib/components/primitives/Label.svelte';
	import LoadingSpinner from '$lib/components/primitives/LoadingSpinner.svelte';
	import { transactionService, type TransactionOrGroup } from '$lib/core/services/transaction-service';
	import { accountService } from '$lib/core/services/account-service';
	import { tagService } from '$lib/core/services/tag-service';
	
	import type { Transaction, WhatTagType, WhyTagType, Account } from '$lib/core/db';
	import { generateUUID } from '$lib/core/db';
	import TopBar from '$lib/components/layout/TopBar.svelte';
	import TransactionActions from '$lib/components/layout/TopBarComponents/TransactionActions.svelte';
	import TransactionForm from '$lib/components/layout/TransactionForm.svelte';
	import SmartTags from '$lib/components/layout/SmartTags.svelte';
	import BudgetImpactPanel from '$lib/components/layout/BudgetImpactPanel.svelte';
	import SplitTransactionForm from '$lib/components/layout/SplitTransactionForm.svelte';
	import TransferForm from '$lib/components/layout/TransferForm.svelte';
	import NotesSection from '$lib/components/layout/NotesSection.svelte';

	// Get transaction ID from URL params
	const transactionId = $derived($page.params.id);
	const isNewTransaction = $derived(transactionId === 'new');

	// State
	let isLoading = $state(true);
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	let accounts = $state<Account[]>([]);
	let whatTags = $state<string[]>([]);
	let whyTags = $state<string[]>([]);
	
	// Form data type that allows empty strings for tags
	type FormTransactionData = Omit<Partial<Transaction>, 'whatTag' | 'whyTag'> & {
		whatTag?: WhatTagType | '';
		whyTag?: WhyTagType | '';
		referenceNumber?: string;
		toAccountId?: string;
	};

	// Transaction data
	let transactionData = $state<FormTransactionData>({
		type: 'expense',
		status: 'cleared',
		amount: 0,
		currency: 'USD',
		description: '',
		accountId: '',
		whatTag: '',
		whyTag: '',
		clearedDate: new Date().toISOString(),
		notes: ''
	});

	// String versions for input binding
	let amountString = $state('0');
	let splitAmountStrings = $state<string[]>([]);

	// Split transaction handling
	let isSplitTransaction = $state(false);
	let splitTransactions = $state<FormTransactionData[]>([]);
	let splitName = $state('');

	// Advanced options
	let showAdvancedOptions = $state(false);

	// TopBar state
	let topBarTitle = $state('New Transaction');
	let topBarDescription = $state('Add a new transaction');
	let topBarChildren = $state<any>(null);
	let topBarChildrenProps = $state<any>(null);

	// Update TopBar based on transaction state
	const updateTopBar = () => {
		if (isNewTransaction) {
			topBarTitle = 'New Transaction';
			topBarDescription = 'Add a new transaction';
		} else {
			topBarTitle = 'Edit Transaction';
			topBarDescription = transactionData.description || 'Edit transaction details';
		}
		
		topBarChildren = TransactionActions;
		topBarChildrenProps = {
			transactionData,
			isSaving,
			onSave: saveTransaction,
			onDelete: deleteTransaction,
			onDuplicate: copyTransaction
		};
	};

	// Load initial data
	const loadInitialData = async () => {
		try {
			isLoading = true;
			error = null;

			// Load accounts with balances
			const accountsWithBalances = await accountService.getAccountsWithBalances();
			accounts = accountsWithBalances.map(item => item.account);
			if (accounts.length > 0 && !transactionData.accountId) {
				transactionData.accountId = accounts[0].id;
			}

			console.log('accounts', accounts);

			// Load tags
			const allTags = await tagService.getActiveTags();
			whatTags = allTags.filter(tag => tag.dimension === 'what').map(tag => tag.name);
			whyTags = allTags.filter(tag => tag.dimension === 'why').map(tag => tag.name);

			// Load existing transaction if editing
			if (!isNewTransaction) {
				await loadExistingTransaction();
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load data';
			console.error('Error loading initial data:', err);
		} finally {
			isLoading = false;
		}
	};

	// Load existing transaction
	const loadExistingTransaction = async () => {
		try {
			// Get transaction groups to find the specific transaction
			const transactionGroups = await transactionService.getTransactions(true);
			const allTransactions: Transaction[] = Array.isArray(transactionGroups) 
				? transactionGroups as Transaction[]
				: (transactionGroups as TransactionOrGroup[]).flatMap((group: TransactionOrGroup) => group.transactions);
			
			const transaction = allTransactions.find((tx: Transaction) => tx.id === transactionId);
			if (!transaction) {
				throw new Error('Transaction not found');
			}

			// Check if this is part of a split
			if (transaction.splitId) {
				isSplitTransaction = true;
				splitName = transaction.splitName || 'Split Transaction';
				
				// Load all transactions in the split
				const splitGroup = await transactionService.getTransactionsBySplit(transaction.splitId, true);
				const splitTransactionsArray: Transaction[] = Array.isArray(splitGroup) 
					? splitGroup as Transaction[]
					: (splitGroup as TransactionOrGroup[]).flatMap((group: TransactionOrGroup) => group.transactions);
				
				splitTransactions = splitTransactionsArray.map((tx: Transaction) => ({
					id: tx.id,
					type: tx.type,
					status: tx.status,
					amount: tx.amount,
					currency: tx.currency,
					description: tx.description,
					accountId: tx.accountId,
					whatTag: tx.whatTag,
					whyTag: tx.whyTag,
					clearedDate: tx.clearedDate,
					plannedDate: tx.plannedDate,
					notes: tx.notes,
					splitId: tx.splitId,
					splitName: tx.splitName
				}));
				
				// Initialize split amount strings
				splitAmountStrings = splitTransactions.map(tx => tx.amount?.toString() || '0');
			} else {
				// Single transaction
				transactionData = {
					id: transaction.id,
					type: transaction.type,
					status: transaction.status,
					confidence: transaction.confidence,
					amount: transaction.amount,
					currency: transaction.currency,
					description: transaction.description,
					accountId: transaction.accountId,
					whatTag: transaction.whatTag,
					whyTag: transaction.whyTag,
					clearedDate: transaction.clearedDate,
					plannedDate: transaction.plannedDate,
					notes: transaction.notes,
					recurrenceRule: transaction.recurrenceRule,
					parentRecurrenceId: transaction.parentRecurrenceId
				};
				
				// Initialize amount string
				amountString = transactionData.amount?.toString() || '0';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load transaction';
			console.error('Error loading transaction:', err);
		}
	};

	// Save transaction
	const saveTransaction = async () => {
		try {
			isSaving = true;
			error = null;

			if (isSplitTransaction) {
				await saveSplitTransaction();
			} else {
				await saveSingleTransaction();
			}

			// Navigate back to transactions list
			goto('/transactions');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save transaction';
			console.error('Error saving transaction:', err);
		} finally {
			isSaving = false;
		}
	};

	// Convert form data to transaction data
	const convertFormDataToTransaction = (formData: FormTransactionData): Partial<Transaction> => {
		return {
			...formData,
			whatTag: formData.whatTag === '' ? undefined : formData.whatTag as WhatTagType | undefined,
			whyTag: formData.whyTag === '' ? undefined : formData.whyTag as WhyTagType | undefined
		};
	};

	// Save single transaction
	const saveSingleTransaction = async () => {
		if (!transactionData.accountId || transactionData.amount === undefined) {
			throw new Error('Account and amount are required');
		}

		const cleanedData = convertFormDataToTransaction(transactionData);

		if (isNewTransaction) {
			await transactionService.createNewTransaction({
				...cleanedData,
				accountId: cleanedData.accountId!,
				amount: cleanedData.amount!,
				type: cleanedData.type!,
				status: cleanedData.status!
			});
		} else {
			await transactionService.updateTransaction(cleanedData.id!, cleanedData);
		}
	};

	// Save split transaction
	const saveSplitTransaction = async () => {
		if (splitTransactions.length === 0) {
			throw new Error('At least one split transaction is required');
		}

		// Validate all split transactions
		for (const splitTx of splitTransactions) {
			if (!splitTx.accountId || splitTx.amount === undefined) {
				throw new Error('All split transactions must have an account and amount');
			}
		}

		if (isNewTransaction) {
			// Create new split using the new service method
			const splitTransactionData = splitTransactions.map(splitTx => {
				const cleanedSplitTx = convertFormDataToTransaction(splitTx);
				return {
					...cleanedSplitTx,
					accountId: cleanedSplitTx.accountId!,
					amount: cleanedSplitTx.amount!,
					type: cleanedSplitTx.type!,
					status: cleanedSplitTx.status!,
					currency: cleanedSplitTx.currency || 'USD'
				};
			});

			await transactionService.createSplitTransactionGroup(splitTransactionData, splitName);
		} else {
			// Update existing split using the new service method
			const splitId = splitTransactions[0].splitId;
			if (!splitId) {
				throw new Error('Split ID not found for existing split');
			}

			// Prepare shared fields update
			const firstTx = splitTransactions[0];
			const sharedFields = {
				type: firstTx.type!,
				status: firstTx.status!,
				currency: firstTx.currency || 'USD',
				whatTag: firstTx.whatTag === '' ? undefined : firstTx.whatTag as WhatTagType | undefined,
				whyTag: firstTx.whyTag === '' ? undefined : firstTx.whyTag as WhyTagType | undefined,
				splitName
			};

			// Prepare individual updates
			const individualUpdates = splitTransactions.map(splitTx => ({
				id: splitTx.id!,
				amount: splitTx.amount,
				description: splitTx.description,
				accountId: splitTx.accountId
			}));

			await transactionService.updateSplitTransactionGroup(splitId, {
				sharedFields,
				individualUpdates
			});
		}
	};

	// Add new split transaction
	const addSplitTransaction = () => {
		splitTransactions = [...splitTransactions, {
			type: 'expense',
			status: 'cleared',
			amount: 0,
			currency: 'USD',
			description: '',
			accountId: accounts[0]?.id || '',
			whatTag: '',
			whyTag: '',
			clearedDate: new Date().toISOString()
		}];
		splitAmountStrings = [...splitAmountStrings, '0'];
	};

	// Remove split transaction
	const removeSplitTransaction = (index: number) => {
		splitTransactions = splitTransactions.filter((_, i) => i !== index);
		splitAmountStrings = splitAmountStrings.filter((_, i) => i !== index);
	};

	// Update split transaction
	const updateSplitTransaction = (index: number, updates: Partial<FormTransactionData>) => {
		splitTransactions = splitTransactions.map((tx, i) => 
			i === index ? { ...tx, ...updates } : tx
		);
	};

	// Handle shared field changes for split transactions
	const handleSharedFieldChange = (field: string, value: any) => {
		splitTransactions = splitTransactions.map(tx => ({
			...tx,
			[field]: value
		}));
	};

	// Delete transaction
	const deleteTransaction = async () => {
		if (!confirm('Are you sure you want to delete this transaction?')) {
			return;
		}

		try {
			isSaving = true;
			error = null;

			if (isSplitTransaction) {
				// Delete the entire split group
				const splitId = splitTransactions[0].splitId;
				if (splitId) {
					await transactionService.deleteSplitTransactionGroup(splitId);
				} else {
					// Fallback to individual deletion
					for (const splitTx of splitTransactions) {
						if (splitTx.id) {
							await transactionService.deleteTransaction(splitTx.id);
						}
					}
				}
			} else if (transactionData.id) {
				await transactionService.deleteTransaction(transactionData.id);
			}

			// Navigate back to transactions list
			goto('/transactions');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete transaction';
			console.error('Error deleting transaction:', err);
		}
	};

	// Toggle split mode
	const toggleSplitMode = () => {
		if (!isSplitTransaction) {
			// Convert to split
			isSplitTransaction = true;
			splitName = transactionData.description || 'Split Transaction';
			splitTransactions = [{
				...transactionData,
				splitId: generateUUID()
			}];
			splitAmountStrings = [amountString];
		} else {
			// Convert to single
			isSplitTransaction = false;
			if (splitTransactions.length > 0) {
				transactionData = { ...splitTransactions[0] };
				amountString = transactionData.amount?.toString() || '0';
			}
			splitTransactions = [];
			splitName = '';
			splitAmountStrings = [];
		}
	};

	// Toggle advanced options
	const toggleAdvancedOptions = () => {
		showAdvancedOptions = !showAdvancedOptions;
	};

	// Handle transaction type change
	const handleTypeChange = (type: 'income' | 'expense' | 'transfer' | 'adjustment') => {
		transactionData.type = type;
	};

	// Copy transaction
	const copyTransaction = () => {
		// Placeholder for copy functionality
		console.log('Copy transaction');
	};

	// Calculate total amount for split
	const totalSplitAmount = $derived(splitTransactions.reduce((total, tx) => total + (tx.amount || 0), 0));

	// Handle amount string changes for single transaction
	const handleAmountChange = () => {
		transactionData.amount = parseFloat(amountString) || 0;
	};

	// Handle split amount string changes
	const handleSplitAmountChange = (index: number) => {
		const newAmount = parseFloat(splitAmountStrings[index] || '0') || 0;
		splitTransactions = splitTransactions.map((tx, i) => 
			i === index ? { ...tx, amount: newAmount } : tx
		);
	};

	// Ensure split amount strings array is always in sync
	$effect(() => {
		if (splitTransactions.length !== splitAmountStrings.length) {
			splitAmountStrings = splitTransactions.map(tx => tx.amount?.toString() || '0');
		}
	});

	// Set up TopBar
	$effect(() => {
		updateTopBar();
	});

	onMount(() => {
		loadInitialData();
	});
</script>

<TopBar 
	title={topBarTitle}
	description={topBarDescription}
	showBackButton={true}
	onBack={() => goto('/transactions')}
>
	{#if topBarChildren}
		{@render topBarChildren(topBarChildrenProps)}
	{/if}
</TopBar>

<div class="min-h-screen bg-gradient-to-br from-bg-primary via-bg-secondary/50 to-bg-primary">
	{#if isLoading}
		<div class="flex items-center justify-center min-h-screen">
			<LoadingSpinner message="Loading transaction..." />
		</div>
	{:else if error}
		<div class="flex items-center justify-center min-h-screen p-4">
			<div class="glass p-6 text-center max-w-md">
				<div class="w-12 h-12 bg-alert/20 rounded-full flex items-center justify-center mx-auto mb-4">
					<X class="w-6 h-6 text-alert" />
				</div>
				<h3 class="text-lg font-semibold text-text-primary mb-2">Oops!</h3>
				<p class="text-text-secondary">{error}</p>
			</div>
		</div>
	{:else}
		<div class="px-2 space-y-3 max-w-2xl mx-auto">

			{#if transactionData.type === 'transfer'}
				<!-- Transfer Mode -->
				<TransferForm
					fromAccountId={transactionData.accountId || ''}
					toAccountId={transactionData.toAccountId || ''}
					amount={transactionData.amount || 0}
					referenceNumber={transactionData.referenceNumber || ''}
					transferDate={transactionData.clearedDate || ''}
					onDataChange={(updates) => {
						transactionData = { ...transactionData, ...updates };
					}}
					accounts={accounts}
				/>
			{:else if isSplitTransaction}
				<!-- Split Transaction Mode -->
				<SplitTransactionForm
					splitName={splitName}
					splitTransactions={splitTransactions}
					accounts={accounts}
					whatTags={whatTags}
					whyTags={whyTags}
					onSplitNameChange={(name) => splitName = name}
					onSplitTransactionChange={(index, updates) => updateSplitTransaction(index, updates)}
					onAddSplitTransaction={addSplitTransaction}
					onRemoveSplitTransaction={removeSplitTransaction}
					onSharedFieldChange={handleSharedFieldChange}
				/>
			{:else}
				<!-- Simple Transaction Mode -->
				<div class="space-y-4">
					<!-- Core Fields Section -->
					<div class="glass p-4 border border-bg-surface/50 space-y-4">
						<TransactionForm
							transactionData={transactionData}
							accounts={accounts}
							onDataChange={(updates) => {
								transactionData = { ...transactionData, ...updates };
								if (updates.amount !== undefined) {
									amountString = updates.amount.toString();
								}
							}}
						/>

						<!-- Smart Tags Section -->
						<SmartTags
							whatTags={whatTags}
							whyTags={whyTags}
							selectedWhatTag={transactionData.whatTag || ''}
							selectedWhyTag={transactionData.whyTag || ''}
							onTagChange={(dimension, tag) => {
								if (dimension === 'what') transactionData.whatTag = tag as WhatTagType;
								if (dimension === 'why') transactionData.whyTag = tag as WhyTagType;
							}}
						/>
					</div>

					<!-- Budget Impact Panel -->
					<BudgetImpactPanel
						transactionAmount={transactionData.amount || 0}
						transactionType={transactionData.type}
					/>
				</div>
			{/if}

			<!-- Notes Section (always shown) -->
			<NotesSection
				notes={transactionData.notes || ''}
				onNotesChange={(notes) => transactionData.notes = notes}
			/>


			<!-- Error Display -->
			{#if error}
				<div class="glass p-3 border border-alert/20 bg-alert/10">
					<div class="flex items-center space-x-2">
						<div class="w-4 h-4 bg-alert/20 rounded-full flex items-center justify-center">
							<X class="w-2 h-2 text-alert" />
						</div>
						<p class="text-alert text-sm font-medium">{error}</p>
					</div>
				</div>
			{/if}

			<!-- Advanced Options Section -->
			<div class="glass p-4 border border-bg-surface/50">
				<div class="flex items-center justify-between mb-2">
					<h3 class="text-base font-semibold text-text-primary">Advanced Options</h3>
					<Button 
						variant="neutral"
						size="sm"
						onclick={toggleAdvancedOptions}
						class="flex-0"
					>
						<Settings class="w-4 h-4 mr-2" />
						{showAdvancedOptions ? 'Hide' : 'Show'}
					</Button>
				</div>
				<div class="flex items-center space-x-3">
					<div class="w-6 h-6 bg-gradient-to-br from-sage-green to-info rounded-full flex items-center justify-center">
						<Settings class="w-3 h-3 text-warm-charcoal" />
					</div>
				</div>
			</div>

			<!-- Save Button Section -->
			<div class="glass p-4 border border-sage-green/20 bg-gradient-to-r from-sage-green/10 to-info/10">
				<div class="flex items-center justify-between">
					<div class="space-y-2">
						<div class="flex items-center space-x-2">
							<div class="w-6 h-6 bg-gradient-to-br from-sage-green to-info rounded-full flex items-center justify-center">
								<Save class="w-3 h-3 min-w-3 min-h-3 text-warm-charcoal" />
							</div>
							<h3 class="text-base font-semibold text-text-primary">
								{isNewTransaction ? 'Create Transaction' : 'Update Transaction'}
							</h3>
						</div>
						<div>
							<p class="text-text-secondary text-sm">
								{isSplitTransaction 
									? `Save ${splitTransactions.length} split item${splitTransactions.length !== 1 ? 's' : ''} (Total: $${totalSplitAmount.toFixed(2)})`
									: `Save transaction ($${transactionData.amount?.toFixed(2) || '0.00'})`
								}
							</p>
						</div>
					</div>
					
					<Button 
						variant="primary" 
						size="lg"
						onclick={saveTransaction}
						disabled={isSaving}
						class="bg-gradient-to-r from-sage-green to-info hover:from-sage-green/90 hover:to-info/90 text-warm-charcoal font-semibold px-6 py-2 shadow-lg shadow-sage-green/20 hover:shadow-sage-green/30 transition-all duration-300"
					>
						{#if isSaving}
							<LoadingSpinner size="sm" />
							<span class="ml-2">Saving...</span>
						{:else}
							<Save class="w-4 h-4 mr-2" />
							{isNewTransaction ? 'Create' : 'Save'}
						{/if}
					</Button>
				</div>
			</div>
		</div>
	{/if}
</div> 