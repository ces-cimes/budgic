<script lang="ts">
    import Button from '$lib/components/primitives/Button.svelte';
    import Card from '$lib/components/primitives/Card.svelte';
    import TransactionList from '$lib/components/TransactionList.svelte';
  
    // Form state
    let form = {
      date: new Date().toISOString().split('T')[0], // Default to today in YYYY-MM-DD format
      name: '',
      category: '',
      type: 'Expense' as 'Expense' | 'Income' | 'Savings',
      amount: '',
      notes: ''
    };
  
    const categories = ['Food', 'Transport', 'Entertainment', 'Bills', 'Income'];
    const types = ['Expense', 'Income', 'Savings'] as const;
  
    function handleSubmit() {
      // In a real app, you would save to a store or API here
      console.log('Form submitted:', form);
      
      // Reset form (keep the same date)
      form = {
        ...form,
        name: '',
        category: '',
        type: 'Expense',
        amount: '',
        notes: ''
      };
    }
  </script>
  
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold">Add New Planned Entry</h1>
  
    <Card>
      <h2 class="text-xl font-medium mb-4">Transaction Form</h2>
      
      <form on:submit|preventDefault={handleSubmit} class="space-y-4">
        <div>
          <label for="date" class="block text-sm font-medium mb-1">Date</label>
          <input
            type="date"
            id="date"
            bind:value={form.date}
            class="w-full p-2 border rounded"
            required
          >
        </div>
        
        <div>
          <label for="name" class="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            id="name"
            bind:value={form.name}
            placeholder="Transaction name"
            class="w-full p-2 border rounded"
            required
          >
        </div>
        
        <div>
          <label for="category" class="block text-sm font-medium mb-1">Category</label>
          <select
            id="category"
            bind:value={form.category}
            class="w-full p-2 border rounded"
            required
          >
            <option value="">Select a category</option>
            {#each categories as category}
              <option value={category}>{category}</option>
            {/each}
          </select>
        </div>
        
        <div>
          <label for="type" class="block text-sm font-medium mb-1">Type</label>
          <select
            id="type"
            bind:value={form.type}
            class="w-full p-2 border rounded"
            required
          >
            {#each types as type}
              <option value={type}>{type}</option>
            {/each}
          </select>
        </div>
        
        <div>
          <label for="amount" class="block text-sm font-medium mb-1">Amount</label>
          <input
            type="number"
            id="amount"
            bind:value={form.amount}
            placeholder={form.type === 'Expense' ? '-200' : '200'}
            class="w-full p-2 border rounded"
            required
          >
        </div>
        
        <div>
          <label for="notes" class="block text-sm font-medium mb-1">Notes (Optional)</label>
          <textarea
            id="notes"
            bind:value={form.notes}
            class="w-full p-2 border rounded min-h-[80px]"
          ></textarea>
        </div>
        
        <Button type="submit" class="w-full">Save</Button>
      </form>
    </Card>
  
    <h2 class="text-2xl font-semibold">Planned Transactions</h2>
    <TransactionList filterName='future' />
  </div>