<!-- src/lib/components/ui/Button.svelte -->
<script lang='ts'>
	let {
		variant = 'primary',
		size = 'medium',
		disabled = false,
		typeProp = null,
		fullWidth = false,
		children = null,
		element = $bindable(),
		...rest
	} = $props();

	let type = $state(null);
	if (typeProp != null) {
		type = typeProp;
	}
</script>

<button
	type={type}
	disabled={disabled}
	class="rounded-xl inline-flex items-center justify-center px-4 py-3
font-medium leading-none text-magnum-700 shadow hover:opacity-75
		{variant == 'primary' ? 'text-black bg-teal-200' : ''} 
		{variant == 'secondary' ? 'text-white' : ''}
		{variant == 'neutral' ? 'text-white' : ''}
		{variant == 'danger' ? 'text-white' : ''}

		{size == 'sm' ? 'text-sm' : ''}
		{size == 'md' ? 'text-base' : ''}
		{size == 'lg' ? 'text-md' : ''}

		{fullWidth == true ? 'w-full' : ''}
	"
	bind:this={element}
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
</button>