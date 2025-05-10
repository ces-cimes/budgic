<script lang="ts">
	import NavigationBar from '$lib/components/NavigationBar.svelte';
	import '../app.css';

	let { children } = $props();
</script>

<main class="p-4 w-full">
	{@render children()}
</main>

<NavigationBar />