<script lang="ts">
	import { page } from '$app/stores';
	import RouteErrorDisplay from '$lib/components/shared/RouteErrorDisplay.svelte';

	const friendlyMessage = $derived.by(() => {
		if ($page.status === 404) {
			return "We couldn't find that page. It may have moved or the link is outdated.";
		}
		return 'Something went wrong loading this page. Please try again or go back home.';
	});

	$effect(() => {
		if ($page.error) {
			console.error('Route error:', $page.error);
		}
	});
</script>

<svelte:head>
	<title>{$page.status === 404 ? 'Page not found' : 'Error'} - Budgic</title>
</svelte:head>

<RouteErrorDisplay message={friendlyMessage} status={$page.status} />
