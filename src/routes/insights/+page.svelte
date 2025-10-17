<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    // Redirect to alerts page
    goto('/insights/alerts', { replaceState: true });
  });
</script>

<!-- This page redirects to /insights/alerts -->
<!-- The redirect happens in onMount to ensure proper client-side navigation -->
