<script lang='ts'>
	import Button from "$lib/components/ui/Button.svelte";

</script>

<h1 class="text-2xl font-semibold mb-4">Settings</h1>
<Button onclick={() => document.body.classList.toggle('dark')}>Toggle Dark Mode</Button>