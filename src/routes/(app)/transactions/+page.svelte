<script lang="ts">
	import Fab from '$lib/components/primitives/Fab.svelte';
    import TransactionList from '$lib/components/TransactionList.svelte';
	import { Plus } from '@lucide/svelte';
</script>

<h2 class="text-2xl font-semibold mb-4">Completed Transactions</h2>

<Fab onclick={() => console.log('FAB clicked!')} size='md'>
    <Plus/>
</Fab>

<TransactionList filterName='all'/>