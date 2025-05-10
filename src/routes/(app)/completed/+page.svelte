<script lang="ts">
    import TransactionList from '$lib/components/TransactionList.svelte';
</script>

<h2 class="text-2xl font-semibold mb-4">Completed Transactions</h2>

<TransactionList completed={true}/>