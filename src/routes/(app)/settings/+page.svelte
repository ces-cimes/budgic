<script lang='ts'>
	import Button from "$lib/components/primitives/Button.svelte";
	import { populateSampleData } from "$lib/core/sample-data";
</script>

<h1 class="text-2xl font-semibold mb-4">Settings</h1>
<Button onclick={() => document.body.classList.toggle('dark')}>Toggle Dark Mode</Button>
<Button onclick={populateSampleData}>Populate Sample Data</Button>