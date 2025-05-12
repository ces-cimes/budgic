<script lang="ts">
	import NavigationBar from '$lib/components/layout/NavigationBar.svelte';
	import '../app.css';

	let { children } = $props();
</script>

<main class="p-4 w-full pb-24">
	{@render children()}
</main>

<NavigationBar />