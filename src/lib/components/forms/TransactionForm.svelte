<script lang="ts">
	import { accounts } from '$lib/utils/stores';
	import { createTransaction } from '$lib/utils/types';
	import { enhance } from '$app/forms';

	export let transaction = createTransaction();
	export let onSuccess: () => void = () => {};

	$: accountOptions = $accounts.value.map(a => ({
	value: a.id,
	label: `${a.name} (${a.type})`
	}));

	const categories = [
	'Groceries', 'Dining', 'Transport', 'Housing',
	'Entertainment', 'Healthcare', 'Income', 'Savings'
	];
</script>

<form
	use:enhance
	class="space-y-4"
	on:submit={() => onSuccess()}
>
	<div class="grid grid-cols-2 gap-4">
	<div>
		<label class="block text-sm font-medium mb-1">Account</label>
		<select
		bind:value={transaction.accountId}
		class="w-full p-2 border rounded"
		required
		>
		{#each accountOptions as opt}
			<option value={opt.value}>{opt.label}</option>
		{/each}
		</select>
	</div>

	<div>
		<label class="block text-sm font-medium mb-1">Type</label>
		<select
		bind:value={transaction.type}
		class="w-full p-2 border rounded"
		>
		<option value="expense">Expense</option>
		<option value="income">Income</option>
		<option value="saving">Saving</option>
		</select>
	</div>
	</div>

	<div>
	<label class="block text-sm font-medium mb-1">Category</label>
	<input
		list="categories"
		bind:value={transaction.category}
		class="w-full p-2 border rounded"
		required
	/>
	<datalist id="categories">
		{#each categories as category}
		<option value={category} />
		{/each}
	</datalist>
	</div>

	<div class="grid grid-cols-2 gap-4">
	<div>
		<label class="block text-sm font-medium mb-1">Planned Amount</label>
		<input
		type="number"
		bind:value={transaction.plannedAmount}
		step="0.01"
		class="w-full p-2 border rounded"
		required
		/>
	</div>

	<div>
		<label class="block text-sm font-medium mb-1">Actual Amount</label>
		<input
		type="number"
		bind:value={transaction.actualAmount}
		step="0.01"
		class="w-full p-2 border rounded"
		/>
	</div>
	</div>

	<div>
	<label class="block text-sm font-medium mb-1">Date</label>
	<input
		type="date"
		bind:value={transaction.date}
		class="w-full p-2 border rounded"
	/>
	</div>

	<button
	type="submit"
	class="w-full bg-primary text-white py-2 px-4 rounded hover:bg-primary-dark"
	>
		Save Transaction
	</button>
</form>