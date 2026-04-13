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

	const accountList = $derived(
		Object.values(accounts).filter((a) => a && !a.deletedAt && a.isActive)
	);

	type AccountTypeValue = NonNullable<FilterState['accountTypes']>[number];

	const accountTypes: Array<{ value: AccountTypeValue; label: string }> = [
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
			? currentIds.filter((id) => id !== accountId)
			: [...currentIds, accountId];

		onFiltersChange({
			...filters,
			accountIds: newIds.length > 0 ? newIds : undefined
		});
	}

	function toggleAccountType(type: AccountTypeValue) {
		const currentTypes = filters.accountTypes ?? [];
		const newTypes = currentTypes.includes(type)
			? currentTypes.filter((t) => t !== type)
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
		<p class="text-muted-foreground text-xs font-medium" id="filter-account-type-heading">
			Account Type
		</p>
		<div class="space-y-2" role="group" aria-labelledby="filter-account-type-heading">
			{#each accountTypes as type}
				<label class="flex cursor-pointer items-center space-x-2">
					<Checkbox
						checked={filters.accountTypes?.includes(type.value) || false}
						onCheckedChange={() => toggleAccountType(type.value)}
					/>
					<span class="text-primary text-sm">{type.label}</span>
				</label>
			{/each}
		</div>
	</div>

	<!-- Accounts -->
	<div class="space-y-2">
		<p class="text-muted-foreground text-xs font-medium" id="filter-accounts-heading">Accounts</p>
		<div
			class="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2"
			role="group"
			aria-labelledby="filter-accounts-heading"
		>
			{#each accountList as account}
				<label class="flex cursor-pointer items-center space-x-2">
					<Checkbox
						checked={filters.accountIds?.includes(account.id) || false}
						onCheckedChange={() => toggleAccount(account.id)}
					/>
					<span class="text-primary text-sm">{account.name}</span>
				</label>
			{/each}
		</div>
	</div>
</div>
