<script lang="ts">
    import { accounts, transactions } from '$lib/utils/stores';
    import { createAccount, createTransaction } from '$lib/utils/types';

    // Form states - now requires accountId
    let newAccount = createAccount();
    let newTransaction = createTransaction({
        accountId: accounts.value[0]?.id || '' // Default to first account
    });
    
    // Add account with validation
    function addAccount() {
        try {
            accounts.value = [...accounts.value, newAccount];
            newTransaction.accountId = newAccount.id; // Auto-select new account
            newAccount = createAccount();
        } catch (error) {
            alert('Failed to add account: ' + error.message);
        }
    }

    // Add transaction with validation
    function addTransaction() {
        if (!newTransaction.accountId) {
            alert('Please select an account');
            return;
        }

        try {
            transactions.value = [...transactions.value, newTransaction];
            newTransaction = createTransaction({
                accountId: accounts.value[0]?.id || '' // Reset with valid account
            });
        } catch (error) {
            alert('Failed to add transaction: ' + error.message);
        }
    }

    // Format helpers with fallbacks
    function formatDate(dateString: string) {
        try {
            return new Date(dateString).toLocaleDateString();
        } catch {
            return 'Invalid date';
        }
    }

    function formatCurrency(amount: number) {
        return amount.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
</script>

{#if accounts.isLoading || transactions.isLoading}
    <div class="loading-indicator">Loading data...</div>
{:else if accounts.error || transactions.error}
    <div class="error-message">
        Error loading data. {accounts.error?.message || transactions.error?.message}
        <button on:click={() => { accounts.clearError(); transactions.clearError() }}>
            Dismiss
        </button>
    </div>
{/if}

<div class="grid grid-cols-2 gap-8">
	<!-- Accounts Section -->
	<section>
		<h2 class="text-xl font-bold mb-4">Accounts</h2>
		
		<form on:submit|preventDefault={addAccount} class="mb-6 space-y-4">
			<div>
				<label>Account Name</label>
				<input bind:value={newAccount.name} required class="w-full p-2 border rounded">
			</div>
			
			<div>
				<label>Type</label>
				<select bind:value={newAccount.type} class="w-full p-2 border rounded">
					<option value="debit">Debit</option>
					<option value="credit">Credit</option>
					<option value="savings">Savings</option>
					<option value="investment">Investment</option>
				</select>
			</div>
			
			<div>
				<label>Initial Balance</label>
				<input 
					type="number" 
					bind:value={newAccount.currentBalance} 
					required
					class="w-full p-2 border rounded"
				>
			</div>
			
			<button type="submit" class="bg-blue-500 text-white p-2 rounded">
				Add Account
			</button>
		</form>
		
		<ul class="space-y-2">
			{#each accounts.value as account}
				<li class="p-3 border rounded flex justify-between">
					<div>
						<h3 class="font-medium">{account.name}</h3>
						<p class="text-sm text-gray-600">{account.type}</p>
					</div>
					<div class="font-bold">
						{formatCurrency(account.currentBalance)}
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<!-- Transactions Section -->
	<section>
		<h2 class="text-xl font-bold mb-4">Transactions</h2>
		
		<form on:submit|preventDefault={addTransaction} class="mb-6 space-y-4">
			<div>
				<label>Account</label>
				<select 
					bind:value={newTransaction.accountId}
					required
					class="w-full p-2 border rounded"
				>
					{#each accounts.value as account}
						<option value={account.id}>{account.name}</option>
					{/each}
				</select>
			</div>
			
			<div>
				<label>Type</label>
				<select bind:value={newTransaction.type} class="w-full p-2 border rounded">
					<option value="expense">Expense</option>
					<option value="income">Income</option>
					<option value="saving">Saving</option>
				</select>
			</div>
			
			<div>
				<label>Amount</label>
				<input 
					type="number" 
					bind:value={newTransaction.plannedAmount} 
					required
					class="w-full p-2 border rounded"
				>
			</div>
			
			<button type="submit" class="bg-green-500 text-white p-2 rounded">
				Add Transaction
			</button>
		</form>
		
		<ul class="space-y-2">
			{#each transactions.value as transaction}
				<li class="p-3 border rounded">
					<div class="flex justify-between">
						<span class="font-medium">
							{transaction.category}
						</span>
						<span class="font-bold"
							class:text-red-500={transaction.type === 'expense'}
							class:text-green-500={transaction.type !== 'expense'}>
							{formatCurrency(transaction.plannedAmount)}
						</span>
					</div>
					<div class="text-sm text-gray-600">
						{formatDate(transaction.date)} • {accounts.value.find(a => a.id === transaction.accountId)?.name || 'Unknown'}
					</div>
				</li>
			{/each}
		</ul>
	</section>
</div>

<!-- <style>
	input, select {
		@apply border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500;
	}
</style> -->