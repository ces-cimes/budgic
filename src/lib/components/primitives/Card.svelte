<!-- src/lib/components/ui/Card.svelte -->
<script>
	let { children = null, class: className = '', padding = 'p-4', ...rest } = $props();
</script>

<div
	class="bg-primary border border-zinc-800 rounded-xl shadow-sm {padding} transition-all duration-150 {className}"
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
</div>