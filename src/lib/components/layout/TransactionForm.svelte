<script lang="ts">
	import Input from '$lib/components/primitives/Input.svelte';
	import Label from '$lib/components/primitives/Label.svelte';
	import { DollarSign, Calendar, MapPin } from '@lucide/svelte';
	import type { Account } from '$lib/core/db';
	import { settingsService } from '$lib/core/services/settings-service';
	import { onMount } from 'svelte';
	
	const { 
		transactionData = {},
		accounts = [],
		onDataChange = () => {}
	} = $props<{
		transactionData?: {
			amount?: number;
			description?: string;
			clearedDate?: string;
			accountId?: string;
			currency?: string;
		};
		accounts?: Account[];
		onDataChange?: (updates: any) => void;
	}>();

	// Currency options (placeholder - should come from settings)
	const currencies = [
		{ code: 'USD', symbol: '$' },
		{ code: 'EUR', symbol: '€' },
		{ code: 'GBP', symbol: '£' },
		{ code: 'CAD', symbol: 'C$' }
	];

	let currentCurrency = $state('');

	// Format date for display
	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		const today = new Date();
		const isToday = date.toDateString() === today.toDateString();
		
		if (isToday) {
			return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		}
		return date.toLocaleDateString() + ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	};

	onMount(async () => {
		currentCurrency = await settingsService.getStringSetting('currency');
	});	
</script>

<div class="space-y-4">
	<!-- Amount Input -->
	<div class="text-center">
		<Label for="amount" class="text-text-secondary font-medium text-sm mb-2 block">Amount</Label>
		<div class="relative inline-block">
			<Input
				icon={currentCurrency}
				id="amount"
				type="number"
				step="0.01"
				value={transactionData.amount?.toString() || '0'}
				on:input={(e) => onDataChange({ amount: parseFloat(e.currentTarget.value) || 0 })}
				placeholder="0.00"
				class="text-center text-2xl font-bold pl-8 pr-4 py-3 bg-bg-tertiary/50 border-bg-surface/50 focus:border-sage-green/50 focus:ring-sage-green/20 w-48"
			/>
		</div>
	</div>

	<!-- Description Field -->
	<div>
		<Label for="description" class="text-text-secondary font-medium text-sm">Description</Label>
		<Input
			id="description"
			value={transactionData.description || ''}
			on:input={(e) => onDataChange({ description: e.currentTarget.value })}
			placeholder="What did you buy?"
			class="mt-1 bg-bg-tertiary/50 border-bg-surface/50 focus:border-info/50 focus:ring-info/20"
		/>
	</div>

	<!-- Date & Time Picker -->
	<div>
		<Label for="date" class="text-text-secondary font-medium text-sm">Date & Time</Label>
		<div class="relative mt-1">
			<div class="absolute left-2 top-1/2 transform -translate-y-1/2 text-text-tertiary">
				<Calendar class="w-4 h-4" />
			</div>
			<Input
				id="date"
				type="datetime-local"
				value={transactionData.clearedDate || ''}
				on:input={(e) => onDataChange({ clearedDate: e.currentTarget.value })}
				class="pl-8 bg-bg-tertiary/50 border-bg-surface/50 focus:border-info/50 focus:ring-info/20"
			/>
		</div>
		{#if transactionData.clearedDate}
			<div class="text-xs text-text-tertiary mt-1">
				{formatDate(transactionData.clearedDate)}
			</div>
		{/if}
	</div>

	<!-- Account Selector -->
	<div>
		<Label for="account" class="text-text-secondary font-medium text-sm">Account</Label>
		<select
			id="account"
			value={transactionData.accountId || ''}
			onchange={(e) => onDataChange({ accountId: e.currentTarget.value })}
			class="w-full mt-1 px-2 py-1.5 bg-bg-tertiary/50 border border-bg-surface/50 rounded-lg text-text-primary focus:border-info/50 focus:ring-info/20 transition-colors"
		>
			{#each accounts as account}
				<option value={account.id}>
					{account.name} (${account.currentBalance?.toFixed(2) || '0.00'})
				</option>
			{/each}
		</select>
	</div>
</div> 