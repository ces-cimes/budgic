<!-- src/lib/components/ui/Card.svelte -->
<script>
	let {
		children = null,
		class: className = '',
		padding = 'p-4',
		glass = false,
		...rest
	} = $props();
</script>

<div
	class="bg-secondary overflow-hidden border border-primary rounded-xl shadow-sm {padding} transition-all duration-150 {className} {glass ? 'glass' : ''}"
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
</div>