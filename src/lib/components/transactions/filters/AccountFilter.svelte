<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import type { FilterState } from '../TransactionList.svelte';
	import type { Account } from '$lib/core/db';

	interface Props {
		filters: FilterState;
		accounts: Record<string, Account>;
		onFiltersChange: (filters: FilterState) => void;
	}

	let { filters, accounts, onFiltersChange }: Props = $props();

	const accountList = $derived(Object.values(accounts).filter(a => a && !a.deletedAt && a.isActive));
	
	const accountTypes: Array<{ value: FilterState['accountTypes'][number]; label: string }> = [
		{ value: 'checking', label: 'Checking' },
		{ value: 'savings', label: 'Savings' },
		{ value: 'credit', label: 'Credit' },
		{ value: 'cash', label: 'Cash' },
		{ value: 'investment', label: 'Investment' },
		{ value: 'crypto', label: 'Crypto' }
	];

	function toggleAccount(accountId: string) {
		const currentIds = filters.accountIds || [];
		const newIds = currentIds.includes(accountId)
			? currentIds.filter(id => id !== accountId)
			: [...currentIds, accountId];
		
		onFiltersChange({
			...filters,
			accountIds: newIds.length > 0 ? newIds : undefined
		});
	}

	function toggleAccountType(type: FilterState['accountTypes'][number]) {
		const currentTypes = filters.accountTypes || [];
		const newTypes = currentTypes.includes(type)
			? currentTypes.filter(t => t !== type)
			: [...currentTypes, type];
		
		onFiltersChange({
			...filters,
			accountTypes: newTypes.length > 0 ? newTypes : undefined
		});
	}
</script>

<div class="space-y-4">
	<!-- Account Types -->
	<div class="space-y-2">
		<label class="text-xs font-medium text-muted-foreground">Account Type</label>
		<div class="space-y-2">
			{#each accountTypes as type}
				<label class="flex items-center space-x-2 cursor-pointer">
					<Checkbox
						checked={filters.accountTypes?.includes(type.value) || false}
						onCheckedChange={() => toggleAccountType(type.value)}
					/>
					<span class="text-sm text-primary">{type.label}</span>
				</label>
			{/each}
		</div>
	</div>

	<!-- Accounts -->
	<div class="space-y-2">
		<label class="text-xs font-medium text-muted-foreground">Accounts</label>
		<div class="max-h-48 overflow-y-auto space-y-2 border rounded-md p-2">
			{#each accountList as account}
				<label class="flex items-center space-x-2 cursor-pointer">
					<Checkbox
						checked={filters.accountIds?.includes(account.id) || false}
						onCheckedChange={() => toggleAccount(account.id)}
					/>
					<span class="text-sm text-primary">{account.name}</span>
				</label>
			{/each}
		</div>
	</div>
</div>
