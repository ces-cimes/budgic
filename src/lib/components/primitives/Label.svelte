<script lang="ts">
	let {
        children = $bindable(),
        class: className = '',
        ...rest
    } = $props();
</script>

<span class="inline-block px-2 py-1 text-xs text-zinc-800 font-medium rounded bg-zinc-200 {className}">
	{#if children}
        {@render children()}
    {/if}
</span>