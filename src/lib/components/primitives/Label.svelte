<script lang="ts">
	let {
        children = $bindable(),
        class: className = '',
        ...rest
    } = $props();
</script>

<span class="inline-block px-2 py-1 text-xs text-text-primary font-medium rounded bg-bg-tertiary {className}">
	{#if children}
        {@render children()}
    {/if}
</span>