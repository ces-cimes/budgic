<script lang='ts'>
	import Card from "../primitives/Card.svelte";

    let {
        children = null,
        title = '',
		...rest
    } = $props();
</script>

<Card {...rest}>
    <h1 class="text-2xl font-semibold">{title}</h1>
    {#if children}
		{@render children()}
	{/if}
</Card>