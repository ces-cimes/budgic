<script lang="ts">
	import NavigationBar from '$lib/components/layout/NavigationBar.svelte';
	import '../app.css';
	//import { dataService } from '$lib/core/data-service';

	let { children } = $props();
</script>

<main class="p-2 w-full pb-24">
	{@render children()}
</main>

<NavigationBar />