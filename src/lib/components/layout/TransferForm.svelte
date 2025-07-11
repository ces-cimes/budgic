<script lang="ts">
	import Input from '$lib/components/primitives/Input.svelte';
	import Label from '$lib/components/primitives/Label.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import { ArrowRight, DollarSign, Calendar } from '@lucide/svelte';
	import type { Account } from '$lib/core/db';

	const { 
		fromAccountId = '',
		toAccountId = '',
		amount = 0,
		referenceNumber = '',
		transferDate = '',
		onDataChange = () => {},
		accounts = []
	} = $props<{
		fromAccountId?: string;
		toAccountId?: string;
		amount?: number;
		referenceNumber?: string;
		transferDate?: string;
		onDataChange?: (updates: any) => void;
		accounts?: Account[];
	}>();

	// Transfer templates (placeholders)
	const transferTemplates = [
		{
			name: 'Emergency Fund',
			fromAccount: 'Checking',
			toAccount: 'Savings',
			amount: 500
		},
		{
			name: 'Investment',
			fromAccount: 'Checking',
			toAccount: 'Brokerage',
			amount: 1000
		},
		{
			name: 'Bill Payment',
			fromAccount: 'Savings',
			toAccount: 'Checking',
			amount: 200
		}
	];

	// Apply template
	const applyTemplate = (template: any) => {
		const fromAccount = accounts.find((acc: any) => acc.name === template.fromAccount);
		const toAccount = accounts.find((acc: any) => acc.name === template.toAccount);
		
		if (fromAccount && toAccount) {
			onDataChange({
				fromAccountId: fromAccount.id,
				toAccountId: toAccount.id,
				amount: template.amount
			});
		}
	};
</script>

<div class="space-y-4">
	<!-- Transfer Flow Visualization -->
	<div class="glass p-4 border border-bg-surface/50">
		<div class="text-center mb-4">
			<h3 class="text-lg font-semibold text-text-primary mb-2">Transfer Flow</h3>
			<p class="text-sm text-text-secondary">Move money between your accounts</p>
		</div>

		<div class="flex items-center justify-between gap-4">
			<!-- From Account -->
			<div class="flex-1">
				<Label class="text-text-secondary font-medium text-sm">From Account</Label>
				<select
					value={fromAccountId}
					onchange={(e) => onDataChange({ fromAccountId: e.currentTarget.value })}
					class="w-full mt-1 px-2 py-1.5 bg-bg-tertiary/50 border border-bg-surface/50 rounded-lg text-text-primary focus:border-info/50 focus:ring-info/20 transition-colors"
				>
					<option value="">Select account...</option>
					{#each accounts as account}
						<option value={account.id}>
							{account.name} (${account.currentBalance?.toFixed(2) || '0.00'})
						</option>
					{/each}
				</select>
			</div>

			<!-- Arrow -->
			<div class="flex flex-col items-center">
				<div class="w-8 h-8 bg-gradient-to-br from-sage-green to-info rounded-full flex items-center justify-center">
					<ArrowRight class="w-4 h-4 text-warm-charcoal" />
				</div>
			</div>

			<!-- To Account -->
			<div class="flex-1">
				<Label class="text-text-secondary font-medium text-sm">To Account</Label>
				<select
					value={toAccountId}
					onchange={(e) => onDataChange({ toAccountId: e.currentTarget.value })}
					class="w-full mt-1 px-2 py-1.5 bg-bg-tertiary/50 border border-bg-surface/50 rounded-lg text-text-primary focus:border-info/50 focus:ring-info/20 transition-colors"
				>
					<option value="">Select account...</option>
					{#each accounts as account}
						<option value={account.id}>
							{account.name} (${account.currentBalance?.toFixed(2) || '0.00'})
						</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- Amount -->
		<div class="mt-4 text-center">
			<Label for="transfer-amount" class="text-text-secondary font-medium text-sm">Amount</Label>
			<div class="relative inline-block mt-1">
				<div class="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary">
					<DollarSign class="w-4 h-4" />
				</div>
				<Input
					id="transfer-amount"
					type="number"
					step="0.01"
					value={amount.toString()}
					oninput={(e: any) => onDataChange({ amount: parseFloat(e.currentTarget.value) || 0 })}
					placeholder="0.00"
					class="pl-8 pr-4 py-2 bg-bg-tertiary/50 border-bg-surface/50 focus:border-sage-green/50 focus:ring-sage-green/20 text-center w-48"
				/>
			</div>
		</div>
	</div>

	<!-- Quick Transfer Templates -->
	<div class="glass p-4 border border-bg-surface/50">
		<h3 class="text-base font-semibold text-text-primary mb-3">Quick Templates</h3>
		<div class="flex gap-3 overflow-x-auto pb-2">
			{#each transferTemplates as template}
				<Button 
					variant="neutral"
					size="sm"
					onclick={() => applyTemplate(template)}
					class="flex-shrink-0 bg-bg-tertiary/50 border-bg-surface/50 hover:border-golden-amber/50 hover:bg-golden-amber/10"
				>
					<div class="text-left">
						<div class="text-sm font-medium text-text-primary">{template.name}</div>
						<div class="text-xs text-text-secondary">
							{template.fromAccount} → {template.toAccount}
						</div>
						<div class="text-xs font-medium text-sage-green">
							${template.amount.toFixed(2)}
						</div>
					</div>
				</Button>
			{/each}
		</div>
	</div>

	<!-- Transfer Details -->
	<div class="glass p-4 border border-bg-surface/50">
		<h3 class="text-base font-semibold text-text-primary mb-3">Transfer Details</h3>
		
		<div class="space-y-3">
			<!-- Reference Number -->
			<div>
				<Label for="reference" class="text-text-secondary font-medium text-sm">Reference Number</Label>
				<Input
					id="reference"
					value={referenceNumber}
					oninput={(e: any) => onDataChange({ referenceNumber: e.currentTarget.value })}
					placeholder="Optional reference number"
					class="mt-1 bg-bg-tertiary/50 border-bg-surface/50 focus:border-info/50 focus:ring-info/20"
				/>
			</div>

			<!-- Transfer Date -->
			<div>
				<Label for="transfer-date" class="text-text-secondary font-medium text-sm">Transfer Date</Label>
				<div class="relative mt-1">
					<div class="absolute left-2 top-1/2 transform -translate-y-1/2 text-text-tertiary">
						<Calendar class="w-4 h-4" />
					</div>
					<Input
						id="transfer-date"
						type="datetime-local"
						value={transferDate}
						oninput={(e: any) => onDataChange({ transferDate: e.currentTarget.value })}
						class="pl-8 bg-bg-tertiary/50 border-bg-surface/50 focus:border-info/50 focus:ring-info/20"
					/>
				</div>
			</div>

			<!-- Transfer Info (Placeholders) -->
			<div class="space-y-2">
				<div class="flex justify-between text-sm">
					<span class="text-text-secondary">Transfer Fee:</span>
					<span class="text-text-primary">$0.00</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-text-secondary">Expected Arrival:</span>
					<span class="text-text-primary">Instant</span>
				</div>
			</div>
		</div>
	</div>
</div> 