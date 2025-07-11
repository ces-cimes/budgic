<script lang="ts">
	import Input from '$lib/components/primitives/Input.svelte';
	import Label from '$lib/components/primitives/Label.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import { Plus, X, Receipt, AlertTriangle, CheckCircle } from '@lucide/svelte';
	import type { Account } from '$lib/core/db';
	import { validateSplitTransaction } from '$lib/core/db';

	const { 
		splitName = '',
		splitTransactions = [],
		accounts = [],
		whatTags = [],
		whyTags = [],
		whereTags = [],
		onSplitNameChange = () => {},
		onSplitTransactionChange = () => {},
		onAddSplitTransaction = () => {},
		onRemoveSplitTransaction = () => {},
		onSharedFieldChange = () => {}
	} = $props<{
		splitName?: string;
		splitTransactions?: Array<{
			id?: string;
			description?: string;
			amount?: number;
			accountId?: string;
			whatTag?: string;
			whyTag?: string;
			whereTag?: string;
			type?: 'income' | 'expense' | 'transfer' | 'adjustment';
			status?: 'planned' | 'pending' | 'cleared' | 'cancelled';
			currency?: string;
		}>;
		accounts?: Account[];
		whatTags?: string[];
		whyTags?: string[];
		whereTags?: string[];
		onSplitNameChange?: (name: string) => void;
		onSplitTransactionChange?: (index: number, updates: any) => void;
		onAddSplitTransaction?: () => void;
		onRemoveSplitTransaction?: (index: number) => void;
		onSharedFieldChange?: (field: string, value: any) => void;
	}>();

	// Calculate total
	const totalAmount = $derived(
		splitTransactions.reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0)
	);

	// Validate split transactions
	const validation = $derived(() => {
		if (splitTransactions.length === 0) {
			return { isValid: false, errors: ['At least one split transaction is required'], totalAmount: 0 };
		}
		
		// Create a mock validation by checking if all transactions have the same shared fields
		const firstTx = splitTransactions[0];
		const errors: string[] = [];
		
		// Check if all transactions have the same type
		if (!splitTransactions.every((tx: any) => tx.type === firstTx.type)) {
			errors.push('All split transactions must have the same type');
		}
		
		// Check if all transactions have the same status
		if (!splitTransactions.every((tx: any) => tx.status === firstTx.status)) {
			errors.push('All split transactions must have the same status');
		}
		
		// Check if all transactions have the same currency
		if (!splitTransactions.every((tx: any) => tx.currency === firstTx.currency)) {
			errors.push('All split transactions must have the same currency');
		}
		
		// Check if all transactions have the same accountId (for non-transfers)
		if (firstTx.type !== 'transfer' && !splitTransactions.every((tx: any) => tx.accountId === firstTx.accountId)) {
			errors.push('All split transactions must have the same account');
		}
		
		// Check if all transactions have the same tags
		if (!splitTransactions.every((tx: any) => tx.whatTag === firstTx.whatTag)) {
			errors.push('All split transactions must have the same "What" tag');
		}
		if (!splitTransactions.every((tx: any) => tx.whyTag === firstTx.whyTag)) {
			errors.push('All split transactions must have the same "Why" tag');
		}
		
		return { 
			isValid: errors.length === 0, 
			errors, 
			totalAmount 
		};
	});

	// Format date for receipt
	const formatReceiptDate = () => {
		const now = new Date();
		return now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	};

	// Generate receipt number
	const receiptNumber = $derived('R' + Date.now().toString().slice(-6));

	// Get shared fields from the first transaction
	const sharedFields = $derived(() => {
		if (splitTransactions.length === 0) return {};
		const firstTx = splitTransactions[0];
		return {
			type: firstTx.type,
			status: firstTx.status,
			currency: firstTx.currency,
			accountId: firstTx.accountId,
			whatTag: firstTx.whatTag,
			whyTag: firstTx.whyTag
		};
	});

	// Handle shared field changes
	const handleSharedFieldChange = (field: string, value: any) => {
		onSharedFieldChange(field, value);
	};
