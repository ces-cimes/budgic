<script lang="ts">
	import { Search } from '@lucide/svelte';

	let {
		placeholder = '',
		value = $bindable(''),
		class: className = '',
		icon = null,
		onIconClick = null,
		...rest
	} = $props();

	let inputElement: HTMLInputElement;
</script>

<div class="relative">
	{#if icon}
		{#if typeof icon === 'function'}
			{@const Icon = icon}
			{#if onIconClick}
				<button 
					type="button"
					onclick={onIconClick}
					class="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary size-4 hover:text-text-secondary transition-colors"
				>
					<Icon />
				</button>
			{:else}
				<Icon class="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary size-4" />
			{/if}
		{:else if typeof icon === 'string'}
			{#if onIconClick}
				<button 
					type="button"
					onclick={onIconClick}
					class="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
				>
					{icon}
				</button>
			{:else}
				<span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary">{icon}</span>
			{/if}
		{:else if typeof icon === 'symbol'}
			{#if onIconClick}
				<button 
					type="button"
					onclick={onIconClick}
					class="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
				>
					{icon.toString()}
				</button>
			{:else}
				<span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary">{icon.toString()}</span>
			{/if}
		{/if}
	{:else}
		{#if onIconClick}
			<button 
				type="button"
				onclick={onIconClick}
				class="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary size-4 hover:text-text-secondary transition-colors"
			>
				<Search />
			</button>
		{:else}
			<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary size-4" />
		{/if}
	{/if}
	<input
		bind:this={inputElement}
		bind:value
		{placeholder}
		class="w-full pl-10 pr-4 py-2 bg-bg-secondary border border-primary rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-golden-amber focus:border-transparent {className}"
		{...rest}
	/>
</div>
