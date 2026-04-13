<script lang="ts">
	interface Props {
		title: string;
		children?: any;
		description?: string;
	}

	let { title, children, description }: Props = $props();
</script>

<div class="space-y-3">
	<div>
		<h4 class="text-primary text-sm font-semibold">{title}</h4>
		{#if description}
			<p class="text-muted-foreground mt-1 text-xs">{description}</p>
		{/if}
	</div>
	<div class="space-y-2">
		{@render children?.()}
	</div>
</div>
