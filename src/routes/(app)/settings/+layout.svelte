<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import TopBar from '$lib/components/layout/TopBar.svelte';

    let { children } = $props();

	// Get the current route to determine if we should show back button
	const currentPath = $derived($page.url.pathname);
	const isSubPage = $derived(currentPath !== '/settings');

	function goBack() {
		goto('/settings');
	}
</script>

{#if !isSubPage}
	<TopBar 
		title="Settings"
		description="Manage your Budgic preferences and features"
		showBackButton={false}
	/>
{/if}

<div class="min-h-screen bg-bg-primary">
	<div class="max-w-xl mx-auto px-2 py-4">
		{@render children()}
	</div>
</div> 