</script>

<div class="space-y-4">
	<!-- Receipt Header -->
	<div class="glass p-4 border border-bg-surface/50">
		<div class="text-center mb-3">
			<div class="flex items-center justify-center gap-2 mb-2">
				<Receipt class="w-5 h-5 text-golden-amber" />
				<h3 class="text-lg font-bold text-text-primary">Receipt</h3>
			</div>
			<div class="text-sm text-text-secondary">
				{formatReceiptDate()}
			</div>
			<div class="text-xs text-text-tertiary">
				Receipt #{receiptNumber}
			</div>
		</div>

		<!-- Split Name -->
		<div>
			<Label for="split-name" class="text-text-secondary font-medium text-sm">Description</Label>
			<Input
				id="split-name"
				value={splitName}
				on:input={(e) => onSplitNameChange(e.currentTarget.value)}
				placeholder="e.g., Grocery Shopping"
				class="mt-1 bg-bg-tertiary/50 border-bg-surface/50 focus:border-info/50 focus:ring-info/20"
			/>
		</div>
	</div>

	<!-- Shared Fields Section -->
	{#if splitTransactions.length > 0}
		<div class="glass p-4 border border-bg-surface/50">
			<h4 class="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
				<CheckCircle class="w-4 h-4 text-sage-green" />
				Shared Fields (applied to all items)
			</h4>
			
			<div class="grid grid-cols-2 gap-3">
				<!-- Type -->
				<div>
					<Label class="text-text-secondary text-xs">Type</Label>
					<select
						value={sharedFields().type || ''}
						on:change={(e) => handleSharedFieldChange('type', e.currentTarget.value)}
						class="w-full px-2 py-1 bg-bg-tertiary/50 border border-bg-surface/50 rounded text-text-primary focus:border-sage-green/50 focus:ring-sage-green/20 text-sm"
					>
						<option value="expense">Expense</option>
						<option value="income">Income</option>
						<option value="transfer">Transfer</option>
						<option value="adjustment">Adjustment</option>
					</select>
				</div>

				<!-- Status -->
				<div>
					<Label class="text-text-secondary text-xs">Status</Label>
					<select
						value={sharedFields().status || ''}
						on:change={(e) => handleSharedFieldChange('status', e.currentTarget.value)}
						class="w-full px-2 py-1 bg-bg-tertiary/50 border border-bg-surface/50 rounded text-text-primary focus:border-sage-green/50 focus:ring-sage-green/20 text-sm"
					>
						<option value="cleared">Cleared</option>
						<option value="pending">Pending</option>
						<option value="planned">Planned</option>
						<option value="cancelled">Cancelled</option>
					</select>
				</div>

				<!-- Account -->
				<div>
					<Label class="text-text-secondary text-xs">Account</Label>
					<select
						value={sharedFields().accountId || ''}
						on:change={(e) => handleSharedFieldChange('accountId', e.currentTarget.value)}
						class="w-full px-2 py-1 bg-bg-tertiary/50 border border-bg-surface/50 rounded text-text-primary focus:border-sage-green/50 focus:ring-sage-green/20 text-sm"
					>
						<option value="">Select Account</option>
						{#each accounts as account}
							<option value={account.id}>{account.name}</option>
						{/each}
					</select>
				</div>

				<!-- Currency -->
				<div>
					<Label class="text-text-secondary text-xs">Currency</Label>
					<select
						value={sharedFields().currency || 'USD'}
						on:change={(e) => handleSharedFieldChange('currency', e.currentTarget.value)}
						class="w-full px-2 py-1 bg-bg-tertiary/50 border border-bg-surface/50 rounded text-text-primary focus:border-sage-green/50 focus:ring-sage-green/20 text-sm"
					>
						<option value="USD">USD</option>
						<option value="EUR">EUR</option>
						<option value="GBP">GBP</option>
					</select>
				</div>
			</div>

			<!-- Tags -->
			<div class="grid grid-cols-2 gap-2 mt-3">
				<select
					value={sharedFields().whatTag || ''}
					on:change={(e) => handleSharedFieldChange('whatTag', e.currentTarget.value || undefined)}
					class="px-2 py-1 bg-bg-tertiary/50 border border-bg-surface/50 rounded text-text-primary focus:border-sage-green/50 focus:ring-sage-green/20 text-xs"
				>
					<option value="">What...</option>
					{#each whatTags as tag}
						<option value={tag}>{tag}</option>
					{/each}
				</select>

				<select
					value={sharedFields().whyTag || ''}
					on:change={(e) => handleSharedFieldChange('whyTag', e.currentTarget.value || undefined)}
					class="px-2 py-1 bg-bg-tertiary/50 border border-bg-surface/50 rounded text-text-primary focus:border-warm-coral/50 focus:ring-warm-coral/20 text-xs"
				>
					<option value="">Why...</option>
					{#each whyTags as tag}
						<option value={tag}>{tag}</option>
					{/each}
				</select>
			</div>
		</div>
	{/if}

	<!-- Validation Errors -->
	{#if !validation().isValid}
		<div class="glass p-3 border border-alert/20 bg-alert/10">
			<div class="flex items-start gap-2">
				<AlertTriangle class="w-4 h-4 text-alert mt-0.5 flex-shrink-0" />
				<div class="text-sm">
					<h4 class="font-medium text-alert mb-1">Split Validation Errors</h4>
					<ul class="text-text-secondary space-y-1">
						{#each validation().errors as error}
							<li class="text-xs">• {error}</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
	{/if}

	<!-- Split Items -->
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<h4 class="text-sm font-semibold text-text-primary">Split Items</h4>
			<Button
				variant="secondary"
				size="sm"
				onclick={onAddSplitTransaction}
				class="text-xs"
			>
				<Plus class="w-3 h-3 mr-1" />
				Add Item
			</Button>
		</div>

		{#each splitTransactions as splitTx, index}
			<div class="glass p-3 border border-bg-surface/50">
				<div class="flex items-center justify-between mb-2">
					<span class="text-xs font-medium text-text-secondary">Item {index + 1}</span>
					<Button
						variant="neutral"
						size="sm"
						onclick={() => onRemoveSplitTransaction(index)}
						disabled={splitTransactions.length === 1}
						class="text-alert hover:text-alert/80 p-1"
					>
						<X class="w-3 h-3" />
					</Button>
				</div>

				<!-- Description and Amount -->
				<div class="flex items-center justify-between gap-3">
					<div class="flex-1">
						<Input
							value={splitTx.description || ''}
							on:input={(e) => onSplitTransactionChange(index, { description: e.currentTarget.value })}
							placeholder="Item description"
							class="bg-bg-tertiary/50 border-bg-surface/50 focus:border-sage-green/50 focus:ring-sage-green/20 text-sm"
						/>
					</div>
					<div class="w-24">
						<Input
							type="number"
							step="0.01"
							value={splitTx.amount?.toString() || '0'}
							on:input={(e) => onSplitTransactionChange(index, { amount: parseFloat(e.currentTarget.value) || 0 })}
							placeholder="0.00"
							class="text-right bg-bg-tertiary/50 border-bg-surface/50 focus:border-sage-green/50 focus:ring-sage-green/20 text-sm"
						/>
					</div>
				</div>
			</div>
		{/each}
	</div>

	<!-- Total -->
	<div class="glass p-3 border border-sage-green/20 bg-gradient-to-r from-sage-green/10 to-info/10">
		<div class="flex items-center justify-between">
			<span class="text-sm font-semibold text-text-primary">Total</span>
			<span class="text-lg font-bold text-sage-green">
				${totalAmount.toFixed(2)}
			</span>
		</div>
		<div class="text-xs text-text-secondary mt-1">
			{splitTransactions.length} item{splitTransactions.length !== 1 ? 's' : ''}
		</div>
	</div>
</div> 