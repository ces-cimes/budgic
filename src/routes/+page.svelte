<script lang="ts">
    import MonthSummary from '$lib/components/MonthSummary.svelte';
    import TransactionList from '$lib/components/TransactionList.svelte';
	import Card from '$lib/components/ui/Card.svelte';
</script>

<Card class="mb-4">
	<h1 class="text-2xl font-semibold mb-4">Dashboard</h1>
	<MonthSummary />
</Card>

<h2 class="text-xl font-semibold mb-2">Upcoming Transactions</h2>

<TransactionList/>